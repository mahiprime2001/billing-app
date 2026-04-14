"""
Stores Service
Handles all store and inventory-related business logic and database operations
"""

import logging
import uuid
import json
import os
from datetime import datetime, timedelta
from typing import Any, List, Dict, Optional, Tuple
from collections import defaultdict

from utils.supabase_db import db
from utils.supabase_resilience import (
    execute_with_retry,
    is_transient_supabase_error,
    is_circuit_open_error,
)
from config import Config
from utils.json_helpers import (
    get_stores_data,
    save_stores_data,
    get_store_inventory_data,
    save_store_inventory_data,
    get_products_data,
    save_products_data,
    get_store_damage_returns_data,
    save_store_damage_returns_data,
)
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel
from utils.concurrency_guard import extract_base_markers, safe_update_with_conflict_check

logger = logging.getLogger(__name__)

TRANSFER_ACTIVE_STATUSES = ["pending", "in_progress"]
TRANSFER_CLOSED_STATUSES = ["completed", "closed_with_issues", "cancelled"]

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
        response = execute_with_retry(
            lambda: client.table("stores").select("*"),
            "stores",
        )
        stores = response.data or []
        transformed_stores = [convert_snake_to_camel(store) for store in stores]
        logger.debug(f"Returning {len(transformed_stores)} stores from Supabase.")
        return transformed_stores
    except Exception as e:
        if is_circuit_open_error(e):
            logger.info("Supabase circuit open while fetching stores; using local cache.")
        elif is_transient_supabase_error(e):
            logger.warning(f"Transient Supabase error while fetching stores; using local cache: {e}")
        else:
            logger.error(f"Error getting Supabase stores: {e}", exc_info=True)
        return []

# ============================================
# MERGED OPERATIONS
# ============================================

def get_merged_stores() -> Tuple[List[Dict], int]:
    """Get stores by merging local and Supabase (Supabase takes precedence)"""
    try:
        supabase_stores = get_supabase_stores()
        if supabase_stores:
            try:
                save_stores_data([convert_camel_to_snake(s) for s in supabase_stores])
            except Exception as cache_err:
                logger.warning(f"Failed to refresh local stores cache: {cache_err}")
            logger.debug(f"Returning {len(supabase_stores)} stores from Supabase (cache refreshed)")
            return supabase_stores, 200

        local_stores = get_local_stores()
        logger.debug(f"Returning {len(local_stores)} stores from local fallback")
        return local_stores, 200
    except Exception as e:
        logger.error(f"Error getting merged stores: {e}", exc_info=True)
        return [], 500

def get_store_inventory_stats(store_id: str) -> Tuple[int, int]:
    """Get inventory statistics for a store"""
    try:
        client = db.client
        response = execute_with_retry(
            lambda: client.table("storeinventory").select("*").eq('storeid', store_id),
            f"storeinventory for store {store_id}",
        )
        
        if not response or not response.data:
            return 0, 0
        
        inventory_items = response.data
        product_count = len(inventory_items)
        total_stock = sum(item.get('quantity', 0) for item in inventory_items)
        
        logger.debug(f"Store {store_id}: {product_count} products, {total_stock} total stock")
        return product_count, total_stock
    except Exception as e:
        if is_circuit_open_error(e):
            logger.info(
                f"Supabase circuit open while fetching inventory stats for store {store_id}; returning zero stats."
            )
        elif is_transient_supabase_error(e):
            logger.warning(
                f"Transient Supabase error while fetching inventory stats for store {store_id}; returning zero stats: {e}"
            )
        else:
            logger.error(f"Error getting inventory stats for store {store_id}: {e}", exc_info=True)
        return 0, 0

def get_store_bill_stats(store_id: str) -> Tuple[float, int]:
    """Get bill statistics for a store from Supabase"""
    try:
        client = db.client
        response = execute_with_retry(
            lambda: client.table("bills").select("*").eq('storeid', store_id),
            f"bills for store {store_id}",
        )
        
        if not response or not response.data:
            return 0.0, 0
        
        bills = response.data
        bill_count = len(bills)
        total_revenue = sum(float(bill.get('total', 0)) for bill in bills)
        
        logger.debug(f"Store {store_id}: {bill_count} bills, ₹{total_revenue:.2f} revenue")
        return total_revenue, bill_count
    except Exception as e:
        if is_circuit_open_error(e):
            logger.info(
                f"Supabase circuit open while fetching bill stats for store {store_id}; returning zero stats."
            )
        elif is_transient_supabase_error(e):
            logger.warning(
                f"Transient Supabase error while fetching bill stats for store {store_id}; returning zero stats: {e}"
            )
        else:
            logger.error(f"Error getting bill stats for store {store_id}: {e}", exc_info=True)
        return 0.0, 0

