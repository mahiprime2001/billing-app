"""
Sync Routes
Flask blueprint for all sync-related API endpoints
"""
from flask import Blueprint, jsonify, request
import logging

from services import sync_service

logger = logging.getLogger(__name__)

# Create Blueprint
sync_bp = Blueprint('sync', __name__, url_prefix='/api')


# ============================================
# SYNC STATUS
# ============================================

@sync_bp.route('/sync/status', methods=['GET'])
def get_sync_status():
    """Get sync status"""
    try:
        status, status_code = sync_service.get_sync_status()
        
        if status_code == 200:
            return jsonify(status), 200
        else:
            return jsonify({"error": "Failed to fetch sync status"}), status_code
            
    except Exception as e:
        logger.error(f"Error in get_sync_status: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# SYNC OPERATIONS
# ============================================

@sync_bp.route('/sync/push', methods=['POST'])
def push_sync():
    """Trigger push sync"""
    try:
        success, message, status_code = sync_service.trigger_push_sync()
        
        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in push_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@sync_bp.route('/sync/pull', methods=['POST'])
def pull_sync():
    """Trigger pull sync"""
    try:
        success, message, status_code = sync_service.trigger_pull_sync()
        
        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in pull_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@sync_bp.route('/sync/retry', methods=['POST'])
def retry_sync():
    """Retry failed syncs"""
    try:
        success, message, status_code = sync_service.retry_failed_syncs()
        
        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in retry_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@sync_bp.route('/sync/cleanup', methods=['POST'])
def cleanup_sync():
    """Cleanup old sync records"""
    try:
        success, message, status_code = sync_service.cleanup_old_syncs()
        
        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in cleanup_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500



# ============================================
# LEGACY SYNC ENDPOINTS
# ============================================

@sync_bp.route('/push-sync', methods=['POST'])
def legacy_push_sync():
    """Legacy push sync endpoint"""
    try:
        success, message, status_code = sync_service.trigger_push_sync()
        
        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in legacy_push_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@sync_bp.route('/pull-sync', methods=['GET'])
def legacy_pull_sync():
    """Legacy pull sync endpoint"""
    try:
        success, message, status_code = sync_service.trigger_pull_sync()
        
        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in legacy_pull_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
