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
