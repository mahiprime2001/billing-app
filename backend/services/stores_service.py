"""
Stores Service
Handles all store and inventory-related business logic and database operations
"""

import logging
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from collections import defaultdict

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
    """Get stores by merging local and Supabase (Supabase takes precedence)"""
    try:
        supabase_stores = get_supabase_stores()
        local_stores = get_local_stores()
        
        stores_map = {}
        for store in local_stores:
            if store.get('id'):
                stores_map[store['id']] = store
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
    """Get inventory statistics for a store"""
    try:
        client = db.client
        response = client.table("storeinventory").select("*").eq('storeid', store_id).execute()
        
        if not response or not response.data:
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
    """Get bill statistics for a store from Supabase"""
    try:
        client = db.client
        response = client.table("bills").select("*").eq('storeid', store_id).execute()
        
        if not response or not response.data:
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
    """Get all stores with inventory and bill statistics included"""
    try:
        stores, status_code = get_merged_stores()
        
        if status_code != 200:
            return stores, status_code

        client = db.client
        inventory_rows = client.table("storeinventory").select("storeid, productid, quantity").execute()
        bill_rows = client.table("bills").select("storeid, total").execute()

        inventory_by_store: Dict[str, Dict] = {}
        for row in (inventory_rows.data or []):
            sid = row.get("storeid")
            if not sid:
                continue
            if sid not in inventory_by_store:
                inventory_by_store[sid] = {"product_ids": set(), "total_stock": 0}
            inventory_by_store[sid]["product_ids"].add(row.get("productid"))
            inventory_by_store[sid]["total_stock"] += int(row.get("quantity") or 0)

        bills_by_store: Dict[str, Dict] = {}
        for row in (bill_rows.data or []):
            sid = row.get("storeid")
            if not sid:
                continue
            if sid not in bills_by_store:
                bills_by_store[sid] = {"bill_count": 0, "total_revenue": 0.0}
            bills_by_store[sid]["bill_count"] += 1
            bills_by_store[sid]["total_revenue"] += float(row.get("total") or 0)

        for store in stores:
            store_id = store.get("id")
            if not store_id:
                store["productCount"] = 0
                store["totalStock"] = 0
                store["totalRevenue"] = 0.0
                store["totalBills"] = 0
                continue

            inv = inventory_by_store.get(store_id, {"product_ids": set(), "total_stock": 0})
            bill = bills_by_store.get(store_id, {"bill_count": 0, "total_revenue": 0.0})

            store["productCount"] = len(inv["product_ids"])
            store["totalStock"] = inv["total_stock"]
            store["totalRevenue"] = bill["total_revenue"]
            store["totalBills"] = bill["bill_count"]
        
        logger.info(f"Returning {len(stores)} stores with inventory and bill stats")
        return stores, 200
    except Exception as e:
        logger.error(f"Error getting stores with inventory: {e}", exc_info=True)
        return [], 500

# ============================================
# AVAILABLE PRODUCTS FOR ASSIGNMENT ✅ NEW
# ============================================

def get_available_products_for_assignment(store_id: str) -> List[Dict]:
    """Get products with available stock (global - total allocated across all stores)"""
    try:
        client = db.client
        
        products_response = client.table("products").select("*").execute()
        if not products_response or not products_response.data:
            return []

        inventory_response = client.table("storeinventory").select("storeid, productid, quantity").execute()
        inventory_rows = inventory_response.data or []

        total_allocated_by_product: Dict[str, int] = defaultdict(int)
        current_store_qty_by_product: Dict[str, int] = defaultdict(int)

        for row in inventory_rows:
            product_id = row.get("productid")
            if not product_id:
                continue
            qty = int(row.get("quantity") or 0)
            total_allocated_by_product[product_id] += qty
            if row.get("storeid") == store_id:
                current_store_qty_by_product[product_id] += qty

        result = []
        for product in products_response.data:
            product_id = product.get("id")
            if not product_id:
                continue

            global_stock = int(product.get("stock") or 0)
            total_allocated = total_allocated_by_product[product_id]
            current_store_qty = current_store_qty_by_product[product_id]
            available_stock = max(0, global_stock - total_allocated)

            result.append({
                **product,
                "availableStock": available_stock,
                "currentStoreStock": current_store_qty,
                "totalAllocated": total_allocated,
                "globalStock": global_stock
            })
        
        available_products = [convert_snake_to_camel(p) for p in result if p['availableStock'] > 0]
        logger.info(f"Found {len(available_products)} products available for store {store_id}")
        return available_products
        
    except Exception as e:
        logger.error(f"Error getting available products for {store_id}: {e}", exc_info=True)
        return []

