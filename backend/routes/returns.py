"""
Returns Routes
Flask blueprint for all return-related API endpoints
"""
from flask import Blueprint, jsonify, request
import logging

from services import returns_service

logger = logging.getLogger(__name__)

# Create Blueprint
returns_bp = Blueprint('returns', __name__, url_prefix='/api')


# ============================================
# RETURNS ENDPOINTS
# ============================================

@returns_bp.route('/returns', methods=['GET'])
def get_returns():
    """Get all returns"""
    try:
        returns, status_code = returns_service.get_merged_returns()
        
        if status_code == 200:
            return jsonify(returns), 200
        else:
            return jsonify({
                "error": "Internal server error",
                "details": "Failed to fetch returns"
            }), status_code
            
    except Exception as e:
        logger.error(f"Error in get_returns: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


# ============================================
# CREATE RETURN
# ============================================

@returns_bp.route('/returns', methods=['POST'])
def create_return():
    """Create return"""
    try:
        return_data = request.json
        
        return_id, message, status_code = returns_service.create_return(return_data)
        
        if status_code == 201:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('returns', 'CREATE', return_id, return_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message, "id": return_id}), 201
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in create_return: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# UPDATE RETURN STATUS
# ============================================

@returns_bp.route('/returns/<return_id>/status', methods=['PUT'])
def update_return_status(return_id):
    """Update return status"""
    try:
        data = request.json
        status = data.get('status')
        
        success, message, status_code = returns_service.update_return_status(return_id, status)
        
        if success:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('returns', 'UPDATE', return_id, {'status': status})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in update_return_status: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
