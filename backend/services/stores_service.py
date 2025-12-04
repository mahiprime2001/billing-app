"""
Stores Service
Handles all store and inventory-related business logic and database operations
"""

import logging
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from utils.supabase_db import db
from utils.json_helpers import (
    get_stores_data, save_stores_data,
    get_store_inventory_data, save_store_inventory_data
)
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

logger = logging.getLogger(__name__)

# ============================================
# LOCAL JSON OPERATIONS - STORES
# ============================================

def get_local_stores() -> List[Dict]:
    """Get stores from local JSON storage"""
    try:
        stores = get_stores_data()
        transformed_stores = [convert_snake_to_camel(store) for store in stores]
        logger.debug(f"Returning {len(transformed_stores)} stores from local JSON.")
        return transformed_stores
    except Exception as e:
        logger.error(f"Error getting local stores: {e}", exc_info=True)
        return []

# ============================================
# SUPABASE OPERATIONS - STORES
# ============================================

def get_supabase_stores() -> List[Dict]:
    """Get stores directly from Supabase"""
    try:
        client = db.client
        response = client.table("stores").select("*").execute()
        stores = response.data or []
        transformed_stores = [convert_snake_to_camel(store) for store in stores]
        logger.debug(f"Returning {len(transformed_stores)} stores from Supabase.")
        return transformed_stores
    except Exception as e:
        logger.error(f"Error getting Supabase stores: {e}", exc_info=True)
        return []

# ============================================
# MERGED OPERATIONS - STORES
# ============================================

def get_merged_stores() -> Tuple[List[Dict], int]:
    """
    Get stores by merging local and Supabase (Supabase takes precedence).
    Returns (stores_list, status_code)
    """
    try:
        # Fetch from Supabase (preferred source)
        supabase_stores = get_supabase_stores()
        
        # Fetch from local JSON (fallback)
        local_stores = get_local_stores()
        
        # Merge: Supabase takes precedence
        stores_map = {}
        
        # Add local stores first (lower priority)
        for store in local_stores:
            if store.get('id'):
                stores_map[store['id']] = store
        
        # Add Supabase stores (higher priority)
        for store in supabase_stores:
            if store.get('id'):
                stores_map[store['id']] = store
        
        final_stores = list(stores_map.values())
        logger.debug(f"Returning {len(final_stores)} merged stores")
        return final_stores, 200
        
    except Exception as e:
        logger.error(f"Error getting merged stores: {e}", exc_info=True)
        return [], 500

# ============================================
# SYNC OPERATIONS
# ============================================

def sync_local_from_supabase() -> Tuple[bool, str, int]:
    """
    Sync local storage from Supabase (overwrite local with Supabase data).
    Returns (success, message, status_code)
    """
    try:
        logger.info("Starting sync from Supabase to local storage")
        
        # Get all stores from Supabase
        client = db.client
        response = client.table("stores").select("*").execute()
        stores = response.data or []
        
        # Convert to snake_case for local storage
        stores_snake = [convert_camel_to_snake(store) for store in stores]
        
        # Save to local JSON
        save_stores_data(stores_snake)
        
        logger.info(f"✅ Synced {len(stores_snake)} stores from Supabase to local storage")
        return True, f"Synced {len(stores_snake)} stores", 200
        
    except Exception as e:
        logger.error(f"❌ Error syncing stores: {e}", exc_info=True)
        return False, str(e), 500

# ============================================
# BUSINESS LOGIC - STORES
# ============================================

def create_store(store_data: dict) -> Tuple[Optional[str], str, int]:
    """
    Create a new store.
    Returns (store_id, message, status_code)
    """
    try:
        if not store_data:
            return None, "No store data provided", 400

        # Convert field names
        store_data = convert_camel_to_snake(store_data)

        # Generate ID if not present
        if 'id' not in store_data:
            store_data['id'] = str(uuid.uuid4())

        # Add timestamps
        now_naive = datetime.now().isoformat()
        if 'createdat' not in store_data:
            store_data['createdat'] = now_naive
        store_data['updatedat'] = now_naive

        # Remove 'email' and 'manager' if present, as they are not columns in the 'stores' table
        store_data.pop('email', None)
        store_data.pop('manager', None)

        # Insert into Supabase
        client = db.client
        supabase_response = client.table('stores').insert(store_data).execute()

        if not supabase_response.data:
            return None, "Failed to insert store into Supabase", 500

        # Save to local JSON
        stores = get_stores_data()
        stores.append(store_data)
        save_stores_data(stores)

        logger.info(f"Store created {store_data['id']}")
        return store_data['id'], "Store created", 201

    except Exception as e:
        logger.error(f"Error creating store: {e}", exc_info=True)
        return None, str(e), 500