# ============================================
# SYNC OPERATIONS
# ============================================

def sync_local_from_supabase() -> Tuple[bool, str, int]:
    """Sync local storage from Supabase (overwrite local with Supabase data)"""
    try:
        logger.info("Starting sync from Supabase to local storage")
        
        client = db.client
        response = client.table("stores").select("*").execute()
        stores = response.data or []
        
        stores_snake = [convert_camel_to_snake(store) for store in stores]
        save_stores_data(stores_snake)
        
        logger.info(f"✅ Synced {len(stores_snake)} stores from Supabase to local storage")
        return True, f"Synced {len(stores_snake)} stores", 200
    except Exception as e:
        logger.error(f"❌ Error syncing stores: {e}", exc_info=True)
        return False, str(e), 500

# ============================================
# BUSINESS LOGIC - CRUD
# ============================================

def create_store(store_data: dict) -> Tuple[Optional[str], str, int]:
    """Create a new store"""
    try:
        if not store_data:
            return None, "No store data provided", 400
        
        store_data = convert_camel_to_snake(store_data)
        if 'id' not in store_data:
            store_data['id'] = str(uuid.uuid4())
        
        now_naive = datetime.now().isoformat()
        if 'createdat' not in store_data:
            store_data['createdat'] = now_naive
        store_data['updatedat'] = now_naive
        
        store_data.pop('email', None)
        store_data.pop('manager', None)
        
        client = db.client
        supabase_response = client.table('stores').insert(store_data).execute()
        
        if not supabase_response or not supabase_response.data:
            return None, "Failed to insert store into Supabase", 500
        
        stores = get_stores_data()
        stores.append(store_data)
        save_stores_data(stores)
        
        logger.info(f"Store created {store_data['id']}")
        return store_data['id'], "Store created", 201
    except Exception as e:
        logger.error(f"Error creating store: {e}", exc_info=True)
        return None, str(e), 500

def update_store(store_id: str, update_data: dict) -> Tuple[bool, str, int]:
    """Update a store"""
    try:
        if not update_data:
            return False, "No update data provided", 400
        
        update_data = convert_camel_to_snake(update_data)
        stores = get_stores_data()
        store_index = next((i for i, s in enumerate(stores) if s.get('id') == store_id), -1)
        
        if store_index == -1:
            return False, "Store not found", 404
        
        update_data['updatedat'] = datetime.now().isoformat()
        stores[store_index].update(update_data)
        save_stores_data(stores)
        
        client = db.client
        client.table('stores').update(update_data).eq('id', store_id).execute()
        
        logger.info(f"Store updated {store_id}")
        return True, "Store updated", 200
    except Exception as e:
        logger.error(f"Error updating store: {e}", exc_info=True)
        return False, str(e), 500

