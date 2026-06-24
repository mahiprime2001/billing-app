"""
Common utility functions used across the application
"""
import logging
from datetime import datetime
from decimal import Decimal
from typing import Any

logger = logging.getLogger(__name__)


def _safe_int(value: Any, default: int = 0) -> int:
    """Safely convert value to int, returning default if conversion fails."""
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Safely convert value to float, returning default if conversion fails."""
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def _to_date_only(dt_str: str) -> str:
    """Convert datetime string to date-only string (YYYY-MM-DD)"""
    try:
        return datetime.fromisoformat(dt_str).date().isoformat()
    except Exception:
        return None


def _price_of(product: dict) -> float:
    """Extract price from product as float"""
    return _safe_float(product.get('price'))


def _stock_of(product: dict) -> int:
    """Extract stock from product as int"""
    return _safe_int(product.get('stock'))


# Bill statuses that represent a voided/cancelled bill and must be excluded
# from revenue, sales amount and bill-count aggregations.
CANCELLED_BILL_STATUSES = frozenset({"cancelled", "canceled", "void", "voided"})


def is_cancelled_bill(bill: Any) -> bool:
    """Return True if a bill should NOT count as a sale (cancelled/voided).

    A bill with no/empty status is treated as a valid sale (matches the
    frontend default of "completed"), so only an explicit cancelled status
    is excluded.
    """
    try:
        status = str((bill or {}).get("status") or "").strip().lower()
    except AttributeError:
        return False
    return status in CANCELLED_BILL_STATUSES


def json_serial(obj: Any) -> Any:
    """
    JSON serializer for objects not serializable by default json code.
    Handles datetime and Decimal objects.
    """
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")
