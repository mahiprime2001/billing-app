"""
Products Service
Handles all product-related business logic and database operations
"""

import logging
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from decimal import Decimal
from utils.supabase_db import db
from utils.supabase_resilience import execute_with_retry
from utils.json_helpers import (
    get_products_data,
    save_products_data,
    get_hsn_codes_data,
    get_returns_data,
    save_returns_data,
    get_store_inventory_data,
    save_store_inventory_data,
)
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel
from utils.concurrency_guard import extract_base_markers, safe_update_with_conflict_check

logger = logging.getLogger(__name__)

# ============================================
# HELPER FUNCTIONS
# ============================================

def get_primary_barcode(product: dict) -> str:
    """Helper to expose a single primary barcode for UI (e.g., first barcode in a comma-separated string)."""
    barcodes_str = product.get('barcodes') or product.get('barcode')
    if isinstance(barcodes_str, str) and barcodes_str.strip():
        codes = [b.strip() for b in barcodes_str.split(',') if b.strip()]
        return codes[0] if codes else ""
    return ""

def process_barcodes(product_data: dict) -> str:
    """
    Process barcode data from product input and return comma-separated string.
    Handles both 'barcode' (single) and 'barcodes' (array) fields.
    """
    all_barcodes = []
    
    # Handle single 'barcode' field
    if 'barcode' in product_data and product_data.get('barcode'):
        barcode_val = str(product_data.get('barcode', '')).strip()
        if barcode_val:
            all_barcodes.append(barcode_val)
    
    # Handle 'barcodes' field (array or string)
    if 'barcodes' in product_data and product_data.get('barcodes'):
        barcodes_val = product_data.get('barcodes')
        if isinstance(barcodes_val, list):
            all_barcodes.extend([str(b).strip() for b in barcodes_val if str(b).strip()])
        elif isinstance(barcodes_val, str):
            all_barcodes.extend([b.strip() for b in barcodes_val.split(',') if b.strip()])
    
    # Return unique, sorted, comma-separated string
    if all_barcodes:
        return ','.join(sorted(list(set(all_barcodes))))
    return ""

def _parse_tax_value(value) -> float:
    """Safely parse numeric tax values."""
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0

def _get_hsn_tax_map() -> Dict[str, float]:
    """Return HSN tax map keyed by HSN id from local JSON and Supabase."""
    tax_map: Dict[str, float] = {}

    # Local JSON (fallback)
    try:
        for code in get_hsn_codes_data():
            code_id = code.get("id")
            if code_id is None:
                continue
            tax_map[str(code_id)] = _parse_tax_value(code.get("tax"))
    except Exception as e:
        logger.warning(f"Failed to load HSN taxes from local JSON: {e}")

    # Supabase (preferred)
    try:
        client = db.client
        response = execute_with_retry(
            lambda: client.table("hsn_codes").select("id,tax"),
            "hsn_codes (tax map)",
            retries=2,
        )
        for code in response.data or []:
            code_id = code.get("id")
            if code_id is None:
                continue
            tax_map[str(code_id)] = _parse_tax_value(code.get("tax"))
    except Exception as e:
        logger.warning(f"Failed to load HSN taxes from Supabase: {e}")

    return tax_map

# ============================================
# HSN CODE UTILITIES
# ============================================

def get_hsn_code_details(hsn_code_id: str) -> Optional[Dict]:
    """
    Get HSN code details by ID
    Returns HSN code dict or None if not found
    """
    try:
        client = db.client
        response = execute_with_retry(
            lambda: client.table("hsn_codes").select("*").eq("id", hsn_code_id),
            f"hsn_codes details {hsn_code_id}",
            retries=2,
        )
        if response.data and len(response.data) > 0:
            return convert_snake_to_camel(response.data[0])
        return None
    except Exception as e:
        logger.error(f"Error getting HSN code details: {e}", exc_info=True)
        return None

# ============================================
# LOCAL JSON OPERATIONS
# ============================================