def delete_store(store_id: str) -> Tuple[bool, str, int]:
    """Delete a store from both local storage and Supabase"""
    local_deleted = False
    supabase_deleted = False
    
    try:
        client = db.client
        
        # Step 0: Update bills to remove store reference
        logger.info(f"Checking for bills associated with storeid {store_id}")
        try:
            bills_response = client.table('bills').select('id').eq('storeid', store_id).execute()
            if bills_response and bills_response.data and len(bills_response.data) > 0:
                bill_count = len(bills_response.data)
                logger.info(f"Found {bill_count} bills for store {store_id}")
                
                update_response = client.table('bills').update({'storeid': None}).eq('storeid', store_id).execute()
                logger.info(f"✅ Updated {bill_count} bills - set storeId to NULL")
        except Exception as bills_error:
            logger.error(f"Failed to update bills: {bills_error}", exc_info=True)
            return False, f"Failed to update bills: {str(bills_error)}", 500
        
        # Step 1: Delete store inventory
        logger.info(f"Checking for inventory associated with storeid {store_id}")
        try:
            inventory_response = client.table('storeinventory').select('id').eq('storeid', store_id).execute()
            if inventory_response and inventory_response.data and len(inventory_response.data) > 0:
                inventory_count = len(inventory_response.data)
                logger.info(f"Found {inventory_count} inventory items")
                
                delete_inventory_response = client.table('storeinventory').delete().eq('storeid', store_id).execute()
                logger.info(f"✅ Deleted {inventory_count} inventory items")
                
                try:
                    inventory = get_store_inventory_data()
                    updated_inventory = [inv for inv in inventory if inv.get('storeid') != store_id]
                    save_store_inventory_data(updated_inventory)
                except Exception as local_inv_error:
                    logger.warning(f"Local inventory cleanup failed: {local_inv_error}")
        except Exception as inventory_error:
            logger.error(f"Failed to delete inventory: {inventory_error}", exc_info=True)
            return False, f"Failed to delete store inventory: {str(inventory_error)}", 500
        
        # Step 2: Delete userstores entries
        try:
            check_response = client.table('userstores').select('*').eq('storeId', store_id).execute()
            if check_response and check_response.data and len(check_response.data) > 0:
                delete_response = client.table('userstores').delete().eq('storeId', store_id).execute()
                logger.info(f"✅ Deleted userstores entries")
        except Exception as userstore_error:
            logger.error(f"Failed to delete userstores: {userstore_error}", exc_info=True)
        
        # Step 3: Delete from local JSON
        stores = get_stores_data()
        store_index = next((i for i, s in enumerate(stores) if s.get('id') == store_id), -1)
        
        if store_index != -1:
            stores.pop(store_index)
            save_stores_data(stores)
            local_deleted = True
        
        # Step 4: Delete from Supabase
        supabase_response = client.table('stores').delete().eq('id', store_id).execute()
        if supabase_response and (supabase_response.data or supabase_response.count):
            supabase_deleted = True
        
        if local_deleted or supabase_deleted:
            return True, "Store deleted successfully (bills preserved)", 200
        return False, "Store not found", 404
        
    except Exception as e:
        logger.error(f"Error deleting store {store_id}: {e}", exc_info=True)
        return False, str(e), 500

# ============================================
# INVENTORY OPERATIONS - ✅ FULLY FIXED
# ============================================

def get_store_inventory(store_id: str) -> Tuple[Optional[List[Dict]], int]:
    """Get inventory for a specific store"""
    try:
        client = db.client
        response = client.table("storeinventory")\
            .select("*, products(name, price, barcode)")\
            .eq('storeid', store_id)\
            .execute()
        
        if not response or not response.data:
            return [], 200
        
        transformed = [convert_snake_to_camel(inv) for inv in response.data]
        return transformed, 200
    except Exception as e:
        logger.error(f"Error getting store inventory: {e}", exc_info=True)
        return [], 500

