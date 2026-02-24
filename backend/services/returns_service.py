"""
Returns Service
Handles all return-related business logic and database operations
"""

import logging
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from utils.supabase_db import db
from utils.supabase_resilience import execute_with_retry
from utils.json_helpers import get_returns_data, save_returns_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

logger = logging.getLogger(__name__)


def _enrich_returns_with_related_data(returns: List[Dict]) -> List[Dict]:
    """Attach product/customer display fields when only IDs are present."""
    if not returns:
        return returns

    product_ids = sorted(
        {
            str(ret.get("product_id") or ret.get("productId") or "").strip()
            for ret in returns
            if (ret.get("product_id") or ret.get("productId"))
        }
    )
    customer_ids = sorted(
        {
            str(ret.get("customer_id") or ret.get("customerId") or "").strip()
            for ret in returns
            if (ret.get("customer_id") or ret.get("customerId"))
        }
    )

    products_by_id: Dict[str, Dict] = {}
    customers_by_id: Dict[str, Dict] = {}

    try:
        client = db.client
        if product_ids:
            products_response = execute_with_retry(
                lambda: client.table("products").select("id, name").in_("id", product_ids),
                "returns products lookup",
                retries=2,
            )
            products_by_id = {str(row.get("id")): row for row in (products_response.data or []) if row.get("id")}

        if customer_ids:
            customers_response = execute_with_retry(
                lambda: client.table("customers").select("id, name, phone").in_("id", customer_ids),
                "returns customers lookup",
                retries=2,
            )
            customers_by_id = {str(row.get("id")): row for row in (customers_response.data or []) if row.get("id")}
    except Exception as lookup_error:
        logger.warning(f"Could not enrich returns with product/customer details: {lookup_error}")

    enriched_returns: List[Dict] = []
    for ret in returns:
        enriched = dict(ret)

        product_id = str(ret.get("product_id") or ret.get("productId") or "").strip()
        customer_id = str(ret.get("customer_id") or ret.get("customerId") or "").strip()

        if not (ret.get("product_name") or ret.get("productName")):
            if product_id and product_id in products_by_id:
                enriched["product_name"] = products_by_id[product_id].get("name") or "Unknown Product"
            elif product_id:
                enriched["product_name"] = "Unknown Product"

        if not (ret.get("customer_name") or ret.get("customerName")) and customer_id and customer_id in customers_by_id:
            enriched["customer_name"] = customers_by_id[customer_id].get("name") or "Unknown Customer"

        if not (ret.get("customer_phone_number") or ret.get("customerPhoneNumber")) and customer_id and customer_id in customers_by_id:
            enriched["customer_phone_number"] = customers_by_id[customer_id].get("phone") or ""

        enriched_returns.append(enriched)

    return enriched_returns


def _create_return_notification(return_data: Dict) -> None:
    """Best-effort notification for new return requests."""
    try:
        from services import notifications_service

        return_id = return_data.get("return_id", "")
        product_id = return_data.get("product_id", "")
        bill_id = return_data.get("bill_id", "")
        return_amount = return_data.get("return_amount")

        parts = [f"Return request {return_id}"]
        if product_id:
            parts.append(f"for product {product_id}")
        if bill_id:
            parts.append(f"(bill {bill_id})")
        if return_amount is not None:
            parts.append(f"amount ₹{return_amount}")

        notifications_service.create_notification(
            {
                "type": "RETURN_REQUEST",
                "notification": " ".join(parts),
                "relatedId": return_id,
                "isRead": False,
            }
        )
    except Exception as notification_error:
        logger.warning(f"Failed to create return notification: {notification_error}")

# ============================================
# LOCAL JSON OPERATIONS
# ============================================

def get_local_returns() -> List[Dict]:
    """Get returns from local JSON storage"""
    try:
        returns = get_returns_data()
        transformed_returns = [convert_snake_to_camel(ret) for ret in returns]
        logger.debug(f"Returning {len(transformed_returns)} returns from local JSON.")
        return transformed_returns
    except Exception as e:
        logger.error(f"Error getting local returns: {e}", exc_info=True)
        return []

# ============================================
# SUPABASE OPERATIONS
# ============================================

def get_supabase_returns() -> List[Dict]:
    """Get returns directly from Supabase"""
    try:
        client = db.client
        response = execute_with_retry(
            lambda: client.table("returns").select("*"),
            "returns",
            retries=2,
        )
        returns = response.data or []
        transformed_returns = [convert_snake_to_camel(ret) for ret in returns]
        logger.debug(f"Returning {len(transformed_returns)} returns from Supabase.")
        return transformed_returns
    except Exception as e:
        logger.warning(f"Error getting Supabase returns (falling back to local): {e}")
        return []

