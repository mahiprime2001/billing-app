"""
Orders Service
Dedicated transfer-order business logic (online + local fallback).
"""

import json
import logging
import os
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from config import Config
from utils.json_helpers import (
    get_batches_data,
    get_inventory_transfer_items_data,
    get_inventory_transfer_orders_data,
    get_inventory_transfer_scans_data,
    get_inventory_transfer_verifications_data,
    get_orders_data,
    get_products_data,
    save_inventory_transfer_items_data,
    save_inventory_transfer_orders_data,
    save_orders_data,
)
from utils.json_utils import convert_snake_to_camel
from utils.supabase_db import db
from utils.supabase_resilience import execute_with_retry, is_transient_supabase_error

logger = logging.getLogger(__name__)

TRANSFER_ACTIVE_STATUSES = ["pending", "in_progress"]


def _chunked(values: List[str], size: int) -> List[List[str]]:
    return [values[i : i + size] for i in range(0, len(values), size)]


def _derive_item_state(item: Dict[str, Any]) -> str:
    assigned = int(item.get("assigned_qty") or 0)
    verified = int(item.get("verified_qty") or 0)
    damaged = int(item.get("damaged_qty") or 0)
    wrong_store = int(item.get("wrong_store_qty") or 0)
    processed = verified + damaged + wrong_store
    if processed <= 0:
        return "pending"
    if processed >= assigned:
        return "closed_with_issues" if (damaged > 0 or wrong_store > 0) else "completed"
    return "in_progress"


def _upsert_orders_local_cache(orders: List[Dict[str, Any]]) -> None:
    """Merge latest API rows into orders.json cache."""
    try:
        existing = get_orders_data()
        order_map: Dict[str, Dict] = {}
        for row in existing:
            oid = str(row.get("id") or "").strip()
            if oid:
                order_map[oid] = row
        for row in orders:
            oid = str(row.get("id") or "").strip()
            if oid:
                order_map[oid] = row
        save_orders_data(list(order_map.values()))
    except Exception as cache_err:
        logger.warning(f"Failed to update orders local cache: {cache_err}")


def _upsert_inventory_transfer_local_cache(orders: List[Dict[str, Any]], items: List[Dict[str, Any]]) -> None:
    """
    Keep normalized transfer order/item JSON caches fresh for offline details.
    """
    try:
        existing_orders = get_inventory_transfer_orders_data()
        order_map: Dict[str, Dict[str, Any]] = {
            str(row.get("id")): row for row in existing_orders if row.get("id")
        }
        for row in orders:
            oid = str(row.get("id") or "").strip()
            if oid:
                order_map[oid] = row
        save_inventory_transfer_orders_data(list(order_map.values()))
    except Exception as cache_err:
        logger.warning(f"Failed to update inventory_transfer_orders.json cache: {cache_err}")

    try:
        existing_items = get_inventory_transfer_items_data()
        item_map: Dict[str, Dict[str, Any]] = {
            str(row.get("id")): row for row in existing_items if row.get("id")
        }
        for row in items:
            iid = str(row.get("id") or "").strip()
            if iid:
                item_map[iid] = row
        save_inventory_transfer_items_data(list(item_map.values()))
    except Exception as cache_err:
        logger.warning(f"Failed to update inventory_transfer_items.json cache: {cache_err}")


def _upsert_transfer_order_detail_cache(order_row: Dict[str, Any], items: List[Dict[str, Any]]) -> None:
    """
    Persist single-order detail payload into normalized transfer JSON files.
    """
    try:
        _upsert_inventory_transfer_local_cache([order_row], items)
    except Exception as cache_err:
        logger.warning(f"Failed to persist transfer detail cache for order {order_row.get('id')}: {cache_err}")