def get_all_stores_with_inventory() -> Tuple[List[Dict], int]:
    """Get all stores with inventory and bill statistics included"""
    try:
        stores, status_code = get_merged_stores()
        
        if status_code != 200:
            return stores, status_code

        client = db.client
        # Use select("*") so this works across deployments that may use either
        # snake/lowercase keys (storeid/productid) or camelCase keys (storeId/productId).
        inventory_rows_data = []
        bill_rows_data = []
        try:
            inventory_rows = execute_with_retry(
                lambda: client.table("storeinventory").select("storeid,productid,quantity").limit(10000),
                "storeinventory (all stores)",
            )
            inventory_rows_data = inventory_rows.data or []
        except Exception as inventory_error:
            if is_circuit_open_error(inventory_error):
                logger.info(
                    "Supabase circuit open in get_all_stores_with_inventory; continuing with empty inventory."
                )
            else:
                logger.warning(
                    "Supabase inventory fetch failed in get_all_stores_with_inventory; continuing with empty inventory: %s",
                    inventory_error,
                )

        try:
            bill_rows = execute_with_retry(
                lambda: client.table("bills").select("storeid,total").limit(10000),
                "bills (all stores)",
            )
            bill_rows_data = bill_rows.data or []
        except Exception as bills_error:
            if is_circuit_open_error(bills_error):
                logger.info(
                    "Supabase circuit open in get_all_stores_with_inventory; continuing with empty bill stats."
                )
            else:
                logger.warning(
                    "Supabase bills fetch failed in get_all_stores_with_inventory; continuing with empty bill stats: %s",
                    bills_error,
                )

        inventory_by_store: Dict[str, Dict] = {}
        for row in inventory_rows_data:
            sid = row.get("storeid") or row.get("storeId")
            if not sid:
                continue
            if sid not in inventory_by_store:
                inventory_by_store[sid] = {"product_ids": set(), "total_stock": 0}
            product_id = row.get("productid") or row.get("productId")
            if product_id:
                inventory_by_store[sid]["product_ids"].add(product_id)
            inventory_by_store[sid]["total_stock"] += int(row.get("quantity") or 0)

        bills_by_store: Dict[str, Dict] = {}
        for row in bill_rows_data:
            sid = row.get("storeid") or row.get("storeId")
            if not sid:
                continue
            if sid not in bills_by_store:
                bills_by_store[sid] = {"bill_count": 0, "total_revenue": 0.0}
            bills_by_store[sid]["bill_count"] += 1
            bills_by_store[sid]["total_revenue"] += float(row.get("total") or row.get("grandTotal") or 0)

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

def _get_reserved_pending_transfer_qty(client: Any, product_ids: Optional[List[str]] = None) -> Dict[str, int]:
    """
    Calculate quantity reserved in active transfer orders and not yet resolved.
    reserved = assigned_qty - verified_qty - damaged_qty - wrong_store_qty
    """
    reserved_by_product: Dict[str, int] = defaultdict(int)
    try:
        query = client.table("inventory_transfer_items").select(
            "product_id, assigned_qty, verified_qty, damaged_qty, wrong_store_qty, "
            "inventory_transfer_orders(status)"
        )
        if product_ids:
            query = query.in_("product_id", product_ids)
        response = query.execute()
        for row in response.data or []:
            order_ref = row.get("inventory_transfer_orders") or {}
            order_status = order_ref.get("status")
            if order_status not in TRANSFER_ACTIVE_STATUSES:
                continue
            product_id = row.get("product_id")
            if not product_id:
                continue
            assigned = int(row.get("assigned_qty") or 0)
            verified = int(row.get("verified_qty") or 0)
            damaged = int(row.get("damaged_qty") or 0)
            wrong_store = int(row.get("wrong_store_qty") or 0)
            reserved = max(0, assigned - verified - damaged - wrong_store)
            reserved_by_product[product_id] += reserved
    except Exception as e:
        # Backward-compatible fallback before table migration is applied.
        logger.warning(f"Transfer reservation lookup failed (fallback to zero reserved): {e}")
    return reserved_by_product


def _to_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _get_available_products_for_assignment_local(store_id: str) -> List[Dict]:
    """
    Offline/local fallback for available-products.
    Uses local products + local storeinventory. Pending transfer reservations are
    not subtracted in fallback mode.
    """
    products = get_products_data() or []
    inventory_rows = get_store_inventory_data() or []

    total_allocated_by_product: Dict[str, int] = defaultdict(int)
    current_store_qty_by_product: Dict[str, int] = defaultdict(int)

    for row in inventory_rows:
        product_id = row.get("productid") or row.get("productId") or row.get("product_id")
        if not product_id:
            continue
        qty = _to_int(row.get("quantity"))
        total_allocated_by_product[product_id] += qty
        row_store_id = row.get("storeid") or row.get("storeId") or row.get("store_id")
        if str(row_store_id) == str(store_id):
            current_store_qty_by_product[product_id] += qty

    result: List[Dict] = []
    for product in products:
        product_id = product.get("id")
        if not product_id:
            continue
        global_stock = _to_int(product.get("stock"))
        total_allocated = total_allocated_by_product.get(product_id, 0)
        current_store_qty = current_store_qty_by_product.get(product_id, 0)
        available_stock = max(0, global_stock - total_allocated)

        result.append(
            {
                **product,
                "availableStock": available_stock,
                "currentStoreStock": current_store_qty,
                "totalAllocated": total_allocated,
                "pendingReserved": 0,
                "globalStock": global_stock,
            }
        )

    # Keep already-assigned items visible in the assignment UI even when no
    # additional stock is available to allocate.
    available_products = [
        convert_snake_to_camel(p)
        for p in result
        if p["availableStock"] > 0 or p["currentStoreStock"] > 0
    ]
    logger.info(
        "Offline fallback: found %s locally available products for store %s",
        len(available_products),
        store_id,
    )
    return available_products


