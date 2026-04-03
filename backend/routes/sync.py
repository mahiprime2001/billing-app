"""
Sync Routes
Flask blueprint for all sync-related API endpoints
"""
from flask import Blueprint, jsonify, request
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Create Blueprint
sync_bp = Blueprint('sync', __name__, url_prefix='/api')


def _as_bool(value, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}

# ============================================
# SYNC STATUS & HEARTBEAT
# ============================================

@sync_bp.route('/sync/status', methods=['GET'], strict_slashes=False)
def get_sync_status():
    """
    Heartbeat endpoint - Check if backend is alive and get sync status
    """
    try:
        # Get sync service if available
        try:
            from services import sync_service
            status, status_code = sync_service.get_sync_status()
            if status_code == 200:
                return jsonify(status), 200
        except (ImportError, AttributeError) as e:
            logger.debug(f"Sync service not available, using basic heartbeat: {e}")
        
        # Fallback to basic heartbeat response
        return jsonify({
            'status': 'online',
            'timestamp': datetime.now().isoformat(),
            'message': 'Backend is running',
            'version': '2.0',
            'sync_available': False
        }), 200
        
    except Exception as e:
        logger.error(f"Error in get_sync_status: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500


# ============================================
# SYNC OPERATIONS
# ============================================

@sync_bp.route('/sync/push', methods=['POST'])
def push_sync():
    """Trigger push sync"""
    try:
        from services import sync_service
        success, message, status_code = sync_service.trigger_push_sync()
        
        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except ImportError:
        logger.warning("Sync service not available")
        return jsonify({"error": "Sync service not available"}), 503
    except Exception as e:
        logger.error(f"Error in push_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@sync_bp.route('/sync/pull', methods=['POST'])
def pull_sync():
    """Trigger pull sync"""
    try:
        from services import sync_service
        success, message, status_code = sync_service.trigger_pull_sync()
        
        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except ImportError:
        logger.warning("Sync service not available")
        return jsonify({"error": "Sync service not available"}), 503
    except Exception as e:
        logger.error(f"Error in pull_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@sync_bp.route('/sync/retry', methods=['POST'])
def retry_sync():
    """Retry failed syncs"""
    try:
        from services import sync_service
        success, message, status_code = sync_service.retry_failed_syncs()
        
        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except ImportError:
        logger.warning("Sync service not available")
        return jsonify({"error": "Sync service not available"}), 503
    except Exception as e:
        logger.error(f"Error in retry_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@sync_bp.route('/sync/reconnect', methods=['POST'])
def reconnect_sync():
    """Trigger immediate sync cycle when connectivity is restored"""
    try:
        from services import sync_service
        success, message, status_code = sync_service.trigger_reconnect_sync()

        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code

    except ImportError:
        logger.warning("Sync service not available")
        return jsonify({"error": "Sync service not available"}), 503
    except Exception as e:
        logger.error(f"Error in reconnect_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@sync_bp.route('/sync/resend', methods=['POST'])
def resend_unsent_sync():
    """Requeue failed/skipped logs and resend to Supabase"""
    try:
        from services import sync_service
        success, message, status_code = sync_service.resend_unsent_syncs()

        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code

    except ImportError:
        logger.warning("Sync service not available")
        return jsonify({"error": "Sync service not available"}), 503
    except Exception as e:
        logger.error(f"Error in resend_unsent_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@sync_bp.route('/sync/resend-products', methods=['POST'])
def resend_local_products_sync():
    """Force requeue/resend of local products to Supabase."""
    try:
        from services import sync_service

        body = request.json or {}
        include_outdated = _as_bool(body.get("includeOutdated"), True)
        process_now = _as_bool(body.get("processNow"), True)
        limit = int(body.get("limit", 0) or 0)

        success, message, status_code = sync_service.resend_local_products(
            include_outdated=include_outdated,
            process_now=process_now,
            limit=limit,
        )

        if success:
            return jsonify({"message": message}), status_code
        return jsonify({"error": message}), status_code

    except ImportError:
        logger.warning("Sync service not available")
        return jsonify({"error": "Sync service not available"}), 503
    except Exception as e:
        logger.error(f"Error in resend_local_products_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@sync_bp.route('/sync/reconcile-products', methods=['POST'])
def reconcile_products_direct_sync():
    """Directly reconcile local products with Supabase and upload missing/newer rows."""
    try:
        from services import sync_service

        body = request.json or {}
        include_outdated = _as_bool(body.get("includeOutdated"), True)
        queue_failures = _as_bool(body.get("queueFailures"), True)
        limit = int(body.get("limit", 0) or 0)

        success, message, status_code = sync_service.reconcile_and_upload_local_products(
            include_outdated=include_outdated,
            limit=limit,
            queue_failures=queue_failures,
        )

        if success:
            return jsonify({"message": message}), status_code
        return jsonify({"error": message}), status_code

    except ImportError:
        logger.warning("Sync service not available")
        return jsonify({"error": "Sync service not available"}), 503
    except Exception as e:
        logger.error(f"Error in reconcile_products_direct_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@sync_bp.route('/sync/cleanup', methods=['POST'])
def cleanup_sync():
    """Cleanup old sync records"""
    try:
        from services import sync_service
        success, message, status_code = sync_service.cleanup_old_syncs()
        
        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except ImportError:
        logger.warning("Sync service not available")
        return jsonify({"error": "Sync service not available"}), 503
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
        from services import sync_service
        success, message, status_code = sync_service.trigger_push_sync()
        
        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except ImportError:
        logger.warning("Sync service not available")
        return jsonify({"error": "Sync service not available"}), 503
    except Exception as e:
        logger.error(f"Error in legacy_push_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@sync_bp.route('/pull-sync', methods=['GET'])
def legacy_pull_sync():
    """Legacy pull sync endpoint"""
    try:
        from services import sync_service
        success, message, status_code = sync_service.trigger_pull_sync()
        
        if success:
            return jsonify({"message": message}), status_code
        else:
            return jsonify({"error": message}), status_code
            
    except ImportError:
        logger.warning("Sync service not available")
        return jsonify({"error": "Sync service not available"}), 503
    except Exception as e:
        logger.error(f"Error in legacy_pull_sync: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