def assign_products_to_store(store_id: str, products: List[Dict]) -> Tuple[bool, str, int]:
    """Assign products to a store with batched stock validation and writes."""
    try:
        client = db.client

        if not products:
            return False, "No products provided", 400

        requested_qty_by_product: Dict[str, int] = defaultdict(int)
        for product in products:
            product_id = product.get("productId") or product.get("productid")
            try:
                quantity = int(product.get("quantity", 0))
            except (TypeError, ValueError):
                quantity = 0

            if not product_id or quantity <= 0:
                return False, f"Invalid product ID or quantity: {product_id}", 400
            requested_qty_by_product[product_id] += quantity

        product_ids = list(requested_qty_by_product.keys())

        products_response = client.table("products").select("id, stock, name").in_("id", product_ids).execute()
        product_rows = products_response.data or []
        product_map = {row.get("id"): row for row in product_rows if row.get("id")}

        for product_id in product_ids:
            if product_id not in product_map:
                return False, f"Product {product_id} not found", 404

        allocations_response = client.table("storeinventory").select("id, storeid, productid, quantity").in_("productid", product_ids).execute()
        allocation_rows = allocations_response.data or []

        total_allocated_by_product: Dict[str, int] = defaultdict(int)
        existing_for_store_by_product: Dict[str, Dict] = {}
        for row in allocation_rows:
            product_id = row.get("productid")
            if not product_id:
                continue

            qty = int(row.get("quantity") or 0)
            total_allocated_by_product[product_id] += qty
            if row.get("storeid") == store_id:
                existing_for_store_by_product[product_id] = row

        for product_id, requested_qty in requested_qty_by_product.items():
            product_row = product_map[product_id]
            global_stock = int(product_row.get("stock") or 0)
            total_allocated = total_allocated_by_product.get(product_id, 0)
            available = global_stock - total_allocated
            if requested_qty > available:
                product_name = product_row.get("name", "Unknown")
                return False, (
                    f"Insufficient stock '{product_name}'. Global: {global_stock}, "
                    f"Allocated: {total_allocated}, Available: {available}, Requested: {requested_qty}"
                ), 400

        local_inventory = get_store_inventory_data()
        local_inventory_map = {
            (row.get("storeid"), row.get("productid")): row for row in local_inventory
        }
        now_iso = datetime.now().isoformat()

        for product_id, requested_qty in requested_qty_by_product.items():
            product_name = product_map[product_id].get("name", "Unknown")
            existing_row = existing_for_store_by_product.get(product_id)

            if existing_row:
                current_qty = int(existing_row.get("quantity") or 0)
                new_qty = current_qty + requested_qty
                client.table("storeinventory").update({
                    "quantity": new_qty,
                    "updatedat": now_iso
                }).eq("id", existing_row["id"]).execute()
                logger.info(f"Updated {store_id}: {product_name} {current_qty}->{new_qty}")

                local_key = (store_id, product_id)
                local_existing = local_inventory_map.get(local_key)
                if local_existing:
                    local_existing["quantity"] = new_qty
                    local_existing["updatedat"] = now_iso
                else:
                    new_local = {
                        "id": existing_row["id"],
                        "storeid": store_id,
                        "productid": product_id,
                        "quantity": new_qty,
                        "assignedat": existing_row.get("assignedat") or now_iso,
                        "updatedat": now_iso
                    }
                    local_inventory.append(new_local)
                    local_inventory_map[local_key] = new_local
            else:
                new_row = {
                    "id": str(uuid.uuid4()),
                    "storeid": store_id,
                    "productid": product_id,
                    "quantity": requested_qty,
                    "assignedat": now_iso,
                    "updatedat": now_iso
                }
                client.table("storeinventory").insert(new_row).execute()
                logger.info(f"Created {store_id}: {product_name}={requested_qty}")
                local_inventory.append(dict(new_row))
                local_inventory_map[(store_id, product_id)] = new_row

        save_store_inventory_data(local_inventory)

        logger.info(f"Assigned {len(product_ids)} products to store {store_id}")
        return True, f"Successfully assigned {len(product_ids)} products", 200

    except Exception as e:
        logger.error(f"Error assigning products to store {store_id}: {e}", exc_info=True)
        return False, f"Assignment failed: {str(e)}", 500


def get_store_stats(store_id: str) -> Tuple[Dict, int]:
    """Get lightweight inventory and billing stats for one store."""
    try:
        product_count, total_stock = get_store_inventory_stats(store_id)
        total_revenue, total_bills = get_store_bill_stats(store_id)

        return {
            "storeId": store_id,
            "productCount": product_count,
            "totalStock": total_stock,
            "totalRevenue": total_revenue,
            "totalBills": total_bills
        }, 200
    except Exception as e:
        logger.error(f"Error getting store stats for {store_id}: {e}", exc_info=True)
        return {
            "storeId": store_id,
            "productCount": 0,
            "totalStock": 0,
            "totalRevenue": 0.0,
            "totalBills": 0
        }, 500

