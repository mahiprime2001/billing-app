"""
HSN Codes Service
Handles all HSN code-related business logic and database operations
"""
import logging
from datetime import datetime
from typing import List, Dict, Optional, Tuple

from utils.supabase_db import db
from utils.json_helpers import get_hsn_codes_data, save_hsn_codes_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

logger = logging.getLogger(__name__)


def _is_numeric_id(value) -> bool:
    if value is None:
        return False
    return str(value).strip().isdigit()


def _resolve_supabase_hsn_id(hsn_id: str, local_row: Optional[Dict] = None) -> Optional[int]:
    """Resolve incoming HSN id (possibly legacy local UUID) to Supabase numeric id."""
    raw = str(hsn_id).strip()
    if _is_numeric_id(raw):
        return int(raw)

    hsn_code_text = ""
    if local_row:
        hsn_code_text = str(local_row.get("hsn_code") or local_row.get("hsnCode") or "").strip()

    if hsn_code_text:
        client = db.client
        resp = client.table("hsn_codes").select("id").eq("hsn_code", hsn_code_text).limit(1).execute()
        if resp.data:
            code_id = resp.data[0].get("id")
            if _is_numeric_id(code_id):
                return int(code_id)
    return None


# ============================================
# LOCAL JSON OPERATIONS
# ============================================

def get_local_hsn_codes() -> List[Dict]:
    """Get HSN codes from local JSON storage"""
    try:
        hsn_codes = get_hsn_codes_data()
        transformed = [convert_snake_to_camel(code) for code in hsn_codes]
        logger.debug(f"Returning {len(transformed)} HSN codes from local JSON.")
        return transformed
    except Exception as e:
        logger.error(f"Error getting local HSN codes: {e}", exc_info=True)
        return []


# ============================================
# SUPABASE OPERATIONS
# ============================================

def get_supabase_hsn_codes() -> List[Dict]:
    """Get HSN codes directly from Supabase"""
    try:
        client = db.client
        response = client.table("hsn_codes").select("*").execute()
        hsn_codes = response.data or []
        transformed = [convert_snake_to_camel(code) for code in hsn_codes]
        logger.debug(f"Returning {len(transformed)} HSN codes from Supabase.")
        return transformed
    except Exception as e:
        logger.error(f"Error getting Supabase HSN codes: {e}", exc_info=True)
        return []


# ============================================
# MERGED OPERATIONS
# ============================================

def get_merged_hsn_codes() -> Tuple[List[Dict], int]:
    """
    Get HSN codes by merging local and Supabase (Supabase takes precedence).
    Returns (hsn_codes_list, status_code)
    """
    try:
        supabase_codes = get_supabase_hsn_codes()
        local_codes = get_local_hsn_codes()

        codes_map = {}
        # Only include local rows that have numeric ids; UUID-only local ids cannot be used
        # as products.hsn_code_id in Supabase (bigint FK).
        for code in local_codes:
            if _is_numeric_id(code.get("id")):
                codes_map[str(code["id"])] = code

        for code in supabase_codes:
            if code.get("id") is not None:
                codes_map[str(code["id"])] = code

        final_codes = list(codes_map.values())
        final_codes.sort(key=lambda x: x.get("createdAt", ""), reverse=True)

        logger.debug(f"Returning {len(final_codes)} merged HSN codes")
        return final_codes, 200
    except Exception as e:
        logger.error(f"Error getting merged HSN codes: {e}", exc_info=True)
        return [], 500


# ============================================
# BUSINESS LOGIC
# ============================================