def get_local_products() -> List[Dict]:
    """Get products from local JSON storage"""
    try:
        products = get_products_data()
        transformed_products = []
        hsn_tax_map = _get_hsn_tax_map()
        
        for product in products:
            converted_product = convert_snake_to_camel(product)
            
            # Convert hsn_code_id to hsnCode for frontend
            if 'hsnCodeId' in converted_product:
                converted_product['hsnCode'] = converted_product.pop('hsnCodeId')

            hsn_code_id = converted_product.get("hsnCode")
            if hsn_code_id is not None and str(hsn_code_id).strip() != "":
                converted_product["tax"] = hsn_tax_map.get(str(hsn_code_id), 0.0)
            else:
                converted_product["tax"] = 0.0
            
            # Set display price
            if 'sellingPrice' in converted_product and converted_product['sellingPrice']:
                converted_product['displayPrice'] = converted_product['sellingPrice']
            elif 'price' in converted_product:
                converted_product['displayPrice'] = converted_product['price']
            
            # Process barcodes for display
            barcode_str = converted_product.get('barcode')
            if isinstance(barcode_str, str) and barcode_str.strip():
                converted_product['barcodes'] = [b.strip() for b in barcode_str.split(',') if b.strip()]
            else:
                converted_product['barcodes'] = []
            
            # Ensure batchId is properly set
            if 'batchid' in converted_product and converted_product['batchid']:
                converted_product['batchId'] = converted_product['batchid']
            elif 'batchId' not in converted_product:
                converted_product['batchId'] = None
            
            transformed_products.append(converted_product)
        
        return transformed_products
    except Exception as e:
        logger.error(f"Error getting local products: {e}", exc_info=True)
        return []


def get_local_products_for_billing() -> List[Dict]:
    """
    Get local products for billing with available stock only.
    available stock = max(0, product.stock - sum(storeinventory.quantity for product))
    """
    try:
        local_products = get_local_products()
        inventory_rows = get_store_inventory_data()
        allocated_by_product: Dict[str, int] = {}
        for row in inventory_rows:
            pid = row.get("productid")
            if not pid:
                continue
            allocated_by_product[pid] = allocated_by_product.get(pid, 0) + int(row.get("quantity") or 0)

        for product in local_products:
            pid = product.get("id")
            global_stock = int(product.get("stock") or 0)
            allocated = int(allocated_by_product.get(pid, 0))
            available_stock = max(0, global_stock - allocated)
            product["globalStock"] = global_stock
            product["allocatedStock"] = allocated
            product["availableStock"] = available_stock
            product["stock"] = available_stock

        return local_products
    except Exception as e:
        logger.error(f"Error getting local products for billing: {e}", exc_info=True)
        return []

def update_local_products(products_data: List[Dict]) -> bool:
    """Update local JSON products with new data"""
    try:
        if not isinstance(products_data, list):
            logger.error("Expected a list of products")
            return False
        
        # Convert from camelCase to snake_case before saving
        snake_case_products = [convert_camel_to_snake(product) for product in products_data]
        save_products_data(snake_case_products)
        logger.info(f"Updated local JSON with {len(products_data)} products.")
        return True
    except Exception as e:
        logger.error(f"Error updating local products: {e}", exc_info=True)
        return False

# ============================================
# SUPABASE OPERATIONS
# ============================================

def get_supabase_products() -> List[Dict]:
    """Get products directly from Supabase"""
    try:
        client = db.client
        response = execute_with_retry(
            lambda: client.table("products").select("*"),
            "products",
            retries=2,
        )
        products = response.data or []
        
        transformed_products = []
        hsn_tax_map = _get_hsn_tax_map()
        for product in products:
            converted_product = convert_snake_to_camel(product)
            
            # Convert hsn_code_id to hsnCode for frontend
            if 'hsnCodeId' in converted_product:
                converted_product['hsnCode'] = converted_product.pop('hsnCodeId')

            hsn_code_id = converted_product.get("hsnCode")
            if hsn_code_id is not None and str(hsn_code_id).strip() != "":
                converted_product["tax"] = hsn_tax_map.get(str(hsn_code_id), 0.0)
            else:
                converted_product["tax"] = 0.0
            
            # Set display price
            if 'sellingPrice' in converted_product and converted_product['sellingPrice']:
                converted_product['displayPrice'] = converted_product['sellingPrice']
            elif 'price' in converted_product:
                converted_product['displayPrice'] = converted_product['price']
            
            # Process barcodes for display
            barcode_str = converted_product.get('barcode')
            if isinstance(barcode_str, str) and barcode_str.strip():
                converted_product['barcodes'] = [b.strip() for b in barcode_str.split(',') if b.strip()]
            else:
                converted_product['barcodes'] = []
            
            # Ensure batchId is properly set
            if 'batchid' in converted_product and converted_product['batchid']:
                converted_product['batchId'] = converted_product['batchid']
            elif 'batchId' not in converted_product:
                converted_product['batchId'] = None
            
            transformed_products.append(converted_product)
        
        logger.debug(f"Returning {len(transformed_products)} products from Supabase.")
        return transformed_products
    except Exception as e:
        logger.error(f"Error getting Supabase products: {e}", exc_info=True)
        return []


