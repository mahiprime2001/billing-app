"""
Bills Routes
Flask blueprint for all bill-related API endpoints
"""

from flask import Blueprint, jsonify, request
import logging
import threading
import time
from services import bills_service
import utils.supabase_circuit as supabase_circuit

logger = logging.getLogger(__name__)

_BILLS_CACHE_TTL_SECONDS = 30
_BILLS_CACHE_STALE_SECONDS = 180
_BILLS_CACHE_LOCK = threading.Lock()
_BILLS_CACHE: dict[str, dict] = {}
_BILLS_INFLIGHT: dict[str, threading.Event] = {}


def _bills_cache_key(params: dict) -> str:
    items = sorted((str(k), str(v)) for k, v in params.items())
    return "&".join([f"{k}={v}" for k, v in items]) or "default"


def _get_bills_cache(key: str, allow_stale: bool = False):
    now = time.time()
    with _BILLS_CACHE_LOCK:
        entry = _BILLS_CACHE.get(key)
    if not entry:
        return None
    if now <= float(entry.get("expires_at") or 0):
        return entry.get("data")
    if allow_stale and now <= float(entry.get("stale_until") or 0):
        return entry.get("data")
    return None


def _set_bills_cache(key: str, data):
    now = time.time()
    with _BILLS_CACHE_LOCK:
        _BILLS_CACHE[key] = {
            "data": data,
            "expires_at": now + _BILLS_CACHE_TTL_SECONDS,
            "stale_until": now + _BILLS_CACHE_STALE_SECONDS,
        }

# Create Blueprint
bills_bp = Blueprint("bills", __name__, url_prefix="/api")

# ======================================================
# LOCAL BILLS ENDPOINTS
# ======================================================

@bills_bp.route("/local/bills", methods=["GET"])
def get_local_bills():
    """Get bills from LOCAL JSON"""
    try:
        bills = bills_service.get_local_bills()
        logger.debug(f"Returning {len(bills)} local bills")
        return jsonify(bills), 200
    except Exception as e:
        logger.error("Error fetching local bills", exc_info=True)
        return jsonify({"error": str(e)}), 500


