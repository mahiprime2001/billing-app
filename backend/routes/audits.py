"""
Audits Routes
Flask blueprint for store audit + reconciliation endpoints.
"""

from flask import Blueprint, jsonify, request
import logging
from services import audits_service

logger = logging.getLogger(__name__)

audits_bp = Blueprint("audits", __name__, url_prefix="/api")


@audits_bp.route("/stores/<store_id>/audits", methods=["POST"])
def create_audit(store_id):
    """Save a completed audit (header + items)."""
    try:
        payload = request.json or {}
        audit, status_code = audits_service.create_audit(store_id, payload)
        if audit is not None:
            return jsonify(audit), status_code
        return jsonify({"error": "Failed to create audit"}), status_code
    except Exception as e:
        logger.error(f"Error in create_audit for store {store_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@audits_bp.route("/stores/<store_id>/audits", methods=["GET"])
def list_audits(store_id):
    """List audits for a store (newest first)."""
    try:
        audits, status_code = audits_service.list_audits(store_id)
        return jsonify(audits), status_code
    except Exception as e:
        logger.error(f"Error in list_audits for store {store_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@audits_bp.route("/audits/<audit_id>", methods=["GET"])
def get_audit(audit_id):
    """Get one audit with its line items."""
    try:
        audit, status_code = audits_service.get_audit(audit_id)
        if audit is not None:
            return jsonify(audit), status_code
        return jsonify({"error": "Audit not found"}), status_code
    except Exception as e:
        logger.error(f"Error in get_audit {audit_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@audits_bp.route("/audits/<audit_id>/reconcile", methods=["POST"])
def reconcile_audit(audit_id):
    """Apply reconciliation decisions for an audit."""
    try:
        payload = request.json or {}
        audit, status_code, message = audits_service.reconcile_audit(audit_id, payload)
        if audit is not None:
            return jsonify({"message": message, "audit": audit}), status_code
        return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error(f"Error in reconcile_audit {audit_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
