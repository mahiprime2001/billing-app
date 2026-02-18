"""
Bills Routes
Flask blueprint for all bill-related API endpoints
"""

from flask import Blueprint, jsonify, request
import logging
from services import bills_service

logger = logging.getLogger(__name__)

# Create Blueprint
bills_bp = Blueprint("bills", __name__, url_prefix="/api")

# ======================================================
# LOCAL BILLS ENDPOINTS
# ======================================================

@bills_bp.route("/local/bills", methods=["GET"])
def get_local_bills():
    """Get bills from LOCAL JSON"""
    try:
        bills = bills_service.get_local_bills()
        logger.debug(f"Returning {len(bills)} local bills")
        return jsonify(bills), 200
    except Exception as e:
        logger.error("Error fetching local bills", exc_info=True)
        return jsonify({"error": str(e)}), 500


@bills_bp.route("/local/bills/update", methods=["POST"])
def update_local_bills():
    """Update local JSON bills"""
    try:
        bills_data = request.json or []
        success = bills_service.update_local_bills(bills_data)

        if success:
            return jsonify({
                "message": f"Local bills updated with {len(bills_data)} records"
            }), 200

        return jsonify({"error": "Failed to update local bills"}), 500

    except Exception as e:
        logger.error("Error updating local bills", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ======================================================
# SUPABASE BILLS ENDPOINTS
# ======================================================

@bills_bp.route("/supabase/bills", methods=["GET"])
def get_supabase_bills():
    """Get bills directly from Supabase"""
    try:
        bills = bills_service.get_supabase_bills()
        logger.debug(f"Returning {len(bills)} supabase bills")
        return jsonify(bills), 200
    except Exception as e:
        logger.error("Error fetching supabase bills", exc_info=True)
        return jsonify({"error": str(e)}), 500


@bills_bp.route("/supabase/bills-with-details", methods=["GET"])
def get_supabase_bills_with_details():
    """Get bills with items from Supabase"""
    try:
        bills = bills_service.get_supabase_bills_with_details()
        logger.debug(f"Returning {len(bills)} detailed bills")
        return jsonify(bills), 200
    except Exception as e:
        logger.error("Error fetching detailed supabase bills", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ======================================================
# MAIN / MERGED BILLS ENDPOINT (FIXED)
# ======================================================

@bills_bp.route("/bills", methods=["POST"])
def create_bill():
    """Create bill - always saves locally, syncs to Supabase when available"""
    try:
        bill_data = request.json or {}
        bill_id, message, status_code = bills_service.create_bill(bill_data)

        if status_code == 201 and bill_id:
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation(
                    json_type="bills",
                    operation="CREATE",
                    record_id=bill_id,
                    data=bill_data,
                )
            except ImportError:
                logger.warning("Sync manager not available")

            return jsonify({"message": message, "id": bill_id}), 201

        return jsonify({"error": message}), status_code

    except Exception as e:
        logger.error("Error creating bill", exc_info=True)
        return jsonify({"error": str(e)}), 500

@bills_bp.route("/bills", methods=["GET"])
def get_bills():
    """
    Main bills endpoint used by frontend
    Priority:
    1. Supabase bills with details
    2. Merged bills (local + supabase)
    3. Empty list (never break UI)
    """
    try:
        logger.info("Fetching bills with details from Supabase")
        bills = bills_service.get_supabase_bills_with_details()

        if bills:
            logger.info(f"Returning {len(bills)} bills with details")
            return jsonify(bills), 200

        logger.warning("No detailed bills found, trying merged bills")
        bills, status_code = bills_service.get_merged_bills()

        if status_code == 200:
            logger.info(f"Returning {len(bills)} merged bills")
            return jsonify(bills), 200

        logger.warning("No bills found, returning empty list")
        return jsonify([]), 200

    except Exception as e:
        logger.error("Error in get_bills", exc_info=True)
        return jsonify([]), 200


# ======================================================
# DELETE BILL
# ======================================================

@bills_bp.route("/bills/<bill_id>", methods=["DELETE"])
def delete_bill(bill_id):
    """Delete a bill"""
    try:
        success, message, status_code = bills_service.delete_bill(bill_id)

        if success:
            # Sync log (optional)
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation(
                    json_type="bills",
                    operation="DELETE",
                    record_id=bill_id,
                    data={"id": bill_id},
                )
            except ImportError:
                logger.warning("Sync manager not available")

            return jsonify({"message": message}), status_code

        return jsonify({"error": message}), status_code

    except Exception as e:
        logger.error("Error deleting bill", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ======================================================
# SYNC ENDPOINT
# ======================================================

@bills_bp.route("/bills/sync", methods=["GET"])
def sync_bills():
    """Sync bills for offline/online reconciliation"""
    try:
        bills = bills_service.get_supabase_bills_with_details()
        return jsonify({
            "status": "synced",
            "count": len(bills)
        }), 200
    except Exception as e:
        logger.error("Error syncing bills", exc_info=True)
        return jsonify({"error": str(e)}), 500