# ============================================
# MERGED OPERATIONS
# ============================================

def get_merged_returns() -> Tuple[List[Dict], int]:
    """
    Get returns by merging local and Supabase (Supabase takes precedence).
    Returns (returns_list, status_code)
    """
    try:
        # Fetch from Supabase (preferred source)
        supabase_returns = get_supabase_returns()
        
        # Fetch from local JSON (fallback)
        local_returns = get_local_returns()
        
        # Merge: Supabase takes precedence
        returns_map = {}
        
        # Add local returns first (lower priority)
        for ret in local_returns:
            # Use returnId (camelCase) or return_id (snake_case)
            ret_id = ret.get('returnId') or ret.get('return_id')
            if ret_id:
                returns_map[ret_id] = ret
        
        # Add Supabase returns (higher priority)
        for ret in supabase_returns:
            # Use returnId (camelCase) or return_id (snake_case)
            ret_id = ret.get('returnId') or ret.get('return_id')
            if ret_id:
                returns_map[ret_id] = ret
        
        final_returns = _enrich_returns_with_related_data(list(returns_map.values()))
        final_returns.sort(key=lambda x: x.get('createdAt') or x.get('created_at', ''), reverse=True)
        
        logger.debug(f"Returning {len(final_returns)} merged returns")
        return final_returns, 200
        
    except Exception as e:
        logger.error(f"Error getting merged returns: {e}", exc_info=True)
        return [], 500

# ============================================
# BUSINESS LOGIC
# ============================================

def create_return(return_data: dict) -> Tuple[Optional[str], str, int]:
    """
    Create a new return.
    Returns (return_id, message, status_code)
    """
    try:
        if not return_data:
            return None, "No return data provided", 400
        
        # Convert field names
        return_data = convert_camel_to_snake(return_data)
        
        # Generate return_id if not present
        if 'return_id' not in return_data:
            return_data['return_id'] = f"RET-{uuid.uuid4().hex[:12].upper()}"
        
        # Add timestamps
        now_naive = datetime.now().isoformat()
        if 'created_at' not in return_data:
            return_data['created_at'] = now_naive
        return_data['updated_at'] = now_naive
        
        # Set default status if not provided
        if 'status' not in return_data:
            return_data['status'] = 'pending'
        
        # Save to local JSON first (offline-first)
        returns = get_returns_data()
        existing_idx = next((i for i, r in enumerate(returns) if r.get("return_id") == return_data["return_id"]), -1)
        if existing_idx >= 0:
            returns[existing_idx] = return_data
        else:
            returns.append(return_data)
        save_returns_data(returns)

        # Best-effort Supabase sync now; queue handles retry on failure
        try:
            client = db.client
            execute_with_retry(
                lambda: client.table('returns').upsert(return_data),
                "returns upsert",
                retries=2,
            )
        except Exception as supabase_error:
            logger.warning(
                f"Return {return_data['return_id']} saved locally; Supabase sync deferred: {supabase_error}"
            )
            _create_return_notification(return_data)
            return return_data["return_id"], "Return saved locally and queued for sync", 201
        
        _create_return_notification(return_data)
        logger.info(f"Return created {return_data['return_id']}")
        return return_data['return_id'], "Return created", 201
        
    except Exception as e:
        logger.error(f"Error creating return: {e}", exc_info=True)
        return None, str(e), 500

def update_return_status(return_id: str, status: str) -> Tuple[bool, str, int]:
    """
    Update return status.
    Returns (success, message, status_code)
    """
    try:
        if not status:
            return False, "No status provided", 400
        
        # Find return in local storage
        returns = get_returns_data()
        return_index = next((i for i, r in enumerate(returns) if r.get('return_id') == return_id), -1)
        
        if return_index == -1:
            logger.warning(f"Return {return_id} not found in local storage")
            return False, "Return not found", 404
        
        # Update status
        update_data = {
            'status': status,
            'updated_at': datetime.now().isoformat()
        }
        
        # Update in local JSON
        returns[return_index].update(update_data)
        save_returns_data(returns)
        
        # Update in Supabase
        try:
            client = db.client
            supabase_response = execute_with_retry(
                lambda: client.table('returns').update(update_data).eq('return_id', return_id),
                "returns update",
                retries=2,
            )
            
            if not supabase_response.data:
                logger.warning(f"No rows updated in Supabase for return_id {return_id}")
        except Exception as supabase_error:
            logger.error(f"Error updating Supabase for return {return_id}: {supabase_error}")
            # Continue anyway since local update succeeded
        
        logger.info(f"Return {return_id} status updated to {status}")
        return True, "Return status updated", 200
        
    except Exception as e:
        logger.error(f"Error updating return status: {e}", exc_info=True)
        return False, str(e), 500
