# sync_manager.py - Main Enhanced Sync System
# This is the core sync manager that handles all sync operations

import os
import sys
import json
import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import schedule

# Setup logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(handler)

# Determine the base directory for resource loading
if getattr(sys, 'frozen', False):
    PROJECT_ROOT = os.path.dirname(sys._MEIPASS)  # type: ignore
else:
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.db import DatabaseConnection  # noqa: E402


class EnhancedSyncManager:
    """
    Enhanced Sync Manager that handles:
    1. CRUD operation logging to a local sync table (JSON)
    2. Sequential log processing with retry mechanism
    3. Pulling changes from MySQL sync_table every 15 minutes
    4. Cleanup of logs older than 30 days
    """

    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        self.local_sync_table_file = os.path.join(base_dir, 'data', 'json', 'local_sync_table.json')
        self.sync_logs_file = os.path.join(base_dir, 'data', 'json', 'sync_logs.json')
        self.settings_file = os.path.join(base_dir, 'data', 'json', 'settings.json')
        self.is_running = False
        self.sync_thread = None

        # Ensure directories exist
        os.makedirs(os.path.dirname(self.local_sync_table_file), exist_ok=True)
        os.makedirs(os.path.dirname(self.sync_logs_file), exist_ok=True)
        os.makedirs(os.path.dirname(self.settings_file), exist_ok=True)

    # ---------- JSON helpers ----------

    def _safe_json_load(self, path: str, default_value: Any) -> Any:
        """Safely load JSON data from file"""
        if not os.path.exists(path):
            return default_value
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading JSON from {path}: {e}")
            return default_value

    def _safe_json_dump(self, path: str, data: Any) -> None:
        """Safely dump JSON data to file"""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Error saving JSON to {path}: {e}")

    def get_local_sync_table(self) -> List[Dict]:
        """Get local sync table data"""
        return self._safe_json_load(self.local_sync_table_file, [])

    def save_local_sync_table(self, data: List[Dict]) -> None:
        """Save local sync table data"""
        self._safe_json_dump(self.local_sync_table_file, data)

    def get_sync_logs(self) -> List[Dict]:
        """Get sync logs data"""
        return self._safe_json_load(self.sync_logs_file, [])

    def save_sync_logs(self, data: List[Dict]) -> None:
        """Save sync logs data"""
        self._safe_json_dump(self.sync_logs_file, data)

    def get_settings(self) -> Dict:
        """Get settings data"""
        return self._safe_json_load(self.settings_file, {})

    def save_settings(self, data: Dict) -> None:
        """Save settings data"""
        self._safe_json_dump(self.settings_file, data)

    def get_last_sync_timestamp(self) -> Optional[str]:
        """Get last sync timestamp"""
        settings = self.get_settings()
        return settings.get('systemSettings', {}).get('last_sync_time')

    def set_last_sync_timestamp(self, timestamp: str) -> None:
        """Set last sync timestamp"""
        settings = self.get_settings()
        if 'systemSettings' not in settings:
            settings['systemSettings'] = {}
        settings['systemSettings']['last_sync_time'] = timestamp
        self.save_settings(settings)

    # ---------- Public logging APIs ----------

    def log_crud_operation(self, table_name: str, operation_type: str, record_id: str, data: Dict) -> None:
        """
        Log CRUD operation to local sync table (main entrypoint to queue changes).
        """
        sync_table = self.get_local_sync_table()

        # Deduplicate pending changes for same record and table
        sync_table = [
            entry for entry in sync_table
            if not (entry.get('table_name') == table_name and
                    entry.get('record_id') == record_id and
                    entry.get('status') == 'pending')
        ]

        # Generate unique ID
        max_id = max([entry.get('id', 0) for entry in sync_table], default=0)

        new_entry = {
            "id": max_id + 1,
            "sync_time": datetime.now().isoformat(),
            "table_name": table_name,      # e.g., 'Products'
            "change_type": operation_type, # 'CREATE' | 'UPDATE' | 'DELETE'
            "record_id": record_id,
            "change_data": data,
            "status": "pending",           # 'pending' | 'completed' | 'failed' | 'skipped'
            "retry_count": 0,
            "last_retry": None,
            "error_message": None,
            "created_at": datetime.now().isoformat()
        }

        sync_table.append(new_entry)
        self.save_local_sync_table(sync_table)

        logger.info(f"Logged CRUD operation: {table_name} - {operation_type} - {record_id}")

        # Also log to sync logs
        self.log_sync_event(f"{table_name}_{operation_type.lower()}_logged", "pending", {
            "table_name": table_name,
            "record_id": record_id,
            "operation_type": operation_type
        })

    def log_sync_event(self, event_type: str, status: str, details: Dict) -> None:
        """Log sync event to sync logs"""
        sync_logs = self.get_sync_logs()
        max_id = max([log.get('id', 0) for log in sync_logs], default=0)

        new_log = {
            "id": max_id + 1,
            "timestamp": datetime.now().isoformat(),
            "eventType": event_type,
            "status": status,
            "details": details
        }

        sync_logs.append(new_log)
        self.save_sync_logs(sync_logs)
        logger.info(f"Logged sync event: {event_type} - {status}")

    # ---------- DB write pipeline ----------

    def apply_change_to_mysql_db(self, table_name: str, change_type: str, record_id: str, change_data: Dict) -> bool:
        """
        Apply change to MySQL database with upsert/related-table handling.
        """
        try:
            with DatabaseConnection.get_connection_ctx() as conn:
                cursor = conn.cursor(dictionary=True)
                conn.start_transaction()

                try:
                    if change_type == 'DELETE':
                        # Handle foreign keys first
                        if table_name == 'Bills':
                            cursor.execute("DELETE FROM `BillItems` WHERE `billId` = %s", (record_id,))
                        elif table_name == 'Products':
                            cursor.execute("DELETE FROM `ProductBarcodes` WHERE `productId` = %s", (record_id,))
                        elif table_name == 'Users':
                            cursor.execute("DELETE FROM `UserStores` WHERE `userId` = %s", (record_id,))

                        cursor.execute(f"DELETE FROM `{table_name}` WHERE `id` = %s", (record_id,))
                        logger.info(f"DELETE - {table_name} - ID: {record_id}")

                    elif change_type in ['CREATE', 'UPDATE']:
                        # Get table columns
                        cursor.execute(f"DESCRIBE `{table_name}`")
                        table_columns = [row[0] for row in cursor.fetchall()]

                        # Filter data by valid columns
                        filtered_data = {k: v for k, v in change_data.items() if k in table_columns}

                        # Ensure primary key exists for upsert path
                        if 'id' not in filtered_data and record_id and 'id' in table_columns:
                            filtered_data['id'] = record_id

                        if not filtered_data:
                            logger.warning(f"No valid columns found for {table_name}")
                            conn.rollback()
                            return False

                        # Build upsert
                        columns = ', '.join([f"`{key}`" for key in filtered_data.keys()])
                        placeholders = ', '.join(['%s'] * len(filtered_data))
                        update_placeholders = ', '.join([f"`{col}` = VALUES(`{col}`)" for col in filtered_data.keys()])

                        query = f"""
                        INSERT INTO `{table_name}` ({columns})
                        VALUES ({placeholders})
                        ON DUPLICATE KEY UPDATE {update_placeholders}
                        """

                        values = list(filtered_data.values())
                        cursor.execute(query, values)

                        # Handle related tables
                        self._handle_related_tables(cursor, table_name, record_id, change_data)

                        logger.info(f"{change_type} - {table_name} - ID: {record_id}")

                    conn.commit()
                    return True

                except Exception as e:
                    conn.rollback()
                    logger.error(f"Error in database operation: {e}")
                    return False

        except Exception as e:
            logger.error(f"Error connecting to database: {e}")
            return False

    def _handle_related_tables(self, cursor, table_name: str, record_id: str, change_data: Dict) -> None:
        """Handle related table operations"""
        if table_name == 'Products' and 'barcodes' in change_data:
            # ProductBarcodes maintenance
            barcodes = change_data.get('barcodes')
            barcodes = barcodes if isinstance(barcodes, list) else []

            cursor.execute("SELECT `barcode` FROM `ProductBarcodes` WHERE `productId` = %s", (record_id,))
            existing_barcodes = {row['barcode'] for row in cursor.fetchall()}
            new_barcodes = {str(b) for b in barcodes}

            # Add new
            for b in (new_barcodes - existing_barcodes):
                cursor.execute(
                    "INSERT INTO `ProductBarcodes` (`productId`, `barcode`) VALUES (%s, %s)",
                    (record_id, b)
                )

            # Remove old
            for b in (existing_barcodes - new_barcodes):
                cursor.execute(
                    "DELETE FROM `ProductBarcodes` WHERE `productId` = %s AND `barcode` = %s",
                    (record_id, b)
                )

        elif table_name == 'Bills' and 'items' in change_data:
            # Replace BillItems
            bill_items = change_data.get('items') or []
            bill_items = bill_items if isinstance(bill_items, list) else []

            cursor.execute("DELETE FROM `BillItems` WHERE `billId` = %s", (record_id,))

            cursor.execute("DESCRIBE `BillItems`")
            bill_item_columns = [row[0] for row in cursor.fetchall()]

            for item in bill_items:
                if not isinstance(item, dict):
                    continue

                filtered_item_data = {k: v for k, v in item.items() if k in bill_item_columns}
                filtered_item_data['billId'] = record_id

                if 'productId' not in filtered_item_data:
                    continue

                item_columns = ', '.join([f"`{key}`" for key in filtered_item_data.keys()])
                item_placeholders = ', '.join(['%s'] * len(filtered_item_data))
                item_query = f"INSERT INTO `BillItems` ({item_columns}) VALUES ({item_placeholders})"
                cursor.execute(item_query, list(filtered_item_data.values()))

    # ---------- Process pipeline ----------

    def process_pending_logs(self) -> Dict:
        """
        Process pending logs sequentially (1-by-1).
        Marks success/failed and records retry metadata.
        """
        sync_table = self.get_local_sync_table()
        pending_logs = [log for log in sync_table if log.get('status') == 'pending']

        if not pending_logs:
            logger.info("No pending sync logs to process")
            return {"status": "success", "message": "No pending logs", "processed": 0, "failed": 0}

        logger.info(f"Processing {len(pending_logs)} pending sync logs sequentially...")

        processed = 0
        failed = 0

        for log_entry in pending_logs:
            log_id = log_entry.get('id')
            table_name = log_entry.get('table_name')
            change_type = log_entry.get('change_type')
            record_id = log_entry.get('record_id')
            change_data = log_entry.get('change_data', {})

            logger.info(f"Processing log {log_id}: {table_name} - {change_type} - {record_id}")

            # Attempt to apply change
            success = self.apply_change_to_mysql_db(table_name, change_type, record_id, change_data)

            if success:
                for entry in sync_table:
                    if entry.get('id') == log_id:
                        entry['status'] = 'completed'
                        entry['completed_at'] = datetime.now().isoformat()
                        break

                self.log_sync_event(f"{table_name}_{change_type.lower()}_success", "completed", {
                    "log_id": log_id,
                    "table_name": table_name,
                    "record_id": record_id
                })

                processed += 1
                logger.info(f"Successfully processed log {log_id}")

            else:
                for entry in sync_table:
                    if entry.get('id') == log_id:
                        entry['status'] = 'failed'
                        entry['retry_count'] = entry.get('retry_count', 0) + 1
                        entry['last_retry'] = datetime.now().isoformat()
                        entry['error_message'] = "Database operation failed"
                        break

                self.log_sync_event(f"{table_name}_{change_type.lower()}_failed", "failed", {
                    "log_id": log_id,
                    "table_name": table_name,
                    "record_id": record_id
                })

                failed += 1
                logger.warning(f"Failed to process log {log_id}, will retry later")

        self.save_local_sync_table(sync_table)

        return {
            "status": "success",
            "message": f"Processed {processed} logs, {failed} failed",
            "processed": processed,
            "failed": failed
        }

    def retry_failed_logs(self) -> Dict:
        """
        Retry failed logs by resetting them back to 'pending' (max 3 attempts).
        """
        sync_table = self.get_local_sync_table()
        failed_logs = [log for log in sync_table if log.get('status') == 'failed']

        if not failed_logs:
            logger.info("No failed logs to retry")
            return {"status": "success", "message": "No failed logs", "retried": 0}

        logger.info(f"Retrying {len(failed_logs)} failed sync logs...")

        retried = 0

        for log_entry in failed_logs:
            log_id = log_entry.get('id')
            retry_count = log_entry.get('retry_count', 0)

            # Limit retries
            if retry_count >= 3:
                logger.warning(f"Log {log_id} has exceeded max retry attempts")
                continue

            for entry in sync_table:
                if entry.get('id') == log_id:
                    entry['status'] = 'pending'
                    break

            retried += 1

        self.save_local_sync_table(sync_table)

        if retried > 0:
            result = self.process_pending_logs()
            result['retried'] = retried
            return result

        return {"status": "success", "message": "No logs eligible for retry", "retried": 0}

    # ---------- Pull pipeline ----------

    def pull_from_mysql_sync_table(self) -> Dict:
        """
        Pull changes from MySQL sync_table since last_sync_time and apply to local JSON.
        """
        try:
            with DatabaseConnection.get_connection_ctx() as conn:
                cursor = conn.cursor(dictionary=True)

                last_sync = self.get_last_sync_timestamp()

                if last_sync:
                    cursor.execute("""
                        SELECT * FROM `sync_table`
                        WHERE `timestamp` > %s
                        ORDER BY `timestamp` ASC
                    """, (last_sync,))
                else:
                    cursor.execute("""
                        SELECT * FROM `sync_table`
                        WHERE `timestamp` >= DATE_SUB(NOW(), INTERVAL 1 DAY)
                        ORDER BY `timestamp` ASC
                    """)

                new_entries = cursor.fetchall()

                if not new_entries:
                    logger.info("No new entries from MySQL sync_table")
                    return {"status": "success", "message": "No new entries", "pulled": 0}

                logger.info(f"Pulled {len(new_entries)} new entries from MySQL sync_table")

                applied = 0
                for entry in new_entries:
                    try:
                        change_data = json.loads(entry.get('change_data', '{}'))
                        change_type_parts = (entry.get('change_type') or '').split('_')

                        if len(change_type_parts) >= 2:
                            table_name = '_'.join(change_type_parts[:-1])  # Everything except last part
                            operation = change_type_parts[-1].upper()      # Last part as operation

                            self._apply_to_local_json(table_name, operation, change_data)
                            applied += 1

                    except Exception as e:
                        logger.error(f"Error applying pulled change: {e}")

                if new_entries:
                    latest_timestamp = max(entry['timestamp'] for entry in new_entries if entry.get('timestamp'))
                    if latest_timestamp:
                        self.set_last_sync_timestamp(latest_timestamp.isoformat())

                return {
                    "status": "success",
                    "message": f"Pulled {len(new_entries)} entries, applied {applied}",
                    "pulled": len(new_entries),
                    "applied": applied
                }

        except Exception as e:
            logger.error(f"Error pulling from MySQL sync_table: {e}")
            return {"status": "error", "message": str(e)}

    def _apply_to_local_json(self, table_name: str, operation: str, change_data: Dict) -> None:
        """Apply pulled changes to local JSON files"""
        json_file_mapping = {
            'Products': 'products.json',
            'Users': 'users.json',
            'Bills': 'bills.json',
            'Customers': 'customers.json',
            'Stores': 'stores.json',
            'SystemSettings': 'settings.json',
            'Notifications': 'notifications.json'
        }

        json_file = json_file_mapping.get(table_name)
        if not json_file:
            return

        file_path = os.path.join(self.base_dir, 'data', 'json', json_file)

        if json_file == 'settings.json':
            settings = self._safe_json_load(file_path, {})
            if operation in ['CREATE', 'UPDATE']:
                settings.update(change_data)
            self._safe_json_dump(file_path, settings)
            logger.info(f"Applied {operation} to {json_file}")
            return

        data = self._safe_json_load(file_path, [])
        record_id = change_data.get('id')

        if operation in ['CREATE', 'UPDATE']:
            found = False
            for i, item in enumerate(data):
                if item.get('id') == record_id:
                    data[i] = change_data
                    found = True
                    break
            if not found:
                data.append(change_data)

        elif operation == 'DELETE':
            data = [item for item in data if item.get('id') != record_id]

        self._safe_json_dump(file_path, data)
        logger.info(f"Applied {operation} to {json_file} for record {record_id}")

    # ---------- Maintenance ----------

    def cleanup_old_logs(self) -> Dict:
        """
        Clean up logs older than 30 days (local sync table, local sync logs, and MySQL sync_table).
        """
        cutoff_date = datetime.now() - timedelta(days=30)

        # Local sync table
        sync_table = self.get_local_sync_table()
        original_count = len(sync_table)
        sync_table = [
            entry for entry in sync_table
            if datetime.fromisoformat(entry.get('created_at', entry.get('sync_time', datetime.now().isoformat()))) > cutoff_date
        ]
        local_cleaned = original_count - len(sync_table)
        self.save_local_sync_table(sync_table)

        # Local sync logs
        sync_logs = self.get_sync_logs()
        original_logs_count = len(sync_logs)
        sync_logs = [
            log for log in sync_logs
            if datetime.fromisoformat(log.get('timestamp', datetime.now().isoformat())) > cutoff_date
        ]
        logs_cleaned = original_logs_count - len(sync_logs)
        self.save_sync_logs(sync_logs)

        # MySQL sync_table
        mysql_cleaned = 0
        try:
            with DatabaseConnection.get_connection_ctx() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM `sync_table` WHERE `timestamp` < %s", (cutoff_date,))
                mysql_cleaned = cursor.rowcount
                conn.commit()
        except Exception as e:
            logger.error(f"Error cleaning MySQL sync_table: {e}")

        logger.info(f"Cleanup completed: {local_cleaned} local entries, {logs_cleaned} logs, {mysql_cleaned} MySQL entries")

        return {
            "status": "success",
            "local_cleaned": local_cleaned,
            "logs_cleaned": logs_cleaned,
            "mysql_cleaned": mysql_cleaned
        }

    # ---------- Scheduler / Status ----------

    def start_background_sync(self) -> None:
        """
        Start background sync process on schedule:
        - every 15 minutes: push pending logs and pull from MySQL
        - every 15 minutes: retry failed logs
        - daily 02:00: cleanup old logs
        """
        if self.is_running:
            logger.info("Background sync already running")
            return

        self.is_running = True

        schedule.every(15).minutes.do(self.scheduled_sync)
        schedule.every(15).minutes.do(self.retry_failed_logs)
        schedule.every().day.at("02:00").do(self.cleanup_old_logs)

        def run_scheduler():
            logger.info("Background sync scheduler started")

            # Initial run
            self.scheduled_sync()

            while self.is_running:
                schedule.run_pending()
                time.sleep(60)  # Check every minute

        self.sync_thread = threading.Thread(target=run_scheduler, daemon=True)
        self.sync_thread.start()

        logger.info("Background sync process started")

    def scheduled_sync(self) -> None:
        """Scheduled sync operation - runs every 15 minutes"""
        logger.info("Starting scheduled sync...")

        try:
            push_result = self.process_pending_logs()
            logger.info(f"Push sync result: {push_result}")

            pull_result = self.pull_from_mysql_sync_table()
            logger.info(f"Pull sync result: {pull_result}")

            self.log_sync_event("scheduled_sync", "completed", {
                "push_result": push_result,
                "pull_result": pull_result,
                "sync_time": datetime.now().isoformat()
            })

        except Exception as e:
            logger.error(f"Error in scheduled sync: {e}")
            self.log_sync_event("scheduled_sync", "failed", {
                "error": str(e),
                "sync_time": datetime.now().isoformat()
            })

    def stop_background_sync(self) -> None:
        """Stop background sync process"""
        self.is_running = False
        if self.sync_thread:
            self.sync_thread.join(timeout=5)
        logger.info("Background sync process stopped")

    def get_sync_status(self) -> Dict:
        """Get current sync status"""
        sync_table = self.get_local_sync_table()

        pending_count = len([log for log in sync_table if log.get('status') == 'pending'])
        failed_count = len([log for log in sync_table if log.get('status') == 'failed'])
        completed_count = len([log for log in sync_table if log.get('status') == 'completed'])

        return {
            "is_running": self.is_running,
            "last_sync": self.get_last_sync_timestamp(),
            "pending_logs": pending_count,
            "failed_logs": failed_count,
            "completed_logs": completed_count,
            "total_logs": len(sync_table)
        }