def create_hsn_code(hsn_data: dict) -> Tuple[Optional[str], str, int]:
    """
    Create a new HSN code.
    Returns (hsn_code_id, message, status_code)
    """
    try:
        if not hsn_data:
            return None, "No HSN code data provided", 400

        hsn_data = convert_camel_to_snake(hsn_data)

        tax_value = hsn_data.get("tax", 0)
        try:
            hsn_data["tax"] = float(tax_value)
        except (TypeError, ValueError):
            return None, "Invalid tax value", 400

        now_naive = datetime.now().isoformat()
        if "created_at" not in hsn_data:
            hsn_data["created_at"] = now_naive
        hsn_data["updated_at"] = now_naive

        try:
            client = db.client
            # Let Supabase assign canonical numeric id when missing.
            payload = dict(hsn_data)
            if not _is_numeric_id(payload.get("id")):
                payload.pop("id", None)
            response = client.table("hsn_codes").insert(payload).execute()
            inserted = (response.data or [None])[0]
            if not inserted:
                return None, "Failed to create HSN code in Supabase", 500
        except Exception as supabase_error:
            logger.warning(
                f"HSN code create deferred from Supabase: {supabase_error}"
            )
            # Offline fallback: keep local temporary row but mark id as local-only.
            temp = dict(hsn_data)
            if not temp.get("id"):
                temp["id"] = f"local-{datetime.now().timestamp()}"
            hsn_codes = get_hsn_codes_data()
            hsn_codes.append(temp)
            save_hsn_codes_data(hsn_codes)
            return str(temp.get("id")), "HSN code saved locally and queued for sync", 201

        # Keep local cache aligned to Supabase-assigned id.
        hsn_codes = get_hsn_codes_data()
        existing_idx = next((i for i, h in enumerate(hsn_codes) if str(h.get("id")) == str(inserted.get("id"))), -1)
        if existing_idx >= 0:
            hsn_codes[existing_idx] = inserted
        else:
            hsn_codes.append(inserted)
        save_hsn_codes_data(hsn_codes)

        logger.info(f"HSN code created {inserted.get('id')}")
        return str(inserted.get("id")), "HSN code created", 201

    except Exception as e:
        logger.error(f"Error creating HSN code: {e}", exc_info=True)
        return None, str(e), 500


def update_hsn_code(hsn_id: str, update_data: dict) -> Tuple[bool, str, int]:
    """
    Update an HSN code.
    Returns (success, message, status_code)
    """
    try:
        if not update_data:
            return False, "No update data provided", 400

        update_data = convert_camel_to_snake(update_data)
        if "tax" in update_data:
            try:
                update_data["tax"] = float(update_data.get("tax", 0))
            except (TypeError, ValueError):
                return False, "Invalid tax value", 400
        update_data["updated_at"] = datetime.now().isoformat()

        hsn_codes = get_hsn_codes_data()
        hsn_index = next((i for i, c in enumerate(hsn_codes) if str(c.get("id")) == str(hsn_id)), -1)
        if hsn_index == -1:
            return False, "HSN code not found", 404

        local_row = dict(hsn_codes[hsn_index])
        merged_row = dict(local_row)
        merged_row.update(update_data)

        client = db.client
        supabase_id = _resolve_supabase_hsn_id(hsn_id, local_row=local_row)

        if supabase_id is not None:
            client.table("hsn_codes").update(update_data).eq("id", supabase_id).execute()
            # Keep local id aligned with Supabase canonical numeric id.
            merged_row["id"] = supabase_id
        else:
            # Row exists only locally (legacy/offline). Create it in Supabase now,
            # then continue using the canonical numeric id.
            create_payload = {
                "hsn_code": merged_row.get("hsn_code"),
                "tax": merged_row.get("tax", 0),
                "created_at": merged_row.get("created_at") or datetime.now().isoformat(),
                "updated_at": merged_row.get("updated_at"),
            }
            create_payload.pop("id", None)
            inserted_resp = client.table("hsn_codes").insert(create_payload).execute()
            inserted = (inserted_resp.data or [None])[0]
            if not inserted or not _is_numeric_id(inserted.get("id")):
                return False, "Failed to sync HSN code to Supabase", 500
            merged_row["id"] = int(inserted["id"])

        hsn_codes[hsn_index] = merged_row
        save_hsn_codes_data(hsn_codes)

        logger.info(f"HSN code updated {hsn_id}")
        return True, "HSN code updated", 200

    except Exception as e:
        logger.error(f"Error updating HSN code: {e}", exc_info=True)
        return False, str(e), 500


def delete_hsn_code(hsn_id: str) -> Tuple[bool, str, int]:
    """
    Delete an HSN code.
    Returns (success, message, status_code)
    """
    try:
        hsn_codes = get_hsn_codes_data()
        hsn_index = next((i for i, c in enumerate(hsn_codes) if str(c.get("id")) == str(hsn_id)), -1)
        if hsn_index == -1:
            return False, "HSN code not found", 404

        local_row = hsn_codes[hsn_index]

        client = db.client
        supabase_id = _resolve_supabase_hsn_id(hsn_id, local_row=local_row)
        if supabase_id is not None:
            client.table("hsn_codes").delete().eq("id", supabase_id).execute()

        # Remove from local cache regardless (for local-only legacy rows too).
        hsn_codes.pop(hsn_index)
        save_hsn_codes_data(hsn_codes)

        logger.info(f"HSN code deleted {hsn_id}")
        return True, "HSN code deleted", 200

    except Exception as e:
        msg = str(e)
        if "foreign key" in msg.lower() or "violates" in msg.lower():
            return False, "Cannot delete HSN code because it is used by products", 409
        logger.error(f"Error deleting HSN code: {e}", exc_info=True)
        return False, str(e), 500
