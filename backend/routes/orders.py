"""
Orders Routes
Dedicated transfer-order endpoints for Orders page.
"""

from flask import Blueprint, jsonify, request
import logging

from services import orders_service

logger = logging.getLogger(__name__)

orders_bp = Blueprint("orders", __name__, url_prefix="/api")


def _parse_limit(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        parsed = int(value)
        if parsed <= 0:
            return None
        return min(parsed, 1000)
    except (TypeError, ValueError):
        return None


@orders_bp.route("/orders", methods=["GET"])
def get_orders():
    """Get transfer orders with optional store/date/status filters."""
    try:
        store_id = request.args.get("storeId") or request.args.get("store_id")
        status = request.args.get("status")
        from_date = request.args.get("from")
        to_date = request.args.get("to")
        limit = _parse_limit(request.args.get("limit"))

        orders, status_code = orders_service.get_transfer_orders(
            store_id=store_id,
            status=status,
            from_date=from_date,
            to_date=to_date,
            limit=limit,
        )
        return jsonify(orders), status_code
    except Exception as e:
        logger.error(f"Error in get_orders: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch orders", "details": str(e)}), 500


@orders_bp.route("/orders/<order_id>", methods=["GET"])
def get_order_details(order_id):
    """Get one transfer-order detail row."""
    try:
        order, status_code = orders_service.get_transfer_order_details(order_id)
        if status_code == 200:
            return jsonify(order), 200
        if status_code == 404:
            return jsonify({"error": "Order not found"}), 404
        return jsonify({"error": "Failed to fetch order"}), status_code
    except Exception as e:
        logger.error(f"Error in get_order_details: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@orders_bp.route("/orders/<order_id>", methods=["DELETE"])
def delete_order(order_id):
    """Delete transfer order from Supabase + local cache."""
    try:
        success, message, status_code, _store_id = orders_service.delete_transfer_order(order_id)
        if success:
            return jsonify({"message": message, "id": order_id}), status_code
        return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error in delete_order: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