def get_available_products_for_assignment(store_id: str) -> List[Dict]:
    """Get products with available stock (global - verified allocations - pending reserved transfers)."""
    try:
        client = db.client
        
        products_response = execute_with_retry(
            lambda: client.table("products").select("*, batch(id, batch_number)"),
            "products for available-products",
        )
        if not products_response or not products_response.data:
            return []

        # Use select("*") to support deployments that may expose either
        # storeid/productid or storeId/productId keys.
        inventory_response = execute_with_retry(
            lambda: client.table("storeinventory").select("*"),
            "storeinventory for available-products",
        )
        inventory_rows = inventory_response.data or []

        total_allocated_by_product: Dict[str, int] = defaultdict(int)
        current_store_qty_by_product: Dict[str, int] = defaultdict(int)

        for row in inventory_rows:
            product_id = row.get("productid") or row.get("productId")
            if not product_id:
                continue
            qty = int(row.get("quantity") or 0)
            total_allocated_by_product[product_id] += qty
            row_store_id = row.get("storeid") or row.get("storeId")
            if row_store_id == store_id:
                current_store_qty_by_product[product_id] += qty

        reserved_pending_by_product = _get_reserved_pending_transfer_qty(client)
        result = []
        for product in products_response.data:
            product_id = product.get("id")
            if not product_id:
                continue

            global_stock = int(product.get("stock") or 0)
            total_allocated = total_allocated_by_product[product_id]
            total_reserved = reserved_pending_by_product.get(product_id, 0)
            current_store_qty = current_store_qty_by_product[product_id]
            available_stock = max(0, global_stock - total_allocated - total_reserved)

            result.append({
                **product,
                "availableStock": available_stock,
                "currentStoreStock": current_store_qty,
                "totalAllocated": total_allocated,
                "pendingReserved": total_reserved,
                "globalStock": global_stock
            })
        
        # Keep already-assigned items visible in the assignment UI even when no
        # additional stock is available to allocate.
        available_products = [
            convert_snake_to_camel(p)
            for p in result
            if p["availableStock"] > 0 or p["currentStoreStock"] > 0
        ]
        logger.info(f"Found {len(available_products)} products available for store {store_id}")
        return available_products
        
    except Exception as e:
        if is_circuit_open_error(e):
            logger.info(
                "Supabase circuit open while fetching available products for %s; using local fallback.",
                store_id,
            )
            return _get_available_products_for_assignment_local(store_id)
        logger.warning(
            "Error getting available products for %s from Supabase; using local fallback: %s",
            store_id,
            e,
        )
        return _get_available_products_for_assignment_local(store_id)

# ============================================
# SYNC OPERATIONS
# ============================================

def sync_local_from_supabase() -> Tuple[bool, str, int]:
    """Sync local storage from Supabase (overwrite local with Supabase data)"""
    try:
        logger.info("Starting sync from Supabase to local storage")
        
        client = db.client
        response = execute_with_retry(
            lambda: client.table("stores").select("*"),
            "stores sync",
        )
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
        
        stores = get_stores_data()
        existing_idx = next((i for i, s in enumerate(stores) if s.get("id") == store_data["id"]), -1)
        if existing_idx >= 0:
            stores[existing_idx] = store_data
        else:
            stores.append(store_data)
        save_stores_data(stores)

        try:
            client = db.client
            client.table('stores').upsert(store_data).execute()
        except Exception as supabase_error:
            logger.warning(
                f"Store {store_data['id']} saved locally; Supabase sync deferred: {supabase_error}"
            )
            return store_data["id"], "Store saved locally and queued for sync", 201
        
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
        base_version, base_updated_at = extract_base_markers(update_data)

        allowed_columns = {"name", "address", "phone", "status"}
        filtered_update_data = {k: v for k, v in update_data.items() if k in allowed_columns}
        if not filtered_update_data:
            return False, "No valid store fields provided for update", 400

        stores = get_stores_data()
        store_index = next((i for i, s in enumerate(stores) if s.get('id') == store_id), -1)
        
        if store_index == -1:
            try:
                exists_resp = db.client.table("stores").select("id").eq("id", store_id).limit(1).execute()
                if not exists_resp.data:
                    return False, "Store not found", 404
            except Exception:
                return False, "Store not found", 404

        client = db.client
        if base_updated_at is None:
            try:
                latest_resp = client.table("stores").select("updatedat").eq("id", store_id).limit(1).execute()
                if latest_resp.data:
                    base_updated_at = latest_resp.data[0].get("updatedat")
            except Exception as marker_error:
                logger.debug(f"Unable to read current store updated marker for {store_id}: {marker_error}")
        try:
            update_result = safe_update_with_conflict_check(
                client,
                table_name="stores",
                id_column="id",
                record_id=store_id,
                update_payload=filtered_update_data,
                updated_at_column="updatedat",
                base_version=base_version,
                base_updated_at=base_updated_at,
            )
            if not update_result["ok"]:
                if update_result.get("conflict"):
                    # If frontend did not send base markers, fallback to direct update.
                    if base_version is None and base_updated_at is None:
                        client.table("stores").update(filtered_update_data).eq("id", store_id).execute()
                    else:
                        return False, update_result.get("message", "Update conflict"), 409
                return False, "Failed to update store in Supabase", 500
        except Exception as supabase_error:
            logger.warning(
                f"Supabase update failed for store {store_id}; applying local fallback: {supabase_error}"
            )
            if store_index != -1:
                stores[store_index].update(filtered_update_data)
                stores[store_index]['updatedat'] = datetime.now().isoformat()
                save_stores_data(stores)
            return True, "Store saved locally (offline fallback)", 202

        if store_index != -1:
            stores[store_index].update(filtered_update_data)
            stores[store_index]['updatedat'] = datetime.now().isoformat()
            save_stores_data(stores)
        
        logger.info(f"Store updated {store_id}")
        return True, "Store updated", 200
    except Exception as e:
        logger.error(f"Error updating store: {e}", exc_info=True)
        return False, str(e), 500

