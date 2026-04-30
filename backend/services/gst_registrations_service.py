"""
GST Registrations Service
CRUD for the gst_registrations table (one row per GST number / state pair).

Each store has exactly one gst_registration_id (NOT NULL FK), so deletes
must verify no store still references the row.
"""

import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from utils.supabase_db import db
from utils.supabase_resilience import (
    execute_with_retry,
    is_circuit_open_error,
    is_transient_supabase_error,
)
from utils.json_helpers import (
    get_gst_registrations_data,
    save_gst_registrations_data,
    get_stores_data,
)

logger = logging.getLogger(__name__)

_TABLE = "gst_registrations"
_ALLOWED_COLUMNS = {"gst_number", "state"}


def _now_iso() -> str:
    return datetime.now().isoformat()


# ============================================
# READ
# ============================================

def get_local_gst_registrations() -> List[Dict]:
    try:
        return get_gst_registrations_data() or []
    except Exception as e:
        logger.error(f"Error reading local GST registrations: {e}", exc_info=True)
        return []


def get_supabase_gst_registrations() -> List[Dict]:
    try:
        client = db.client
        response = execute_with_retry(
            lambda: client.table(_TABLE).select("*").order("created_at"),
            _TABLE,
        )
        return response.data or []
    except Exception as e:
        if is_circuit_open_error(e):
            logger.info("Supabase circuit open while fetching GST registrations; using local cache.")
        elif is_transient_supabase_error(e):
            logger.warning(f"Transient Supabase error fetching GST registrations; using local cache: {e}")
        else:
            logger.error(f"Error fetching GST registrations from Supabase: {e}", exc_info=True)
        return []


def list_gst_registrations() -> Tuple[List[Dict], int]:
    """Source of truth is Supabase; fall back to local cache when offline."""
    rows = get_supabase_gst_registrations()
    if rows:
        try:
            save_gst_registrations_data(rows)
        except Exception as cache_err:
            logger.warning(f"Failed to refresh GST registrations local cache: {cache_err}")
        return rows, 200
    return get_local_gst_registrations(), 200


# ============================================
# WRITE
# ============================================

def _validate_payload(data: dict) -> Optional[str]:
    gst = (data.get("gst_number") or "").strip()
    state = (data.get("state") or "").strip()
    if not gst:
        return "gst_number is required"
    if not state:
        return "state is required"
    return None


def create_gst_registration(payload: dict) -> Tuple[Optional[Dict], str, int]:
    if not payload:
        return None, "No data provided", 400

    error = _validate_payload(payload)
    if error:
        return None, error, 400

    row = {
        "id": payload.get("id") or f"gst-{uuid.uuid4()}",
        "gst_number": payload["gst_number"].strip(),
        "state": payload["state"].strip(),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }

    rows = get_local_gst_registrations()
    if any(r.get("gst_number") == row["gst_number"] for r in rows):
        return None, f"GST number '{row['gst_number']}' already exists", 409

    rows.append(row)
    save_gst_registrations_data(rows)

    try:
        db.client.table(_TABLE).insert(row).execute()
    except Exception as supabase_error:
        logger.warning(
            f"GST registration {row['id']} saved locally; Supabase sync deferred: {supabase_error}"
        )
        return row, "GST registration saved locally and queued for sync", 201

    return row, "GST registration created", 201


def update_gst_registration(reg_id: str, payload: dict) -> Tuple[bool, str, int]:
    if not payload:
        return False, "No update data provided", 400

    update = {k: v for k, v in payload.items() if k in _ALLOWED_COLUMNS}
    if not update:
        return False, "No valid fields provided", 400

    if "gst_number" in update:
        update["gst_number"] = (update["gst_number"] or "").strip()
        if not update["gst_number"]:
            return False, "gst_number cannot be empty", 400
    if "state" in update:
        update["state"] = (update["state"] or "").strip()
        if not update["state"]:
            return False, "state cannot be empty", 400

    update["updated_at"] = _now_iso()

    rows = get_local_gst_registrations()
    idx = next((i for i, r in enumerate(rows) if r.get("id") == reg_id), -1)

    # Uniqueness guard on gst_number against any other row
    if "gst_number" in update:
        if any(r.get("id") != reg_id and r.get("gst_number") == update["gst_number"] for r in rows):
            return False, f"GST number '{update['gst_number']}' already exists", 409

    try:
        db.client.table(_TABLE).update(update).eq("id", reg_id).execute()
    except Exception as supabase_error:
        logger.warning(
            f"Supabase update failed for GST registration {reg_id}; applying local fallback: {supabase_error}"
        )
        if idx != -1:
            rows[idx].update(update)
            save_gst_registrations_data(rows)
            return True, "GST registration saved locally (offline fallback)", 202
        return False, "GST registration not found", 404

    if idx != -1:
        rows[idx].update(update)
        save_gst_registrations_data(rows)

    return True, "GST registration updated", 200


def delete_gst_registration(reg_id: str) -> Tuple[bool, str, int]:
    """Reject delete if any store still references this GST."""
    client = db.client

    # Block on remote first; fall back to local check if Supabase is unreachable.
    try:
        ref_resp = (
            client.table("stores")
            .select("id")
            .eq("gst_registration_id", reg_id)
            .limit(1)
            .execute()
        )
        if ref_resp.data:
            return False, "Cannot delete: this GST is assigned to one or more stores. Reassign them first.", 409
    except Exception as e:
        logger.warning(f"Remote reference check failed for GST {reg_id}; using local check: {e}")
        local_stores = get_stores_data() or []
        if any(s.get("gst_registration_id") == reg_id for s in local_stores):
            return False, "Cannot delete: this GST is assigned to one or more stores. Reassign them first.", 409

    try:
        client.table(_TABLE).delete().eq("id", reg_id).execute()
    except Exception as e:
        logger.error(f"Failed to delete GST registration {reg_id} from Supabase: {e}", exc_info=True)
        return False, str(e), 500

    rows = get_local_gst_registrations()
    rows = [r for r in rows if r.get("id") != reg_id]
    save_gst_registrations_data(rows)

    return True, "GST registration deleted", 200
