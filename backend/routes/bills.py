"""
Bills Routes
Flask blueprint for all bill-related API endpoints
"""
from flask import Blueprint, jsonify, request
import logging

from services import bills_service

logger = logging.getLogger(__name__)

# Create Blueprint
bills_bp = Blueprint('bills', __name__, url_prefix='/api')


# ============================================
# LOCAL BILLS ENDPOINTS
# ============================================

@bills_bp.route("/local/bills", methods=["GET"])
def get_local_bills():
    """Get bills from LOCAL JSON"""
    try:
        bills = bills_service.get_local_bills()
        logger.debug(f"Returning {len(bills)} bills from local JSON.")
        return jsonify(bills), 200
    except Exception as e:
        logger.error(f"Error in get_local_bills: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@bills_bp.route("/local/bills/update", methods=["POST"])
def update_local_bills():
    """Update local JSON bills with new data"""
    try:
        bills_data = request.json
        
        success = bills_service.update_local_bills(bills_data)
        if success:
            return jsonify({
                "message": f"Local bills updated with {len(bills_data)} records."
            }), 200
        else:
            return jsonify({"error": "Failed to update local bills"}), 500
            
    except Exception as e:
        logger.error(f"Error in update_local_bills: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# SUPABASE BILLS ENDPOINTS
# ============================================

@bills_bp.route("/supabase/bills", methods=["GET"])
def get_supabase_bills():
    """Get bills directly from Supabase"""
    try:
        bills = bills_service.get_supabase_bills()
        logger.debug(f"Returning {len(bills)} bills from Supabase.")
        return jsonify(bills), 200
    except Exception as e:
        logger.error(f"Error in get_supabase_bills: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@bills_bp.route("/supabase/bills-with-details", methods=["GET"])
def get_supabase_bills_with_details():
    """Get bills with details from Supabase"""
    try:
        bills = bills_service.get_supabase_bills_with_details()
        logger.debug(f"Returning {len(bills)} bills with details from Supabase.")
        return jsonify(bills), 200
    except Exception as e:
        logger.error(f"Error in get_supabase_bills_with_details: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# MERGED BILLS ENDPOINTS
# ============================================

@bills_bp.route('/bills', methods=['GET'])
def get_bills():
    """Get bills by merging local and Supabase (Supabase takes precedence)"""
    try:
        bills, status_code = bills_service.get_merged_bills()
        
        if status_code == 200:
            return jsonify(bills), 200
        else:
            return jsonify({
                "error": "Internal server error",
                "details": "Failed to fetch bills"
            }), status_code
            
    except Exception as e:
        logger.error(f"Error in get_bills: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


# ============================================
# CREATE & DELETE BILLS
# ============================================

@bills_bp.route('/bills', methods=['POST'])
def create_bill():
    """Create bill"""
    try:
        bill_data = request.json
        
        bill_id, message, status_code = bills_service.create_bill(bill_data)
        
        if status_code == 201:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('bills', 'CREATE', bill_id, bill_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message, "id": bill_id}), 201
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in create_bill: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@bills_bp.route('/bills/<bill_id>', methods=['DELETE'])
def delete_bill(bill_id):
    """Delete bill"""
    try:
        success, message, status_code = bills_service.delete_bill(bill_id)
        
        if success:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('bills', 'DELETE', bill_id, {'id': bill_id})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in delete_bill: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# SYNC ENDPOINT
# ============================================

@bills_bp.route('/bills/sync', methods=['GET'])
def sync_bills():
    """Sync bills endpoint"""
    try:
        # This endpoint can be used for manual sync trigger
        bills, status_code = bills_service.get_merged_bills()
        return jsonify({
            "status": "synced",
            "count": len(bills)
        }), 200
    except Exception as e:
        logger.error(f"Error in sync_bills: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
