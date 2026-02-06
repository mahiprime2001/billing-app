"""
Stores Routes
Flask blueprint for all store and inventory-related API endpoints
"""

from flask import Blueprint, jsonify, request
import logging
from services import stores_service

logger = logging.getLogger(__name__)

# Create Blueprint
stores_bp = Blueprint('stores', __name__, url_prefix='/api')

# ============================================
# DIRECT SUPABASE/LOCAL ROUTES (FOR DEBUGGING)
# ============================================

@stores_bp.route('/supabase/stores', methods=['GET'])
def get_supabase_stores():
    """Get stores directly from Supabase"""
    try:
        stores = stores_service.get_supabase_stores()
        logger.debug(f"Returning {len(stores)} stores from Supabase.")
        return jsonify(stores), 200
    except Exception as e:
        logger.error(f"Error in get_supabase_stores: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@stores_bp.route('/stores/local', methods=['GET'])
def get_local_stores_only():
    """Get stores from local storage only (for debugging)"""
    try:
        stores = stores_service.get_local_stores()
        logger.debug(f"Returning {len(stores)} stores from local storage.")
        return jsonify({'count': len(stores), 'stores': stores}), 200
    except Exception as e:
        logger.error(f"Error in get_local_stores_only: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@stores_bp.route('/stores/sync', methods=['POST'])
def sync_stores():
    """Sync local storage from Supabase"""
    try:
        success, message, status_code = stores_service.sync_local_from_supabase()
        if success:
            return jsonify({'message': message}), status_code
        else:
            return jsonify({'error': message}), status_code
    except Exception as e:
        logger.error(f"Error in sync_stores: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

# ============================================
# MAIN STORES ROUTES
# ============================================

@stores_bp.route('/stores', methods=['GET'])
def get_stores():
    """Get all stores with inventory statistics (merged from local and Supabase)"""
    try:
        stores, status_code = stores_service.get_all_stores_with_inventory()
        
        if status_code == 200:
            return jsonify(stores), 200
        else:
            return jsonify({
                'error': 'Internal server error',
                'details': 'Failed to fetch stores'
            }), status_code
    except Exception as e:
        logger.error(f"Error in get_stores: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500

@stores_bp.route('/stores', methods=['POST'])
def create_store():
    """Create store"""
    try:
        store_data = request.json
        store_id, message, status_code = stores_service.create_store(store_data)
        
        if status_code == 201:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('stores', 'CREATE', store_id, store_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({'message': message, 'id': store_id}), 201
        else:
            return jsonify({'error': message}), status_code
    except Exception as e:
        logger.error(f"Error in create_store: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@stores_bp.route('/stores/<store_id>', methods=['GET'])
def get_store(store_id):
    """Get single store"""
    try:
        stores, status_code = stores_service.get_all_stores_with_inventory()
        
        if status_code != 200:
            return jsonify({'error': 'Failed to fetch stores'}), status_code
        
        store = next((s for s in stores if s.get('id') == store_id), None)
        
        if store:
            return jsonify(store), 200
        else:
            return jsonify({'error': 'Store not found'}), 404
    except Exception as e:
        logger.error(f"Error in get_store: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@stores_bp.route('/stores/<store_id>', methods=['PUT'])
def update_store(store_id):
    """Update store"""
    try:
        update_data = request.json
        success, message, status_code = stores_service.update_store(store_id, update_data)
        
        if success:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('stores', 'UPDATE', store_id, update_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({'message': message, 'id': store_id}), status_code
        else:
            return jsonify({'error': message}), status_code
    except Exception as e:
        logger.error(f"Error in update_store: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@stores_bp.route('/stores/<store_id>', methods=['DELETE'])
def delete_store(store_id):
    """Delete store"""
    try:
        success, message, status_code = stores_service.delete_store(store_id)
        
        if success:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('stores', 'DELETE', store_id, {'id': store_id})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({'message': message}), status_code
        else:
            return jsonify({'error': message}), status_code
    except Exception as e:
        logger.error(f"Error in delete_store: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

# ============================================
# NEW: AVAILABLE PRODUCTS ROUTES (CRITICAL FOR STOCK ASSIGNMENT)
# ============================================

@stores_bp.route('/stores/<store_id>/available-products', methods=['GET'])
def get_available_products(store_id):
    """Get products with available stock for assignment to this store"""
    try:
        products = stores_service.get_available_products_for_assignment(store_id)
        logger.debug(f"Returning {len(products)} available products for store {store_id}")
        return jsonify(products), 200
    except Exception as e:
        logger.error(f"Error getting available products for store {store_id}: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

# ============================================
# INVENTORY ROUTES
# ============================================

@stores_bp.route('/stores/<store_id>/inventory', methods=['GET'])
def get_store_inventory(store_id):
    """Get inventory for a specific store"""
    try:
        inventory, status_code = stores_service.get_store_inventory(store_id)
        
        if status_code == 200:
            return jsonify(inventory), 200
        else:
            return jsonify({'error': 'Failed to fetch inventory'}), status_code
    except Exception as e:
        logger.error(f"Error in get_store_inventory: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@stores_bp.route('/stores/<store_id>/assign-products', methods=['POST'])
def assign_products_to_store(store_id):
    """Assign products to a store with stock validation"""
    try:
        products = request.json.get('products', [])
        success, message, status_code = stores_service.assign_products_to_store(store_id, products)
        
        if success:
            logger.info(f"Successfully assigned {len(products)} products to store {store_id}")
            return jsonify({'message': message}), status_code
        else:
            logger.warning(f"Failed to assign products to store {store_id}: {message}")
            return jsonify({'error': message}), status_code
    except Exception as e:
        logger.error(f"Error in assign_products_to_store: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@stores_bp.route('/inventory/assign', methods=['POST'])
def assign_inventory():
    """Assign inventory (alternative endpoint)"""
    try:
        data = request.json
        store_id = data.get('storeId') or data.get('storeid')
        products = data.get('products', [])
        
        if not store_id:
            return jsonify({'error': 'storeId is required'}), 400
            
        success, message, status_code = stores_service.assign_products_to_store(store_id, products)
        
        if success:
            return jsonify({'message': message}), status_code
        else:
            return jsonify({'error': message}), status_code
    except Exception as e:
        logger.error(f"Error in assign_inventory: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@stores_bp.route('/inventory/<inventory_id>/adjust', methods=['PATCH'])
def adjust_inventory(inventory_id):
    """Adjust inventory quantity"""
    try:
        adjustment = request.json.get('adjustment', 0)
        success, message, status_code = stores_service.adjust_inventory(inventory_id, adjustment)
        
        if success:
            return jsonify({'message': message}), status_code
        else:
            return jsonify({'error': message}), status_code
    except Exception as e:
        logger.error(f"Error in adjust_inventory: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@stores_bp.route('/stores/<store_id>/assigned-products', methods=['GET'])
def get_assigned_products(store_id):
    """Get assigned products for a store"""
    try:
        inventory, status_code = stores_service.get_store_inventory(store_id)
        
        if status_code == 200:
            return jsonify(inventory), 200
        else:
            return jsonify({'error': 'Failed to fetch assigned products'}), status_code
    except Exception as e:
        logger.error(f"Error in get_assigned_products: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@stores_bp.route('/stores/<store_id>/inventory-calendar', methods=['GET'])
def get_inventory_calendar(store_id):
    """Get inventory calendar for a store"""
    try:
        days = request.args.get('days', 90, type=int)
        
        calendar, status_code = stores_service.get_store_inventory_calendar(store_id, days)
        
        if status_code == 200:
            return jsonify({
                'success': True,
                'calendar': calendar
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to fetch inventory calendar',
                'calendar': []
            }), status_code
            
    except Exception as e:
        logger.error(f"Error in get_inventory_calendar: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e),
            'calendar': []
        }), 500

@stores_bp.route('/stores/<store_id>/inventory-by-date/<date_str>', methods=['GET'])
def get_inventory_by_date(store_id, date_str):
    """Get inventory by date"""
    try:
        result, status_code = stores_service.get_store_inventory_by_date(store_id, date_str)
        
        if status_code == 200:
            return jsonify(result), 200
        else:
            return jsonify({
                'rows': [],
                'totalStock': 0,
                'totalValue': 0,
                'error': 'Failed to fetch inventory'
            }), status_code
            
    except Exception as e:
        logger.error(f"Error in get_inventory_by_date: {e}", exc_info=True)
        return jsonify({
            'rows': [],
            'totalStock': 0,
            'totalValue': 0,
            'error': str(e)
        }), 500
