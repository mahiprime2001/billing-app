"""
Offline Queue Manager
Tracks operations performed offline for later sync to Supabase
"""
import json
import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class OfflineQueue:
    """Manages operations performed offline that need syncing"""
    
    def __init__(self, queue_file: str = None):
        base_dir = os.environ.get("APP_BASE_DIR", os.getcwd())
        self.queue_file = queue_file or os.path.join(
            base_dir, "data", "json", "offline_queue.json"
        )
        self._ensure_file_exists()
    
    def _ensure_file_exists(self):
        """Ensure the queue file and directory exist"""
        os.makedirs(os.path.dirname(self.queue_file), exist_ok=True)
        if not os.path.exists(self.queue_file):
            self._save_queue([])
    
    def add_operation(
        self, 
        table: str, 
        operation: str, 
        record_id: str, 
        data: dict,
        priority: int = 5
    ):
        """
        Add an operation to the offline queue
        
        Args:
            table: Table name (e.g., 'products', 'batches')
            operation: Operation type ('CREATE', 'UPDATE', 'DELETE')
            record_id: Record ID
            data: Data to sync
            priority: Priority (1=highest, 10=lowest)
        """
        queue = self._load_queue()
        
        # Remove duplicate pending operations for same record
        queue = [
            q for q in queue 
            if not (
                q.get("table") == table and 
                q.get("record_id") == record_id and 
                q.get("status") == "pending"
            )
        ]
        
        entry = {
            "id": f"{table}_{operation}_{record_id}_{int(datetime.now().timestamp() * 1000)}",
            "table": table,
            "operation": operation.upper(),
            "record_id": record_id,
            "data": data,
            "priority": priority,
            "timestamp": datetime.now().isoformat(),
            "status": "pending",
            "retry_count": 0
        }
        
        queue.append(entry)
        self._save_queue(queue)
        logger.info(f"📥 Queued: {table} - {operation} - {record_id}")
        
        return entry["id"]
    
    def get_pending(self, limit: Optional[int] = None) -> List[Dict]:
        """Get pending operations sorted by priority and timestamp"""
        queue = self._load_queue()
        pending = [q for q in queue if q.get("status") == "pending"]
        
        # Sort by priority (ascending) then timestamp (ascending)
        pending.sort(key=lambda x: (x.get("priority", 5), x.get("timestamp")))
        
        if limit:
            return pending[:limit]
        return pending
    
    def get_count(self) -> Dict[str, int]:
        """Get count of operations by status"""
        queue = self._load_queue()
        return {
            "pending": sum(1 for q in queue if q.get("status") == "pending"),
            "synced": sum(1 for q in queue if q.get("status") == "synced"),
            "failed": sum(1 for q in queue if q.get("status") == "failed"),
            "total": len(queue)
        }
    
    def mark_synced(self, entry_id: str):
        """Mark an operation as successfully synced"""
        queue = self._load_queue()
        for entry in queue:
            if entry["id"] == entry_id:
                entry["status"] = "synced"
                entry["synced_at"] = datetime.now().isoformat()
                logger.info(f"✅ Synced: {entry.get('table')} - {entry.get('record_id')}")
                break
        self._save_queue(queue)
    
    def mark_failed(self, entry_id: str, error: str):
        """Mark an operation as failed"""
        queue = self._load_queue()
        for entry in queue:
            if entry["id"] == entry_id:
                entry["status"] = "failed"
                entry["error"] = error
                entry["failed_at"] = datetime.now().isoformat()
                entry["retry_count"] = entry.get("retry_count", 0) + 1
                logger.error(f"❌ Failed: {entry.get('table')} - {entry.get('record_id')} - {error}")
                break
        self._save_queue(queue)
    
    def retry_failed(self) -> int:
        """Mark failed operations as pending for retry"""
        queue = self._load_queue()
        retried = 0
        
        for entry in queue:
            if entry.get("status") == "failed" and entry.get("retry_count", 0) < 3:
                entry["status"] = "pending"
                retried += 1
        
        self._save_queue(queue)
        logger.info(f"🔄 Retrying {retried} failed operations")
        return retried
    
    def clear_synced(self, days: int = 7):
        """Remove synced operations older than specified days"""
        queue = self._load_queue()
        cutoff = datetime.now() - timedelta(days=days)
        
        original_count = len(queue)
        queue = [
            q for q in queue 
            if not (
                q.get("status") == "synced" and 
                datetime.fromisoformat(q.get("synced_at", "2000-01-01")) < cutoff
            )
        ]
        
        removed = original_count - len(queue)
        if removed > 0:
            self._save_queue(queue)
            logger.info(f"🗑️ Removed {removed} old synced operations")
        
        return removed
    
    def clear_all(self):
        """Clear entire queue (use with caution!)"""
        self._save_queue([])
        logger.warning("⚠️ Cleared entire offline queue")
    
    def _load_queue(self) -> List[Dict]:
        """Load queue from file.

        On corruption, the file is preserved as a ``.corrupt-<ts>`` backup rather
        than silently discarded. Combined with the atomic _save_queue below, this
        prevents the queue from being erased: a half-written/corrupt file used to
        be read as [] and the next save overwrote everything that was queued.
        """
        try:
            with open(self.queue_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            return []
        except json.JSONDecodeError as e:
            backup = f"{self.queue_file}.corrupt-{int(datetime.now().timestamp())}"
            try:
                os.replace(self.queue_file, backup)
                logger.error(f"Corrupt offline queue backed up to {backup}: {e}")
            except OSError as be:
                logger.error(f"Corrupt offline queue; backup failed: {be}")
            return []
        except Exception as e:
            logger.error(f"Error loading queue: {e}")
            return []

    def _save_queue(self, queue: List[Dict]) -> bool:
        """Save queue atomically: temp file -> fsync -> os.replace.

        Guarantees the queue file is never left half-written, so a crash mid-write
        cannot corrupt it. Returns True on success, False on failure.
        """
        tmp = f"{self.queue_file}.tmp"
        try:
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(queue, f, indent=2, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.queue_file)
            return True
        except Exception as e:
            logger.error(f"Error saving queue: {e}")
            try:
                if os.path.exists(tmp):
                    os.remove(tmp)
            except OSError:
                pass
            return False

# Global instance
offline_queue = OfflineQueue()
