"""
Customers Routes
Flask blueprint for all customer-related API endpoints
"""
from flask import Blueprint, jsonify, request
import logging

from services import customers_service

logger = logging.getLogger(__name__)

# Create Blueprint
customers_bp = Blueprint('customers', __name__, url_prefix='/api')


# ============================================
# LOCAL CUSTOMERS ENDPOINTS
# ============================================

@customers_bp.route("/local/customers", methods=["GET"])
def get_local_customers():
    """Get customers from LOCAL JSON"""
    try:
        customers = customers_service.get_local_customers()
        logger.debug(f"Returning {len(customers)} customers from local JSON.")
        return jsonify(customers), 200
    except Exception as e:
        logger.error(f"Error in get_local_customers: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@customers_bp.route("/local/customers/update", methods=["POST"])
def update_local_customers():
    """Update local JSON customers with new data"""
    try:
        customers_data = request.json
        
        success = customers_service.update_local_customers(customers_data)
        if success:
            return jsonify({
                "message": f"Local customers updated with {len(customers_data)} records."
            }), 200
        else:
            return jsonify({"error": "Failed to update local customers"}), 500
            
    except Exception as e:
        logger.error(f"Error in update_local_customers: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# SUPABASE CUSTOMERS ENDPOINTS
# ============================================

@customers_bp.route("/supabase/customers", methods=["GET"])
def get_supabase_customers():
    """Get customers directly from Supabase"""
    try:
        customers = customers_service.get_supabase_customers()
        logger.debug(f"Returning {len(customers)} customers from Supabase.")
        return jsonify(customers), 200
    except Exception as e:
        logger.error(f"Error in get_supabase_customers: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# MERGED CUSTOMERS ENDPOINTS
# ============================================

@customers_bp.route('/customers', methods=['GET'])
def get_customers():
    """Get customers by merging local and Supabase (Supabase takes precedence)"""
    try:
        customers, status_code = customers_service.get_merged_customers()
        
        if status_code == 200:
            return jsonify(customers), 200
        else:
            return jsonify({
                "error": "Internal server error",
                "details": "Failed to fetch customers"
            }), status_code
            
    except Exception as e:
        logger.error(f"Error in get_customers: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


# ============================================
# CREATE & UPDATE CUSTOMERS
# ============================================

@customers_bp.route('/customers', methods=['POST'])
def create_customer():
    """Create customer"""
    try:
        customer_data = request.json
        
        customer_id, message, status_code = customers_service.create_customer(customer_data)
        
        if status_code == 201:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('customers', 'CREATE', customer_id, customer_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message, "id": customer_id}), 201
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in create_customer: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@customers_bp.route('/customers/<customer_id>', methods=['PUT'])
def update_customer(customer_id):
    """Update customer"""
    try:
        update_data = request.json
        
        success, message, status_code = customers_service.update_customer(customer_id, update_data)
        
        if success:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('customers', 'UPDATE', customer_id, update_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message, "id": customer_id}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in update_customer: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
