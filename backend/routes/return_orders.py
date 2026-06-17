"""
Admin Return Orders routes (store -> admin returns).
"""
from flask import Blueprint, jsonify, request
import logging

from services import return_orders_service

logger = logging.getLogger(__name__)
return_orders_bp = Blueprint('return_orders', __name__, url_prefix='/api')


@return_orders_bp.route('/return-orders', methods=['GET'])
def list_return_orders():
    """List store->admin return orders (optionally filtered by admin_status)."""
    try:
        admin_status = request.args.get('status') or request.args.get('admin_status')
        rows, status_code = return_orders_service.list_return_orders(admin_status)
        if status_code == 200:
            return jsonify(rows), 200
        return jsonify({'error': 'Failed to fetch return orders'}), status_code
    except Exception as e:
        logger.error(f"Error in list_return_orders: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@return_orders_bp.route('/return-orders/<return_id>', methods=['GET'])
def get_return_order(return_id):
    """Get one return order with its product lines."""
    try:
        row, status_code = return_orders_service.get_return_order(return_id)
        if status_code == 200:
            return jsonify(row), 200
        return jsonify({'error': 'Return order not found'}), status_code
    except Exception as e:
        logger.error(f"Error in get_return_order: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@return_orders_bp.route('/return-orders/<return_id>/verify', methods=['POST'])
def verify_return_order(return_id):
    """Verify a return order: per-line verified qty / status / reason. Reduces store
    stock, routes damaged to the Damage page, holds the rest with admin."""
    try:
        payload = request.json or {}
        actor = payload.get('verifiedBy') or payload.get('verified_by') or request.args.get('actor')
        success, message, status_code = return_orders_service.verify_return_order(return_id, payload, actor)
        if success:
            return jsonify({'message': message}), status_code
        return jsonify({'error': message}), status_code
    except Exception as e:
        logger.error(f"Error in verify_return_order: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@return_orders_bp.route('/store-damage-returns/<row_id>/resolve', methods=['PATCH'])
def resolve_damaged_item(row_id):
    """Mark a damaged item Fixed or Discarded (and Discarded -> Fixed)."""
    try:
        payload = request.json or {}
        action = payload.get('action')
        actor = payload.get('actor') or payload.get('resolvedBy') or payload.get('resolved_by')
        success, message, status_code = return_orders_service.set_damage_resolution(row_id, action, actor)
        if success:
            return jsonify({'message': message}), status_code
        return jsonify({'error': message}), status_code
    except Exception as e:
        logger.error(f"Error in resolve_damaged_item: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@return_orders_bp.route('/store-damage-returns/send', methods=['POST'])
def send_damaged_items():
    """Send selected FIXED damaged items to a store as a transfer order."""
    try:
        payload = request.json or {}
        store_id = payload.get('storeId') or payload.get('store_id')
        ids = payload.get('ids') or []
        actor = payload.get('createdBy') or payload.get('created_by')
        note = payload.get('note')
        success, message, status_code, data = return_orders_service.send_damaged_to_store(
            store_id, ids, actor, note
        )
        if success:
            return jsonify({'message': message, **(data or {})}), status_code
        return jsonify({'error': message}), status_code
    except Exception as e:
        logger.error(f"Error in send_damaged_items: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@return_orders_bp.route('/return-holdings/send', methods=['POST'])
def send_return_holdings():
    """Send selected 'with admin' return lines to a store as a transfer order."""
    try:
        payload = request.json or {}
        store_id = payload.get('storeId') or payload.get('store_id')
        items = payload.get('items') or []
        actor = payload.get('createdBy') or payload.get('created_by')
        note = payload.get('note')
        success, message, status_code, data = return_orders_service.send_holdings_to_store(
            store_id, items, actor, note
        )
        if success:
            return jsonify({'message': message, **(data or {})}), status_code
        return jsonify({'error': message}), status_code
    except Exception as e:
        logger.error(f"Error in send_return_holdings: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@return_orders_bp.route('/return-holdings', methods=['GET'])
def list_return_holdings():
    """List return_products lines by holding_status (with_admin | sent_out | ...)."""
    try:
        holding = request.args.get('holding_status') or request.args.get('status') or 'with_admin'
        rows, status_code = return_orders_service.list_return_holdings(holding)
        if status_code == 200:
            return jsonify(rows), 200
        return jsonify({'error': 'Failed to fetch return holdings'}), status_code
    except Exception as e:
        logger.error(f"Error in list_return_holdings: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