def delete_store(store_id: str) -> Tuple[bool, str, int]:
    """Delete a store from both local storage and Supabase"""
    try:
        client = db.client

        stores = get_stores_data()
        store_index = next((i for i, s in enumerate(stores) if s.get('id') == store_id), -1)
        remote_exists = False
        try:
            remote_resp = client.table("stores").select("id").eq("id", store_id).limit(1).execute()
            remote_exists = bool(remote_resp.data)
        except Exception:
            remote_exists = False

        if store_index == -1 and not remote_exists:
            return False, "Store not found", 404

        # Hard blockers: rows in these tables must be removed first.
        # Transfer-order rows are cleaned up below, but store_damage_returns
        # remains a hard blocker to avoid deleting audit/repair history silently.
        hard_blockers = [
            ("store_damage_returns", "store_id", "store damage returns"),
        ]
        for table_name, column_name, label in hard_blockers:
            try:
                blocker_resp = client.table(table_name).select("id").eq(column_name, store_id).limit(1).execute()
                if blocker_resp.data:
                    return False, f"Cannot delete store: linked {label} exist. Remove those records first.", 409
            except Exception as blocker_error:
                logger.warning(f"Skipping blocker check for {table_name}.{column_name}: {blocker_error}")

        # Clean inventory transfer dependencies for this store.
        try:
            order_ids: List[str] = []
            orders_resp = client.table("inventory_transfer_orders").select("id").or_(
                f"store_id.eq.{store_id},source_store_id.eq.{store_id}"
            ).execute()
            if orders_resp.data:
                order_ids = [row.get("id") for row in orders_resp.data if row.get("id")]

            # Remove verifications tied directly to this store.
            client.table("inventory_transfer_verifications").delete().eq("store_id", store_id).execute()

            if order_ids:
                # Remove verifications tied by order.
                client.table("inventory_transfer_verifications").delete().in_("order_id", order_ids).execute()

                # Remove scans via transfer item ids.
                items_resp = client.table("inventory_transfer_items").select("id").in_(
                    "transfer_order_id", order_ids
                ).execute()
                item_ids = [row.get("id") for row in (items_resp.data or []) if row.get("id")]
                if item_ids:
                    client.table("inventory_transfer_scans").delete().in_("transfer_item_id", item_ids).execute()

                # Remove items and then orders.
                client.table("inventory_transfer_items").delete().in_("transfer_order_id", order_ids).execute()
                client.table("inventory_transfer_orders").delete().in_("id", order_ids).execute()
        except Exception as transfer_cleanup_error:
            return False, f"Failed to remove inventory transfer records: {transfer_cleanup_error}", 500

        # Nullable references can be detached safely.
        try:
            client.table("bills").update({"storeid": None}).eq("storeid", store_id).execute()
            client.table("returns").update({"store_id": None}).eq("store_id", store_id).execute()
            client.table("damaged_inventory_events").update({"store_id": None}).eq("store_id", store_id).execute()
        except Exception as detach_error:
            return False, f"Failed to detach store references: {detach_error}", 500

        try:
            client.table("storeinventory").delete().eq("storeid", store_id).execute()
            try:
                client.table("userstores").delete().eq("storeId", store_id).execute()
            except Exception:
                client.table("userstores").delete().eq("storeid", store_id).execute()
        except Exception as child_delete_error:
            return False, f"Failed to remove store child records: {child_delete_error}", 500

        try:
            client.table("stores").delete().eq("id", store_id).execute()
        except Exception as delete_error:
            return False, f"Failed to delete store: {delete_error}", 500

        if store_index != -1:
            stores.pop(store_index)
            save_stores_data(stores)
        try:
            inventory = get_store_inventory_data()
            updated_inventory = [inv for inv in inventory if inv.get("storeid") != store_id]
            save_store_inventory_data(updated_inventory)
        except Exception as local_inventory_error:
            logger.warning(f"Failed to clean local store inventory cache for {store_id}: {local_inventory_error}")

        return True, "Store deleted successfully", 200
        
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
        response = execute_with_retry(
            lambda: client.table("storeinventory")
            .select("*, products(name, price, barcode)")
            .eq("storeid", store_id),
            f"store inventory for {store_id}",
        )

        if not response or not response.data:
            try:
                # Fallback to local cache if cloud has no rows / query mismatch
                local_inventory = get_store_inventory_data()
                local_products = get_products_data()
                product_map = {str(p.get("id")): p for p in local_products if p.get("id")}
                rows: List[Dict] = []
                for inv in local_inventory:
                    row_store_id = inv.get("storeid") or inv.get("storeId")
                    if row_store_id != store_id:
                        continue
                    product_id = inv.get("productid") or inv.get("productId")
                    product = product_map.get(str(product_id), {})
                    row = dict(inv)
                    row["products"] = {
                        "name": product.get("name"),
                        "price": product.get("price"),
                        "barcode": product.get("barcode"),
                    }
                    rows.append(row)
                return [convert_snake_to_camel(inv) for inv in rows], 200
            except Exception as local_err:
                logger.warning(f"Local store inventory fallback failed for {store_id}: {local_err}")
                return [], 200

        transformed = [convert_snake_to_camel(inv) for inv in response.data]
        return transformed, 200
    except Exception as e:
        if is_transient_supabase_error(e):
            logger.warning(
                "Transient Supabase error getting store inventory for %s; falling back to local cache: %s",
                store_id,
                e,
            )
            try:
                local_inventory = get_store_inventory_data()
                local_products = get_products_data()
                product_map = {str(p.get("id")): p for p in local_products if p.get("id")}
                rows: List[Dict] = []
                for inv in local_inventory:
                    row_store_id = inv.get("storeid") or inv.get("storeId")
                    if row_store_id != store_id:
                        continue
                    product_id = inv.get("productid") or inv.get("productId")
                    product = product_map.get(str(product_id), {})
                    row = dict(inv)
                    row["products"] = {
                        "name": product.get("name"),
                        "price": product.get("price"),
                        "barcode": product.get("barcode"),
                    }
                    rows.append(row)
                return [convert_snake_to_camel(inv) for inv in rows], 200
            except Exception as local_err:
                logger.warning(f"Local store inventory fallback failed for {store_id}: {local_err}")
                return [], 200

        logger.error(f"Error getting store inventory: {e}", exc_info=True)
        return [], 500

