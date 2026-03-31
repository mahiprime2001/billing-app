"""
Sync Service
Handles sync operations and status
"""
import logging
from typing import Dict, Tuple

logger = logging.getLogger(__name__)


# ============================================
# SYNC STATUS
# ============================================

def get_sync_status() -> Tuple[Dict, int]:
    """
    Get current sync status.
    Returns (status_dict, status_code)
    """
    try:
        # Import sync manager if available
        try:
            from scripts.sync_manager import get_sync_manager
            sync_manager = get_sync_manager()
            
            # Get status from sync manager (normalized for frontend)
            raw_status = sync_manager.get_sync_status() if hasattr(sync_manager, "get_sync_status") else {}
            status = {
                "available": True,
                "isRunning": raw_status.get("is_running", False),
                "lastSync": raw_status.get("last_sync"),
                "pendingChanges": raw_status.get("pending_logs", 0),
                "failedChanges": raw_status.get("failed_logs", 0),
            }
        except ImportError:
            status = {
                'available': False,
                'message': 'Sync manager not available'
            }
        
        return status, 200
        
    except Exception as e:
        logger.error(f"Error getting sync status: {e}", exc_info=True)
        return {}, 500


# ============================================
# SYNC OPERATIONS
# ============================================

def trigger_push_sync() -> Tuple[bool, str, int]:
    """
    Trigger push sync to cloud.
    Returns (success, message, status_code)
    """
    try:
        from scripts.sync_manager import get_sync_manager
        sync_manager = get_sync_manager()
        
        if hasattr(sync_manager, "process_pending_logs"):
            result = sync_manager.process_pending_logs()
            return True, f"Push sync completed: {result}", 200
        return False, "Push sync not supported", 501
        
    except ImportError:
        return False, "Sync manager not available", 503
    except Exception as e:
        logger.error(f"Error triggering push sync: {e}", exc_info=True)
        return False, str(e), 500


def trigger_pull_sync() -> Tuple[bool, str, int]:
    """
    Trigger pull sync from cloud.
    Returns (success, message, status_code)
    """
    try:
        from scripts.sync_manager import get_sync_manager
        sync_manager = get_sync_manager()
        
        if hasattr(sync_manager, "pull_from_supabase_sync_table"):
            result = sync_manager.pull_from_supabase_sync_table()
            return True, f"Pull sync completed: {result}", 200
        return False, "Pull sync not supported", 501
        
    except ImportError:
        return False, "Sync manager not available", 503
    except Exception as e:
        logger.error(f"Error triggering pull sync: {e}", exc_info=True)
        return False, str(e), 500


def retry_failed_syncs() -> Tuple[bool, str, int]:
    """
    Retry failed sync operations.
    Returns (success, message, status_code)
    """
    try:
        from scripts.sync_manager import get_sync_manager
        sync_manager = get_sync_manager()
        
        if hasattr(sync_manager, "retry_failed_logs"):
            result = sync_manager.retry_failed_logs()
            return True, f"Retry completed: {result}", 200
        return False, "Retry not supported", 501
        
    except ImportError:
        return False, "Sync manager not available", 503
    except Exception as e:
        logger.error(f"Error retrying syncs: {e}", exc_info=True)
        return False, str(e), 500


def cleanup_old_syncs() -> Tuple[bool, str, int]:
    """
    Cleanup old sync records.
    Returns (success, message, status_code)
    """
    try:
        from scripts.sync_manager import get_sync_manager
        sync_manager = get_sync_manager()
        
        if hasattr(sync_manager, "cleanup_old_logs"):
            result = sync_manager.cleanup_old_logs()
            return True, f"Cleanup completed: {result}", 200
        return False, "Cleanup not supported", 501
        
    except ImportError:
        return False, "Sync manager not available", 503
    except Exception as e:
        logger.error(f"Error cleaning up syncs: {e}", exc_info=True)
        return False, str(e), 500


