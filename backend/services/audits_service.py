"""
Audits Service
Business logic for store physical-count audits and post-audit reconciliation.

Storage: Supabase (store_audits / store_audit_items) as the source of truth,
mirrored to local JSON for offline reads — mirroring the rest of the app.
"""

import logging
import os
import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from utils.supabase_db import db
from utils.supabase_resilience import execute_with_retry, is_transient_supabase_error
from config import Config
from services import stores_service

logger = logging.getLogger(__name__)

VALID_OUTCOMES = {"verified", "short", "unscanned", "missing", "found", "over"}
SHORTAGE_ACTIONS = {"sold_offline", "lost", "damaged", "topup_from_owner", "ignore"}
SURPLUS_ACTIONS = {"add_to_store", "allocate_from_owner", "create_order", "flag_only"}


# ============================================
# LOCAL JSON HELPERS
# ============================================

def _read_local(path: str) -> List[Dict]:
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.warning(f"Failed reading local file {path}: {e}")
        return []


def _write_local(path: str, data: List[Dict]) -> None:
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False, default=str)
    except Exception as e:
        logger.warning(f"Failed writing local file {path}: {e}")


# ============================================
# SERIALIZATION (DB <-> frontend shape)
# ============================================

def _audit_to_api(row: Dict, items: List[Dict]) -> Dict:
    """Map a store_audits DB row (+ items) to the AuditRecord shape the UI uses."""
    return {
        "id": row.get("id"),
        "storeId": row.get("store_id"),
        "storeName": row.get("store_name"),
        "storeCode": row.get("store_code"),
        "auditedBy": row.get("audited_by"),
        "startedAt": row.get("started_at"),
        "completedAt": row.get("completed_at"),
        "status": row.get("status") or "completed",
        "note": row.get("note"),
        "reconciledAt": row.get("reconciled_at"),
        "reconciledBy": row.get("reconciled_by"),
        "totals": {
            "verifiedLines": row.get("verified_lines") or 0,
            "shortLines": row.get("short_lines") or 0,
            "unscannedLines": row.get("unscanned_lines") or 0,
            "missingLines": row.get("missing_lines") or 0,
            "foundLines": row.get("found_lines") or 0,
            "overCountLines": row.get("over_count_lines") or 0,
            "scannedUnits": row.get("scanned_units") or 0,
            "systemUnits": row.get("system_units") or 0,
            "discrepancyUnits": row.get("discrepancy_units") or 0,
            "discrepancyValue": float(row.get("discrepancy_value") or 0),
            "shortageValue": float(row.get("shortage_value") or 0),
            "surplusValue": float(row.get("surplus_value") or 0),
            "accuracyPct": row.get("accuracy_pct") or 0,
        },
        "items": [_item_to_api(it) for it in items],
    }


def _item_to_api(row: Dict) -> Dict:
    item = {
        "productId": row.get("product_id"),
        "name": row.get("name"),
        "barcode": row.get("barcode"),
        "price": float(row.get("price") or 0),
        "systemQty": row.get("system_qty") or 0,
        "countedQty": row.get("counted_qty") or 0,
        "outcome": row.get("outcome"),
    }
    if row.get("resolution_action"):
        item["resolution"] = {
            "action": row.get("resolution_action"),
            "quantity": row.get("resolution_qty") or 0,
            "amount": float(row["resolution_amount"]) if row.get("resolution_amount") is not None else None,
            "note": row.get("resolution_note"),
        }
    return item


def _header_row_from_payload(audit_id: str, store_id: str, payload: Dict, now_iso: str) -> Dict:
    totals = payload.get("totals") or {}
    return {
        "id": audit_id,
        "store_id": store_id,
        "store_name": payload.get("storeName"),
        "store_code": payload.get("storeCode"),
        "audited_by": payload.get("auditedBy"),
        "started_at": payload.get("startedAt"),
        "completed_at": now_iso,
        "verified_lines": int(totals.get("verifiedLines") or 0),
        "short_lines": int(totals.get("shortLines") or 0),
        "unscanned_lines": int(totals.get("unscannedLines") or 0),
        "missing_lines": int(totals.get("missingLines") or 0),
        "found_lines": int(totals.get("foundLines") or 0),
        "over_count_lines": int(totals.get("overCountLines") or 0),
        "scanned_units": int(totals.get("scannedUnits") or 0),
        "system_units": int(totals.get("systemUnits") or 0),
        "discrepancy_units": int(totals.get("discrepancyUnits") or 0),
        "discrepancy_value": float(totals.get("discrepancyValue") or 0),
        "shortage_value": float(totals.get("shortageValue") or 0),
        "surplus_value": float(totals.get("surplusValue") or 0),
        "accuracy_pct": int(totals.get("accuracyPct") or 0),
        "status": "completed",
        "note": payload.get("note"),
        "created_at": now_iso,
        "updated_at": now_iso,
    }