def update_store(store_id: str, update_data: dict) -> Tuple[bool, str, int]:
    """
    Update a store.
    Returns (success, message, status_code)
    """
    try:
        if not update_data:
            return False, "No update data provided", 400

        # Convert field names
        update_data = convert_camel_to_snake(update_data)

        # Find store in local storage
        stores = get_stores_data()
        store_index = next((i for i, s in enumerate(stores) if s.get('id') == store_id), -1)

        if store_index == -1:
            return False, "Store not found", 404

        # Update timestamp
        update_data['updatedat'] = datetime.now().isoformat()

        # Update in local JSON
        stores[store_index].update(update_data)
        save_stores_data(stores)

        # Update in Supabase
        client = db.client
        client.table('stores').update(update_data).eq('id', store_id).execute()

        logger.info(f"Store updated {store_id}")
        return True, "Store updated", 200

    except Exception as e:
        logger.error(f"Error updating store: {e}", exc_info=True)
        return False, str(e), 500

def delete_store(store_id: str) -> Tuple[bool, str, int]:
    """
    Delete a store from both local storage and Supabase.
    Bills are preserved with storeId set to NULL.
    Returns (success, message, status_code)
    """
    local_deleted = False
    supabase_deleted = False
    
    try:
        client = db.client
        
        # Step 0: Update bills to remove store reference (set storeId to NULL)
        logger.info(f"🔍 Checking for bills associated with store_id: {store_id}")
        try:
            bills_response = client.table('bills').select('id').eq('storeid', store_id).execute()
            if bills_response.data and len(bills_response.data) > 0:
                bill_count = len(bills_response.data)
                logger.info(f"Found {bill_count} bill(s) for store {store_id}")
                
                # Set storeId to NULL in all bills
                update_response = client.table('bills').update({'storeid': None}).eq('storeid', store_id).execute()
                logger.info(f"✅ Updated {bill_count} bill(s) - set storeId to NULL (bills preserved)")
            else:
                logger.info(f"No bills found for store {store_id}")
        except Exception as bills_error:
            logger.error(f"❌ Failed to update bills: {bills_error}", exc_info=True)
            return False, f"Failed to update bills: {str(bills_error)}", 500
        
        # Step 1: Delete associated userstores entries
        logger.info(f"🔍 Checking userstores for store_id: {store_id}")
        try:
            # Check if there are any userstores entries
            check_response = client.table('userstores').select('*').eq('storeId', store_id).execute()
            logger.info(f"Found {len(check_response.data) if check_response.data else 0} userstores entries")
            
            if check_response.data and len(check_response.data) > 0:
                # Delete userstores entries
                delete_response = client.table('userstores').delete().eq('storeId', store_id).execute()
                logger.info(f"✅ Deleted {len(delete_response.data) if delete_response.data else 0} userstores entries")
            else:
                logger.info(f"No userstores entries to delete for store_id: {store_id}")
        except Exception as userstore_error:
            logger.error(f"❌ Failed to delete userstores: {userstore_error}", exc_info=True)
            return False, f"Failed to delete user-store associations: {str(userstore_error)}", 500
        
        # Step 2: Delete from local JSON
        logger.info(f"Starting deletion of store {store_id} from local JSON")
        stores = get_stores_data()
        logger.debug(f"Current stores count: {len(stores)}")
        
        store_index = next((i for i, s in enumerate(stores) if s.get('id') == store_id), -1)
        
        if store_index == -1:
            logger.warning(f"⚠️ Store {store_id} not found in local storage - will still attempt Supabase deletion")
            # Don't return error, continue to delete from Supabase
        else:
            # Remove from list
            deleted_store = stores.pop(store_index)
            logger.info(f"Removing store: {deleted_store.get('name', 'Unknown')} (ID: {store_id})")
            
            # Save to local JSON
            try:
                save_stores_data(stores)
                local_deleted = True
                logger.info(f"✅ Saved to local storage. New count: {len(stores)}")
                
                # Verify it was saved
                verification = get_stores_data()
                logger.debug(f"Verification: {len(verification)} stores in local storage after save")
            except Exception as save_error:
                logger.error(f"❌ Failed to save to local storage: {save_error}", exc_info=True)
                # Don't raise - continue to delete from Supabase
        
        # Step 3: Delete from Supabase
        try:
            logger.info(f"Attempting to delete store {store_id} from Supabase")
            supabase_response = client.table('stores').delete().eq('id', store_id).execute()
            
            if supabase_response.data:
                supabase_deleted = True
                logger.info(f"✅ Deleted store {store_id} from Supabase")
            else:
                logger.warning(f"⚠️ No data returned from Supabase deletion for {store_id}")
                supabase_deleted = True  # Still consider it successful
                
        except Exception as supabase_error:
            logger.error(f"❌ Supabase deletion failed: {supabase_error}", exc_info=True)
            return False, f"Failed to delete from Supabase: {str(supabase_error)}", 500
        
        # Summary
        if local_deleted or supabase_deleted:
            logger.info(f"✅ Store {store_id} deleted - Local: {local_deleted}, Supabase: {supabase_deleted}")
            return True, "Store deleted successfully (bills preserved)", 200
        else:
            return False, "Store not found in any storage", 404
        
    except Exception as e:
        logger.error(f"❌ Error deleting store {store_id}: {e}", exc_info=True)
        return False, str(e), 500

