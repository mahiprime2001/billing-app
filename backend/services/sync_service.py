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
            
            # Get status from sync manager
            status = {
                'available': True,
                'lastSync': sync_manager.get_last_sync_time() if hasattr(sync_manager, 'get_last_sync_time') else None,
                'pendingChanges': sync_manager.get_pending_count() if hasattr(sync_manager, 'get_pending_count') else 0
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
        
        # Trigger sync
        if hasattr(sync_manager, 'push_changes'):
            sync_manager.push_changes()
            return True, "Push sync triggered", 200
        else:
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
        
        # Trigger sync
        if hasattr(sync_manager, 'pull_changes'):
            sync_manager.pull_changes()
            return True, "Pull sync triggered", 200
        else:
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
        
        # Retry failed syncs
        if hasattr(sync_manager, 'retry_failed'):
            count = sync_manager.retry_failed()
            return True, f"Retried {count} failed syncs", 200
        else:
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
        
        # Cleanup
        if hasattr(sync_manager, 'cleanup_old_records'):
            count = sync_manager.cleanup_old_records()
            return True, f"Cleaned up {count} old records", 200
        else:
            return False, "Cleanup not supported", 501
        
    except ImportError:
        return False, "Sync manager not available", 503
    except Exception as e:
        logger.error(f"Error cleaning up syncs: {e}", exc_info=True)
        return False, str(e), 500
