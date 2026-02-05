"""
Discounts Routes
Flask blueprint for discount request API endpoints
"""
from flask import Blueprint, jsonify, request
import logging

from services import discounts_service

logger = logging.getLogger(__name__)

discounts_bp = Blueprint("discounts", __name__, url_prefix="/api")


# ============================================
# DISCOUNTS ENDPOINTS
# ============================================

@discounts_bp.route("/discounts", methods=["GET"])
def get_discounts():
    """Get all discounts"""
    try:
        discounts, status_code = discounts_service.get_merged_discounts()
        if status_code == 200:
            return jsonify(discounts), 200
        return jsonify({"error": "Internal server error"}), status_code
    except Exception as e:
        logger.error(f"Error in get_discounts: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


@discounts_bp.route("/discounts", methods=["POST"])
def create_discount():
    """Create discount request"""
    try:
        discount_data = request.json
        discount_id, message, status_code = discounts_service.create_discount_request(discount_data)

        if status_code == 201:
            try:
                from scripts.sync_manager import log_json_crud_operation

                log_json_crud_operation("discounts", "CREATE", discount_id, discount_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")

            return jsonify({"message": message, "id": discount_id}), 201

        return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error in create_discount: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@discounts_bp.route("/discounts/<discount_id>/status", methods=["PUT"])
def update_discount_status(discount_id):
    """Update discount status"""
    try:
        data = request.json
        status = data.get("status")

        success, message, status_code = discounts_service.update_discount_status(
            discount_id, status
        )

        if success:
            try:
                from scripts.sync_manager import log_json_crud_operation

                log_json_crud_operation("discounts", "UPDATE", discount_id, {"status": status})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")

            return jsonify({"message": message}), status_code

        return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error in update_discount_status: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
