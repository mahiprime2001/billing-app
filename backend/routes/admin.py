"""
Admin Routes
Flask blueprint for administrative API endpoints
"""
from flask import Blueprint, jsonify, request
import logging
import os

logger = logging.getLogger(__name__)

# Create Blueprint
admin_bp = Blueprint('admin', __name__, url_prefix='/api')


# ============================================
# ADMIN OPERATIONS
# ============================================

@admin_bp.route('/flush-data', methods=['POST'])
def flush_data():
    """Flush/reset all data (admin only)"""
    try:
        data_type = request.json.get('type', 'all')
        
        from config import Config
        
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
        import json
        for file_path in files_to_flush:
            try:
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump([], f)
                logger.info(f"Flushed {file_path}")
            except Exception as e:
                logger.error(f"Error flushing {file_path}: {e}")
        
        return jsonify({
            "message": f"Data flushed successfully",
            "type": data_type,
            "files_affected": len(files_to_flush)
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
