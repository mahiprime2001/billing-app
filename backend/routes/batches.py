"""
Batches Routes
Flask blueprint for all batch-related API endpoints
"""
from flask import Blueprint, jsonify, request
import logging

from services import batches_service

logger = logging.getLogger(__name__)

# Create Blueprint
batches_bp = Blueprint('batches', __name__, url_prefix='/api')


# ============================================
# BATCHES ENDPOINTS
# ============================================

@batches_bp.route('/batches', methods=['GET'])
def get_batches():
    """Get all batches"""
    try:
        batches, status_code = batches_service.get_merged_batches()
        
        if status_code == 200:
            return jsonify(batches), 200
        else:
            return jsonify({
                "error": "Internal server error",
                "details": "Failed to fetch batches"
            }), status_code
            
    except Exception as e:
        logger.error(f"Error in get_batches: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


# ============================================
# CREATE, UPDATE & DELETE BATCHES
# ============================================

@batches_bp.route('/batches', methods=['POST'])
def create_batch():
    """Create batch"""
    try:
        batch_data = request.json
        
        batch_id, message, status_code = batches_service.create_batch(batch_data)
        
        if status_code == 201:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('batches', 'CREATE', batch_id, batch_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message, "id": batch_id}), 201
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in create_batch: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@batches_bp.route('/batches/<batch_id>', methods=['PUT'])
def update_batch(batch_id):
    """Update batch"""
    try:
        update_data = request.json
        
        success, message, status_code = batches_service.update_batch(batch_id, update_data)
        
        if success:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('batches', 'UPDATE', batch_id, update_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message, "id": batch_id}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in update_batch: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@batches_bp.route('/batches/<batch_id>', methods=['DELETE'])
def delete_batch(batch_id):
    """Delete batch"""
    try:
        success, message, status_code = batches_service.delete_batch(batch_id)
        
        if success:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('batches', 'DELETE', batch_id, {'id': batch_id})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in delete_batch: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