def assign_products_to_store(
    store_id: str,
    products: List[Dict],
    assignment_meta: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, str, int, Dict[str, Any]]:
    """Create a transfer order for a store assignment after stock validation."""
    try:
        client = db.client
        assignment_meta = assignment_meta or {}

        if not products:
            return False, "No products provided", 400, {}

        requested_qty_by_product: Dict[str, int] = defaultdict(int)
        for product in products:
            product_id = product.get("productId") or product.get("productid")
            try:
                quantity = int(product.get("quantity", 0))
            except (TypeError, ValueError):
                quantity = 0

            if not product_id or quantity <= 0:
                return False, f"Invalid product ID or quantity: {product_id}", 400, {}
            requested_qty_by_product[product_id] += quantity

        product_ids = list(requested_qty_by_product.keys())
        products_response = client.table("products").select("id, stock, name").in_("id", product_ids).execute()
        product_rows = products_response.data or []
        product_map = {row.get("id"): row for row in product_rows if row.get("id")}

        for product_id in product_ids:
            if product_id not in product_map:
                return False, f"Product {product_id} not found", 404, {}

        # Pull all inventory rows so allocation math supports both
        # productid and productId schemas without query-column mismatch.
        allocations_response = client.table("storeinventory").select("*").execute()
        allocation_rows = allocations_response.data or []
        total_allocated_by_product: Dict[str, int] = defaultdict(int)
        for row in allocation_rows:
            product_id = row.get("productid") or row.get("productId")
            if product_id and product_id not in requested_qty_by_product:
                continue
            if product_id:
                total_allocated_by_product[product_id] += int(row.get("quantity") or 0)

        reserved_pending_by_product = _get_reserved_pending_transfer_qty(client, product_ids)
        for product_id, requested_qty in requested_qty_by_product.items():
            product_row = product_map[product_id]
            global_stock = int(product_row.get("stock") or 0)
            total_allocated = total_allocated_by_product.get(product_id, 0)
            reserved_pending = reserved_pending_by_product.get(product_id, 0)
            available = global_stock - total_allocated - reserved_pending
            if requested_qty > available:
                product_name = product_row.get("name", "Unknown")
                return False, (
                    f"Insufficient stock '{product_name}'. Global: {global_stock}, "
                    f"Allocated: {total_allocated}, Pending Reserved: {reserved_pending}, "
                    f"Available: {available}, Requested: {requested_qty}"
                ), 400, {}

        now_iso = datetime.now().isoformat()
        order_id = f"TO-{uuid.uuid4().hex[:12].upper()}"
        order_row = {
            "id": order_id,
            "store_id": store_id,
            "source_type": (assignment_meta.get("sourceType") or assignment_meta.get("source_type") or "manual").lower(),
            "source_store_id": assignment_meta.get("sourceStoreId") or assignment_meta.get("source_store_id"),
            "source_location_ref": assignment_meta.get("sourceLocationRef") or assignment_meta.get("source_location_ref"),
            "created_by": assignment_meta.get("createdBy") or assignment_meta.get("created_by"),
            "status": "pending",
            "notes": assignment_meta.get("notes"),
            "version_number": 1,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        client.table("inventory_transfer_orders").insert(order_row).execute()

        item_rows = []
        for product_id, requested_qty in requested_qty_by_product.items():
            item_rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "transfer_order_id": order_id,
                    "product_id": product_id,
                    "assigned_qty": requested_qty,
                    "verified_qty": 0,
                    "damaged_qty": 0,
                    "wrong_store_qty": 0,
                    "applied_verified_qty": 0,
                    "status": "pending",
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
            )
        client.table("inventory_transfer_items").insert(item_rows).execute()

        logger.info(f"Created transfer order {order_id} with {len(item_rows)} item(s) for store {store_id}")
        return True, f"Transfer order {order_id} created", 200, {"orderId": order_id, "itemCount": len(item_rows)}

    except Exception as e:
        logger.error(f"Error assigning products to store {store_id}: {e}", exc_info=True)
        return False, f"Assignment failed: {str(e)}", 500, {}


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


def _derive_item_state(item: Dict[str, Any]) -> str:
    assigned = int(item.get("assigned_qty") or 0)
    verified = int(item.get("verified_qty") or 0)
    damaged = int(item.get("damaged_qty") or 0)
    wrong_store = int(item.get("wrong_store_qty") or 0)
    processed = verified + damaged + wrong_store
    if processed <= 0:
        return "pending"
    if processed >= assigned:
        return "closed_with_issues" if (damaged > 0 or wrong_store > 0) else "completed"
    return "in_progress"


