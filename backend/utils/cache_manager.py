"""
Cache Manager for local JSON storage
Local JSON now acts as read-only cache of Supabase data
"""
import json
import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

class CacheManager:
    """Manages local JSON cache for offline access"""
    
    def __init__(self, base_dir: str = None):
        self.base_dir = base_dir or os.path.join(
            os.environ.get("APP_BASE_DIR", os.getcwd()), 
            "data", 
            "json"
        )
        os.makedirs(self.base_dir, exist_ok=True)
    
    def get_cache_file(self, entity: str) -> str:
        """Get cache file path for entity"""
        return os.path.join(self.base_dir, f"{entity}.json")
    
    def read(self, entity: str, default: Any = None) -> Any:
        """Read from cache"""
        file_path = self.get_cache_file(entity)
        
        if not os.path.exists(file_path):
            return default if default is not None else []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                logger.debug(f"📖 Cache read: {entity} ({len(data) if isinstance(data, list) else 'N/A'} items)")
                return data
        except json.JSONDecodeError as e:
            logger.error(f"Cache corrupted for {entity}: {e}")
            return default if default is not None else []
        except Exception as e:
            logger.error(f"Error reading cache {entity}: {e}")
            return default if default is not None else []
    
    def write(self, entity: str, data: Any):
        """Write to cache"""
        file_path = self.get_cache_file(entity)
        
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            logger.debug(f"💾 Cache updated: {entity} ({len(data) if isinstance(data, list) else 'N/A'} items)")
        except Exception as e:
            logger.error(f"Error writing cache {entity}: {e}")
    
    def update_item(self, entity: str, item_id: str, updated_data: dict) -> bool:
        """Update a single item in cache"""
        data = self.read(entity, [])
        
        for i, item in enumerate(data):
            if item.get("id") == item_id:
                data[i].update(updated_data)
                self.write(entity, data)
                return True
        
        return False
    
    def add_item(self, entity: str, item: dict) -> bool:
        """Add item to cache"""
        data = self.read(entity, [])
        data.append(item)
        self.write(entity, data)
        return True
    
    def remove_item(self, entity: str, item_id: str) -> bool:
        """Remove item from cache"""
        data = self.read(entity, [])
        original_len = len(data)
        data = [item for item in data if item.get("id") != item_id]
        
        if len(data) < original_len:
            self.write(entity, data)
            return True
        
        return False
    
    def clear(self, entity: str):
        """Clear cache for entity"""
        file_path = self.get_cache_file(entity)
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"🗑️ Cache cleared: {entity}")
    
    def get_metadata(self, entity: str) -> Dict:
        """Get cache metadata"""
        file_path = self.get_cache_file(entity)
        
        if not os.path.exists(file_path):
            return {"exists": False}
        
        stat = os.stat(file_path)
        data = self.read(entity, [])
        
        return {
            "exists": True,
            "size_bytes": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "item_count": len(data) if isinstance(data, list) else None
        }

# Global instance
cache = CacheManager()