def _item_rows_from_payload(audit_id: str, items: List[Dict], now_iso: str) -> List[Dict]:
    rows: List[Dict] = []
    for it in items or []:
        outcome = it.get("outcome")
        if outcome not in VALID_OUTCOMES:
            outcome = "unscanned"
        price = float(it.get("price") or 0)
        counted = int(it.get("countedQty") or 0)
        rows.append({
            "id": str(uuid.uuid4()),
            "audit_id": audit_id,
            "product_id": it.get("productId"),
            "name": it.get("name"),
            "barcode": it.get("barcode"),
            "system_qty": int(it.get("systemQty") or 0),
            "counted_qty": counted,
            "outcome": outcome,
            "price": price,
            "line_value": round(counted * price, 2),
            "resolved": False,
            "created_at": now_iso,
        })
    return rows


# ============================================
# CREATE
# ============================================

def create_audit(store_id: str, payload: Dict) -> Tuple[Optional[Dict], int]:
    """Persist a completed audit (header + items). Returns the created record."""
    now_iso = datetime.now().isoformat()
    audit_id = f"AUD-{uuid.uuid4().hex[:12].upper()}"
    header = _header_row_from_payload(audit_id, store_id, payload, now_iso)
    item_rows = _item_rows_from_payload(audit_id, payload.get("items") or [], now_iso)

    saved_to_cloud = False
    try:
        client = db.client
        client.table("store_audits").insert(header).execute()
        if item_rows:
            client.table("store_audit_items").insert(item_rows).execute()
        saved_to_cloud = True
    except Exception as e:
        logger.error(f"Cloud insert failed for audit {audit_id}; saving locally only: {e}", exc_info=True)

    # Mirror locally regardless (warm cache / offline fallback).
    try:
        audits = _read_local(Config.STORE_AUDITS_FILE)
        audits.insert(0, header)
        _write_local(Config.STORE_AUDITS_FILE, audits)
        all_items = _read_local(Config.STORE_AUDIT_ITEMS_FILE)
        all_items.extend(item_rows)
        _write_local(Config.STORE_AUDIT_ITEMS_FILE, all_items)
    except Exception as e:
        logger.warning(f"Local mirror failed for audit {audit_id}: {e}")

    logger.info(f"Created audit {audit_id} for store {store_id} (cloud={saved_to_cloud})")
    return _audit_to_api(header, item_rows), 201


# ============================================
# READ
# ============================================

def list_audits(store_id: str) -> Tuple[List[Dict], int]:
    """List audits for a store, newest first (header only — no items)."""
    try:
        client = db.client
        resp = execute_with_retry(
            lambda: client.table("store_audits")
            .select("*")
            .eq("store_id", store_id)
            .order("completed_at", desc=True),
            f"list audits for store {store_id}",
        )
        rows = resp.data if resp and resp.data is not None else []
        return [_audit_to_api(r, []) for r in rows], 200
    except Exception as e:
        if is_transient_supabase_error(e):
            logger.warning(f"Transient error listing audits for {store_id}; using local cache: {e}")
        else:
            logger.error(f"Error listing audits for {store_id}: {e}", exc_info=True)
        rows = [r for r in _read_local(Config.STORE_AUDITS_FILE) if r.get("store_id") == store_id]
        rows.sort(key=lambda r: r.get("completed_at") or "", reverse=True)
        return [_audit_to_api(r, []) for r in rows], 200


def get_audit(audit_id: str) -> Tuple[Optional[Dict], int]:
    """Get one audit header + its line items."""
    try:
        client = db.client
        head_resp = execute_with_retry(
            lambda: client.table("store_audits").select("*").eq("id", audit_id).limit(1),
            f"get audit {audit_id}",
        )
        head_rows = head_resp.data if head_resp and head_resp.data is not None else []
        if not head_rows:
            return _get_audit_local(audit_id)
        items_resp = execute_with_retry(
            lambda: client.table("store_audit_items").select("*").eq("audit_id", audit_id),
            f"get audit items {audit_id}",
        )
        items = items_resp.data if items_resp and items_resp.data is not None else []
        return _audit_to_api(head_rows[0], items), 200
    except Exception as e:
        if is_transient_supabase_error(e):
            logger.warning(f"Transient error getting audit {audit_id}; using local cache: {e}")
        else:
            logger.error(f"Error getting audit {audit_id}: {e}", exc_info=True)
        return _get_audit_local(audit_id)


