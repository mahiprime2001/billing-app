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
        transformed = [convert_snake_to_camel(item) for item in discounts]
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

        client = db.client
        response = client.table("discounts").insert(discount_data).execute()
        if not response.data:
            return None, "Failed to insert discount into Supabase", 500

        discounts = get_discounts_data()
        discounts.append(discount_data)
        save_discounts_data(discounts)

        logger.info(f"Discount request created {discount_data['discount_id']}")
        return discount_data["discount_id"], "Discount request created", 201
    except Exception as e:
        logger.error(f"Error creating discount request: {e}", exc_info=True)
        return None, str(e), 500


def update_discount_status(discount_id: str, status: str) -> Tuple[bool, str, int]:
    """
    Update discount request status.
    Returns (success, message, status_code)
    """
    try:
        if not status:
            return False, "No status provided", 400

        discounts = get_discounts_data()
        discount_index = next(
            (i for i, d in enumerate(discounts) if d.get("discount_id") == discount_id),
            -1,
        )

        if discount_index == -1:
            logger.warning(f"Discount {discount_id} not found in local storage")
            return False, "Discount not found", 404

        update_data = {"status": status, "updated_at": datetime.now().isoformat()}

        discounts[discount_index].update(update_data)
        save_discounts_data(discounts)

        try:
            client = db.client
            response = (
                client.table("discounts")
                .update(update_data)
                .eq("discount_id", discount_id)
                .execute()
            )
            if not response.data:
                logger.warning(f"No rows updated in Supabase for discount_id {discount_id}")
        except Exception as supabase_error:
            logger.error(
                f"Error updating Supabase for discount {discount_id}: {supabase_error}"
            )

        logger.info(f"Discount {discount_id} status updated to {status}")
        return True, "Discount status updated", 200
    except Exception as e:
        logger.error(f"Error updating discount status: {e}", exc_info=True)
        return False, str(e), 500