def get_supabase_products_for_billing() -> List[Dict]:
    """
    Get products for billing with AVAILABLE stock only.
    available stock = max(0, product.stock - sum(storeinventory.quantity for product))
    """
    try:
        client = db.client
        products_response = execute_with_retry(
            lambda: client.table("products").select("*"),
            "products for billing",
            retries=2,
        )
        products = products_response.data or []

        inventory_response = execute_with_retry(
            lambda: client.table("storeinventory").select("productid, quantity"),
            "storeinventory for billing products",
            retries=2,
        )
        inventory_rows = inventory_response.data or []

        allocated_by_product: Dict[str, int] = {}
        for row in inventory_rows:
            pid = row.get("productid")
            if not pid:
                continue
            allocated_by_product[pid] = allocated_by_product.get(pid, 0) + int(row.get("quantity") or 0)

        transformed_products = []
        hsn_tax_map = _get_hsn_tax_map()
        for product in products:
            converted_product = convert_snake_to_camel(product)
            product_id = converted_product.get("id")
            global_stock = int(converted_product.get("stock") or 0)
            allocated = int(allocated_by_product.get(product_id, 0))
            available_stock = max(0, global_stock - allocated)

            if 'hsnCodeId' in converted_product:
                converted_product['hsnCode'] = converted_product.pop('hsnCodeId')

            hsn_code_id = converted_product.get("hsnCode")
            if hsn_code_id is not None and str(hsn_code_id).strip() != "":
                converted_product["tax"] = hsn_tax_map.get(str(hsn_code_id), 0.0)
            else:
                converted_product["tax"] = 0.0

            if 'sellingPrice' in converted_product and converted_product['sellingPrice']:
                converted_product['displayPrice'] = converted_product['sellingPrice']
            elif 'price' in converted_product:
                converted_product['displayPrice'] = converted_product['price']

            barcode_str = converted_product.get('barcode')
            if isinstance(barcode_str, str) and barcode_str.strip():
                converted_product['barcodes'] = [b.strip() for b in barcode_str.split(',') if b.strip()]
            else:
                converted_product['barcodes'] = []

            if 'batchid' in converted_product and converted_product['batchid']:
                converted_product['batchId'] = converted_product['batchid']
            elif 'batchId' not in converted_product:
                converted_product['batchId'] = None

            converted_product["globalStock"] = global_stock
            converted_product["allocatedStock"] = allocated
            converted_product["availableStock"] = available_stock
            converted_product["stock"] = available_stock
            transformed_products.append(converted_product)

        logger.debug(f"Returning {len(transformed_products)} products for billing (available stock).")
        return transformed_products
    except Exception as e:
        logger.error(f"Error getting Supabase products for billing: {e}", exc_info=True)
        return []

def insert_product_to_supabase(product_data: dict) -> Optional[dict]:
    """Insert a product into Supabase"""
    try:
        client = db.client
        logger.info(f"Attempting to insert product {product_data['id']} into Supabase...")
        
        supabase_response = client.table('products').insert(product_data).execute()
        
        if supabase_response.data is None or len(supabase_response.data) == 0:
            logger.error(f"Supabase insertion failed for product {product_data['id']}")
            return None
        
        logger.info(f"Product {product_data['id']} inserted successfully into Supabase.")
        return supabase_response.data[0] if supabase_response.data else None
    except Exception as e:
        logger.error(f"Error inserting product to Supabase: {e}", exc_info=True)
        return None