def get_store_transfer_orders(store_id: str, status: Optional[str] = None) -> Tuple[List[Dict], int]:
    """Fetch transfer orders for a store with computed progress and missing qty."""
    try:
        client = db.client
        # Pull rows and filter in Python to tolerate schema variants:
        # store_id / storeid / storeId.
        response = execute_with_retry(
            lambda: client.table("inventory_transfer_orders").select("*").order("created_at", desc=True),
            f"transfer orders for store {store_id}",
        )
        all_orders = response.data or []
        orders = []
        for row in all_orders:
            row_store_id = row.get("store_id") or row.get("storeid") or row.get("storeId")
            if str(row_store_id) != str(store_id):
                continue
            row_status = str(row.get("status") or "").lower()
            if status and row_status != str(status).lower():
                continue
            orders.append(row)
        if not orders:
            return [], 200

        order_ids = [order.get("id") for order in orders if order.get("id")]
        items_response = execute_with_retry(
            lambda: client.table("inventory_transfer_items").select("*").in_("transfer_order_id", order_ids),
            f"transfer order items for store {store_id}",
        )
        items = items_response.data or []

        items_by_order: Dict[str, List[Dict]] = defaultdict(list)
        for item in items:
            order_id = item.get("transfer_order_id")
            if order_id:
                items_by_order[order_id].append(item)

        result = []
        for order in orders:
            order_items = items_by_order.get(order.get("id"), [])
            assigned = sum(int(i.get("assigned_qty") or 0) for i in order_items)
            verified = sum(int(i.get("verified_qty") or 0) for i in order_items)
            damaged = sum(int(i.get("damaged_qty") or 0) for i in order_items)
            wrong_store = sum(int(i.get("wrong_store_qty") or 0) for i in order_items)
            missing = max(0, assigned - verified - damaged - wrong_store)
            computed_status = order.get("status")
            if computed_status in TRANSFER_ACTIVE_STATUSES and assigned > 0:
                if missing == 0:
                    computed_status = "closed_with_issues" if (damaged > 0 or wrong_store > 0) else "completed"
                elif verified > 0 or damaged > 0 or wrong_store > 0:
                    computed_status = "in_progress"

            result.append(
                convert_snake_to_camel(
                    {
                        **order,
                        "status": computed_status,
                        "assigned_qty_total": assigned,
                        "verified_qty_total": verified,
                        "damaged_qty_total": damaged,
                        "wrong_store_qty_total": wrong_store,
                        "missing_qty_total": missing,
                        "item_count": len(order_items),
                    }
                )
            )
        return result, 200
    except Exception as e:
        if is_transient_supabase_error(e):
            logger.warning(
                "Transient Supabase error getting transfer orders for store %s; returning empty list: %s",
                store_id,
                e,
            )
            return [], 200
        logger.error(f"Error getting transfer orders for store {store_id}: {e}", exc_info=True)
        return [], 500


def get_transfer_order_details(order_id: str) -> Tuple[Optional[Dict], int]:
    """Fetch one transfer order with items and computed missing qty per item."""
    try:
        client = db.client
        order_response = execute_with_retry(
            lambda: client.table("inventory_transfer_orders").select("*").eq("id", order_id).limit(1),
            f"transfer order details {order_id}",
        )
        if not order_response.data:
            return None, 404

        # Avoid relational select dependency (`products(...)`) because it may fail
        # on deployments missing that explicit FK relationship metadata.
        items_response = execute_with_retry(
            lambda: client.table("inventory_transfer_items").select("*").eq("transfer_order_id", order_id),
            f"transfer order items {order_id}",
        )
        items = items_response.data or []
        product_ids = list(
            {
                str(item.get("product_id") or "").strip()
                for item in items
                if str(item.get("product_id") or "").strip()
            }
        )
        product_map: Dict[str, Dict[str, Any]] = {}
        if product_ids:
            try:
                products_response = execute_with_retry(
                    lambda: client.table("products").select("id, name, barcode, selling_price, batchid, batch(id, batch_number)").in_("id", product_ids),
                    f"transfer order products {order_id}",
                )
                for prod in products_response.data or []:
                    pid = str(prod.get("id") or "").strip()
                    if pid:
                        product_map[pid] = prod
            except Exception as product_error:
                logger.warning("Failed to enrich transfer-order products for %s: %s", order_id, product_error)

        normalized_items = []
        for item in items:
            assigned = int(item.get("assigned_qty") or 0)
            verified = int(item.get("verified_qty") or 0)
            damaged = int(item.get("damaged_qty") or 0)
            wrong_store = int(item.get("wrong_store_qty") or 0)
            missing = max(0, assigned - verified - damaged - wrong_store)
            product_id = str(item.get("product_id") or "").strip()
            product_meta = product_map.get(product_id, {})
            
            # Extract batch information
            batch_ref = product_meta.get("batch")
            batch_number = ""
            if batch_ref:
                if isinstance(batch_ref, list):
                    batch_ref = batch_ref[0] if batch_ref else {}
                if isinstance(batch_ref, dict):
                    batch_number = batch_ref.get("batch_number", "")
            
            normalized_items.append(
                convert_snake_to_camel(
                    {
                        **item,
                        "missing_qty": missing,
                        "status": _derive_item_state(item),
                        "products": {
                            "name": product_meta.get("name"),
                            "barcode": product_meta.get("barcode"),
                            "selling_price": product_meta.get("selling_price") or product_meta.get("sellingPrice"),
                            "batch_number": batch_number,
                        },
                    }
                )
            )

        order = convert_snake_to_camel(order_response.data[0])
        order["items"] = normalized_items
        return order, 200
    except Exception as e:
        if is_transient_supabase_error(e):
            logger.warning(
                "Transient Supabase error getting transfer order details %s; returning temporary-unavailable status: %s",
                order_id,
                e,
            )
            return None, 503
        logger.error(f"Error getting transfer order details {order_id}: {e}", exc_info=True)
        return None, 500


