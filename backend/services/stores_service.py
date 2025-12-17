"""
Stores Service
Handles all store and inventory-related business logic and database operations
"""

import logging
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple

from utils.supabase_db import db
from utils.json_helpers import get_stores_data, save_stores_data, get_store_inventory_data, save_store_inventory_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

logger = logging.getLogger(__name__)


# ============================================
# LOCAL JSON OPERATIONS
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
# SUPABASE OPERATIONS
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
# MERGED OPERATIONS
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


def get_store_inventory_stats(store_id: str) -> Tuple[int, int]:
    """
    Get inventory statistics for a store.
    Returns (product_count, total_stock)
    """
    try:
        client = db.client
        response = client.table("storeinventory").select("*").eq('storeid', store_id).execute()
        
        if not response.data:
            return 0, 0
        
        inventory_items = response.data
        product_count = len(inventory_items)
        total_stock = sum(item.get('quantity', 0) for item in inventory_items)
        
        logger.debug(f"Store {store_id}: {product_count} products, {total_stock} total stock")
        return product_count, total_stock
    except Exception as e:
        logger.error(f"Error getting inventory stats for store {store_id}: {e}", exc_info=True)
        return 0, 0


def get_store_bill_stats(store_id: str) -> Tuple[float, int]:
    """
    Get bill statistics for a store from Supabase.
    Returns (total_revenue, bill_count)
    """
    try:
        client = db.client
        
        # Fetch all bills for this store
        response = client.table("bills").select("*").eq('storeid', store_id).execute()
        
        if not response.data:
            return 0.0, 0
        
        bills = response.data
        bill_count = len(bills)
        total_revenue = sum(float(bill.get('total', 0)) for bill in bills)
        
        logger.debug(f"Store {store_id}: {bill_count} bills, ₹{total_revenue:.2f} revenue")
        return total_revenue, bill_count
    except Exception as e:
        logger.error(f"Error getting bill stats for store {store_id}: {e}", exc_info=True)
        return 0.0, 0