def update_product_in_supabase(product_id: str, update_data: dict) -> Optional[dict]:
    """Update a product in Supabase"""
    try:
        client = db.client
        logger.info(f"Updating product {product_id} in Supabase...")
        
        supabase_response = client.table('products').update(update_data).eq('id', product_id).execute()
        
        if supabase_response.data is None or len(supabase_response.data) == 0:
            logger.error(f"Supabase update failed for product {product_id}")
            return None
        
        logger.info(f"Product {product_id} updated successfully in Supabase.")
        return supabase_response.data[0] if supabase_response.data else None
    except Exception as e:
        logger.error(f"Error updating product in Supabase: {e}", exc_info=True)
        return None

def delete_product_from_supabase(product_id: str) -> bool:
    """
    Delete a product from Supabase and all dependent table rows per schema FKs.
    """
    try:
        client = db.client

        logger.info(f"Deleting dependent rows for product {product_id}...")

        # replacements has two foreign keys to products
        execute_with_retry(
            lambda: client.table('replacements').delete().eq('replaced_product_id', product_id),
            f"replacements (replaced_product_id) delete for product {product_id}",
            retries=2,
        )
        execute_with_retry(
            lambda: client.table('replacements').delete().eq('new_product_id', product_id),
            f"replacements (new_product_id) delete for product {product_id}",
            retries=2,
        )

        # Find transfer items to remove related scans first
        transfer_items_resp = execute_with_retry(
            lambda: client.table('inventory_transfer_items').select('id').eq('product_id', product_id),
            f"inventory_transfer_items lookup for product {product_id}",
            retries=2,
        )
        transfer_item_ids = [row.get("id") for row in (transfer_items_resp.data or []) if row.get("id")]
        if transfer_item_ids:
            execute_with_retry(
                lambda: client.table('inventory_transfer_scans').delete().in_('transfer_item_id', transfer_item_ids),
                f"inventory_transfer_scans delete for product {product_id}",
                retries=2,
            )

        execute_with_retry(
            lambda: client.table('inventory_transfer_items').delete().eq('product_id', product_id),
            f"inventory_transfer_items delete for product {product_id}",
            retries=2,
        )

        execute_with_retry(
            lambda: client.table('damaged_inventory_events').delete().eq('product_id', product_id),
            f"damaged_inventory_events delete for product {product_id}",
            retries=2,
        )
        execute_with_retry(
            lambda: client.table('returns').delete().eq('product_id', product_id),
            f"returns delete for product {product_id}",
            retries=2,
        )
        execute_with_retry(
            lambda: client.table('billitems').delete().eq('productid', product_id),
            f"billitems delete for product {product_id}",
            retries=2,
        )
        execute_with_retry(
            lambda: client.table('storeinventory').delete().eq('productid', product_id),
            f"storeinventory delete for product {product_id}",
            retries=2,
        )
        execute_with_retry(
            lambda: client.table('products').delete().eq('id', product_id),
            f"product delete {product_id}",
            retries=2,
        )

        logger.info(f"Product {product_id} and dependent rows deleted from Supabase")
        
        return True
    except Exception as e:
        logger.error(f"Error deleting product from Supabase: {e}", exc_info=True)
        return False

# ============================================
# MERGED OPERATIONS
# ============================================

def get_merged_products() -> Tuple[List[Dict], int]:
    """
    Get products by merging local and Supabase (Supabase takes precedence).
    Returns (products_list, status_code)
    """
    try:
        # Fetch from Supabase first (source of truth)
        supabase_products = get_supabase_products()
        if supabase_products:
            try:
                cache_rows = [convert_camel_to_snake(p) for p in supabase_products]
                save_products_data(cache_rows)
            except Exception as cache_err:
                logger.warning(f"Failed to refresh local products cache: {cache_err}")
            supabase_products.sort(key=lambda x: x.get('name', ''), reverse=False)
            logger.debug(f"Returning {len(supabase_products)} products from Supabase (cache refreshed)")
            return supabase_products, 200

        # Offline fallback
        local_products = get_local_products()
        local_products.sort(key=lambda x: x.get('name', ''), reverse=False)
        logger.debug(f"Returning {len(local_products)} products from local fallback")
        return local_products, 200
    except Exception as e:
        logger.error(f"Error getting merged products: {e}", exc_info=True)
        return [], 500

