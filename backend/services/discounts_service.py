"""
Discounts Service
Handles discount request business logic and database operations
"""

import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from utils.supabase_db import db
from utils.json_helpers import get_discounts_data, save_discounts_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

logger = logging.getLogger(__name__)


def _create_discount_notification(discount_data: Dict) -> None:
    """Best-effort notification for new discount requests."""
    try:
        from services import notifications_service

        discount_id = discount_data.get("discount_id", "")
        user_id = discount_data.get("user_id", "")
        discount_pct = discount_data.get("discount")
        discount_amount = discount_data.get("discount_amount")
        bill_id = discount_data.get("bill_id", "")

        parts = [f"Discount request {discount_id}"]
        if user_id:
            parts.append(f"by user {user_id}")
        if bill_id:
            parts.append(f"for bill {bill_id}")
        if discount_pct is not None:
            parts.append(f"({discount_pct}%")
            if discount_amount is not None:
                parts[-1] = f"{parts[-1]}, amount ₹{discount_amount})"
            else:
                parts[-1] = f"{parts[-1]})"
        elif discount_amount is not None:
            parts.append(f"(amount ₹{discount_amount})")

        notifications_service.create_notification(
            {
                "type": "DISCOUNT_REQUEST",
                "notification": " ".join(parts),
                "relatedId": discount_id,
                "isRead": False,
            }
        )
    except Exception as notification_error:
        logger.warning(f"Failed to create discount notification: {notification_error}")

# ============================================
# LOCAL JSON OPERATIONS
# ============================================

def get_local_discounts() -> List[Dict]:
    """Get discounts from local JSON storage"""
    try:
        discounts = get_discounts_data()
        transformed = [convert_snake_to_camel(item) for item in discounts]
        logger.debug(f"Returning {len(transformed)} discounts from local JSON.")
        return transformed
    except Exception as e:
        logger.error(f"Error getting local discounts: {e}", exc_info=True)
        return []


# ============================================
# SUPABASE OPERATIONS
# ============================================

def get_supabase_discounts() -> List[Dict]:
    """Get discounts directly from Supabase"""
    try:
        client = db.client
        response = client.table("discounts").select("*").execute()
        discounts = response.data or []

        # Collect all user ids referenced by discounts (requester + approver)
        user_ids = {
            item.get("user_id")
            for item in discounts
            if item.get("user_id")
        } | {
            item.get("approved_by")
            for item in discounts
            if item.get("approved_by")
        }

        user_name_map: Dict[str, str] = {}
        if user_ids:
            try:
                users_resp = (
                    client.table("users")
                    .select("id,name")
                    .in_("id", list(user_ids))
                    .execute()
                )
                for user in users_resp.data or []:
                    user_name_map[user["id"]] = user.get("name") or user["id"]
            except Exception as user_err:
                logger.warning(f"Failed to load user names for discounts: {user_err}")

        transformed: List[Dict] = []
        for item in discounts:
            camel_item = convert_snake_to_camel(item)

            requester_id = item.get("user_id")
            approver_id = item.get("approved_by")

            if requester_id:
                camel_item["userName"] = user_name_map.get(requester_id, requester_id)
            if approver_id:
                camel_item["approvedByName"] = user_name_map.get(approver_id, approver_id)

            transformed.append(camel_item)

        logger.debug(f"Returning {len(transformed)} discounts from Supabase.")
        return transformed
    except Exception as e:
        logger.error(f"Error getting Supabase discounts: {e}", exc_info=True)
        return []


# ============================================
# MERGED OPERATIONS
# ============================================

def get_merged_discounts() -> Tuple[List[Dict], int]:
    """
    Get discounts by merging local and Supabase (Supabase takes precedence).
    Returns (discounts_list, status_code)
    """
    try:
        supabase_discounts = get_supabase_discounts()
        local_discounts = get_local_discounts()

        discounts_map: Dict[str, Dict] = {}

        for item in local_discounts:
            discount_id = item.get("discountId") or item.get("discount_id")
            if discount_id:
                discounts_map[discount_id] = item

        for item in supabase_discounts:
            discount_id = item.get("discountId") or item.get("discount_id")
            if discount_id:
                discounts_map[discount_id] = item

        final_discounts = list(discounts_map.values())
        final_discounts.sort(
            key=lambda x: x.get("createdAt") or x.get("created_at", ""), reverse=True
        )

        logger.debug(f"Returning {len(final_discounts)} merged discounts")
        return final_discounts, 200
    except Exception as e:
        logger.error(f"Error getting merged discounts: {e}", exc_info=True)
        return [], 500


# ============================================
# BUSINESS LOGIC
# ============================================