def _get_audit_local(audit_id: str) -> Tuple[Optional[Dict], int]:
    head = next((r for r in _read_local(Config.STORE_AUDITS_FILE) if r.get("id") == audit_id), None)
    if not head:
        return None, 404
    items = [r for r in _read_local(Config.STORE_AUDIT_ITEMS_FILE) if r.get("audit_id") == audit_id]
    return _audit_to_api(head, items), 200


# ============================================
# RECONCILE
# ============================================

def reconcile_audit(audit_id: str, payload: Dict) -> Tuple[Optional[Dict], int, str]:
    """
    Apply reconciliation decisions for an audit: adjust store stock, create
    transfer orders, log damaged events, and record each line's resolution.
    """
    resolutions: Dict[str, Dict] = payload.get("resolutions") or {}
    reconciled_by = payload.get("reconciledBy")
    now_iso = datetime.now().isoformat()

    audit, status = get_audit(audit_id)
    if not audit:
        return None, 404, "Audit not found"

    store_id = audit.get("storeId")
    client = db.client

    # Index items by productId for gap/outcome lookups.
    items_by_pid = {it.get("productId"): it for it in audit.get("items", [])}
    product_cache: Dict[str, Optional[Dict]] = {}

    applied = 0
    for product_id, res in resolutions.items():
        action = (res or {}).get("action")
        if not action or action in ("ignore", "flag_only"):
            _record_resolution(client, audit_id, product_id, res, now_iso)
            continue

        item = items_by_pid.get(product_id) or {}
        gap = _line_gap(item)
        try:
            qty = int(res.get("quantity") or 0)
        except (TypeError, ValueError):
            qty = 0
        qty = max(0, min(qty, gap) if gap else qty)

        try:
            _apply_action(client, store_id, product_id, item, action, qty, res, reconciled_by, audit_id, now_iso, product_cache)
            applied += 1
        except Exception as e:
            logger.error(f"Reconcile action '{action}' failed for product {product_id}: {e}", exc_info=True)

        _record_resolution(client, audit_id, product_id, res, now_iso)

    # Mark the audit reconciled.
    head_update = {
        "status": "reconciled",
        "reconciled_at": now_iso,
        "reconciled_by": reconciled_by,
        "updated_at": now_iso,
    }
    try:
        client.table("store_audits").update(head_update).eq("id", audit_id).execute()
    except Exception as e:
        logger.warning(f"Failed cloud update of audit header {audit_id}: {e}")
    _update_local_audit_header(audit_id, head_update)

    logger.info(f"Reconciled audit {audit_id}: {applied} action(s) applied")
    fresh, _ = get_audit(audit_id)
    return fresh, 200, f"{applied} action(s) applied"


def _line_gap(item: Dict) -> int:
    outcome = item.get("outcome")
    system = int(item.get("systemQty") or 0)
    counted = int(item.get("countedQty") or 0)
    if outcome in ("found", "over"):
        return max(0, counted - system)
    return max(0, system - counted)


def _apply_action(client, store_id, product_id, item, action, qty, res, actor, audit_id, now_iso, product_cache):
    """Execute one reconciliation action against live inventory."""
    if action in ("sold_offline", "lost"):
        if qty > 0:
            _adjust_store_inventory(client, store_id, product_id, -qty, item, now_iso)

    elif action == "damaged":
        if qty > 0:
            _adjust_store_inventory(client, store_id, product_id, -qty, item, now_iso)
            _create_damaged_event(client, store_id, product_id, qty, res, actor, audit_id, now_iso)

    elif action == "topup_from_owner":
        if qty > 0:
            # Reuse the existing assignment flow (validates owner stock, creates a
            # pending owner→store transfer order).
            stores_service.assign_products_to_store(
                store_id,
                [{"productId": product_id, "quantity": qty}],
                {"sourceType": "audit", "notes": f"Audit {audit_id} top-up", "createdBy": actor},
            )

    elif action == "add_to_store":
        if qty > 0 and _product_exists(client, product_id, product_cache):
            _adjust_store_inventory(client, store_id, product_id, qty, item, now_iso)

    elif action == "allocate_from_owner":
        if qty > 0 and _product_exists(client, product_id, product_cache):
            _adjust_store_inventory(client, store_id, product_id, qty, item, now_iso)
            _decrement_owner_stock(client, product_id, qty)

    elif action == "create_order":
        if qty > 0 and _product_exists(client, product_id, product_cache):
            stores_service.assign_products_to_store(
                store_id,
                [{"productId": product_id, "quantity": qty}],
                {"sourceType": "audit", "notes": f"Audit {audit_id} found-stock assignment", "createdBy": actor},
            )