# ============================================
# BUSINESS LOGIC
# ============================================

def create_product(product_data: dict) -> Tuple[Optional[str], str, int]:
    """
    Create a new product (offline-first approach).
    Returns (product_id, message, status_code)
    """
    try:
        if not product_data:
            return None, "No product data provided", 400
        
        # Convert field names from camelCase to snake_case
        product_data = convert_camel_to_snake(product_data)

        # Product tax is derived from HSN code; never store manual tax values on products.
        product_data.pop("tax", None)
        
        # Convert hsn_code to hsn_code_id for database
        if 'hsn_code' in product_data:
            product_data['hsn_code_id'] = product_data.pop('hsn_code')
        if "hsn_code_id" in product_data and not product_data.get("hsn_code_id"):
            product_data["hsn_code_id"] = None
        
        # Generate ID if not present
        if 'id' not in product_data:
            product_data['id'] = str(uuid.uuid4())
        
        # Add timestamps
        now_naive = datetime.now().isoformat()
        if 'createdat' not in product_data:
            product_data['createdat'] = now_naive
        product_data['updatedat'] = now_naive
        
        # Process barcodes
        barcode_string = process_barcodes(product_data)
        product_data['barcode'] = barcode_string
        product_data.pop('barcodes', None)
        
        # Handle empty batchId
        if 'batchid' in product_data and not product_data['batchid']:
            product_data['batchid'] = None
        
        # STEP 1: Save to local JSON first (offline-first)
        products = get_products_data()
        existing_idx = next((i for i, p in enumerate(products) if p.get("id") == product_data["id"]), -1)
        if existing_idx >= 0:
            products[existing_idx] = product_data
        else:
            products.append(product_data)
        save_products_data(products)

        # STEP 2: Best-effort sync to Supabase now (queue will retry on failure)
        supabase_result = insert_product_to_supabase(product_data)
        if not supabase_result:
            logger.warning(
                f"Product {product_data['id']} saved locally; Supabase sync deferred"
            )
            return product_data["id"], "Product saved locally and queued for sync", 201
        
        logger.info(f"Product created {product_data['id']} (Supabase + local JSON)")
        return product_data['id'], "Product created", 201
    except Exception as e:
        logger.error(f"Error creating product: {e}", exc_info=True)
        return None, str(e), 500

