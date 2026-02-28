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
        payload = request.json or {}
        products = payload.get('products', [])
        success, message, status_code, data = stores_service.assign_products_to_store(store_id, products, payload)
        
        if success:
            logger.info(f"Successfully assigned {len(products)} products to store {store_id}")
            return jsonify({'message': message, **(data or {})}), status_code
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
            
        success, message, status_code, data = stores_service.assign_products_to_store(store_id, products, data)
        
        if success:
            return jsonify({'message': message, **(data or {})}), status_code
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


@stores_bp.route('/stores/<store_id>/stats', methods=['GET'])
def get_store_stats(store_id):
    """Get lightweight stats for one store."""
    try:
        stats, status_code = stores_service.get_store_stats(store_id)
        return jsonify(stats), status_code
    except Exception as e:
        logger.error(f"Error in get_store_stats: {e}", exc_info=True)
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


@stores_bp.route('/stores/<store_id>/transfer-orders', methods=['GET'])
def get_store_transfer_orders(store_id):
    """Get transfer orders for a store."""
    try:
        status = request.args.get('status')
        orders, status_code = stores_service.get_store_transfer_orders(store_id, status)
        if status_code == 200:
            return jsonify(orders), 200
        return jsonify({'error': 'Failed to fetch transfer orders'}), status_code
    except Exception as e:
        logger.error(f"Error in get_store_transfer_orders: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@stores_bp.route('/transfer-orders/<order_id>', methods=['GET'])
def get_transfer_order_details(order_id):
    """Get transfer order details with computed progress."""
    try:
        order, status_code = stores_service.get_transfer_order_details(order_id)
        if status_code == 200:
            return jsonify(order), 200
        if status_code == 404:
            return jsonify({'error': 'Transfer order not found'}), 404
        return jsonify({'error': 'Failed to fetch transfer order'}), status_code
    except Exception as e:
        logger.error(f"Error in get_transfer_order_details: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@stores_bp.route('/damaged-products', methods=['GET'])
def get_damaged_products():
    """Get damaged inventory events."""
    try:
        store_id = request.args.get('storeId') or request.args.get('store_id')
        status = request.args.get('status')
        events, status_code = stores_service.get_damaged_inventory_events(store_id, status)
        if status_code == 200:
            return jsonify(events), 200
        return jsonify({'error': 'Failed to fetch damaged products'}), status_code
    except Exception as e:
        logger.error(f"Error in get_damaged_products: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@stores_bp.route('/damaged-products/<event_id>/resolve', methods=['PATCH'])
def resolve_damaged_product(event_id):
    """Resolve a damaged inventory event."""
    try:
        payload = request.json or {}
        success, message, status_code = stores_service.resolve_damaged_inventory_event(event_id, payload)
        if success:
            return jsonify({'message': message}), status_code
        return jsonify({'error': message}), status_code
    except Exception as e:
        logger.error(f"Error in resolve_damaged_product: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@stores_bp.route('/store-damage-returns', methods=['GET'])
def get_store_damage_returns():
    """Get store damaged-return rows for admin management."""
    try:
        store_id = request.args.get('storeId') or request.args.get('store_id')
        status = request.args.get('status')
        rows, status_code = stores_service.get_store_damage_returns(store_id, status)
        if status_code == 200:
            return jsonify(rows), 200
        return jsonify({'error': 'Failed to fetch store damage returns'}), status_code
    except Exception as e:
        logger.error(f"Error in get_store_damage_returns: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@stores_bp.route('/store-damage-returns/<row_id>/repair', methods=['PATCH'])
def repair_store_damage_return(row_id):
    """Mark a store damaged-return row as repaired and restock product inventory."""
    try:
        payload = request.json or {}
        success, message, status_code = stores_service.mark_store_damage_return_repaired(row_id, payload)
        if success:
            return jsonify({'message': message}), status_code
        return jsonify({'error': message}), status_code
    except Exception as e:
        logger.error(f"Error in repair_store_damage_return: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
