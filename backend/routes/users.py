"""
Users Routes
Flask blueprint for all user-related API endpoints
"""
from flask import Blueprint, jsonify, request
import logging

from services import users_service

logger = logging.getLogger(__name__)

# Create Blueprint
users_bp = Blueprint('users', __name__, url_prefix='/api')


# ============================================
# USERS ENDPOINTS
# ============================================

@users_bp.route('/users', methods=['GET'])
def get_users():
    """Get all users"""
    try:
        users, status_code = users_service.get_merged_users()
        
        if status_code == 200:
            return jsonify(users), 200
        else:
            return jsonify({
                "error": "Internal server error",
                "details": "Failed to fetch users"
            }), status_code
            
    except Exception as e:
        logger.error(f"Error in get_users: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


@users_bp.route('/admin-users', methods=['GET'])
def get_admin_users():
    """Get admin users only"""
    try:
        users, status_code = users_service.get_merged_users()
        
        if status_code == 200:
            # Filter for admin users
            admin_users = [
                u for u in users
                if str(u.get('role', '')).strip().lower() in {'admin', 'super_admin'}
            ]
            return jsonify({"adminUsers": admin_users}), 200
        else:
            return jsonify({
                "error": "Internal server error",
                "details": "Failed to fetch users"
            }), status_code
            
    except Exception as e:
        logger.error(f"Error in get_admin_users: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


# ============================================
# CREATE, UPDATE & DELETE USERS
# ============================================

@users_bp.route('/users', methods=['POST'])
def create_user():
    """Create user"""
    try:
        user_data = request.json
        
        user_id, message, status_code = users_service.create_user(user_data)
        
        if status_code == 201:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                # Don't log password
                safe_data = {k: v for k, v in user_data.items() if k != 'password'}
                log_json_crud_operation('users', 'CREATE', user_id, safe_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message, "id": user_id}), 201
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in create_user: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@users_bp.route('/users/<user_id>', methods=['PUT'])
def update_user(user_id):
    """Update user"""
    try:
        update_data = request.json
        
        success, message, status_code = users_service.update_user(user_id, update_data)
        
        if success:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                # Don't log password
                safe_data = {k: v for k, v in update_data.items() if k != 'password'}
                log_json_crud_operation('users', 'UPDATE', user_id, safe_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message, "id": user_id}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in update_user: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@users_bp.route('/users/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    """Delete user"""
    try:
        success, message, status_code = users_service.delete_user(user_id)
        
        if success:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('users', 'DELETE', user_id, {'id': user_id})
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in delete_user: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
