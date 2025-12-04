"""
Bills Service
Handles all bill-related business logic and database operations
"""
import logging
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from decimal import Decimal

from utils.supabase_db import db
from utils.json_helpers import get_bills_data, save_bills_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

logger = logging.getLogger(__name__)


# ============================================
# LOCAL JSON OPERATIONS
# ============================================

def get_local_bills() -> List[Dict]:
    """Get bills from local JSON storage"""
    try:
        bills = get_bills_data()
        transformed_bills = [convert_snake_to_camel(bill) for bill in bills]
        logger.debug(f"Returning {len(transformed_bills)} bills from local JSON.")
        return transformed_bills
    except Exception as e:
        logger.error(f"Error getting local bills: {e}", exc_info=True)
        return []


def update_local_bills(bills_data: List[Dict]) -> bool:
    """Update local JSON bills with new data"""
    try:
        if not isinstance(bills_data, list):
            logger.error("Expected a list of bills")
            return False
        
        # Convert from camelCase to snake_case before saving
        snake_case_bills = [convert_camel_to_snake(bill) for bill in bills_data]
        save_bills_data(snake_case_bills)
        
        logger.info(f"Updated local JSON with {len(bills_data)} bills.")
        return True
    except Exception as e:
        logger.error(f"Error updating local bills: {e}", exc_info=True)
        return False


# ============================================
# SUPABASE OPERATIONS
# ============================================

def get_supabase_bills() -> List[Dict]:
    """Get bills directly from Supabase"""
    try:
        client = db.client
        response = client.table("bills").select("*").execute()
        bills = response.data or []
        
        transformed_bills = [convert_snake_to_camel(bill) for bill in bills]
        logger.debug(f"Returning {len(transformed_bills)} bills from Supabase.")
        return transformed_bills
    except Exception as e:
        logger.error(f"Error getting Supabase bills: {e}", exc_info=True)
        return []


def get_supabase_bills_with_details() -> List[Dict]:
    """Get bills with full item details from Supabase"""
    try:
        client = db.client
        response = client.table("bills").select("*, items:billitems(*)").execute()
        bills = response.data or []
        
        transformed_bills = [convert_snake_to_camel(bill) for bill in bills]
        logger.debug(f"Returning {len(transformed_bills)} bills with details from Supabase.")
        return transformed_bills
    except Exception as e:
        logger.error(f"Error getting Supabase bills with details: {e}", exc_info=True)
        return []


# ============================================
# MERGED OPERATIONS
# ============================================

def get_merged_bills() -> Tuple[List[Dict], int]:
    """
    Get bills by merging local and Supabase (Supabase takes precedence).
    Returns (bills_list, status_code)
    """
    try:
        # Fetch from Supabase (preferred source)
        supabase_bills = get_supabase_bills()
        
        # Fetch from local JSON (fallback)
        local_bills = get_local_bills()
        
        # Merge: Supabase takes precedence
        bills_map = {}
        
        # Add local bills first (lower priority)
        for bill in local_bills:
            if bill.get('id'):
                bills_map[bill['id']] = bill
        
        # Add Supabase bills (higher priority)
        for bill in supabase_bills:
            if bill.get('id'):
                bills_map[bill['id']] = bill
        
        final_bills = list(bills_map.values())
        final_bills.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        
        logger.debug(f"Returning {len(final_bills)} merged bills")
        return final_bills, 200
        
    except Exception as e:
        logger.error(f"Error getting merged bills: {e}", exc_info=True)
        return [], 500


# ============================================
# BUSINESS LOGIC
# ============================================

def create_bill(bill_data: dict) -> Tuple[Optional[str], str, int]:
    """
    Create a new bill.
    Returns (bill_id, message, status_code)
    """
    try:
        if not bill_data:
            return None, "No bill data provided", 400
        
        # Convert field names
        bill_data = convert_camel_to_snake(bill_data)
        
        # Generate ID if not present
        if 'id' not in bill_data:
            bill_data['id'] = str(uuid.uuid4())
        
        # Add timestamps
        now_naive = datetime.now().isoformat()
        if 'createdat' not in bill_data:
            bill_data['createdat'] = now_naive
        bill_data['updatedat'] = now_naive
        
        # Extract items if present
        items = bill_data.pop('items', [])
        
        # Insert bill into Supabase
        client = db.client
        supabase_response = client.table('bills').insert(bill_data).execute()
        
        if not supabase_response.data:
            return None, "Failed to insert bill into Supabase", 500
        
        # Insert bill items if present
        if items:
            for item in items:
                item['bill_id'] = bill_data['id']
                if 'id' not in item:
                    item['id'] = str(uuid.uuid4())
            
            client.table('bill_items').insert(items).execute()
        
        # Save to local JSON
        bills = get_bills_data()
        bill_data['items'] = items  # Add items back for local storage
        bills.append(bill_data)
        save_bills_data(bills)
        
        logger.info(f"Bill created {bill_data['id']}")
        return bill_data['id'], "Bill created", 201
        
    except Exception as e:
        logger.error(f"Error creating bill: {e}", exc_info=True)
        return None, str(e), 500


def delete_bill(bill_id: str) -> Tuple[bool, str, int]:
    """
    Delete a bill.
    Returns (success, message, status_code)
    """
    try:
        # Delete from local JSON
        bills = get_bills_data()
        bill_index = next((i for i, b in enumerate(bills) if b.get('id') == bill_id), -1)
        
        if bill_index == -1:
            return False, "Bill not found", 404
        
        bills.pop(bill_index)
        save_bills_data(bills)
        
        # Delete from Supabase
        client = db.client
        client.table('bills').delete().eq('id', bill_id).execute()
        
        logger.info(f"Bill deleted {bill_id}")
        return True, "Bill deleted", 200
        
    except Exception as e:
        logger.error(f"Error deleting bill: {e}", exc_info=True)
        return False, str(e), 500
