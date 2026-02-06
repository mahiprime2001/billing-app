"""
HSN Codes Routes
Flask blueprint for all HSN code-related API endpoints
"""
from flask import Blueprint, jsonify, request
import logging

from services import hsn_codes_service

logger = logging.getLogger(__name__)

hsn_codes_bp = Blueprint("hsn_codes", __name__, url_prefix="/api")


# ============================================
# HSN CODES ENDPOINTS
# ============================================

@hsn_codes_bp.route("/hsn-codes", methods=["GET"])
def get_hsn_codes():
    """Get all HSN codes"""
    try:
        codes, status_code = hsn_codes_service.get_merged_hsn_codes()
        if status_code == 200:
            return jsonify(codes), 200
        return jsonify({"error": "Internal server error", "details": "Failed to fetch HSN codes"}), status_code
    except Exception as e:
        logger.error(f"Error in get_hsn_codes: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


@hsn_codes_bp.route("/hsn-codes", methods=["POST"])
def create_hsn_code():
    """Create HSN code"""
    try:
        hsn_data = request.json
        hsn_id, message, status_code = hsn_codes_service.create_hsn_code(hsn_data)
        if status_code == 201:
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation("hsn_codes", "CREATE", hsn_id, hsn_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            return jsonify({"message": message, "id": hsn_id}), 201
        return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error in create_hsn_code: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@hsn_codes_bp.route("/hsn-codes/<hsn_id>", methods=["PUT"])
def update_hsn_code(hsn_id):
    """Update HSN code"""
    try:
        update_data = request.json
        success, message, status_code = hsn_codes_service.update_hsn_code(hsn_id, update_data)
        if success:
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation("hsn_codes", "UPDATE", hsn_id, update_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            return jsonify({"message": message, "id": hsn_id}), status_code
        return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error in update_hsn_code: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@hsn_codes_bp.route("/hsn-codes/<hsn_id>", methods=["DELETE"])
def delete_hsn_code(hsn_id):
    """Delete HSN code"""
    try:
        success, message, status_code = hsn_codes_service.delete_hsn_code(hsn_id)
        if success:
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation("hsn_codes", "DELETE", hsn_id, {"id": hsn_id})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            return jsonify({"message": message}), status_code
        return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error in delete_hsn_code: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