def _remove_transfer_order_from_local_cache(order_id: str, transfer_item_ids: List[str]) -> None:
    """
    Best-effort cleanup for local sync/cache json files related to transfer orders.
    """
    file_specs = [
        ("inventory_transfer_orders.json", lambda row: str(row.get("id")) == order_id),
        (
            "inventory_transfer_items.json",
            lambda row: str(row.get("transfer_order_id")) == order_id,
        ),
        (
            "inventory_transfer_verifications.json",
            lambda row: str(row.get("order_id")) == order_id,
        ),
        (
            "inventory_transfer_scans.json",
            lambda row: str(row.get("transfer_item_id")) in set(transfer_item_ids),
        ),
    ]

    for filename, should_remove in file_specs:
        path = os.path.join(Config.JSON_DIR, filename)
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if not isinstance(data, list):
                continue
            filtered = [row for row in data if not should_remove(row if isinstance(row, dict) else {})]
            if len(filtered) == len(data):
                continue
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(filtered, fh, indent=2, ensure_ascii=False)
        except Exception as cache_err:
            logger.warning(f"Failed local transfer-order cache cleanup for {filename}: {cache_err}")


def delete_transfer_order(order_id: str) -> Tuple[bool, str, int, Optional[str]]:
    """Delete transfer order and linked rows from Supabase and local cache."""
    try:
        client = db.client
        order_resp = execute_with_retry(
            lambda: client.table("inventory_transfer_orders").select("id, store_id").eq("id", order_id).limit(1),
            f"lookup transfer order {order_id}",
        )
        order_rows = order_resp.data or []
        if not order_rows:
            return False, "Transfer order not found", 404, None

        store_id = order_rows[0].get("store_id")

        items_resp = execute_with_retry(
            lambda: client.table("inventory_transfer_items").select("id").eq("transfer_order_id", order_id),
            f"lookup transfer order items {order_id}",
        )
        item_ids = [str(row.get("id")) for row in (items_resp.data or []) if row.get("id")]

        if item_ids:
            execute_with_retry(
                lambda: client.table("inventory_transfer_scans").delete().in_("transfer_item_id", item_ids),
                f"delete transfer scans {order_id}",
            )

        execute_with_retry(
            lambda: client.table("inventory_transfer_verifications").delete().eq("order_id", order_id),
            f"delete transfer verifications {order_id}",
        )
        execute_with_retry(
            lambda: client.table("inventory_transfer_items").delete().eq("transfer_order_id", order_id),
            f"delete transfer items {order_id}",
        )
        execute_with_retry(
            lambda: client.table("inventory_transfer_orders").delete().eq("id", order_id),
            f"delete transfer order {order_id}",
        )

        _remove_transfer_order_from_local_cache(order_id, item_ids)
        return True, "Transfer order deleted successfully", 200, str(store_id) if store_id else None
    except Exception as e:
        if is_transient_supabase_error(e):
            return False, "Supabase temporarily unavailable. Please try again in a moment.", 503, None
        logger.error(f"Error deleting transfer order {order_id}: {e}", exc_info=True)
        return False, str(e), 500, None


def get_damaged_inventory_events(
    store_id: Optional[str] = None,
    status: Optional[str] = None,
) -> Tuple[List[Dict], int]:
    """List damaged inventory events for admin."""
    try:
        client = db.client
        query = client.table("damaged_inventory_events").select("*, products(name, barcode), stores(name)")
        if store_id:
            query = query.eq("store_id", store_id)
        if status:
            query = query.eq("status", status)
        response = query.order("created_at", desc=True).execute()
        return [convert_snake_to_camel(row) for row in (response.data or [])], 200
    except Exception as e:
        logger.error(f"Error getting damaged inventory events: {e}", exc_info=True)
        return [], 500


def resolve_damaged_inventory_event(event_id: str, resolution_data: Dict[str, Any]) -> Tuple[bool, str, int]:
    """Resolve one damaged inventory event with lifecycle details."""
    try:
        client = db.client
        now_iso = datetime.now().isoformat()
        update_data = {
            "status": "resolved",
            "resolution_type": resolution_data.get("resolutionType") or resolution_data.get("resolution_type"),
            "resolution_notes": resolution_data.get("resolutionNotes") or resolution_data.get("resolution_notes"),
            "resolved_by": resolution_data.get("resolvedBy") or resolution_data.get("resolved_by"),
            "resolved_at": now_iso,
            "updated_at": now_iso,
        }
        response = client.table("damaged_inventory_events").update(update_data).eq("id", event_id).execute()
        if not response.data:
            return False, "Damaged event not found", 404
        return True, "Damaged event resolved", 200
    except Exception as e:
        logger.error(f"Error resolving damaged inventory event {event_id}: {e}", exc_info=True)
        return False, str(e), 500


