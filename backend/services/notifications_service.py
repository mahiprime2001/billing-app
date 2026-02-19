"""
Notifications Service
Handles all notification-related business logic and database operations
"""
import logging
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple

from utils.supabase_db import db
from utils.json_helpers import get_notifications_data, save_notifications_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

logger = logging.getLogger(__name__)


# ============================================
# LOCAL JSON OPERATIONS
# ============================================

def get_local_notifications() -> List[Dict]:
    """Get notifications from local JSON storage"""
    try:
        notifications = get_notifications_data()
        transformed_notifications = [convert_snake_to_camel(notif) for notif in notifications]
        logger.debug(f"Returning {len(transformed_notifications)} notifications from local JSON.")
        return transformed_notifications
    except Exception as e:
        logger.error(f"Error getting local notifications: {e}", exc_info=True)
        return []


# ============================================
# SUPABASE OPERATIONS
# ============================================

def get_supabase_notifications() -> List[Dict]:
    """Get notifications directly from Supabase"""
    try:
        client = db.client
        response = client.table("notifications").select("*").execute()
        notifications = response.data or []
        
        transformed_notifications = [convert_snake_to_camel(notif) for notif in notifications]
        logger.debug(f"Returning {len(transformed_notifications)} notifications from Supabase.")
        return transformed_notifications
    except Exception as e:
        logger.error(f"Error getting Supabase notifications: {e}", exc_info=True)
        return []


# ============================================
# MERGED OPERATIONS
# ============================================

def get_merged_notifications() -> Tuple[List[Dict], int]:
    """
    Get notifications by merging local and Supabase (Supabase takes precedence).
    Returns (notifications_list, status_code)
    """
    try:
        # Fetch from Supabase (preferred source)
        supabase_notifications = get_supabase_notifications()
        
        # Fetch from local JSON (fallback)
        local_notifications = get_local_notifications()
        
        # Merge: Supabase takes precedence
        notifications_map = {}
        
        # Add local notifications first (lower priority)
        for notif in local_notifications:
            if notif.get('id'):
                notifications_map[notif['id']] = notif
        
        # Add Supabase notifications (higher priority)
        for notif in supabase_notifications:
            if notif.get('id'):
                notifications_map[notif['id']] = notif
        
        final_notifications = list(notifications_map.values())
        final_notifications.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        
        logger.debug(f"Returning {len(final_notifications)} merged notifications")
        return final_notifications, 200
        
    except Exception as e:
        logger.error(f"Error getting merged notifications: {e}", exc_info=True)
        return [], 500


# ============================================
# BUSINESS LOGIC
# ============================================

def create_notification(notification_data: dict) -> Tuple[Optional[str], str, int]:
    """
    Create a new notification.
    Returns (notification_id, message, status_code)
    """
    try:
        if not notification_data:
            return None, "No notification data provided", 400
        
        # Convert field names
        notification_data = convert_camel_to_snake(notification_data)
        
        # Generate ID if not present
        if 'id' not in notification_data:
            notification_data['id'] = str(uuid.uuid4())
        
        # Add timestamps
        now_naive = datetime.now().isoformat()
        if 'createdat' not in notification_data:
            notification_data['createdat'] = now_naive
        notification_data['updatedat'] = now_naive
        
        # Set default read status
        if 'is_read' not in notification_data:
            notification_data['is_read'] = False
        
        # Save to local JSON first (offline-first)
        notifications = get_notifications_data()
        existing_idx = next((i for i, n in enumerate(notifications) if n.get("id") == notification_data["id"]), -1)
        if existing_idx >= 0:
            notifications[existing_idx] = notification_data
        else:
            notifications.append(notification_data)
        save_notifications_data(notifications)

        # Best-effort Supabase sync now; queue handles retry on failure
        try:
            client = db.client
            client.table('notifications').upsert(notification_data).execute()
        except Exception as supabase_error:
            logger.warning(
                f"Notification {notification_data['id']} saved locally; Supabase sync deferred: {supabase_error}"
            )
            return notification_data["id"], "Notification saved locally and queued for sync", 201
        
        logger.info(f"Notification created {notification_data['id']}")
        return notification_data['id'], "Notification created", 201
        
    except Exception as e:
        logger.error(f"Error creating notification: {e}", exc_info=True)
        return None, str(e), 500


def mark_notification_as_read(notification_id: str) -> Tuple[bool, str, int]:
    """
    Mark notification as read.
    Returns (success, message, status_code)
    """
    try:
        # Find notification in local storage
        notifications = get_notifications_data()
        notif_index = next((i for i, n in enumerate(notifications) if n.get('id') == notification_id), -1)
        
        if notif_index == -1:
            return False, "Notification not found", 404
        
        # Update read status
        update_data = {
            'is_read': True,
            'updatedat': datetime.now().isoformat()
        }
        
        # Update in local JSON
        notifications[notif_index].update(update_data)
        save_notifications_data(notifications)
        
        # Update in Supabase
        client = db.client
        client.table('notifications').update(update_data).eq('id', notification_id).execute()
        
        logger.info(f"Notification {notification_id} marked as read")
        return True, "Notification marked as read", 200
        
    except Exception as e:
        logger.error(f"Error marking notification as read: {e}", exc_info=True)
        return False, str(e), 500


def delete_notification(notification_id: str) -> Tuple[bool, str, int]:
    """
    Delete a notification.
    Returns (success, message, status_code)
    """
    try:
        # Delete from local JSON
        notifications = get_notifications_data()
        notif_index = next((i for i, n in enumerate(notifications) if n.get('id') == notification_id), -1)
        
        if notif_index == -1:
            return False, "Notification not found", 404
        
        notifications.pop(notif_index)
        save_notifications_data(notifications)
        
        # Delete from Supabase
        client = db.client
        client.table('notifications').delete().eq('id', notification_id).execute()
        
        logger.info(f"Notification deleted {notification_id}")
        return True, "Notification deleted", 200
        
    except Exception as e:
        logger.error(f"Error deleting notification: {e}", exc_info=True)
        return False, str(e), 500