def _product_exists(client, product_id: str, cache: Dict[str, Optional[Dict]]) -> bool:
    if product_id in cache:
        return cache[product_id] is not None
    try:
        resp = client.table("products").select("id").eq("id", product_id).limit(1).execute()
        row = (resp.data or [None])[0] if resp else None
        cache[product_id] = row
        return row is not None
    except Exception:
        cache[product_id] = None
        return False


def _adjust_store_inventory(client, store_id, product_id, delta, item, now_iso):
    """Increment/decrement a store's inventory for a product (create row if needed)."""
    resp = client.table("storeinventory").select("*").eq("storeid", store_id).eq("productid", product_id).limit(1).execute()
    rows = resp.data or []
    if rows:
        row = rows[0]
        new_qty = max(0, int(row.get("quantity") or 0) + delta)
        client.table("storeinventory").update({
            "quantity": new_qty,
            "updatedat": now_iso,
        }).eq("id", row.get("id")).execute()
    elif delta > 0:
        client.table("storeinventory").insert({
            "id": str(uuid.uuid4()),
            "storeid": store_id,
            "productid": product_id,
            "quantity": delta,
            "minstocklevel": 0,
            "assignedat": now_iso,
            "updatedat": now_iso,
        }).execute()


def _decrement_owner_stock(client, product_id, qty):
    resp = client.table("products").select("id, stock").eq("id", product_id).limit(1).execute()
    rows = resp.data or []
    if rows:
        new_stock = max(0, int(rows[0].get("stock") or 0) - qty)
        client.table("products").update({"stock": new_stock}).eq("id", product_id).execute()


def _create_damaged_event(client, store_id, product_id, qty, res, actor, audit_id, now_iso):
    client.table("damaged_inventory_events").insert({
        "id": str(uuid.uuid4()),
        "source_type": "audit",
        "source_id": audit_id,
        "reason": (res or {}).get("note") or "Damaged found during audit",
        "quantity": qty,
        "status": "reported",
        "store_id": store_id,
        "product_id": product_id,
        "reported_by": actor,
        "created_at": now_iso,
        "updated_at": now_iso,
    }).execute()


def _record_resolution(client, audit_id, product_id, res, now_iso):
    """Persist the chosen resolution onto the audit item row (cloud + local)."""
    res = res or {}
    update = {
        "resolution_action": res.get("action"),
        "resolution_qty": int(res.get("quantity") or 0),
        "resolution_amount": res.get("amount"),
        "resolution_note": res.get("note"),
        "resolved": res.get("action") not in (None, "ignore", "flag_only"),
    }
    try:
        client.table("store_audit_items").update(update).eq("audit_id", audit_id).eq("product_id", product_id).execute()
    except Exception as e:
        logger.warning(f"Failed cloud resolution update ({audit_id}/{product_id}): {e}")

    # Mirror to local items file.
    try:
        items = _read_local(Config.STORE_AUDIT_ITEMS_FILE)
        changed = False
        for row in items:
            if row.get("audit_id") == audit_id and row.get("product_id") == product_id:
                row.update(update)
                changed = True
        if changed:
            _write_local(Config.STORE_AUDIT_ITEMS_FILE, items)
    except Exception as e:
        logger.warning(f"Failed local resolution mirror ({audit_id}/{product_id}): {e}")


def _update_local_audit_header(audit_id: str, update: Dict) -> None:
    try:
        audits = _read_local(Config.STORE_AUDITS_FILE)
        changed = False
        for row in audits:
            if row.get("id") == audit_id:
                row.update(update)
                changed = True
        if changed:
            _write_local(Config.STORE_AUDITS_FILE, audits)
    except Exception as e:
        logger.warning(f"Failed local audit header mirror {audit_id}: {e}")
