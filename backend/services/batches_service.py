"""
Batches Service
Handles all batch-related business logic and database operations
"""
import logging
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple

from utils.supabase_db import db
from utils.json_helpers import get_batches_data, save_batches_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

logger = logging.getLogger(__name__)


# ============================================
# LOCAL JSON OPERATIONS
# ============================================

def get_local_batches() -> List[Dict]:
    """Get batches from local JSON storage"""
    try:
        batches = get_batches_data()
        transformed_batches = [convert_snake_to_camel(batch) for batch in batches]
        logger.debug(f"Returning {len(transformed_batches)} batches from local JSON.")
        return transformed_batches
    except Exception as e:
        logger.error(f"Error getting local batches: {e}", exc_info=True)
        return []


# ============================================
# SUPABASE OPERATIONS
# ============================================

def get_supabase_batches() -> List[Dict]:
    """Get batches directly from Supabase"""
    try:
        client = db.client
        response = client.table("batch").select("*").execute()
        batches = response.data or []
        
        transformed_batches = [convert_snake_to_camel(batch) for batch in batches]
        logger.debug(f"Returning {len(transformed_batches)} batches from Supabase.")
        return transformed_batches
    except Exception as e:
        logger.error(f"Error getting Supabase batches: {e}", exc_info=True)
        return []


# ============================================
# MERGED OPERATIONS
# ============================================

def get_merged_batches() -> Tuple[List[Dict], int]:
    """
    Get batches by merging local and Supabase (Supabase takes precedence).
    Returns (batches_list, status_code)
    """
    try:
        # Fetch from Supabase (preferred source)
        supabase_batches = get_supabase_batches()
        
        # Fetch from local JSON (fallback)
        local_batches = get_local_batches()
        
        # Merge: Supabase takes precedence
        batches_map = {}
        
        # Add local batches first (lower priority)
        for batch in local_batches:
            if batch.get('id'):
                batches_map[batch['id']] = batch
        
        # Add Supabase batches (higher priority)
        for batch in supabase_batches:
            if batch.get('id'):
                batches_map[batch['id']] = batch
        
        final_batches = list(batches_map.values())
        final_batches.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        
        logger.debug(f"Returning {len(final_batches)} merged batches")
        return final_batches, 200
        
    except Exception as e:
        logger.error(f"Error getting merged batches: {e}", exc_info=True)
        return [], 500


# ============================================
# BUSINESS LOGIC
# ============================================

def create_batch(batch_data: dict) -> Tuple[Optional[str], str, int]:
    """
    Create a new batch.
    Returns (batch_id, message, status_code)
    """
    try:
        if not batch_data:
            return None, "No batch data provided", 400
        
        # Convert field names
        batch_data = convert_camel_to_snake(batch_data)
        
        # Generate ID if not present
        if 'id' not in batch_data:
            batch_data['id'] = str(uuid.uuid4())
        
        # Add timestamps
        now_naive = datetime.now().isoformat()
        if 'createdat' not in batch_data:
            batch_data['createdat'] = now_naive
        batch_data['updatedat'] = now_naive
        
        # Save to local JSON first (offline-first)
        batches = get_batches_data()
        existing_idx = next((i for i, b in enumerate(batches) if b.get("id") == batch_data["id"]), -1)
        if existing_idx >= 0:
            batches[existing_idx] = batch_data
        else:
            batches.append(batch_data)
        save_batches_data(batches)

        # Best-effort Supabase sync now; queue handles retry on failure
        try:
            client = db.client
            client.table('batch').upsert(batch_data).execute()
        except Exception as supabase_error:
            logger.warning(
                f"Batch {batch_data['id']} saved locally; Supabase sync deferred: {supabase_error}"
            )
            return batch_data["id"], "Batch saved locally and queued for sync", 201
        
        logger.info(f"Batch created {batch_data['id']}")
        return batch_data['id'], "Batch created", 201
        
    except Exception as e:
        logger.error(f"Error creating batch: {e}", exc_info=True)
        return None, str(e), 500


def update_batch(batch_id: str, update_data: dict) -> Tuple[bool, str, int]:
    """
    Update a batch.
    Returns (success, message, status_code)
    """
    try:
        if not update_data:
            return False, "No update data provided", 400
        
        # Convert field names
        update_data = convert_camel_to_snake(update_data)
        
        # Find batch in local storage
        batches = get_batches_data()
        batch_index = next((i for i, b in enumerate(batches) if b.get('id') == batch_id), -1)
        
        if batch_index == -1:
            return False, "Batch not found", 404
        
        # Update timestamp
        update_data['updatedat'] = datetime.now().isoformat()
        
        # Update in local JSON
        batches[batch_index].update(update_data)
        save_batches_data(batches)
        
        # Update in Supabase
        client = db.client
        client.table('batch').update(update_data).eq('id', batch_id).execute()
        
        logger.info(f"Batch updated {batch_id}")
        return True, "Batch updated", 200
        
    except Exception as e:
        logger.error(f"Error updating batch: {e}", exc_info=True)
        return False, str(e), 500


def delete_batch(batch_id: str) -> Tuple[bool, str, int]:
    """
    Delete a batch.
    Returns (success, message, status_code)
    """
    try:
        # Delete from local JSON
        batches = get_batches_data()
        batch_index = next((i for i, b in enumerate(batches) if b.get('id') == batch_id), -1)
        
        if batch_index == -1:
            return False, "Batch not found", 404
        
        batches.pop(batch_index)
        save_batches_data(batches)
        
        # Delete from Supabase
        client = db.client
        client.table('batch').delete().eq('id', batch_id).execute()
        
        logger.info(f"Batch deleted {batch_id}")
        return True, "Batch deleted", 200
        
    except Exception as e:
        logger.error(f"Error deleting batch: {e}", exc_info=True)
        return False, str(e), 500
