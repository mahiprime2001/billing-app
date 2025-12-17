"""
Products Routes
Flask blueprint for all product-related API endpoints
"""

from flask import Blueprint, jsonify, request
import logging
from services import products_service

logger = logging.getLogger(__name__)

# Create Blueprint
products_bp = Blueprint('products', __name__, url_prefix='/api')


# ============================================
# LOCAL & SUPABASE PRODUCTS ENDPOINTS
# ============================================

@products_bp.route('/local/products', methods=['GET'])
def get_local_products():
    """Get products from LOCAL JSON"""
    try:
        products = products_service.get_local_products()
        logger.debug(f"Returning {len(products)} products from local JSON.")
        return jsonify(products), 200
    except Exception as e:
        logger.error(f"Error in get_local_products: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@products_bp.route('/local/products/update', methods=['POST'])
def update_local_products():
    """Update local JSON products with new data"""
    try:
        products_data = request.json
        success = products_service.update_local_products(products_data)
        if success:
            return jsonify({"message": f"Local products updated with {len(products_data)} records."}), 200
        else:
            return jsonify({"error": "Failed to update local products"}), 500
    except Exception as e:
        logger.error(f"Error in update_local_products: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@products_bp.route('/supabase/products', methods=['GET'])
def get_supabase_products():
    """Get products directly from Supabase"""
    try:
        products = products_service.get_supabase_products()
        logger.debug(f"Returning {len(products)} products from Supabase.")
        return jsonify(products), 200
    except Exception as e:
        logger.error(f"Error in get_supabase_products: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# MERGED PRODUCTS ENDPOINT
# ============================================

@products_bp.route('/products', methods=['GET'])
def get_products():
    """Get products by merging local and Supabase (Supabase takes precedence)"""
    try:
        products, status_code = products_service.get_merged_products()
        if status_code == 200:
            return jsonify(products), 200
        else:
            return jsonify({
                "error": "Internal server error",
                "details": "Failed to fetch products"
            }), status_code
    except Exception as e:
        logger.error(f"Error in get_products: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


# ============================================
# CREATE, UPDATE & DELETE PRODUCTS
# ============================================

@products_bp.route('/products', methods=['POST'])
def create_product():
    """Create product - OFFLINE FIRST approach"""
    try:
        product_data = request.json
        product_id, message, status_code = products_service.create_product(product_data)
        
        if status_code == 201:
            # Log for sync if sync manager is available
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('products', 'CREATE', product_id, product_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message, "id": product_id}), 201
        else:
            return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error in create_product: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@products_bp.route('/products/<product_id>', methods=['PUT'])
def update_product(product_id):
    """Update product - OFFLINE FIRST approach"""
    try:
        update_data = request.json
        success, message, status_code = products_service.update_product(product_id, update_data)
        
        if success:
            # Log for sync if sync manager is available
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('products', 'UPDATE', product_id, update_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message, "id": product_id}), status_code
        else:
            return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error in update_product: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@products_bp.route('/products/<product_id>', methods=['DELETE'])
def delete_product(product_id):
    """Delete product (hard delete - permanent removal)"""
    try:
        success, message, status_code = products_service.delete_product(product_id)
        
        if success:
            # Log for sync if sync manager is available
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('products', 'DELETE', product_id, {'id': product_id})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in delete_product: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# PRODUCT AVAILABILITY
# ============================================

@products_bp.route('/products/<product_id>/stores', methods=['GET'])
def get_product_availability(product_id):
    """Get product availability across all stores"""
    try:
        availability, status_code = products_service.get_product_availability(product_id)
        
        if status_code == 200:
            return jsonify({"success": True, "data": availability}), 200
        else:
            return jsonify({"error": "Failed to fetch product availability"}), status_code
    except Exception as e:
        logger.error(f"Error in get_product_availability: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
