"""
Notifications Routes
Flask blueprint for all notification-related API endpoints
"""
from flask import Blueprint, jsonify, request
import logging

from services import notifications_service

logger = logging.getLogger(__name__)

# Create Blueprint
notifications_bp = Blueprint('notifications', __name__, url_prefix='/api')


# ============================================
# NOTIFICATIONS ENDPOINTS
# ============================================

@notifications_bp.route('/notifications', methods=['GET'])
def get_notifications():
    """Get all notifications"""
    try:
        notifications, status_code = notifications_service.get_merged_notifications()
        
        if status_code == 200:
            return jsonify(notifications), 200
        else:
            return jsonify({
                "error": "Internal server error",
                "details": "Failed to fetch notifications"
            }), status_code
            
    except Exception as e:
        logger.error(f"Error in get_notifications: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


# ============================================
# CREATE NOTIFICATION
# ============================================

@notifications_bp.route('/notifications', methods=['POST'])
def create_notification():
    """Create notification"""
    try:
        notification_data = request.json
        
        notification_id, message, status_code = notifications_service.create_notification(notification_data)
        
        if status_code == 201:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('notifications', 'CREATE', notification_id, notification_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message, "id": notification_id}), 201
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in create_notification: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# SINGLE NOTIFICATION ENDPOINTS
# ============================================

@notifications_bp.route('/notifications/<notification_id>', methods=['GET'])
def get_notification(notification_id):
    """Get single notification"""
    try:
        notifications, status_code = notifications_service.get_merged_notifications()
        
        if status_code != 200:
            return jsonify({"error": "Failed to fetch notifications"}), status_code
        
        notification = next((n for n in notifications if n.get('id') == notification_id), None)
        
        if notification:
            return jsonify(notification), 200
        else:
            return jsonify({"error": "Notification not found"}), 404
            
    except Exception as e:
        logger.error(f"Error in get_notification: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@notifications_bp.route('/notifications/<notification_id>', methods=['PUT'])
def mark_notification_read(notification_id):
    """Mark notification as read"""
    try:
        success, message, status_code = notifications_service.mark_notification_as_read(notification_id)
        
        if success:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('notifications', 'UPDATE', notification_id, {'is_read': True})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in mark_notification_read: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@notifications_bp.route('/notifications/<notification_id>', methods=['DELETE'])
def delete_notification(notification_id):
    """Delete notification"""
    try:
        success, message, status_code = notifications_service.delete_notification(notification_id)
        
        if success:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('notifications', 'DELETE', notification_id, {'id': notification_id})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in delete_notification: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
