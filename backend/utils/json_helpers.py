"""
Local-storage accessors for every domain this backend keeps a local copy of.

Was file-based (one JSON file per domain, via _safe_json_load/_safe_json_dump
below); now backed by utils/sqlite_store.py's SQLite store instead -- see
that module's docstring for why. Every function here keeps its exact old
name and signature on purpose: every route and service in this backend
calls get_X_data()/save_X_data(), never the storage layer directly, so
swapping what's underneath didn't require touching any of them.
"""
import logging
from typing import Any, Dict, List

from utils import sqlite_store

logger = logging.getLogger(__name__)


# ============================================
# PRODUCTS
# ============================================

def get_products_data() -> List[Dict]:
    """Get products from local storage (PRIMARY source)"""
    return sqlite_store.get_table_data("products", [])


def save_products_data(products: List[Dict]) -> bool:
    """Save products to local storage (PRIMARY storage)"""
    return sqlite_store.save_table_data("products", products)


# ============================================
# CUSTOMERS
# ============================================

def get_customers_data() -> List[Dict]:
    """Get customers from local storage (PRIMARY source)"""
    return sqlite_store.get_table_data("customers", [])


def save_customers_data(customers: List[Dict]) -> bool:
    """Save customers to local storage (PRIMARY storage)"""
    return sqlite_store.save_table_data("customers", customers)


# ============================================
# BILLS
# ============================================

def get_bills_data() -> List[Dict]:
    """Get bills from local storage"""
    return sqlite_store.get_table_data("bills", [])


def save_bills_data(bills: List[Dict]) -> bool:
    """Save bills to local storage"""
    return sqlite_store.save_table_data("bills", bills)


def get_bill_items_data() -> List[Dict]:
    """Get bill items from local storage"""
    return sqlite_store.get_table_data("billitems", [])


def save_bill_items_data(bill_items: List[Dict]) -> bool:
    """Save bill items to local storage"""
    return sqlite_store.save_table_data("billitems", bill_items)


# ============================================
# USERS
# ============================================

def get_users_data() -> List[Dict]:
    """Get users from local storage (PRIMARY source)"""
    return sqlite_store.get_table_data("users", [])


def save_users_data(users: List[Dict]) -> bool:
    """Save users to local storage (PRIMARY storage)"""
    return sqlite_store.save_table_data("users", users)


# ============================================
# STORES
# ============================================

def get_stores_data() -> List[Dict]:
    """Get stores from local storage (PRIMARY source)"""
    return sqlite_store.get_table_data("stores", [])


def save_stores_data(stores: List[Dict]) -> bool:
    """Save stores to local storage (PRIMARY storage)"""
    return sqlite_store.save_table_data("stores", stores)


# ============================================
# BATCHES
# ============================================

def get_batches_data() -> List[Dict]:
    """Get batches from local storage (PRIMARY source)"""
    return sqlite_store.get_table_data("batches", [])


def save_batches_data(batches: List[Dict]) -> bool:
    """Save batches to local storage (PRIMARY storage)"""
    return sqlite_store.save_table_data("batches", batches)


# ============================================
# HSN CODES
# ============================================

def get_hsn_codes_data() -> List[Dict]:
    """Get HSN codes from local storage (PRIMARY source)"""
    return sqlite_store.get_table_data("hsn_codes", [])


def save_hsn_codes_data(hsn_codes: List[Dict]) -> bool:
    """Save HSN codes to local storage (PRIMARY storage)"""
    return sqlite_store.save_table_data("hsn_codes", hsn_codes)


# ============================================
# RETURNS
# ============================================

def get_returns_data() -> List[Dict]:
    """Get returns from local storage (PRIMARY source)"""
    return sqlite_store.get_table_data("returns", [])


def save_returns_data(returns: List[Dict]) -> bool:
    """Save returns to local storage (PRIMARY storage)"""
    return sqlite_store.save_table_data("returns", returns)


# ============================================
# STORE DAMAGED RETURNS
# ============================================

def get_store_damage_returns_data() -> List[Dict]:
    """Get store damaged-return rows from local storage (PRIMARY source)"""
    return sqlite_store.get_table_data("store_damage_returns", [])


def save_store_damage_returns_data(rows: List[Dict]) -> bool:
    """Save store damaged-return rows to local storage (PRIMARY storage)"""
    return sqlite_store.save_table_data("store_damage_returns", rows)


# ============================================
# DISCOUNTS
# ============================================

def get_discounts_data() -> List[Dict]:
    """Get discounts from local storage (PRIMARY source)"""
    return sqlite_store.get_table_data("discounts", [])


