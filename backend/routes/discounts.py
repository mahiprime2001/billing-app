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
        approved_by = data.get("approved_by") or data.get("approvedBy")

        success, message, status_code = discounts_service.update_discount_status(
            discount_id, status, approved_by
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


@discounts_bp.route("/discounts/<discount_id>", methods=["DELETE"])
def delete_discount(discount_id):
    """Delete a single discount"""
    try:
        success, message, status_code = discounts_service.delete_discounts([discount_id])
        if success:
            try:
                from scripts.sync_manager import log_json_crud_operation

                log_json_crud_operation("discounts", "DELETE", discount_id, {"discount_id": discount_id})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")

            return jsonify({"message": message}), status_code
        return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error in delete_discount: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@discounts_bp.route("/discounts/bulk-delete", methods=["POST"])
def bulk_delete_discounts():
    """Delete multiple discounts by ids"""
    try:
        data = request.json or {}
        ids = data.get("ids") or data.get("discount_ids") or []
        if not isinstance(ids, list):
            return jsonify({"error": "ids must be a list"}), 400

        success, message, status_code = discounts_service.delete_discounts(ids)
        if success:
            try:
                from scripts.sync_manager import log_json_crud_operation

                for disc_id in ids:
                    log_json_crud_operation("discounts", "DELETE", disc_id, {"discount_id": disc_id})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")

            return jsonify({"message": message}), status_code
        return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error in bulk_delete_discounts: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