# Global instance holder
sync_manager_instance: Optional[EnhancedSyncManager] = None

def get_sync_manager(base_dir: str) -> EnhancedSyncManager:
    """Get or create sync manager instance"""
    global sync_manager_instance
    if sync_manager_instance is None:
        sync_manager_instance = EnhancedSyncManager(base_dir)
    return sync_manager_instance


# Integration helper for app endpoints
def log_json_crud_operation(json_type: str, operation: str, record_id: str, data: Dict) -> None:
    """
    Integration function to log CRUD operations from Flask app.
    Map JSON collections to DB table names and queue the change.
    """
    json_to_table_mapping = {
        'products': 'Products',
        'users': 'Users',
        'bills': 'Bills',
        'customers': 'Customers',
        'stores': 'Stores',
        'notifications': 'Notifications',
        'settings': 'SystemSettings'
    }

    table_name = json_to_table_mapping.get(json_type)
    if table_name:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        manager = get_sync_manager(os.path.dirname(base_dir))  # pass backend path
        manager.log_crud_operation(table_name, operation, record_id, data)


if __name__ == "__main__":
    # Example standalone run (for debugging)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    manager = EnhancedSyncManager(base_dir)

    # Start background sync
    manager.start_background_sync()

    try:
        while True:
            time.sleep(10)
            status = manager.get_sync_status()
            print(f"Sync Status: {status}")
    except KeyboardInterrupt:
        manager.stop_background_sync()
        print("Sync manager stopped")
