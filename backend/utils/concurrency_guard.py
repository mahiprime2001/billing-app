"""
Concurrency guard helpers for conflict-safe updates.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional


def _pick_first(payload: Dict[str, Any], keys: list[str]) -> Optional[Any]:
    for key in keys:
        if key in payload and payload.get(key) is not None:
            return payload.get(key)
    return None


def extract_base_markers(update_data: Dict[str, Any]) -> tuple[Optional[int], Optional[str]]:
    """
    Extract and remove client base markers from payload.
    Accepted keys:
    - baseVersion / base_version
    - baseUpdatedAt / base_updated_at / baseupdatedat
    """
    base_version_raw = _pick_first(update_data, ["baseVersion", "base_version", "baseversion"])
    base_updated_raw = _pick_first(
        update_data, ["baseUpdatedAt", "base_updated_at", "baseupdatedat", "baseUpdatedat"]
    )

    for key in ["baseVersion", "base_version", "baseversion", "baseUpdatedAt", "base_updated_at", "baseupdatedat", "baseUpdatedat"]:
        update_data.pop(key, None)

    base_version: Optional[int] = None
    if base_version_raw is not None:
        try:
            base_version = int(base_version_raw)
        except (TypeError, ValueError):
            base_version = None

    base_updated_at: Optional[str] = str(base_updated_raw) if base_updated_raw is not None else None
    return base_version, base_updated_at


def safe_update_with_conflict_check(
    client: Any,
    *,
    table_name: str,
    id_column: str,
    record_id: str,
    update_payload: Dict[str, Any],
    updated_at_column: str,
    base_version: Optional[int] = None,
    base_updated_at: Optional[str] = None,
    version_column: str = "version",
) -> Dict[str, Any]:
    """
    Perform conflict-safe update:
    - Prefer version-based update when base_version provided.
    - Fallback to updated_at compare when base_updated_at provided.
    Returns: {"ok": bool, "conflict": bool, "data": dict|None, "message": str}
    """
    # Always stamp update time server-side.
    now_iso = datetime.now().isoformat()
    update_payload[updated_at_column] = now_iso

    if base_version is not None:
        payload = dict(update_payload)
        payload[version_column] = base_version + 1
        resp = (
            client.table(table_name)
            .update(payload)
            .eq(id_column, record_id)
            .eq(version_column, base_version)
            .execute()
        )
        if resp.data:
            return {"ok": True, "conflict": False, "data": resp.data[0], "message": "updated"}

    elif base_updated_at:
        resp = (
            client.table(table_name)
            .update(update_payload)
            .eq(id_column, record_id)
            .eq(updated_at_column, base_updated_at)
            .execute()
        )
        if resp.data:
            return {"ok": True, "conflict": False, "data": resp.data[0], "message": "updated"}

    else:
        latest = client.table(table_name).select("*").eq(id_column, record_id).limit(1).execute()
        latest_row = latest.data[0] if latest.data else None
        return {
            "ok": False,
            "conflict": True,
            "data": latest_row,
            "message": "Missing baseVersion/baseUpdatedAt. Refetch latest row before update.",
        }

    latest = client.table(table_name).select("*").eq(id_column, record_id).limit(1).execute()
    latest_row = latest.data[0] if latest.data else None
    return {
        "ok": False,
        "conflict": True,
        "data": latest_row,
        "message": "Conflict detected: record changed in another app/session.",
    }
