"""
Admin-side service for store -> admin RETURN ORDERS (returns + return_products).

Flow:
  - The store submits a return order (handled by the store app).
  - The admin lists incoming orders, opens one, and scans each product to verify it.
  - On verify: the goods physically left the store, so we reduce the source store's
    inventory AND the global product stock (the items are now "with admin", tracked
    only by return_products.holding_status, so they no longer count as sellable).
  - Damaged lines are surfaced on the existing Damage page (store_damage_returns);
    everything else is held "with admin", ready to be sent to a store later.
"""
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from utils.supabase_db import db

logger = logging.getLogger(__name__)

# Reason types routed to the Damage page on verify; anything else is held with admin.
DAMAGE_REASON_TYPES = {"damaged"}


def _now() -> str:
    return datetime.now().isoformat()


def _adjust_store_inventory(client, store_id, product_id, delta, now_iso):
    """Increment/decrement a store's inventory for a product (create row if needed)."""
    resp = (
        client.table("storeinventory")
        .select("*")
        .eq("storeid", store_id)
        .eq("productid", product_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if rows:
        row = rows[0]
        new_qty = max(0, int(row.get("quantity") or 0) + delta)
        client.table("storeinventory").update(
            {"quantity": new_qty, "updatedat": now_iso}
        ).eq("id", row.get("id")).execute()
    elif delta > 0:
        client.table("storeinventory").insert(
            {
                "id": str(uuid.uuid4()),
                "storeid": store_id,
                "productid": product_id,
                "quantity": delta,
                "minstocklevel": 0,
                "assignedat": now_iso,
                "updatedat": now_iso,
            }
        ).execute()


def _decrement_owner_stock(client, product_id, qty, now_iso):
    resp = client.table("products").select("id, stock").eq("id", product_id).limit(1).execute()
    rows = resp.data or []
    if rows:
        new_stock = max(0, int(rows[0].get("stock") or 0) - qty)
        client.table("products").update({"stock": new_stock, "updatedat": now_iso}).eq("id", product_id).execute()


def _attach_lines(headers: List[Dict], client) -> List[Dict]:
    """Attach return_products (with product info) and store name under each header."""
    ids = [str(h.get("return_id")) for h in headers if h.get("return_id")]
    by_return: Dict[str, List[Dict]] = {}
    if ids:
        lines_resp = (
            client.table("return_products")
            .select("*, products(id, name, barcode, selling_price)")
            .in_("return_id", ids)
            .execute()
        )
        for ln in (lines_resp.data or []):
            by_return.setdefault(str(ln.get("return_id")), []).append(ln)

    store_ids = list({str(h.get("store_id")) for h in headers if h.get("store_id")})
    stores_by_id: Dict[str, Dict] = {}
    if store_ids:
        st = client.table("stores").select("id, name").in_("id", store_ids).execute()
        stores_by_id = {str(s.get("id")): s for s in (st.data or [])}

    result = []
    for h in headers:
        result.append(
            {
                **h,
                "stores": stores_by_id.get(str(h.get("store_id"))),
                "return_products": by_return.get(str(h.get("return_id")), []),
            }
        )
    return result


def list_return_orders(admin_status: Optional[str] = None, limit: int = 200) -> Tuple[List[Dict], int]:
    try:
        client = db.client
        q = client.table("returns").select("*").eq("return_type", "store_to_admin")
        if admin_status:
            q = q.eq("admin_status", admin_status)
        resp = q.order("created_at", desc=True).limit(limit).execute()
        return _attach_lines(resp.data or [], client), 200
    except Exception as e:
        logger.error(f"Error listing return orders: {e}", exc_info=True)
        return [], 500


def get_return_order(return_id: str) -> Tuple[Optional[Dict], int]:
    try:
        client = db.client
        resp = (
            client.table("returns")
            .select("*")
            .eq("return_id", return_id)
            .eq("return_type", "store_to_admin")
            .limit(1)
            .execute()
        )
        if not resp.data:
            return None, 404
        return _attach_lines(resp.data, client)[0], 200
    except Exception as e:
        logger.error(f"Error getting return order {return_id}: {e}", exc_info=True)
        return None, 500


def verify_return_order(return_id: str, payload: Dict[str, Any], actor: Optional[str]) -> Tuple[bool, str, int]:
    """Verify a return order.

    payload = { items: [ { line_id, verified_qty, verify_status, reason_type } ] }
      verify_status: 'verified' | 'unsent' (missing) | 'oversend' (extra)
    """
    try:
        client = db.client
        now_iso = _now()

        order_resp = client.table("returns").select("*").eq("return_id", return_id).limit(1).execute()
        if not order_resp.data:
            return False, "Return order not found", 404
        order = order_resp.data[0]
        store_id = order.get("store_id")

        lines_resp = client.table("return_products").select("*").eq("return_id", return_id).execute()
        lines_by_id = {str(l.get("id")): l for l in (lines_resp.data or [])}

        for decision in (payload.get("items") or []):
            line_id = str(decision.get("line_id") or decision.get("id") or "")
            line = lines_by_id.get(line_id)
            if not line:
                continue

            verify_status = (decision.get("verify_status") or "verified").strip().lower()
            reason_type = (decision.get("reason_type") or line.get("reason_type") or "other").strip().lower()
            ordered_qty = int(line.get("quantity") or 0)
            raw_verified = decision.get("verified_qty")
            verified_qty = int(raw_verified) if raw_verified is not None else ordered_qty
            product_id = line.get("product_id")

            update: Dict[str, Any] = {
                "verify_status": verify_status,
                "verified_qty": verified_qty,
                "reason_type": reason_type,
                "verified_by": actor,
                "verified_at": now_iso,
                "updated_at": now_iso,
            }

            if verify_status == "verified" and verified_qty > 0:
                # Goods left the store and are now held by admin: remove from the
                # source store's inventory and from sellable global stock.
                _adjust_store_inventory(client, store_id, product_id, -verified_qty, now_iso)
                _decrement_owner_stock(client, product_id, verified_qty, now_iso)

                if reason_type in DAMAGE_REASON_TYPES:
                    update["holding_status"] = "routed_to_damage"
                    client.table("store_damage_returns").insert(
                        {
                            "id": f"SDR-{uuid.uuid4().hex[:12].upper()}",
                            "store_id": store_id,
                            "product_id": product_id,
                            "quantity": verified_qty,
                            "reason": line.get("reason") or "Damaged (return)",
                            "reason_type": "damaged",
                            "damage_origin": "return",
                            "status": "received_admin",
                            "resolution_status": "pending",
                            "created_by": order.get("created_by"),
                            "created_at": now_iso,
                            "updated_at": now_iso,
                            "notes": f"From return order {return_id}",
                        }
                    ).execute()
                else:
                    update["holding_status"] = "with_admin"
            elif verify_status == "unsent":
                update["holding_status"] = "unsent"
            elif verify_status == "oversend":
                update["holding_status"] = "oversend"

            client.table("return_products").update(update).eq("id", line_id).execute()

        client.table("returns").update(
            {"admin_status": "verified", "updated_at": now_iso}
        ).eq("return_id", return_id).execute()

        return True, "Return order verified", 200
    except Exception as e:
        logger.error(f"Error verifying return order {return_id}: {e}", exc_info=True)
        return False, str(e), 500


def _increment_owner_stock(client, product_id, qty, now_iso):
    resp = client.table("products").select("id, stock").eq("id", product_id).limit(1).execute()
    rows = resp.data or []
    if rows:
        new_stock = int(rows[0].get("stock") or 0) + qty
        client.table("products").update({"stock": new_stock, "updatedat": now_iso}).eq("id", product_id).execute()


def send_holdings_to_store(store_id, items, actor=None, note=None) -> Tuple[bool, str, int, Dict]:
    """Send selected 'with admin' return lines to a store as a transfer order.

    Reuses the standard inventory_transfer_orders/items so the destination store
    verifies them with the existing flow (which adds to its storeinventory). Since
    these units were taken out of global stock when they were returned, we restore
    global product stock here so the accounting balances once the store verifies.
    """
    try:
        client = db.client
        now_iso = _now()
        if not store_id:
            return False, "Destination store is required", 400, {}
        if not items:
            return False, "No items to send", 400, {}

        st = client.table("stores").select("id").eq("id", store_id).limit(1).execute()
        if not st.data:
            return False, "Destination store not found", 404, {}

        line_ids = [str(i.get("line_id") or i.get("id")) for i in items if (i.get("line_id") or i.get("id"))]
        if not line_ids:
            return False, "No valid line ids", 400, {}
        lines_resp = client.table("return_products").select("*").in_("id", line_ids).execute()
        lines_by_id = {str(l.get("id")): l for l in (lines_resp.data or [])}

        order_id = f"TO-{uuid.uuid4().hex[:12].upper()}"
        item_rows = []
        sent_lines = []
        for it in items:
            lid = str(it.get("line_id") or it.get("id") or "")
            line = lines_by_id.get(lid)
            if not line or (line.get("holding_status") or "") != "with_admin":
                continue
            qty = int(line.get("verified_qty") or line.get("quantity") or 0)
            if qty <= 0:
                continue
            item_rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "transfer_order_id": order_id,
                    "product_id": line.get("product_id"),
                    "assigned_qty": qty,
                    "verified_qty": 0,
                    "damaged_qty": 0,
                    "wrong_store_qty": 0,
                    "applied_verified_qty": 0,
                    "status": "pending",
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
            )
            sent_lines.append((line, qty))

        if not item_rows:
            return False, "No eligible items to send (must be held with admin)", 400, {}

        order_row = {
            "id": order_id,
            "store_id": store_id,
            "source_type": "return",
            "source_location_ref": "admin_return",
            "created_by": actor,
            "status": "pending",
            "notes": note or "Return items sent to store",
            "version_number": 1,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        client.table("inventory_transfer_orders").insert(order_row).execute()
        client.table("inventory_transfer_items").insert(item_rows).execute()

        for line, qty in sent_lines:
            _increment_owner_stock(client, line.get("product_id"), qty, now_iso)
            client.table("return_products").update(
                {"holding_status": "sent_out", "updated_at": now_iso}
            ).eq("id", line.get("id")).execute()

        return True, f"Sent {len(item_rows)} item(s) as transfer {order_id}", 200, {
            "orderId": order_id,
            "itemCount": len(item_rows),
        }
    except Exception as e:
        logger.error(f"Error sending holdings to store: {e}", exc_info=True)
        return False, str(e), 500, {}


def set_damage_resolution(row_id: str, action: str, actor: Optional[str] = None) -> Tuple[bool, str, int]:
    """Mark a damaged item Fixed or Discarded (also used to move Discarded -> Fixed).
    No stock movement here — fixed stock re-enters the system only when sent to a store."""
    try:
        client = db.client
        now_iso = _now()
        lookup = client.table("store_damage_returns").select("id").eq("id", row_id).limit(1).execute()
        if not lookup.data:
            return False, "Damaged item not found", 404

        act = (action or "").strip().lower()
        if act == "fix":
            status, resolution = "fixed", "fixed"
        elif act == "discard":
            status, resolution = "discarded", "discarded"
        else:
            return False, "action must be 'fix' or 'discard'", 400

        client.table("store_damage_returns").update(
            {
                "status": status,
                "resolution_status": resolution,
                "resolved_by": actor,
                "resolved_at": now_iso,
                "updated_at": now_iso,
            }
        ).eq("id", row_id).execute()
        return True, f"Item marked {status}", 200
    except Exception as e:
        logger.error(f"Error setting damage resolution {row_id}: {e}", exc_info=True)
        return False, str(e), 500


def send_damaged_to_store(store_id, ids, actor=None, note=None) -> Tuple[bool, str, int, Dict]:
    """Send selected FIXED damaged items to a store as a transfer order (same as the
    'with admin' send: restore global stock, create the transfer, mark them sent)."""
    try:
        client = db.client
        now_iso = _now()
        if not store_id:
            return False, "Destination store is required", 400, {}
        if not ids:
            return False, "No items to send", 400, {}
        st = client.table("stores").select("id").eq("id", store_id).limit(1).execute()
        if not st.data:
            return False, "Destination store not found", 404, {}

        rows_resp = client.table("store_damage_returns").select("*").in_("id", [str(i) for i in ids]).execute()
        rows_by_id = {str(r.get("id")): r for r in (rows_resp.data or [])}

        order_id = f"TO-{uuid.uuid4().hex[:12].upper()}"
        item_rows = []
        sent = []
        for rid in ids:
            row = rows_by_id.get(str(rid))
            if not row or (row.get("status") or "") != "fixed":
                continue
            qty = int(row.get("quantity") or 0)
            if qty <= 0:
                continue
            item_rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "transfer_order_id": order_id,
                    "product_id": row.get("product_id"),
                    "assigned_qty": qty,
                    "verified_qty": 0,
                    "damaged_qty": 0,
                    "wrong_store_qty": 0,
                    "applied_verified_qty": 0,
                    "status": "pending",
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
            )
            sent.append((row, qty))

        if not item_rows:
            return False, "No eligible fixed items to send", 400, {}

        order_row = {
            "id": order_id,
            "store_id": store_id,
            "source_type": "return_fixed",
            "source_location_ref": "admin_damage",
            "created_by": actor,
            "status": "pending",
            "notes": note or "Fixed items sent to store",
            "version_number": 1,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        client.table("inventory_transfer_orders").insert(order_row).execute()
        client.table("inventory_transfer_items").insert(item_rows).execute()

        for row, qty in sent:
            _increment_owner_stock(client, row.get("product_id"), qty, now_iso)
            client.table("store_damage_returns").update(
                {
                    "status": "sent_to_store",
                    "resolution_status": "sent_to_store",
                    "restock_qty": qty,
                    "restock_action": "sent_to_store",
                    "resolved_by": actor,
                    "resolved_at": now_iso,
                    "updated_at": now_iso,
                }
            ).eq("id", row.get("id")).execute()

        return True, f"Sent {len(item_rows)} fixed item(s) as transfer {order_id}", 200, {
            "orderId": order_id,
            "itemCount": len(item_rows),
        }
    except Exception as e:
        logger.error(f"Error sending damaged to store: {e}", exc_info=True)
        return False, str(e), 500, {}


def list_return_holdings(holding_status: str = "with_admin", limit: int = 500) -> Tuple[List[Dict], int]:
    """List return_products lines by holding_status (e.g. with_admin, sent_out)."""
    try:
        client = db.client
        resp = (
            client.table("return_products")
            .select("*, products(id, name, barcode, selling_price)")
            .eq("holding_status", holding_status)
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        return resp.data or [], 200
    except Exception as e:
        logger.error(f"Error listing return holdings ({holding_status}): {e}", exc_info=True)
        return [], 500