def update_product(product_id: str, update_data: dict) -> Tuple[bool, str, int]:
    """
    Update a product (offline-first approach).
    Returns (success, message, status_code)
    """
    try:
        if not update_data:
            return False, "No update data provided", 400
        
        # Convert field names from camelCase to snake_case
        update_data = convert_camel_to_snake(update_data)

        # Product tax is derived from HSN code; ignore manual tax updates.
        update_data.pop("tax", None)
        
        # Convert hsn_code to hsn_code_id for database
        if 'hsn_code' in update_data:
            update_data['hsn_code_id'] = update_data.pop('hsn_code')
        if "hsn_code_id" in update_data and not update_data.get("hsn_code_id"):
            update_data["hsn_code_id"] = None
        
        # Find the product in local storage
        products = get_products_data()
        product_index = next((i for i, p in enumerate(products) if p.get('id') == product_id), -1)
        
        if product_index == -1:
            return False, "Product not found", 404
        
        # Process barcodes if present
        if 'barcode' in update_data or 'barcodes' in update_data:
            existing_barcode_str = products[product_index].get('barcode', '')
            
            # Merge with existing barcodes
            all_barcodes = []
            if existing_barcode_str:
                all_barcodes.extend([b.strip() for b in existing_barcode_str.split(',') if b.strip()])
            
            new_barcode_str = process_barcodes(update_data)
            if new_barcode_str:
                all_barcodes.extend([b.strip() for b in new_barcode_str.split(',') if b.strip()])
            
            update_data['barcode'] = ','.join(sorted(list(set(all_barcodes)))) if all_barcodes else ''
            update_data.pop('barcodes', None)
        
        # Extract conflict markers and fallback to local marker when missing.
        base_version, base_updated_at = extract_base_markers(update_data)
        if base_updated_at is None and product_index != -1:
            base_updated_at = products[product_index].get("updatedat")

        # Update in Supabase first (remove _deleted field if present)
        update_data_clean = {k: v for k, v in update_data.items() if k != '_deleted'}
        client = db.client
        try:
            update_result = safe_update_with_conflict_check(
                client,
                table_name="products",
                id_column="id",
                record_id=product_id,
                update_payload=update_data_clean,
                updated_at_column="updatedat",
                base_version=base_version,
                base_updated_at=base_updated_at,
            )
            if not update_result["ok"]:
                if update_result.get("conflict"):
                    return False, update_result.get("message", "Update conflict"), 409
                return False, "Failed to update product in Supabase", 500
        except Exception as supabase_error:
            logger.warning(
                f"Supabase update failed for product {product_id}; applying local fallback: {supabase_error}"
            )
            products[product_index].update(update_data)
            products[product_index]['updatedat'] = datetime.now().isoformat()
            save_products_data(products)
            return True, "Product saved locally (offline fallback)", 202

        # Keep local cache aligned after successful cloud write.
        products[product_index].update(update_data)
        products[product_index]['updatedat'] = datetime.now().isoformat()
        save_products_data(products)
        
        logger.info(f"Product updated {product_id}")
        return True, "Product updated", 200
    except Exception as e:
        logger.error(f"Error updating product: {e}", exc_info=True)
        return False, str(e), 500

def delete_product(product_id: str) -> Tuple[bool, str, int]:
    """
    Delete a product from local JSON and Supabase.
    Returns (success, message, status_code)
    """
    try:
        # STEP 1: Delete from local JSON
        products = get_products_data()
        product_index = next((i for i, p in enumerate(products) if p.get('id') == product_id), -1)
        
        if product_index == -1:
            return False, "Product not found", 404
        
        # Remove from local storage
        products.pop(product_index)
        save_products_data(products)

        # Best-effort local dependent cleanup to match Supabase deletion behavior
        try:
            returns_data = get_returns_data()
            filtered_returns = [r for r in returns_data if r.get("product_id") != product_id]
            if len(filtered_returns) != len(returns_data):
                save_returns_data(filtered_returns)
        except Exception as local_returns_error:
            logger.warning(f"Failed local returns cleanup for product {product_id}: {local_returns_error}")

        try:
            inventory_data = get_store_inventory_data()
            filtered_inventory = [i for i in inventory_data if i.get("productid") != product_id]
            if len(filtered_inventory) != len(inventory_data):
                save_store_inventory_data(filtered_inventory)
        except Exception as local_inventory_error:
            logger.warning(f"Failed local storeinventory cleanup for product {product_id}: {local_inventory_error}")

        logger.info(f"Product {product_id} deleted from local JSON")
        
        # STEP 2: Delete from Supabase
        supabase_deleted = delete_product_from_supabase(product_id)
        if not supabase_deleted:
            logger.warning(f"Failed to delete product {product_id} from Supabase, but local deletion successful")
        
        return True, "Product deleted successfully", 200
    except Exception as e:
        logger.error(f"Error deleting product: {e}", exc_info=True)
        return False, str(e), 500

def get_product_availability(product_id: str) -> Tuple[Optional[List[Dict]], int]:
    """
    Get product availability across all stores.
    Returns (availability_list, status_code)
    """
    try:
        from utils.json_helpers import get_store_inventory_data
        inventory = get_store_inventory_data()
        product_availability = [inv for inv in inventory if inv.get('productid') == product_id]
        return product_availability, 200
    except Exception as e:
        logger.error(f"Error fetching product availability: {e}", exc_info=True)
        return None, 500