def create_discount_request(discount_data: dict) -> Tuple[Optional[str], str, int]:
    """
    Create a new discount request.
    Returns (discount_id, message, status_code)
    """
    try:
        if not discount_data:
            return None, "No discount data provided", 400

        discount_data = convert_camel_to_snake(discount_data)

        if "discount_id" not in discount_data:
            discount_data["discount_id"] = f"DISC-{uuid.uuid4().hex[:12].upper()}"

        now_naive = datetime.now().isoformat()
        if "created_at" not in discount_data:
            discount_data["created_at"] = now_naive
        discount_data["updated_at"] = now_naive

        if "status" not in discount_data:
            discount_data["status"] = "pending"

        discounts = get_discounts_data()
        existing_idx = next(
            (i for i, d in enumerate(discounts) if d.get("discount_id") == discount_data["discount_id"]),
            -1,
        )
        if existing_idx >= 0:
            discounts[existing_idx] = discount_data
        else:
            discounts.append(discount_data)
        save_discounts_data(discounts)

        try:
            client = db.client
            client.table("discounts").upsert(discount_data).execute()
        except Exception as supabase_error:
            logger.warning(
                f"Discount {discount_data['discount_id']} saved locally; Supabase sync deferred: {supabase_error}"
            )
            _create_discount_notification(discount_data)
            return discount_data["discount_id"], "Discount saved locally and queued for sync", 201

        _create_discount_notification(discount_data)
        logger.info(f"Discount request created {discount_data['discount_id']}")
        return discount_data["discount_id"], "Discount request created", 201
    except Exception as e:
        logger.error(f"Error creating discount request: {e}", exc_info=True)
        return None, str(e), 500


def update_discount_status(discount_id: str, status: str, approved_by: Optional[str] = None) -> Tuple[bool, str, int]:
    """
    Update discount request status.
    Returns (success, message, status_code)
    """
    try:
        if not status:
            return False, "No status provided", 400

        update_data = {"status": status, "updated_at": datetime.now().isoformat()}
        if approved_by:
            update_data["approved_by"] = approved_by

        discounts = get_discounts_data()
        discount_index = next(
            (
                i
                for i, d in enumerate(discounts)
                if d.get("discount_id") == discount_id
                or d.get("discountId") == discount_id
            ),
            -1,
        )

        local_updated = False
        if discount_index != -1:
            discounts[discount_index].update(update_data)
            # normalize key in case older entries used camelCase id key
            discounts[discount_index]["discount_id"] = discount_id
            save_discounts_data(discounts)
            local_updated = True

        supabase_updated = False
        try:
            client = db.client
            response = (
                client.table("discounts")
                .update(update_data)
                .eq("discount_id", discount_id)
                .execute()
            )
            supabase_updated = bool(response.data)
            if not supabase_updated:
                logger.warning(f"No rows updated in Supabase for discount_id {discount_id}")
        except Exception as supabase_error:
            logger.warning(
                f"Supabase update deferred for discount {discount_id}: {supabase_error}"
            )

        if not local_updated and supabase_updated:
            # keep local JSON aligned even if entry was missing locally
            discounts.append({"discount_id": discount_id, **update_data})
            save_discounts_data(discounts)
            local_updated = True

        if not local_updated and not supabase_updated:
            logger.warning(f"Discount {discount_id} not found in local storage or Supabase")
            return False, "Discount not found", 404

        logger.info(f"Discount {discount_id} status updated to {status}")
        return True, "Discount status updated", 200
    except Exception as e:
        logger.error(f"Error updating discount status: {e}", exc_info=True)
        return False, str(e), 500


def delete_discounts(discount_ids: List[str]) -> Tuple[bool, str, int]:
    """
    Delete one or more discounts (local JSON + Supabase).
    Returns (success, message, status_code)
    """
    try:
        if not discount_ids:
            return False, "No discount ids provided", 400

        # Update local JSON
        discounts = get_discounts_data()
        remaining = [d for d in discounts if d.get("discount_id") not in discount_ids]
        if len(remaining) == len(discounts):
            return False, "No matching discounts found", 404

        save_discounts_data(remaining)

        # Remove from Supabase (best-effort)
        try:
            client = db.client
            client.table("discounts").delete().in_("discount_id", discount_ids).execute()
        except Exception as supabase_error:
            logger.error(f"Error deleting discounts from Supabase: {supabase_error}")

        logger.info(f"Deleted {len(discounts) - len(remaining)} discount(s)")
        return True, "Discount(s) deleted", 200
    except Exception as e:
        logger.error(f"Error deleting discounts: {e}", exc_info=True)
        return False, str(e), 500