def adjust_inventory(inventory_id: str, adjustment: int) -> Tuple[bool, str, int]:
    """Adjust inventory quantity"""
    try:
        client = db.client
        response = client.table('storeinventory').select('*').eq('id', inventory_id).single().execute()
        
        if not response or not response.data:
            return False, "Inventory record not found", 404
        
        record = response.data
        current_qty = record.get('quantity', 0)
        new_qty = max(0, current_qty + adjustment)
        
        client.table('storeinventory').update({
            'quantity': new_qty,
            'updatedat': datetime.now().isoformat()
        }).eq('id', inventory_id).execute()
        
        # Update local
        inventory = get_store_inventory_data()
        inv_index = next((i for i, inv in enumerate(inventory) if inv.get('id') == inventory_id), -1)
        if inv_index != -1:
            inventory[inv_index]['quantity'] = new_qty
            inventory[inv_index]['updatedat'] = datetime.now().isoformat()
            save_store_inventory_data(inventory)
        
        logger.info(f"Adjusted inventory {inventory_id}: {current_qty}→{new_qty}")
        return True, f"Inventory adjusted to {new_qty}", 200
    except Exception as e:
        logger.error(f"Error adjusting inventory: {e}", exc_info=True)
        return False, str(e), 500

def get_store_inventory_calendar(store_id: str, days: int = 90) -> Tuple[List[Dict], int]:
    """Get inventory calendar data for a store"""
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        client = db.client
        response = client.table("storeinventory")\
            .select("*, products(name)")\
            .eq('storeid', store_id)\
            .execute()
        
        if not response or not response.data:
            return [], 200
        
        calendar_map = defaultdict(lambda: {'products': set(), 'totalStock': 0})
        
        for item in response.data:
            date_str = item.get('updatedat') or item.get('assignedat', '')
            if date_str:
                try:
                    date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    if start_date <= date_obj <= end_date:
                        date_key = date_obj.strftime('%Y-%m-%d')
                        product_id = item.get('productid')
                        quantity = item.get('quantity', 0)
                        
                        calendar_map[date_key]['products'].add(product_id)
                        calendar_map[date_key]['totalStock'] += quantity
                except (ValueError, AttributeError):
                    continue
        
        calendar = [{
            'date': date,
            'count': len(data['products']),
            'totalStock': data['totalStock'],
            'totalValue': 0
        } for date, data in sorted(calendar_map.items())]
        
        return calendar, 200
    except Exception as e:
        logger.error(f"Error getting inventory calendar: {e}", exc_info=True)
        return [], 500

def get_store_inventory_by_date(store_id: str, date_str: str) -> Tuple[Dict, int]:
    """Get detailed inventory for a specific store and date"""
    try:
        client = db.client
        response = client.table("storeinventory")\
            .select("*, products(id, name, price, barcode)")\
            .eq('storeid', store_id)\
            .execute()
        
        if not response or not response.data:
            return {'rows': [], 'totalStock': 0, 'totalValue': 0}, 200
        
        rows = []
        total_stock = 0
        total_value = 0.0
        
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        
        for item in response.data:
            item_date_str = item.get('updatedat') or item.get('assignedat', '')
            if item_date_str:
                try:
                    item_date = datetime.fromisoformat(item_date_str.replace('Z', '+00:00')).date()
                    if item_date == target_date:
                        product_data = item.get('products', {})
                        if product_data:
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
                except (ValueError, AttributeError):
                    continue
        
        return {
            'rows': rows,
            'totalStock': total_stock,
            'totalValue': round(total_value, 2)
        }, 200
    except Exception as e:
        logger.error(f"Error getting inventory by date: {e}", exc_info=True)
        return {'rows': [], 'totalStock': 0, 'totalValue': 0}, 500