def get_all_stores_with_inventory() -> Tuple[List[Dict], int]:
    """
    Get all stores with inventory and bill statistics included.
    Returns (stores_list, status_code)
    """
    try:
        stores, status_code = get_merged_stores()
        
        if status_code != 200:
            return stores, status_code
        
        # Add inventory and bill stats to each store
        for store in stores:
            store_id = store.get('id')
            if store_id:
                # Get inventory stats
                product_count, total_stock = get_store_inventory_stats(store_id)
                store['productCount'] = product_count
                store['totalStock'] = total_stock
                
                # Get bill stats
                total_revenue, bill_count = get_store_bill_stats(store_id)
                store['totalRevenue'] = total_revenue
                store['totalBills'] = bill_count
            else:
                store['productCount'] = 0
                store['totalStock'] = 0
                store['totalRevenue'] = 0.0
                store['totalBills'] = 0
        
        logger.info(f"Returning {len(stores)} stores with inventory and bill stats")
        return stores, 200
    except Exception as e:
        logger.error(f"Error getting stores with inventory: {e}", exc_info=True)
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
# BUSINESS LOGIC
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
        
        # Remove email and manager if present, as they are not columns in the stores table
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
    Store inventory and bills are handled appropriately.
    Returns (success, message, status_code)
    """
    local_deleted = False
    supabase_deleted = False
    
    try:
        client = db.client
        
        # Step 0: Update bills to remove store reference (set storeId to NULL)
        logger.info(f"Checking for bills associated with storeid {store_id}")
        try:
            bills_response = client.table('bills').select('id').eq('storeid', store_id).execute()
            if bills_response.data and len(bills_response.data) > 0:
                bill_count = len(bills_response.data)
                logger.info(f"Found {bill_count} bills for store {store_id}")
                
                # Set storeId to NULL in all bills
                update_response = client.table('bills').update({'storeid': None}).eq('storeid', store_id).execute()
                logger.info(f"✅ Updated {bill_count} bills - set storeId to NULL (bills preserved)")
            else:
                logger.info(f"No bills found for store {store_id}")
        except Exception as bills_error:
            logger.error(f"Failed to update bills: {bills_error}", exc_info=True)
            return False, f"Failed to update bills: {str(bills_error)}", 500
        
        # Step 1: Delete store inventory
        logger.info(f"Checking for inventory associated with storeid {store_id}")
        try:
            inventory_response = client.table('storeinventory').select('id').eq('storeid', store_id).execute()
            if inventory_response.data and len(inventory_response.data) > 0:
                inventory_count = len(inventory_response.data)
                logger.info(f"Found {inventory_count} inventory items for store {store_id}")
                
                # Delete all inventory items for this store
                delete_inventory_response = client.table('storeinventory').delete().eq('storeid', store_id).execute()
                logger.info(f"✅ Deleted {inventory_count} inventory items from Supabase")
                
                # Also delete from local JSON
                try:
                    inventory = get_store_inventory_data()
                    updated_inventory = [inv for inv in inventory if inv.get('storeid') != store_id]
                    save_store_inventory_data(updated_inventory)
                    logger.info(f"✅ Deleted inventory items from local storage")
                except Exception as local_inv_error:
                    logger.warning(f"Failed to delete inventory from local storage: {local_inv_error}")
            else:
                logger.info(f"No inventory found for store {store_id}")
        except Exception as inventory_error:
            logger.error(f"Failed to delete inventory: {inventory_error}", exc_info=True)
            return False, f"Failed to delete store inventory: {str(inventory_error)}", 500
        
        # Step 2: Delete associated userstores entries
        logger.info(f"Checking userstores for storeid {store_id}")
        try:
            check_response = client.table('userstores').select('*').eq('storeId', store_id).execute()
            logger.info(f"Found {len(check_response.data) if check_response.data else 0} userstores entries")
            
            if check_response.data and len(check_response.data) > 0:
                # Delete userstores entries
                delete_response = client.table('userstores').delete().eq('storeId', store_id).execute()
                logger.info(f"✅ Deleted {len(delete_response.data) if delete_response.data else 0} userstores entries")
            else:
                logger.info(f"No userstores entries to delete for storeid {store_id}")
        except Exception as userstore_error:
            logger.error(f"Failed to delete userstores: {userstore_error}", exc_info=True)
            return False, f"Failed to delete user-store associations: {str(userstore_error)}", 500
        
        # Step 3: Delete from local JSON
        logger.info(f"Starting deletion of store {store_id} from local JSON")
        stores = get_stores_data()
        logger.debug(f"Current stores count: {len(stores)}")
        
        store_index = next((i for i, s in enumerate(stores) if s.get('id') == store_id), -1)
        
        if store_index == -1:
            logger.warning(f"Store {store_id} not found in local storage - will still attempt Supabase deletion")
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
                logger.error(f"Failed to save to local storage: {save_error}", exc_info=True)
        
        # Step 4: Delete from Supabase
        try:
            logger.info(f"Attempting to delete store {store_id} from Supabase")
            supabase_response = client.table('stores').delete().eq('id', store_id).execute()
            
            if supabase_response.data:
                supabase_deleted = True
                logger.info(f"✅ Deleted store {store_id} from Supabase")
            else:
                logger.warning(f"No data returned from Supabase deletion for {store_id}")
                supabase_deleted = True  # Still consider it successful
        except Exception as supabase_error:
            logger.error(f"Supabase deletion failed: {supabase_error}", exc_info=True)
            return False, f"Failed to delete from Supabase: {str(supabase_error)}", 500
        
        # Summary
        if local_deleted or supabase_deleted:
            logger.info(f"✅ Store {store_id} deleted - Local: {local_deleted}, Supabase: {supabase_deleted}")
            return True, "Store and related inventory deleted successfully (bills preserved)", 200
        else:
            return False, "Store not found in any storage", 404
            
    except Exception as e:
        logger.error(f"Error deleting store {store_id}: {e}", exc_info=True)
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
        store_inventory = [inv for inv in inventory if inv.get('storeid') == store_id]
        
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
            product_id = product.get('productId') or product.get('productid')
            quantity = product.get('quantity', 0)
            
            # Check if inventory record exists
            existing = next((inv for inv in inventory if inv.get('storeid') == store_id and inv.get('productid') == product_id), None)
            
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
                    'storeid': store_id,
                    'productid': product_id,
                    'quantity': quantity,
                    'assignedat': datetime.now().isoformat(),
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


def get_store_inventory_calendar(store_id: str, days: int = 90) -> Tuple[List[Dict], int]:
    """
    Get inventory calendar data for a store.
    Returns calendar data aggregated by date with product counts and stock totals.
    """
    try:
        from datetime import datetime, timedelta
        from collections import defaultdict
        
        client = db.client
        
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # Query inventory items for this store
        response = client.table("storeinventory")\
            .select("*, products(name, price, barcode)")\
            .eq('storeid', store_id)\
            .execute()
        
        if not response.data:
            logger.info(f"No inventory found for store {store_id}")
            return [], 200
        
        # Group inventory by date
        calendar_map = defaultdict(lambda: {
            'products': set(),
            'totalStock': 0,
            'items': []
        })
        
        for item in response.data:
            # Extract date from updatedat or assignedat
            date_str = item.get('updatedat') or item.get('assignedat', '')
            if date_str:
                try:
                    # Handle ISO format dates
                    date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    date_key = date_obj.strftime('%Y-%m-%d')
                    
                    # Only include dates within the range
                    if start_date <= date_obj <= end_date:
                        product_id = item.get('productid')
                        quantity = item.get('quantity', 0)
                        
                        calendar_map[date_key]['products'].add(product_id)
                        calendar_map[date_key]['totalStock'] += quantity
                        calendar_map[date_key]['items'].append(item)
                        
                except (ValueError, AttributeError) as e:
                    logger.warning(f"Could not parse date: {date_str}, error: {e}")
                    continue
        
        # Convert to array format expected by frontend
        calendar = []
        for date, data in sorted(calendar_map.items()):
            # Calculate total value
            total_value = 0.0
            for item in data['items']:
                product_data = item.get('products', {})
                if product_data and isinstance(product_data, dict):
                    price = float(product_data.get('price', 0))
                    quantity = item.get('quantity', 0)
                    total_value += price * quantity
            
            calendar.append({
                'date': date,
                'count': len(data['products']),  # Unique product count
                'totalStock': data['totalStock'],
                'totalValue': round(total_value, 2)
            })
        
        logger.info(f"Calendar for store {store_id}: {len(calendar)} dates with inventory")
        return calendar, 200
        
    except Exception as e:
        logger.error(f"Error getting inventory calendar for store {store_id}: {e}", exc_info=True)
        return [], 500


def get_store_inventory_by_date(store_id: str, date_str: str) -> Tuple[Dict, int]:
    """
    Get detailed inventory for a specific store and date.
    Returns rows with product details and totals.
    """
    try:
        client = db.client
        
        # Query inventory with product details
        response = client.table("storeinventory")\
            .select("*, products(id, name, price, barcode)")\
            .eq('storeid', store_id)\
            .execute()
        
        if not response.data:
            return {'rows': [], 'totalStock': 0, 'totalValue': 0}, 200
        
        # Filter by date
        rows = []
        total_stock = 0
        total_value = 0.0
        
        for item in response.data:
            # Check if item's date matches
            item_date = item.get('updatedat') or item.get('assignedat', '')
            if item_date:
                try:
                    date_obj = datetime.fromisoformat(item_date.replace('Z', '+00:00'))
                    item_date_str = date_obj.strftime('%Y-%m-%d')
                    
                    # Only include items from the selected date
                    if item_date_str == date_str:
                        product_data = item.get('products', {})
                        
                        if product_data and isinstance(product_data, dict):
                            quantity = item.get('quantity', 0)
                            price = float(product_data.get('price', 0))
                            row_value = price * quantity
                            
                            rows.append({
                                'id': item.get('id'),
                                'barcode': product_data.get('barcode', 'N/A'),
                                'name': product_data.get('name', 'Unknown'),
                                'price': price,
                                'stock': quantity,
                                'rowValue': round(row_value, 2)
                            })
                            
                            total_stock += quantity
                            total_value += row_value
                            
                except (ValueError, AttributeError) as e:
                    logger.warning(f"Could not parse date for filtering: {item_date}, error: {e}")
                    continue
        
        logger.info(f"Found {len(rows)} products for store {store_id} on date {date_str}")
        
        return {
            'rows': rows,
            'totalStock': total_stock,
            'totalValue': round(total_value, 2)
        }, 200
        
    except Exception as e:
        logger.error(f"Error getting inventory by date for store {store_id}: {e}", exc_info=True)
        return {'rows': [], 'totalStock': 0, 'totalValue': 0}, 500



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
