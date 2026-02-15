"""
Admin Routes
Flask blueprint for administrative API endpoints
"""
from flask import Blueprint, jsonify, request
import logging
import os
import json

logger = logging.getLogger(__name__)

# Create Blueprint
admin_bp = Blueprint('admin', __name__, url_prefix='/api')


# ============================================
# ADMIN OPERATIONS
# ============================================

def _normalize_role(value):
    """Normalize role string for comparisons."""
    if not isinstance(value, str):
        return ""
    return value.strip().lower()


def _is_super_admin(payload):
    """
    Lightweight role gate for destructive endpoints.
    Note: this is not cryptographic auth; intended as a safety guard.
    """
    header_role = _normalize_role(request.headers.get("X-Admin-Role") or request.headers.get("X-User-Role"))
    body_role = _normalize_role(payload.get("role")) if isinstance(payload, dict) else ""
    role = header_role or body_role
    return role == "super_admin"


def _flush_users_with_keep(file_path, admin_users_to_keep):
    """Flush users file while optionally preserving selected admin emails."""
    keep_emails = {
        email.strip().lower()
        for email in admin_users_to_keep
        if isinstance(email, str) and email.strip()
    }

    existing_users = []
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
            if isinstance(loaded, list):
                existing_users = loaded
        except Exception as e:
            logger.warning(f"Failed to read existing users from {file_path}: {e}")

    if keep_emails:
        kept_users = []
        for user in existing_users:
            if not isinstance(user, dict):
                continue
            email = str(user.get("email", "")).strip().lower()
            role = _normalize_role(user.get("role"))
            if email in keep_emails and role in {"admin", "super_admin"}:
                kept_users.append(user)
        output_users = kept_users
    else:
        output_users = []

    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(output_users, f, indent=2, ensure_ascii=False)

    return len(output_users)


@admin_bp.route('/flush-data', methods=['POST'])
def flush_data():
    """Flush/reset all data (admin only)"""
    try:
        from config import Config
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return jsonify({"error": "Invalid request payload"}), 400

        # Hard safety gate for destructive operations.
        if not Config.ENABLE_DESTRUCTIVE_ADMIN_ACTIONS:
            return jsonify({
                "error": "Flush data is disabled",
                "details": "Set ENABLE_DESTRUCTIVE_ADMIN_ACTIONS=true to enable this endpoint."
            }), 403

        if not _is_super_admin(payload):
            return jsonify({"error": "Forbidden: super_admin role required"}), 403

        data_type = payload.get('type') or payload.get('category')
        if not data_type:
            return jsonify({"error": "Missing required field: type"}), 400

        valid_types = {
            "all", "products", "customers", "bills", "users", "stores", "batches", "returns", "notifications"
        }
        if data_type not in valid_types:
            return jsonify({"error": f"Invalid flush type: {data_type}"}), 400

        admin_users_to_keep = payload.get("adminUsersToKeep", [])
        if not isinstance(admin_users_to_keep, list):
            return jsonify({"error": "adminUsersToKeep must be an array"}), 400
        
        files_to_flush = []
        
        if data_type == 'all' or data_type == 'products':
            files_to_flush.append(Config.PRODUCTS_FILE)
        
        if data_type == 'all' or data_type == 'customers':
            files_to_flush.append(Config.CUSTOMERS_FILE)
        
        if data_type == 'all' or data_type == 'bills':
            files_to_flush.append(Config.BILLS_FILE)
        
        if data_type == 'all' or data_type == 'users':
            files_to_flush.append(Config.USERS_FILE)
        
        if data_type == 'all' or data_type == 'stores':
            files_to_flush.append(Config.STORES_FILE)
        
        if data_type == 'all' or data_type == 'batches':
            files_to_flush.append(Config.BATCHES_FILE)
        
        if data_type == 'all' or data_type == 'returns':
            files_to_flush.append(Config.RETURNS_FILE)
        
        if data_type == 'all' or data_type == 'notifications':
            files_to_flush.append(Config.NOTIFICATIONS_FILE)
        
        # Reset files to empty
        kept_users = 0
        for file_path in files_to_flush:
            try:
                if file_path == Config.USERS_FILE:
                    kept_users = _flush_users_with_keep(file_path, admin_users_to_keep)
                else:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump([], f, indent=2, ensure_ascii=False)
                logger.info(f"Flushed {file_path}")
            except Exception as e:
                logger.error(f"Error flushing {file_path}: {e}")
        
        return jsonify({
            "message": f"Data flushed successfully",
            "type": data_type,
            "files_affected": len(files_to_flush),
            "kept_users": kept_users
        }), 200
            
    except Exception as e:
        logger.error(f"Error in flush_data: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@admin_bp.route('/system/info', methods=['GET'])
def get_system_info():
    """Get system information"""
    try:
        import sys
        from config import Config
        
        info = {
            'python_version': sys.version,
            'platform': sys.platform,
            'base_dir': Config.BASE_DIR,
            'json_dir': Config.JSON_DIR,
            'logs_dir': Config.LOGS_DIR
        }
        
        return jsonify(info), 200
            
    except Exception as e:
        logger.error(f"Error in get_system_info: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@admin_bp.route('/system/health', methods=['GET'])
def system_health():
    """Check system health"""
    try:
        from config import Config
        
        health = {
            'status': 'healthy',
            'directories': {
                'json': os.path.exists(Config.JSON_DIR),
                'logs': os.path.exists(Config.LOGS_DIR)
            }
        }
        
        return jsonify(health), 200
            
    except Exception as e:
        logger.error(f"Error in system_health: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