def trigger_reconnect_sync() -> Tuple[bool, str, int]:
    """
    Trigger an immediate sync cycle when connectivity is restored.
    Pushes pending logs, retries failed logs, then pulls remote changes.
    Returns (success, message, status_code)
    """
    try:
        from scripts.sync_manager import get_sync_manager
        import utils.supabase_circuit as supabase_circuit

        # Allow immediate probe right after reconnect.
        supabase_circuit.force_probe()

        sync_manager = get_sync_manager()

        requeue_result = (
            sync_manager.requeue_unsent_logs()
            if hasattr(sync_manager, "requeue_unsent_logs")
            else {"status": "unsupported"}
        )
        push_result = (
            sync_manager.process_pending_logs()
            if hasattr(sync_manager, "process_pending_logs")
            else {"status": "unsupported"}
        )
        retry_result = (
            sync_manager.retry_failed_logs()
            if hasattr(sync_manager, "retry_failed_logs")
            else {"status": "unsupported"}
        )
        pull_result = (
            sync_manager.pull_from_supabase_sync_table()
            if hasattr(sync_manager, "pull_from_supabase_sync_table")
            else {"status": "unsupported"}
        )

        return True, f"Reconnect sync completed: requeue={requeue_result}, push={push_result}, retry={retry_result}, pull={pull_result}", 200
    except ImportError:
        return False, "Sync manager not available", 503
    except Exception as e:
        logger.error(f"Error triggering reconnect sync: {e}", exc_info=True)
        return False, str(e), 500


def resend_unsent_syncs() -> Tuple[bool, str, int]:
    """
    Force resend of unsent logs (failed/skipped) after a fix.
    Returns (success, message, status_code)
    """
    try:
        from scripts.sync_manager import get_sync_manager
        sync_manager = get_sync_manager()

        if hasattr(sync_manager, "requeue_unsent_logs"):
            result = sync_manager.requeue_unsent_logs()
            return True, f"Resend completed: {result}", 200
        return False, "Resend not supported", 501

    except ImportError:
        return False, "Sync manager not available", 503
    except Exception as e:
        logger.error(f"Error resending unsent syncs: {e}", exc_info=True)
        return False, str(e), 500


def resend_local_products(include_outdated: bool = True, process_now: bool = True, limit: int = 0) -> Tuple[bool, str, int]:
    """
    Force requeue and resend products from local JSON to Supabase.
    Useful when pending logs are empty but local product changes were missed.
    """
    try:
        from scripts.sync_manager import get_sync_manager
        sync_manager = get_sync_manager()

        if hasattr(sync_manager, "queue_local_products_for_resync"):
            result = sync_manager.queue_local_products_for_resync(
                include_outdated=include_outdated,
                process_now=process_now,
                limit=limit,
            )
            return True, f"Local product resend completed: {result}", 200
        return False, "Local product resend not supported", 501
    except ImportError:
        return False, "Sync manager not available", 503
    except Exception as e:
        logger.error(f"Error resending local products: {e}", exc_info=True)
        return False, str(e), 500


def reconcile_and_upload_local_products(
    include_outdated: bool = True,
    limit: int = 0,
    queue_failures: bool = True,
) -> Tuple[bool, str, int]:
    """
    Directly compare local products with Supabase and upload missing/newer rows immediately.
    """
    try:
        from scripts.sync_manager import get_sync_manager
        sync_manager = get_sync_manager()

        if hasattr(sync_manager, "reconcile_and_upload_products_from_local"):
            result = sync_manager.reconcile_and_upload_products_from_local(
                include_outdated=include_outdated,
                limit=limit,
                queue_failures=queue_failures,
            )
            return True, f"Direct reconcile+upload completed: {result}", 200
        return False, "Direct reconcile+upload not supported", 501
    except ImportError:
        return False, "Sync manager not available", 503
    except Exception as e:
        logger.error(f"Error in direct reconcile+upload of products: {e}", exc_info=True)
        return False, str(e), 500