def get_store_damage_returns(
    store_id: Optional[str] = None,
    status: Optional[str] = None,
) -> Tuple[List[Dict], int]:
    """List rows from store_damage_returns with optional filters."""
    try:
        client = db.client
        query = client.table("store_damage_returns").select("*, products(name, barcode), stores(name)")
        if store_id:
            query = query.eq("store_id", store_id)
        if status:
            query = query.eq("status", status)
        response = query.order("created_at", desc=True).execute()
        rows = response.data or []

        # Refresh local cache for offline viewing.
        try:
            save_store_damage_returns_data(rows)
        except Exception as cache_err:
            logger.warning(f"Failed to refresh store_damage_returns local cache: {cache_err}")

        return [convert_snake_to_camel(row) for row in rows], 200
    except Exception as e:
        logger.error(f"Error getting store damage returns: {e}", exc_info=True)
        local_rows = get_store_damage_returns_data()
        if store_id:
            local_rows = [r for r in local_rows if str(r.get("store_id")) == str(store_id)]
        if status:
            local_rows = [r for r in local_rows if str(r.get("status")) == str(status)]
        return [convert_snake_to_camel(r) for r in local_rows], 200


def mark_store_damage_return_repaired(row_id: str, payload: Dict[str, Any]) -> Tuple[bool, str, int]:
    """
    Mark a store damaged-return row as repaired and add quantity back to products.stock.
    """
    try:
        client = db.client
        now_iso = datetime.now().isoformat()
        lookup = client.table("store_damage_returns").select("*").eq("id", row_id).limit(1).execute()
        if not lookup.data:
            return False, "Store damaged return not found", 404

        row = lookup.data[0]
        if row.get("status") == "repaired":
            return True, "Already repaired", 200

        restock_qty = int(payload.get("restockQty") or payload.get("restock_qty") or row.get("quantity") or 0)
        if restock_qty <= 0:
            return False, "restockQty must be greater than 0", 400

        product_id = row.get("product_id")
        if not product_id:
            return False, "product_id missing in damaged return row", 400

        # Update global products stock
        product_resp = client.table("products").select("id, stock").eq("id", product_id).limit(1).execute()
        if not product_resp.data:
            return False, "Product not found", 404
        current_stock = int(product_resp.data[0].get("stock") or 0)
        new_stock = current_stock + restock_qty
        client.table("products").update({"stock": new_stock, "updatedat": now_iso}).eq("id", product_id).execute()

        resolution_status = payload.get("resolutionStatus") or payload.get("resolution_status") or "fixed"
        restock_action = payload.get("restockAction") or payload.get("restock_action") or "increase_stock"
        resolution_notes = payload.get("resolutionNotes") or payload.get("resolution_notes") or payload.get("repairNotes") or payload.get("repair_notes")

        update_data = {
            "status": resolution_status,
            "resolution_status": resolution_status,
            "resolution_notes": resolution_notes,
            "resolved_by": payload.get("resolvedBy") or payload.get("resolved_by") or payload.get("repairedBy") or payload.get("repaired_by"),
            "resolved_at": now_iso,
            "restock_qty": restock_qty,
            "restock_action": restock_action,
            "repaired_qty": restock_qty,
            "repaired_by": payload.get("repairedBy") or payload.get("repaired_by"),
            "repaired_at": now_iso,
            "repair_notes": payload.get("repairNotes") or payload.get("repair_notes"),
            "updated_at": now_iso,
        }
        client.table("store_damage_returns").update(update_data).eq("id", row_id).execute()

        # Best-effort local cache sync
        try:
            products = get_products_data()
            for p in products:
                if str(p.get("id")) == str(product_id):
                    p["stock"] = int(p.get("stock") or 0) + restock_qty
                    p["updatedat"] = now_iso
                    break
            save_products_data(products)

            rows = get_store_damage_returns_data()
            for r in rows:
                if str(r.get("id")) == str(row_id):
                    r.update(update_data)
                    break
            save_store_damage_returns_data(rows)
        except Exception as local_err:
            logger.warning(f"Local cache update warning after repairing store damage return {row_id}: {local_err}")

        return True, "Store damaged return marked as repaired", 200
    except Exception as e:
        logger.error(f"Error marking store damaged return repaired {row_id}: {e}", exc_info=True)
        # Offline fallback: update only local JSON cache and mark as pending cloud sync.
        try:
            now_iso = datetime.now().isoformat()
            rows = get_store_damage_returns_data()
            target = next((r for r in rows if str(r.get("id")) == str(row_id)), None)
            if not target:
                return False, str(e), 500

            restock_qty = int(payload.get("restockQty") or payload.get("restock_qty") or target.get("quantity") or 0)
            if restock_qty <= 0:
                return False, "restockQty must be greater than 0", 400

            update_data = {
                "status": "repaired",
                "repaired_qty": restock_qty,
                "repaired_by": payload.get("repairedBy") or payload.get("repaired_by"),
                "repaired_at": now_iso,
                "repair_notes": payload.get("repairNotes") or payload.get("repair_notes"),
                "updated_at": now_iso,
                "cloud_sync_pending": True,
            }
            target.update(update_data)
            save_store_damage_returns_data(rows)

            products = get_products_data()
            for p in products:
                if str(p.get("id")) == str(target.get("product_id")):
                    p["stock"] = int(p.get("stock") or 0) + restock_qty
                    p["updatedat"] = now_iso
                    break
            save_products_data(products)
            return True, "Saved locally (offline fallback). Cloud sync pending.", 202
        except Exception:
            return False, str(e), 500