# ============================================
# INVENTORY OPERATIONS
# ============================================

def get_store_inventory(store_id: str) -> Tuple[Optional[List[Dict]], int]:
    """
    Get inventory for a specific store.
    Returns (inventory_list, status_code)
    """
    try:
        inventory = get_store_inventory_data()
        store_inventory = [inv for inv in inventory if inv.get('store_id') == store_id]
        
        # Transform to camelCase
        transformed = [convert_snake_to_camel(inv) for inv in store_inventory]
        return transformed, 200
        
    except Exception as e:
        logger.error(f"Error getting store inventory: {e}", exc_info=True)
        return None, 500

def assign_products_to_store(store_id: str, products: List[Dict]) -> Tuple[bool, str, int]:
    """
    Assign products to a store.
    Returns (success, message, status_code)
    """
    try:
        client = db.client
        inventory = get_store_inventory_data()
        
        for product in products:
            product_id = product.get('productId') or product.get('product_id')
            quantity = product.get('quantity', 0)
            
            # Check if inventory record exists
            existing = next(
                (inv for inv in inventory
                 if inv.get('store_id') == store_id and inv.get('product_id') == product_id),
                None
            )
            
            if existing:
                # Update existing inventory
                new_quantity = existing.get('quantity', 0) + quantity
                existing['quantity'] = new_quantity
                existing['updatedat'] = datetime.now().isoformat()
                
                # Update in Supabase
                client.table('storeinventory').update({
                    'quantity': new_quantity,
                    'updatedat': existing['updatedat']
                }).eq('id', existing['id']).execute()
            else:
                # Create new inventory record
                new_inv = {
                    'id': str(uuid.uuid4()),
                    'store_id': store_id,
                    'product_id': product_id,
                    'quantity': quantity,
                    'createdat': datetime.now().isoformat(),
                    'updatedat': datetime.now().isoformat()
                }
                inventory.append(new_inv)
                
                # Insert into Supabase
                client.table('storeinventory').insert(new_inv).execute()
        
        # Save to local JSON
        save_store_inventory_data(inventory)
        
        logger.info(f"Assigned {len(products)} products to store {store_id}")
        return True, "Products assigned to store", 200
        
    except Exception as e:
        logger.error(f"Error assigning products to store: {e}", exc_info=True)
        return False, str(e), 500

def adjust_inventory(inventory_id: str, adjustment: int) -> Tuple[bool, str, int]:
    """
    Adjust inventory quantity.
    Returns (success, message, status_code)
    """
    try:
        inventory = get_store_inventory_data()
        inv_index = next((i for i, inv in enumerate(inventory) if inv.get('id') == inventory_id), -1)
        
        if inv_index == -1:
            return False, "Inventory record not found", 404
        
        # Adjust quantity
        current_qty = inventory[inv_index].get('quantity', 0)
        new_qty = current_qty + adjustment
        
        if new_qty < 0:
            return False, "Insufficient inventory", 400
        
        inventory[inv_index]['quantity'] = new_qty
        inventory[inv_index]['updatedat'] = datetime.now().isoformat()
        
        # Update in Supabase
        client = db.client
        client.table('storeinventory').update({
            'quantity': new_qty,
            'updatedat': inventory[inv_index]['updatedat']
        }).eq('id', inventory_id).execute()
        
        # Save to local JSON
        save_store_inventory_data(inventory)
        
        logger.info(f"Adjusted inventory {inventory_id} by {adjustment}")
        return True, "Inventory adjusted", 200
        
    except Exception as e:
        logger.error(f"Error adjusting inventory: {e}", exc_info=True)
        return False, str(e), 500
