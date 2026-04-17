"""
Settings Routes
Flask blueprint for all settings-related API endpoints
"""
from flask import Blueprint, jsonify, request
import logging

from services import settings_service

logger = logging.getLogger(__name__)

# Create Blueprint
settings_bp = Blueprint('settings', __name__, url_prefix='/api')


# ============================================
# SETTINGS ENDPOINTS
# ============================================

@settings_bp.route('/settings', methods=['GET'])
def get_settings():
    """Get all settings"""
    try:
        mode = (request.args.get("mode") or "merged").strip().lower()
        if mode == "local":
            local_settings = settings_service.get_local_settings()
            return jsonify(local_settings), 200
        if mode == "online":
            online_settings = settings_service.get_supabase_settings()
            if online_settings:
                return jsonify(online_settings), 200
            return jsonify({"error": "Online settings unavailable"}), 503

        settings, status_code = settings_service.get_merged_settings()
        
        if status_code == 200:
            return jsonify(settings), 200
        else:
            return jsonify({
                "error": "Internal server error",
                "details": "Failed to fetch settings"
            }), status_code
            
    except Exception as e:
        logger.error(f"Error in get_settings: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


@settings_bp.route('/settings/local', methods=['GET'])
def get_settings_local():
    """Get settings from local JSON only."""
    try:
        return jsonify(settings_service.get_local_settings()), 200
    except Exception as e:
        logger.error(f"Error in get_settings_local: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@settings_bp.route('/settings/online', methods=['GET'])
def get_settings_online():
    """Get settings from Supabase only."""
    try:
        online_settings = settings_service.get_supabase_settings()
        if online_settings:
            return jsonify(online_settings), 200
        return jsonify({"error": "Online settings unavailable"}), 503
    except Exception as e:
        logger.error(f"Error in get_settings_online: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@settings_bp.route('/settings', methods=['POST'])
def update_settings():
    """Update settings"""
    try:
        settings_data = request.json
        
        success, message, status_code = settings_service.update_settings(settings_data)
        
        if success:
            # Log for sync
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation('settings', 'UPDATE', 'system', settings_data)
            except ImportError:
                logger.warning("Sync manager not available, skipping sync log")
            
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except Exception as e:
        logger.error(f"Error in update_settings: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@settings_bp.route('/settings/<key>', methods=['GET'])
def get_setting(key):
    """Get specific setting"""
    try:
        value, status_code = settings_service.get_setting(key)
        
        if status_code == 200:
            return jsonify({"key": key, "value": value}), 200
        else:
            return jsonify({"error": "Setting not found"}), status_code
            
    except Exception as e:
        logger.error(f"Error in get_setting: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