def _filter_local_orders(
    rows: List[Dict[str, Any]],
    store_id: Optional[str] = None,
    status: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    out = rows
    if store_id and str(store_id).lower() != "all":
        out = [row for row in out if str(row.get("storeId") or row.get("store_id") or row.get("storeid")) == str(store_id)]
    if status:
        status_norm = str(status).strip().lower()
        out = [row for row in out if str(row.get("status") or "").strip().lower() == status_norm]
    if from_date:
        out = [row for row in out if str(row.get("createdAt") or row.get("created_at") or "") >= from_date]
    if to_date:
        out = [row for row in out if str(row.get("createdAt") or row.get("created_at") or "") <= to_date]
    out.sort(key=lambda x: x.get("createdAt") or x.get("created_at") or "", reverse=True)
    if isinstance(limit, int) and limit > 0:
        out = out[:limit]
    return out


def _build_local_order_summaries(
    store_id: Optional[str] = None,
    status: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: Optional[int] = None,
) -> List[Dict]:
    """
    Build order summaries from optional normalized local transfer JSON files.
    """
    order_rows = get_inventory_transfer_orders_data()
    item_rows = get_inventory_transfer_items_data()
    products = get_products_data()
    batches = get_batches_data()
    batch_map: Dict[str, str] = {}
    for b in batches:
        bid = str(b.get("id") or "").strip()
        if bid:
            batch_map[bid] = str(b.get("batch_number") or b.get("batchNumber") or "")

    price_map: Dict[str, float] = {}
    product_meta_map: Dict[str, Dict[str, Any]] = {}
    for p in products:
        pid = str(p.get("id") or "").strip()
        if not pid:
            continue
        price_map[pid] = float(p.get("selling_price") or p.get("sellingPrice") or p.get("price") or 0)
        batch_id = str(p.get("batchid") or p.get("batchId") or "")
        product_meta_map[pid] = {
            "name": p.get("name") or "",
            "barcode": p.get("barcode") or "",
            "batch_number": batch_map.get(batch_id, ""),
        }

    items_by_order: Dict[str, List[Dict]] = defaultdict(list)
    for item in item_rows:
        oid = str(item.get("transfer_order_id") or item.get("transferOrderId") or "")
        if oid:
            items_by_order[oid].append(item)

    out: List[Dict] = []
    for order in order_rows:
        oid = str(order.get("id") or "")
        if not oid:
            continue
        row_store_id = order.get("store_id") or order.get("storeId") or order.get("storeid")
        if store_id and str(store_id).lower() != "all" and str(row_store_id) != str(store_id):
            continue
        created_value = str(order.get("created_at") or order.get("createdAt") or "")
        if from_date and created_value < from_date:
            continue
        if to_date and created_value > to_date:
            continue

        order_items = items_by_order.get(oid, [])
        assigned = sum(int(i.get("assigned_qty") or i.get("assignedQty") or 0) for i in order_items)
        verified = sum(int(i.get("verified_qty") or i.get("verifiedQty") or 0) for i in order_items)
        damaged = sum(int(i.get("damaged_qty") or i.get("damagedQty") or 0) for i in order_items)
        wrong_store = sum(int(i.get("wrong_store_qty") or i.get("wrongStoreQty") or 0) for i in order_items)
        missing = max(0, assigned - verified - damaged - wrong_store)
        pending_products: List[Dict[str, Any]] = []
        product_list: List[Dict[str, str]] = []
        seen_product_ids: set = set()
        total_value = 0.0
        for item in order_items:
            qty = int(item.get("assigned_qty") or item.get("assignedQty") or 0)
            vqty = int(item.get("verified_qty") or item.get("verifiedQty") or 0)
            dqty = int(item.get("damaged_qty") or item.get("damagedQty") or 0)
            wqty = int(item.get("wrong_store_qty") or item.get("wrongStoreQty") or 0)
            mqty = max(0, qty - vqty - dqty - wqty)
            pid = str(item.get("product_id") or item.get("productId") or "")
            total_value += qty * price_map.get(pid, 0.0)
            meta = product_meta_map.get(pid, {})
            if pid and pid not in seen_product_ids:
                seen_product_ids.add(pid)
                product_list.append(
                    {
                        "name": meta.get("name") or "",
                        "barcode": meta.get("barcode") or "",
                        "batch": meta.get("batch_number") or "",
                    }
                )
            if mqty > 0:
                pending_products.append(
                    {
                        "product_id": pid,
                        "assigned_qty": qty,
                        "verified_qty": vqty,
                        "missing_qty": mqty,
                    }
                )

        computed_status = str(order.get("status") or "").lower()
        if computed_status in TRANSFER_ACTIVE_STATUSES and assigned > 0:
            if missing == 0:
                computed_status = "closed_with_issues" if (damaged > 0 or wrong_store > 0) else "completed"
            elif verified > 0 or damaged > 0 or wrong_store > 0:
                computed_status = "in_progress"

        out.append(
            convert_snake_to_camel(
                {
                    **order,
                    "status": computed_status,
                    "assigned_qty_total": assigned,
                    "verified_qty_total": verified,
                    "damaged_qty_total": damaged,
                    "wrong_store_qty_total": wrong_store,
                    "missing_qty_total": missing,
                    "missing_item_count": len(pending_products),
                    "missing_stock_total": missing,
                    "pending_products": pending_products[:20],
                    "product_list": product_list,
                    "item_count": len(order_items),
                    "total_value": round(total_value, 2),
                }
            )
        )

    if status:
        status_norm = str(status).strip().lower()
        out = [row for row in out if str(row.get("status") or "").strip().lower() == status_norm]
    out.sort(key=lambda x: x.get("createdAt") or x.get("created_at") or "", reverse=True)
    if isinstance(limit, int) and limit > 0:
        out = out[:limit]
    return out


def _build_offline_order_details(order_id: str) -> Optional[Dict]:
    """
    Build detailed order payload from normalized local JSON files.
    Uses optional verifications/scans files when present.
    """
    summary = next((row for row in get_orders_data() if str(row.get("id")) == str(order_id)), None)
    transfer_orders = get_inventory_transfer_orders_data()
    transfer_order_row = next((row for row in transfer_orders if str(row.get("id")) == str(order_id)), None)
    base_order = transfer_order_row or summary
    if not base_order:
        return None

    transfer_items = get_inventory_transfer_items_data()
    order_items_rows = [
        row for row in transfer_items
        if str(row.get("transfer_order_id") or row.get("transferOrderId") or "") == str(order_id)
    ]

    products = get_products_data()
    product_map: Dict[str, Dict[str, Any]] = {}
    for p in products:
        pid = str(p.get("id") or "").strip()
        if pid:
            product_map[pid] = p

    batches = get_batches_data()
    batch_map: Dict[str, str] = {}
    for b in batches:
        bid = str(b.get("id") or "").strip()
        if bid:
            batch_map[bid] = str(b.get("batch_number") or b.get("batchNumber") or "")

    normalized_items: List[Dict] = []
    transfer_item_ids: List[str] = []
    pending_products_from_summary = list(summary.get("pendingProducts") or summary.get("pending_products") or []) if summary else []
    if not order_items_rows and pending_products_from_summary:
        # Fallback: derive minimal offline items from summary pendingProducts if
        # detailed transfer item files are not available.
        for idx, pending in enumerate(pending_products_from_summary):
            assigned = int(pending.get("assignedQty") or pending.get("assigned_qty") or 0)
            verified = int(pending.get("verifiedQty") or pending.get("verified_qty") or 0)
            missing = int(pending.get("missingQty") or pending.get("missing_qty") or max(0, assigned - verified))
            pid = str(pending.get("productId") or pending.get("product_id") or "")
            normalized_items.append(
                {
                    "id": f"offline-pending-{idx+1}",
                    "productId": pid,
                    "assignedQty": assigned,
                    "verifiedQty": verified,
                    "missingQty": missing,
                    "status": "pending" if missing > 0 else "completed",
                    "products": {
                        "name": pending.get("name"),
                        "barcode": pending.get("barcode"),
                        "sellingPrice": None,
                        "batchNumber": None,
                    },
                }
            )

    for item in order_items_rows:
        transfer_item_id = str(item.get("id") or "")
        if transfer_item_id:
            transfer_item_ids.append(transfer_item_id)
        assigned = int(item.get("assigned_qty") or item.get("assignedQty") or 0)
        verified = int(item.get("verified_qty") or item.get("verifiedQty") or 0)
        damaged = int(item.get("damaged_qty") or item.get("damagedQty") or 0)
        wrong_store = int(item.get("wrong_store_qty") or item.get("wrongStoreQty") or 0)
        missing = max(0, assigned - verified - damaged - wrong_store)
        pid = str(item.get("product_id") or item.get("productId") or "").strip()
        product = product_map.get(pid, {})
        batch_id = str(product.get("batchid") or product.get("batchId") or "")
        normalized_items.append(
            convert_snake_to_camel(
                {
                    **item,
                    "missing_qty": missing,
                    "status": _derive_item_state(item),
                    "products": {
                        "name": product.get("name"),
                        "barcode": product.get("barcode"),
                        "selling_price": product.get("selling_price") or product.get("sellingPrice") or product.get("price"),
                        "batch_number": batch_map.get(batch_id, ""),
                    },
                }
            )
        )

    # Optional event files
    verifications = get_inventory_transfer_verifications_data()
    verification_events = [
        convert_snake_to_camel(row)
        for row in verifications
        if str(row.get("order_id") or row.get("orderId") or "") == str(order_id)
    ]

    scans = get_inventory_transfer_scans_data()
    transfer_item_ids_set = set(transfer_item_ids)
    scan_events = [
        convert_snake_to_camel(row)
        for row in scans
        if str(row.get("transfer_item_id") or row.get("transferItemId") or "") in transfer_item_ids_set
    ]

    out = convert_snake_to_camel(base_order)
    out["items"] = normalized_items
    out["verificationEvents"] = verification_events
    out["scanEvents"] = scan_events
    out["offlineSource"] = "json"
    return out


def _fetch_transfer_orders_for_store(
    client: Any,
    store_id: str,
    status: Optional[str],
    from_date: Optional[str],
    to_date: Optional[str],
    limit: Optional[int],
) -> List[Dict]:
    """
    Fetch transfer orders using DB-side filtering. Supports schema variants for store id:
    store_id / storeid / storeId.
    """
    id_columns = ["store_id", "storeid", "storeId"]
    status_value = str(status).strip().lower() if status else None
    for id_col in id_columns:
        try:
            query = (
                client.table("inventory_transfer_orders")
                .select("*")
                .eq(id_col, store_id)
                .order("created_at", desc=True)
            )
            if status_value:
                query = query.eq("status", status_value)
            if from_date:
                query = query.gte("created_at", from_date)
            if to_date:
                query = query.lte("created_at", to_date)
            if isinstance(limit, int) and limit > 0:
                query = query.limit(limit)
            response = execute_with_retry(
                lambda: query,
                f"transfer orders for store {store_id} ({id_col})",
            )
            rows = response.data or []
            if rows:
                return rows
        except Exception:
            continue
    return []


def _enrich_orders_with_totals(client: Any, orders: List[Dict], store_id_for_label: str) -> List[Dict]:
    if not orders:
        return []
    order_ids = [str(order.get("id")) for order in orders if order.get("id")]
    if not order_ids:
        return [convert_snake_to_camel(order) for order in orders]

    # Avoid 414 Request-URI Too Large by batching in_() filters.
    items: List[Dict] = []
    for chunk in _chunked(order_ids, 120):
        items_response = execute_with_retry(
            lambda chunk=chunk: client.table("inventory_transfer_items").select("*").in_("transfer_order_id", chunk),
            f"transfer order items for {store_id_for_label}",
        )
        items.extend(items_response.data or [])

    product_ids = list(
        {
            str(item.get("product_id") or "").strip()
            for item in items
            if str(item.get("product_id") or "").strip()
        }
    )
    product_price_map: Dict[str, float] = {}
    product_meta_map: Dict[str, Dict[str, Any]] = {}
    if product_ids:
        try:
            for chunk in _chunked(product_ids, 120):
                products_response = execute_with_retry(
                    lambda chunk=chunk: client.table("products").select("id, name, barcode, selling_price, price, batch(batch_number)").in_("id", chunk),
                    f"transfer order prices for {store_id_for_label}",
                )
                for prod in products_response.data or []:
                    pid = str(prod.get("id") or "").strip()
                    if not pid:
                        continue
                    product_price_map[pid] = float(
                        prod.get("selling_price") or prod.get("sellingPrice") or prod.get("price") or 0
                    )
                    batch_ref = prod.get("batch")
                    batch_number = ""
                    if isinstance(batch_ref, list):
                        batch_ref = batch_ref[0] if batch_ref else {}
                    if isinstance(batch_ref, dict):
                        batch_number = batch_ref.get("batch_number") or ""
                    product_meta_map[pid] = {
                        "name": prod.get("name"),
                        "barcode": prod.get("barcode"),
                        "batch_number": batch_number,
                    }
        except Exception as product_err:
            logger.warning("Failed to prefetch product prices for transfer orders (%s): %s", store_id_for_label, product_err)

    items_by_order: Dict[str, List[Dict]] = defaultdict(list)
    for item in items:
        order_id = item.get("transfer_order_id")
        if order_id:
            items_by_order[order_id].append(item)

    _upsert_inventory_transfer_local_cache(orders, items)

    result: List[Dict] = []
    for order in orders:
        order_items = items_by_order.get(order.get("id"), [])
        assigned = sum(int(i.get("assigned_qty") or 0) for i in order_items)
        verified = sum(int(i.get("verified_qty") or 0) for i in order_items)
        damaged = sum(int(i.get("damaged_qty") or 0) for i in order_items)
        wrong_store = sum(int(i.get("wrong_store_qty") or 0) for i in order_items)
        missing = max(0, assigned - verified - damaged - wrong_store)
        missing_item_count = 0
        total_value = 0.0
        pending_products: List[Dict[str, Any]] = []
        product_list: List[Dict[str, str]] = []
        seen_product_ids: set = set()
        for item in order_items:
            item_assigned = int(item.get("assigned_qty") or 0)
            item_verified = int(item.get("verified_qty") or 0)
            item_damaged = int(item.get("damaged_qty") or 0)
            item_wrong_store = int(item.get("wrong_store_qty") or 0)
            item_missing = max(0, item_assigned - item_verified - item_damaged - item_wrong_store)
            if item_missing > 0:
                missing_item_count += 1
            pid = str(item.get("product_id") or "").strip()
            unit_price = product_price_map.get(pid, 0.0)
            total_value += item_assigned * unit_price
            product_meta = product_meta_map.get(pid, {})
            if pid and pid not in seen_product_ids:
                seen_product_ids.add(pid)
                product_list.append(
                    {
                        "name": product_meta.get("name") or "",
                        "barcode": product_meta.get("barcode") or "",
                        "batch": product_meta.get("batch_number") or "",
                    }
                )
            if item_missing > 0:
                pending_products.append(
                    {
                        "product_id": pid,
                        "name": product_meta.get("name"),
                        "barcode": product_meta.get("barcode"),
                        "assigned_qty": item_assigned,
                        "verified_qty": item_verified,
                        "missing_qty": item_missing,
                    }
                )

        computed_status = order.get("status")
        if computed_status in TRANSFER_ACTIVE_STATUSES and assigned > 0:
            if missing == 0:
                computed_status = "closed_with_issues" if (damaged > 0 or wrong_store > 0) else "completed"
            elif verified > 0 or damaged > 0 or wrong_store > 0:
                computed_status = "in_progress"

        result.append(
            convert_snake_to_camel(
                {
                    **order,
                    "status": computed_status,
                    "assigned_qty_total": assigned,
                    "verified_qty_total": verified,
                    "damaged_qty_total": damaged,
                    "wrong_store_qty_total": wrong_store,
                    "missing_qty_total": missing,
                    "missing_item_count": missing_item_count,
                    "missing_stock_total": missing,
                    "pending_products": pending_products[:20],
                    "product_list": product_list,
                    "item_count": len(order_items),
                    "total_value": round(total_value, 2),
                }
            )
        )
    return result


def get_transfer_orders(
    store_id: Optional[str] = None,
    status: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: Optional[int] = None,
) -> Tuple[List[Dict], int]:
    """
    Get transfer orders with computed totals.
    Falls back to local orders.json cache if online fetch fails.
    """
    try:
        client = db.client
        if store_id and str(store_id).lower() != "all":
            orders = _fetch_transfer_orders_for_store(
                client=client,
                store_id=store_id,
                status=status,
                from_date=from_date,
                to_date=to_date,
                limit=limit,
            )
        else:
            query = client.table("inventory_transfer_orders").select("*").order("created_at", desc=True)
            if status:
                query = query.eq("status", str(status).strip().lower())
            if from_date:
                query = query.gte("created_at", from_date)
            if to_date:
                query = query.lte("created_at", to_date)
            if isinstance(limit, int) and limit > 0:
                query = query.limit(limit)
            response = execute_with_retry(lambda: query, "transfer orders (all stores)")
            orders = response.data or []

        enriched = _enrich_orders_with_totals(client, orders, str(store_id or "all"))
        _upsert_orders_local_cache(enriched)
        return enriched, 200
    except Exception as e:
        if is_transient_supabase_error(e):
            logger.warning("Transient Supabase error loading transfer orders, using local cache: %s", e)
        else:
            logger.error("Error loading transfer orders, using local cache: %s", e, exc_info=True)
        local_rows = get_orders_data()
        filtered = _filter_local_orders(
            local_rows,
            store_id=store_id,
            status=status,
            from_date=from_date,
            to_date=to_date,
            limit=limit,
        )
        if filtered:
            return filtered, 200
        return _build_local_order_summaries(
            store_id=store_id,
            status=status,
            from_date=from_date,
            to_date=to_date,
            limit=limit,
        ), 200


def get_store_transfer_orders(
    store_id: str,
    status: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: Optional[int] = None,
) -> Tuple[List[Dict], int]:
    return get_transfer_orders(
        store_id=store_id,
        status=status,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
    )


def get_transfer_order_details(order_id: str) -> Tuple[Optional[Dict], int]:
    """Fetch one transfer order with items and computed missing qty per item."""
    try:
        client = db.client
        order_response = execute_with_retry(
            lambda: client.table("inventory_transfer_orders").select("*").eq("id", order_id).limit(1),
            f"transfer order details {order_id}",
        )
        if not order_response.data:
            local_fallback = _build_offline_order_details(order_id)
            if local_fallback:
                return local_fallback, 200
            return None, 404

        items_response = execute_with_retry(
            lambda: client.table("inventory_transfer_items").select("*").eq("transfer_order_id", order_id),
            f"transfer order items {order_id}",
        )
        items = items_response.data or []
        product_ids = list(
            {
                str(item.get("product_id") or "").strip()
                for item in items
                if str(item.get("product_id") or "").strip()
            }
        )
        product_map: Dict[str, Dict[str, Any]] = {}
        if product_ids:
            try:
                products_response = execute_with_retry(
                    lambda: client.table("products").select("id, name, barcode, selling_price, batchid, batch(id, batch_number)").in_("id", product_ids),
                    f"transfer order products {order_id}",
                )
                for prod in products_response.data or []:
                    pid = str(prod.get("id") or "").strip()
                    if pid:
                        product_map[pid] = prod
            except Exception as product_error:
                logger.warning("Failed to enrich transfer-order products for %s: %s", order_id, product_error)

        normalized_items = []
        for item in items:
            assigned = int(item.get("assigned_qty") or 0)
            verified = int(item.get("verified_qty") or 0)
            damaged = int(item.get("damaged_qty") or 0)
            wrong_store = int(item.get("wrong_store_qty") or 0)
            missing = max(0, assigned - verified - damaged - wrong_store)
            product_id = str(item.get("product_id") or "").strip()
            product_meta = product_map.get(product_id, {})

            batch_ref = product_meta.get("batch")
            batch_number = ""
            if batch_ref:
                if isinstance(batch_ref, list):
                    batch_ref = batch_ref[0] if batch_ref else {}
                if isinstance(batch_ref, dict):
                    batch_number = batch_ref.get("batch_number", "")

            normalized_items.append(
                convert_snake_to_camel(
                    {
                        **item,
                        "missing_qty": missing,
                        "status": _derive_item_state(item),
                        "products": {
                            "name": product_meta.get("name"),
                            "barcode": product_meta.get("barcode"),
                            "selling_price": product_meta.get("selling_price") or product_meta.get("sellingPrice"),
                            "batch_number": batch_number,
                        },
                    }
                )
            )

        order = convert_snake_to_camel(order_response.data[0])
        order["items"] = normalized_items
        _upsert_transfer_order_detail_cache(order_response.data[0], items)
        return order, 200
    except Exception as e:
        if is_transient_supabase_error(e):
            local_fallback = _build_offline_order_details(order_id)
            if local_fallback:
                return local_fallback, 200
            return None, 503
        logger.error(f"Error getting transfer order details {order_id}: {e}", exc_info=True)
        return None, 500


def _remove_transfer_order_from_local_cache(order_id: str, transfer_item_ids: List[str]) -> None:
    """
    Best-effort cleanup for local sync/cache json files related to transfer orders.
    """
    # remove from orders.json
    try:
        existing_orders = get_orders_data()
        remaining_orders = [row for row in existing_orders if str(row.get("id")) != str(order_id)]
        if len(remaining_orders) != len(existing_orders):
            save_orders_data(remaining_orders)
    except Exception as cache_err:
        logger.warning(f"Failed local orders.json cleanup for {order_id}: {cache_err}")

    transfer_item_ids_set = set(transfer_item_ids)
    file_specs = [
        ("inventory_transfer_orders.json", lambda row: str(row.get("id")) == order_id),
        ("inventory_transfer_items.json", lambda row: str(row.get("transfer_order_id")) == order_id),
        ("inventory_transfer_verifications.json", lambda row: str(row.get("order_id")) == order_id),
        ("inventory_transfer_scans.json", lambda row: str(row.get("transfer_item_id")) in transfer_item_ids_set),
    ]

    for filename, should_remove in file_specs:
        path = os.path.join(Config.JSON_DIR, filename)
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if not isinstance(data, list):
                continue
            filtered = [row for row in data if not should_remove(row if isinstance(row, dict) else {})]
            if len(filtered) == len(data):
                continue
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(filtered, fh, indent=2, ensure_ascii=False)
        except Exception as cache_err:
            logger.warning(f"Failed local transfer-order cache cleanup for {filename}: {cache_err}")


def delete_transfer_order(order_id: str) -> Tuple[bool, str, int, Optional[str]]:
    """Delete transfer order and linked rows from Supabase and local cache."""
    try:
        client = db.client
        order_resp = execute_with_retry(
            lambda: client.table("inventory_transfer_orders").select("id, store_id").eq("id", order_id).limit(1),
            f"lookup transfer order {order_id}",
        )
        order_rows = order_resp.data or []
        if not order_rows:
            return False, "Transfer order not found", 404, None

        store_id = order_rows[0].get("store_id")

        items_resp = execute_with_retry(
            lambda: client.table("inventory_transfer_items").select("id").eq("transfer_order_id", order_id),
            f"lookup transfer order items {order_id}",
        )
        item_ids = [str(row.get("id")) for row in (items_resp.data or []) if row.get("id")]

        if item_ids:
            execute_with_retry(
                lambda: client.table("inventory_transfer_scans").delete().in_("transfer_item_id", item_ids),
                f"delete transfer scans {order_id}",
            )

        execute_with_retry(
            lambda: client.table("inventory_transfer_verifications").delete().eq("order_id", order_id),
            f"delete transfer verifications {order_id}",
        )
        execute_with_retry(
            lambda: client.table("inventory_transfer_items").delete().eq("transfer_order_id", order_id),
            f"delete transfer items {order_id}",
        )
        execute_with_retry(
            lambda: client.table("inventory_transfer_orders").delete().eq("id", order_id),
            f"delete transfer order {order_id}",
        )

        _remove_transfer_order_from_local_cache(order_id, item_ids)
        return True, "Transfer order deleted successfully", 200, str(store_id) if store_id else None
    except Exception as e:
        if is_transient_supabase_error(e):
            return False, "Supabase temporarily unavailable. Please try again in a moment.", 503, None
        logger.error(f"Error deleting transfer order {order_id}: {e}", exc_info=True)
        return False, str(e), 500, None
