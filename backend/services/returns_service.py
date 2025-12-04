"""
Returns Service
Handles all return-related business logic and database operations
"""
import logging
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple

from utils.supabase_db import db
from utils.json_helpers import get_returns_data, save_returns_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

logger = logging.getLogger(__name__)


# ============================================
# LOCAL JSON OPERATIONS
# ============================================

def get_local_returns() -> List[Dict]:
    """Get returns from local JSON storage"""
    try:
        returns = get_returns_data()
        transformed_returns = [convert_snake_to_camel(ret) for ret in returns]
        logger.debug(f"Returning {len(transformed_returns)} returns from local JSON.")
        return transformed_returns
    except Exception as e:
        logger.error(f"Error getting local returns: {e}", exc_info=True)
        return []


# ============================================
# SUPABASE OPERATIONS
# ============================================

def get_supabase_returns() -> List[Dict]:
    """Get returns directly from Supabase"""
    try:
        client = db.client
        response = client.table("returns").select("*").execute()
        returns = response.data or []
        
        transformed_returns = [convert_snake_to_camel(ret) for ret in returns]
        logger.debug(f"Returning {len(transformed_returns)} returns from Supabase.")
        return transformed_returns
    except Exception as e:
        logger.error(f"Error getting Supabase returns: {e}", exc_info=True)
        return []


# ============================================
# MERGED OPERATIONS
# ============================================

def get_merged_returns() -> Tuple[List[Dict], int]:
    """
    Get returns by merging local and Supabase (Supabase takes precedence).
    Returns (returns_list, status_code)
    """
    try:
        # Fetch from Supabase (preferred source)
        supabase_returns = get_supabase_returns()
        
        # Fetch from local JSON (fallback)
        local_returns = get_local_returns()
        
        # Merge: Supabase takes precedence
        returns_map = {}
        
        # Add local returns first (lower priority)
        for ret in local_returns:
            if ret.get('id'):
                returns_map[ret['id']] = ret
        
        # Add Supabase returns (higher priority)
        for ret in supabase_returns:
            if ret.get('id'):
                returns_map[ret['id']] = ret
        
        final_returns = list(returns_map.values())
        final_returns.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        
        logger.debug(f"Returning {len(final_returns)} merged returns")
        return final_returns, 200
        
    except Exception as e:
        logger.error(f"Error getting merged returns: {e}", exc_info=True)
        return [], 500


# ============================================
# BUSINESS LOGIC
# ============================================

def create_return(return_data: dict) -> Tuple[Optional[str], str, int]:
    """
    Create a new return.
    Returns (return_id, message, status_code)
    """
    try:
        if not return_data:
            return None, "No return data provided", 400
        
        # Convert field names
        return_data = convert_camel_to_snake(return_data)
        
        # Generate ID if not present
        if 'id' not in return_data:
            return_data['id'] = str(uuid.uuid4())
        
        # Add timestamps
        now_naive = datetime.now().isoformat()
        if 'createdat' not in return_data:
            return_data['createdat'] = now_naive
        return_data['updatedat'] = now_naive
        
        # Set default status if not provided
        if 'status' not in return_data:
            return_data['status'] = 'pending'
        
        # Insert into Supabase
        client = db.client
        supabase_response = client.table('returns').insert(return_data).execute()
        
        if not supabase_response.data:
            return None, "Failed to insert return into Supabase", 500
        
        # Save to local JSON
        returns = get_returns_data()
        returns.append(return_data)
        save_returns_data(returns)
        
        logger.info(f"Return created {return_data['id']}")
        return return_data['id'], "Return created", 201
        
    except Exception as e:
        logger.error(f"Error creating return: {e}", exc_info=True)
        return None, str(e), 500


def update_return_status(return_id: str, status: str) -> Tuple[bool, str, int]:
    """
    Update return status.
    Returns (success, message, status_code)
    """
    try:
        if not status:
            return False, "No status provided", 400
        
        # Find return in local storage
        returns = get_returns_data()
        return_index = next((i for i, r in enumerate(returns) if r.get('id') == return_id), -1)
        
        if return_index == -1:
            return False, "Return not found", 404
        
        # Update status
        update_data = {
            'status': status,
            'updatedat': datetime.now().isoformat()
        }
        
        # Update in local JSON
        returns[return_index].update(update_data)
        save_returns_data(returns)
        
        # Update in Supabase
        client = db.client
        client.table('returns').update(update_data).eq('id', return_id).execute()
        
        logger.info(f"Return {return_id} status updated to {status}")
        return True, "Return status updated", 200
        
    except Exception as e:
        logger.error(f"Error updating return status: {e}", exc_info=True)
        return False, str(e), 500
