"""
GST Registrations Routes
CRUD endpoints for the gst_registrations table.
"""

import logging
from flask import Blueprint, jsonify, request

from services import gst_registrations_service

logger = logging.getLogger(__name__)

gst_registrations_bp = Blueprint("gst_registrations", __name__, url_prefix="/api")


@gst_registrations_bp.route("/gst-registrations", methods=["GET"])
def list_gst_registrations():
    try:
        rows, status_code = gst_registrations_service.list_gst_registrations()
        return jsonify(rows), status_code
    except Exception as e:
        logger.error(f"Error listing GST registrations: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@gst_registrations_bp.route("/gst-registrations", methods=["POST"])
def create_gst_registration():
    try:
        row, message, status_code = gst_registrations_service.create_gst_registration(request.json or {})
        if status_code in (200, 201, 202):
            try:
                from scripts.sync_manager import log_json_crud_operation

                log_json_crud_operation("gst_registrations", "CREATE", row.get("id") if row else None, row or {})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            return jsonify({"message": message, **(row or {})}), status_code
        return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error creating GST registration: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@gst_registrations_bp.route("/gst-registrations/<reg_id>", methods=["PUT"])
def update_gst_registration(reg_id):
    try:
        success, message, status_code = gst_registrations_service.update_gst_registration(reg_id, request.json or {})
        if success:
            try:
                from scripts.sync_manager import log_json_crud_operation

                log_json_crud_operation("gst_registrations", "UPDATE", reg_id, request.json or {})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            return jsonify({"message": message, "id": reg_id}), status_code
        return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error updating GST registration: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@gst_registrations_bp.route("/gst-registrations/<reg_id>", methods=["DELETE"])
def delete_gst_registration(reg_id):
    try:
        success, message, status_code = gst_registrations_service.delete_gst_registration(reg_id)
        if success:
            try:
                from scripts.sync_manager import log_json_crud_operation

                log_json_crud_operation("gst_registrations", "DELETE", reg_id, {"id": reg_id})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            return jsonify({"message": message}), status_code
        return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error deleting GST registration: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
