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
from utils.json_helpers import get_products_data, save_products_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

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


# ============================================
# LOCAL JSON OPERATIONS
# ============================================

def get_local_products() -> List[Dict]:
    """Get products from local JSON storage"""
    try:
        products = get_products_data()
        transformed_products = []
        
        for product in products:
            converted_product = convert_snake_to_camel(product)
            
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
            
            transformed_products.append(converted_product)
        
        return transformed_products
    except Exception as e:
        logger.error(f"Error getting local products: {e}", exc_info=True)
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
        response = client.table("products").select("*").execute()
        products = response.data or []
        
        transformed_products = []
        for product in products:
            converted_product = convert_snake_to_camel(product)
            
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
            
            transformed_products.append(converted_product)
        
        logger.debug(f"Returning {len(transformed_products)} products from Supabase.")
        return transformed_products
    except Exception as e:
        logger.error(f"Error getting Supabase products: {e}", exc_info=True)
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
    """Delete a product from Supabase"""
    try:
        client = db.client
        logger.info(f"Deleting product {product_id} from Supabase...")
        client.table('products').delete().eq('id', product_id).execute()
        logger.info(f"Product {product_id} deleted from Supabase.")
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
        # Fetch from Supabase (preferred source)
        supabase_products = get_supabase_products()
        
        # Fetch from local JSON (fallback)
        local_products = get_local_products()
        
        # Merge: Supabase takes precedence
        products_map = {}
        
        # Add local products first (lower priority)
        for product in local_products:
            if product.get('id'):
                products_map[product['id']] = product
        
        # Add Supabase products (higher priority, overwriting local if IDs match)
        for product in supabase_products:
            if product.get('id'):
                products_map[product['id']] = product
        
        final_products = list(products_map.values())
        final_products.sort(key=lambda x: x.get('name', ''), reverse=False)
        
        logger.debug(f"Returning {len(final_products)} total products (Supabase: {len(supabase_products)}, Local: {len(local_products)})")
        return final_products, 200
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
        product_data.pop('barcodes', None)  # Remove array field
        
        # Handle empty batchId
        if 'batchid' in product_data and not product_data['batchid']:
            product_data['batchid'] = None
        
        # STEP 1: Insert into Supabase
        supabase_result = insert_product_to_supabase(product_data)
        if not supabase_result:
            return None, "Failed to insert product into Supabase", 500
        
        # STEP 2: Save to local JSON
        products = get_products_data()
        products.append(product_data)
        save_products_data(products)
        
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
        
        # Update timestamp
        update_data['updatedat'] = datetime.now().isoformat()
        
        # STEP 1: Update in local JSON
        products[product_index].update(update_data)
        save_products_data(products)

        # STEP 2: Update in Supabase (remove _deleted field if present)
        update_data_clean = {k: v for k, v in update_data.items() if k != '_deleted'}
        update_product_in_supabase(product_id, update_data_clean)

        logger.info(f"Product updated {product_id}")
        return True, "Product updated", 200
            
    except Exception as e:
        logger.error(f"Error updating product: {e}", exc_info=True)
        return False, str(e), 500


def delete_product(product_id: str) -> Tuple[bool, str, int]:
    """
    Hard delete a product (permanent removal).
    Does NOT delete from storeinventory (keeps for historical data).
    Returns (success, message, status_code)
    """
    try:
        # STEP 1: Delete from local JSON
        products = get_products_data()
        product_index = next((i for i, p in enumerate(products) if p.get('id') == product_id), -1)
        
        if product_index == -1:
            return False, "Product not found", 404
        
        # Remove from local JSON
        deleted_product = products.pop(product_index)
        save_products_data(products)
        
        # STEP 2: Delete from Supabase
        delete_product_from_supabase(product_id)
        
        logger.info(f"Product hard deleted: {product_id} ({deleted_product.get('name')})")
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