@bills_bp.route("/local/bills/update", methods=["POST"])
def update_local_bills():
    """Update local JSON bills"""
    try:
        bills_data = request.json or []
        success = bills_service.update_local_bills(bills_data)

        if success:
            return jsonify({
                "message": f"Local bills updated with {len(bills_data)} records"
            }), 200

        return jsonify({"error": "Failed to update local bills"}), 500

    except Exception as e:
        logger.error("Error updating local bills", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ======================================================
# SUPABASE BILLS ENDPOINTS
# ======================================================

@bills_bp.route("/supabase/bills", methods=["GET"])
def get_supabase_bills():
    """Get bills directly from Supabase"""
    try:
        bills = bills_service.get_supabase_bills()
        logger.debug(f"Returning {len(bills)} supabase bills")
        return jsonify(bills), 200
    except Exception as e:
        logger.error("Error fetching supabase bills", exc_info=True)
        return jsonify({"error": str(e)}), 500


@bills_bp.route("/supabase/bills-with-details", methods=["GET"])
def get_supabase_bills_with_details():
    """Get bills with items from Supabase"""
    try:
        bills = bills_service.get_supabase_bills_with_details()
        logger.debug(f"Returning {len(bills)} detailed bills")
        return jsonify(bills), 200
    except Exception as e:
        logger.error("Error fetching detailed supabase bills", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ======================================================
# MAIN / MERGED BILLS ENDPOINT (FIXED)
# ======================================================

@bills_bp.route("/bills", methods=["POST"])
@bills_bp.route("/bills/", methods=["POST"])
def create_bill():
    """Create bill - always saves locally, syncs to Supabase when available"""
    try:
        bill_data = request.json or {}
        bill_id, message, status_code = bills_service.create_bill(bill_data)

        if status_code == 201 and bill_id:
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation(
                    json_type="bills",
                    operation="CREATE",
                    record_id=bill_id,
                    data=bill_data,
                )
            except ImportError:
                logger.warning("Sync manager not available")

            return jsonify({"message": message, "id": bill_id}), 201

        return jsonify({"error": message}), status_code

    except Exception as e:
        logger.error("Error creating bill", exc_info=True)
        return jsonify({"error": str(e)}), 500

@bills_bp.route("/bills", methods=["GET"])
@bills_bp.route("/bills/", methods=["GET"])
def get_bills():
    """
    Main bills endpoint used by frontend
    Priority:
    1. Supabase bills with details
    2. Merged bills (local + supabase)
    3. Empty list (never break UI)
    """
    global _BILLS_INFLIGHT
    event_to_wait = None
    is_leader = False
    cache_key = "default"          # ← safe sentinel; overwritten before first use
    try:
        page = request.args.get("page", type=int)
        page_size = request.args.get("pageSize", type=int)
        from_date = request.args.get("from")
        to_date = request.args.get("to")
        store_id = request.args.get("storeId") or request.args.get("store_id")
        details_flag = request.args.get("details")
        paginate_flag = request.args.get("paginate")

        wants_paginated = (
            paginate_flag == "1"
            or page is not None
            or page_size is not None
            or from_date
            or to_date
            or store_id
        )

        if page is None:
            page = 1
        if page_size is None:
            page_size = 100
        if details_flag is None:
            details_flag = "1"

        cache_key = _bills_cache_key(
            {
                "page": page if wants_paginated else "",
                "pageSize": page_size if wants_paginated else "",
                "from": from_date or "",
                "to": to_date or "",
                "storeId": store_id or "",
                "details": details_flag,
            }
        )

        cached = _get_bills_cache(cache_key, allow_stale=False)
        if cached is not None:
            return jsonify(cached), 200

        with _BILLS_CACHE_LOCK:
            now = time.time()
            entry = _BILLS_CACHE.get(cache_key)
            if entry and now <= float(entry.get("expires_at") or 0):
                return jsonify(entry.get("data") or []), 200

            inflight = _BILLS_INFLIGHT.get(cache_key)
            if inflight is None:
                _BILLS_INFLIGHT[cache_key] = threading.Event()
                is_leader = True
            else:
                event_to_wait = inflight

        if not is_leader and event_to_wait is not None:
            event_to_wait.wait(timeout=6.0)
            cached_after_wait = _get_bills_cache(cache_key, allow_stale=True)
            if cached_after_wait is not None:
                return jsonify(cached_after_wait), 200
            return jsonify([]), 200

        # Leader path
        if supabase_circuit.is_offline():
            cached_stale = _get_bills_cache(cache_key, allow_stale=True)
            if cached_stale is not None:
                return jsonify(cached_stale), 200
            local = bills_service.get_local_bills()
            response_payload = local
            if wants_paginated:
                start = max(0, (page - 1) * page_size)
                end = start + page_size
                response_payload = {
                    "data": local[start:end],
                    "page": page,
                    "pageSize": page_size,
                    "hasMore": end < len(local),
                    "total": len(local),
                }
            _set_bills_cache(cache_key, response_payload)
            return jsonify(response_payload), 200

        if wants_paginated or details_flag == "0":
            result = bills_service.get_bills_paginated(
                page=page,
                page_size=page_size,
                from_date=from_date,
                to_date=to_date,
                store_id=store_id,
                include_details=(details_flag != "0"),
            )
            response_payload = result
            _set_bills_cache(cache_key, response_payload)
            return jsonify(response_payload), 200

        logger.info("Fetching bills with details from Supabase")
        bills = bills_service.get_supabase_bills_with_details()

        if bills:
            logger.info(f"Returning {len(bills)} bills with details")
            _set_bills_cache(cache_key, bills)
            return jsonify(bills), 200

        logger.warning("No detailed bills found, trying merged bills")
        bills, status_code = bills_service.get_merged_bills()

        if status_code == 200:
            logger.info(f"Returning {len(bills)} merged bills")
            _set_bills_cache(cache_key, bills)
            return jsonify(bills), 200

        cached_stale = _get_bills_cache(cache_key, allow_stale=True)
        if cached_stale is not None:
            return jsonify(cached_stale), 200

        logger.warning("No bills found, returning empty list")
        return jsonify([]), 200

    except Exception:
        cached_stale = _get_bills_cache(cache_key, allow_stale=True)
        if cached_stale is not None:
            return jsonify(cached_stale), 200
        logger.error("Error in get_bills", exc_info=True)
        return jsonify([]), 200
    finally:
        if is_leader:
            with _BILLS_CACHE_LOCK:
                done_event = _BILLS_INFLIGHT.pop(cache_key, None)
                if done_event is not None:
                    done_event.set()


# ======================================================
# UPDATE BILL
# ======================================================

@bills_bp.route("/bills/<bill_id>", methods=["PUT"])
@bills_bp.route("/bills/<bill_id>/", methods=["PUT"])
def update_bill(bill_id):
    """Update a bill within the allowed edit window"""
    try:
        bill_data = request.json or {}
        success, message, status_code = bills_service.update_bill(bill_id, bill_data)

        if success:
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation(
                    json_type="bills",
                    operation="UPDATE",
                    record_id=bill_id,
                    data=bill_data,
                )
            except ImportError:
                logger.warning("Sync manager not available")

            return jsonify({"message": message, "id": bill_id}), status_code

        return jsonify({"error": message}), status_code

    except Exception as e:
        logger.error("Error updating bill", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ======================================================
# REVISE BILL
# ======================================================

@bills_bp.route("/bills/<bill_id>/revise", methods=["POST"])
@bills_bp.route("/bills/<bill_id>/revise/", methods=["POST"])
def revise_bill(bill_id):
    """Revise bill: restore stock first, then remove bill-related data"""
    try:
        payload = request.json or {}
        store_id = payload.get("storeId") or payload.get("storeid") or payload.get("store_id")
        success, message, status_code = bills_service.revise_bill(bill_id, store_id_override=store_id)

        if success:
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation(
                    json_type="bills",
                    operation="DELETE",
                    record_id=bill_id,
                    data={"id": bill_id, "mode": "revise"},
                )
            except ImportError:
                logger.warning("Sync manager not available")

            return jsonify({"message": message, "id": bill_id}), status_code

        return jsonify({"error": message}), status_code
    except Exception as e:
        logger.error("Error revising bill", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ======================================================
# DELETE BILL
# ======================================================

@bills_bp.route("/bills/<bill_id>", methods=["DELETE"])
@bills_bp.route("/bills/<bill_id>/", methods=["DELETE"])
def delete_bill(bill_id):
    """Delete a bill"""
    try:
        success, message, status_code = bills_service.delete_bill(bill_id)

        if success:
            # Sync log (optional)
            try:
                from scripts.sync_manager import log_json_crud_operation
                log_json_crud_operation(
                    json_type="bills",
                    operation="DELETE",
                    record_id=bill_id,
                    data={"id": bill_id},
                )
            except ImportError:
                logger.warning("Sync manager not available")

            return jsonify({"message": message}), status_code

        return jsonify({"error": message}), status_code

    except Exception as e:
        logger.error("Error deleting bill", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ======================================================
# SYNC ENDPOINT
# ======================================================

@bills_bp.route("/bills/sync", methods=["GET"])
def sync_bills():
    """Sync bills for offline/online reconciliation"""
    try:
        bills = bills_service.get_supabase_bills_with_details()
        return jsonify({
            "status": "synced",
            "count": len(bills)
        }), 200
    except Exception as e:
        logger.error("Error syncing bills", exc_info=True)
        return jsonify({"error": str(e)}), 500