def save_discounts_data(discounts: List[Dict]) -> bool:
    """Save discounts to local storage (PRIMARY storage)"""
    return sqlite_store.save_table_data("discounts", discounts)


# ============================================
# NOTIFICATIONS
# ============================================

def get_notifications_data() -> List[Dict]:
    """Get notifications from local storage (PRIMARY source)"""
    return sqlite_store.get_table_data("notifications", [])


def save_notifications_data(notifications: List[Dict]) -> bool:
    """Save notifications to local storage (PRIMARY storage)"""
    return sqlite_store.save_table_data("notifications", notifications)


# ============================================
# SETTINGS
# ============================================

def get_settings_data() -> Dict:
    """Get settings from local storage (PRIMARY source)"""
    return sqlite_store.get_table_data("settings", {})


def save_settings_data(settings: Dict) -> bool:
    """Save settings to local storage (PRIMARY storage)"""
    return sqlite_store.save_table_data("settings", settings)


# ============================================
# USER STORES
# ============================================

def get_user_stores_data() -> List[Dict]:
    """Get user stores from local storage (PRIMARY source)"""
    return sqlite_store.get_table_data("userstores", [])


def save_user_stores_data(userstores: List[Dict]) -> bool:
    """Save user stores to local storage (PRIMARY storage)"""
    return sqlite_store.save_table_data("userstores", userstores)


# ============================================
# GST REGISTRATIONS
# ============================================

def get_gst_registrations_data() -> List[Dict]:
    """Get GST registrations from local storage (PRIMARY source)"""
    return sqlite_store.get_table_data("gst_registrations", [])


def save_gst_registrations_data(rows: List[Dict]) -> bool:
    """Save GST registrations to local storage (PRIMARY storage)"""
    return sqlite_store.save_table_data("gst_registrations", rows)


# ============================================
# STORE INVENTORY
# ============================================

def get_store_inventory_data() -> List[Dict]:
    """Get store inventory from local storage"""
    return sqlite_store.get_table_data("storeinventory", [])


def save_store_inventory_data(inventory: List[Dict]) -> bool:
    """Save store inventory to local storage"""
    return sqlite_store.save_table_data("storeinventory", inventory)


# ============================================
# ORDERS (TRANSFER ORDERS LIST CACHE)
# ============================================

def get_orders_data() -> List[Dict]:
    """Get transfer orders from local storage"""
    return sqlite_store.get_table_data("orders", [])


def save_orders_data(orders: List[Dict]) -> bool:
    """Save transfer orders to local storage"""
    return sqlite_store.save_table_data("orders", orders)


# ============================================
# INVENTORY TRANSFER (OPTIONAL OFFLINE FILES)
# ============================================

def get_inventory_transfer_orders_data() -> List[Dict]:
    """Get inventory transfer orders from local storage"""
    return sqlite_store.get_table_data("inventory_transfer_orders", [])


def save_inventory_transfer_orders_data(rows: List[Dict]) -> bool:
    """Save inventory transfer orders to local storage"""
    return sqlite_store.save_table_data("inventory_transfer_orders", rows)


def get_inventory_transfer_items_data() -> List[Dict]:
    """Get inventory transfer items from local storage"""
    return sqlite_store.get_table_data("inventory_transfer_items", [])


def save_inventory_transfer_items_data(rows: List[Dict]) -> bool:
    """Save inventory transfer items to local storage"""
    return sqlite_store.save_table_data("inventory_transfer_items", rows)


def get_inventory_transfer_verifications_data() -> List[Dict]:
    """Get inventory transfer verifications from local storage"""
    return sqlite_store.get_table_data("inventory_transfer_verifications", [])


def save_inventory_transfer_verifications_data(rows: List[Dict]) -> bool:
    """Save inventory transfer verifications to local storage"""
    return sqlite_store.save_table_data("inventory_transfer_verifications", rows)


def get_inventory_transfer_scans_data() -> List[Dict]:
    """Get inventory transfer scans from local storage"""
    return sqlite_store.get_table_data("inventory_transfer_scans", [])


def save_inventory_transfer_scans_data(rows: List[Dict]) -> bool:
    """Save inventory transfer scans to local storage"""
    return sqlite_store.save_table_data("inventory_transfer_scans", rows)


# ============================================
# USER SESSIONS
# ============================================

def get_user_sessions() -> List[Dict]:
    """Get user sessions from local storage"""
    return sqlite_store.get_table_data("user_sessions", [])


def save_user_sessions(sessions: List[Dict]) -> bool:
    """Save user sessions to local storage"""
    return sqlite_store.save_table_data("user_sessions", sessions)
