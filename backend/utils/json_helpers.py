"""
JSON file operations helper functions
Handles reading and writing to local JSON files (offline-first storage)
"""
import os
import json
import logging
from typing import Any, Dict, List, Union
from config import Config

logger = logging.getLogger(__name__)

def _safe_json_load(path: str, default: Any) -> Any:
    """
    Safely load JSON data from a file.
    
    Args:
        path: Path to the JSON file
        default: Default value to return if file doesn't exist or is invalid
        
    Returns:
        Loaded data or default value
    """
    if not os.path.exists(path):
        return default
    
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Ensure top-level dictionary keys are strings to prevent TypeError with jsonify
        if isinstance(data, dict):
            return {str(k): v for k, v in data.items()}
        return data
    except json.JSONDecodeError:
        logger.error(f"JSON decode error in {path}, returning default")
        return default
    except Exception as e:
        logger.error(f"Error loading JSON from {path}: {e}")
        return default


def _safe_json_dump(path: str, data: Any) -> bool:
    """
    Safely write JSON data to a file.
    
    Args:
        path: Path to the JSON file
        data: Data to write
        
    Returns:
        True if successful, False otherwise
    """
    # Only create directory if parent doesn't exist
    parent_dir = os.path.dirname(path)
    if not os.path.exists(parent_dir):
        try:
            os.makedirs(parent_dir, exist_ok=True)
            logger.debug(f"Created parent directory: {parent_dir}")
        except Exception as e:
            logger.error(f"Failed to create directory {parent_dir}: {e}")
            return False
    
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        logger.error(f"Failed to write JSON to {path}: {e}")
        return False


# ============================================
# PRODUCTS
# ============================================

def get_products_data() -> List[Dict]:
    """Get products from local JSON (PRIMARY source)"""
    return _safe_json_load(Config.PRODUCTS_FILE, [])


def save_products_data(products: List[Dict]) -> bool:
    """Save products to local JSON (PRIMARY storage)"""
    return _safe_json_dump(Config.PRODUCTS_FILE, products)


# ============================================
# CUSTOMERS
# ============================================

def get_customers_data() -> List[Dict]:
    """Get customers from local JSON (PRIMARY source)"""
    return _safe_json_load(Config.CUSTOMERS_FILE, [])


def save_customers_data(customers: List[Dict]) -> bool:
    """Save customers to local JSON (PRIMARY storage)"""
    return _safe_json_dump(Config.CUSTOMERS_FILE, customers)


# ============================================
# BILLS
# ============================================

def get_bills_data() -> List[Dict]:
    """Get bills from local JSON"""
    return _safe_json_load(Config.BILLS_FILE, [])


def save_bills_data(bills: List[Dict]) -> bool:
    """Save bills to local JSON"""
    return _safe_json_dump(Config.BILLS_FILE, bills)


# ============================================
# USERS
# ============================================

def get_users_data() -> List[Dict]:
    """Get users from local JSON (PRIMARY source)"""
    return _safe_json_load(Config.USERS_FILE, [])


def save_users_data(users: List[Dict]) -> bool:
    """Save users to local JSON (PRIMARY storage)"""
    return _safe_json_dump(Config.USERS_FILE, users)


# ============================================
# STORES
# ============================================

def get_stores_data() -> List[Dict]:
    """Get stores from local JSON (PRIMARY source)"""
    return _safe_json_load(Config.STORES_FILE, [])


def save_stores_data(stores: List[Dict]) -> bool:
    """Save stores to local JSON (PRIMARY storage)"""
    return _safe_json_dump(Config.STORES_FILE, stores)


# ============================================
# BATCHES
# ============================================

def get_batches_data() -> List[Dict]:
    """Get batches from local JSON (PRIMARY source)"""
    return _safe_json_load(Config.BATCHES_FILE, [])


def save_batches_data(batches: List[Dict]) -> bool:
    """Save batches to local JSON (PRIMARY storage)"""
    return _safe_json_dump(Config.BATCHES_FILE, batches)


# ============================================
# HSN CODES
# ============================================

def get_hsn_codes_data() -> List[Dict]:
    """Get HSN codes from local JSON (PRIMARY source)"""
    return _safe_json_load(Config.HSN_CODES_FILE, [])


def save_hsn_codes_data(hsn_codes: List[Dict]) -> bool:
    """Save HSN codes to local JSON (PRIMARY storage)"""
    return _safe_json_dump(Config.HSN_CODES_FILE, hsn_codes)


# ============================================
# RETURNS
# ============================================

def get_returns_data() -> List[Dict]:
    """Get returns from local JSON (PRIMARY source)"""
    return _safe_json_load(Config.RETURNS_FILE, [])


def save_returns_data(returns: List[Dict]) -> bool:
    """Save returns to local JSON (PRIMARY storage)"""
    return _safe_json_dump(Config.RETURNS_FILE, returns)


# ============================================
# STORE DAMAGED RETURNS
# ============================================

def get_store_damage_returns_data() -> List[Dict]:
    """Get store damaged-return rows from local JSON (PRIMARY source)"""
    return _safe_json_load(Config.STORE_DAMAGE_RETURNS_FILE, [])


def save_store_damage_returns_data(rows: List[Dict]) -> bool:
    """Save store damaged-return rows to local JSON (PRIMARY storage)"""
    return _safe_json_dump(Config.STORE_DAMAGE_RETURNS_FILE, rows)


# ============================================
# DISCOUNTS
# ============================================

def get_discounts_data() -> List[Dict]:
    """Get discounts from local JSON (PRIMARY source)"""
    return _safe_json_load(Config.DISCOUNTS_FILE, [])


def save_discounts_data(discounts: List[Dict]) -> bool:
    """Save discounts to local JSON (PRIMARY storage)"""
    return _safe_json_dump(Config.DISCOUNTS_FILE, discounts)


# ============================================
# NOTIFICATIONS
# ============================================

def get_notifications_data() -> List[Dict]:
    """Get notifications from local JSON (PRIMARY source)"""
    return _safe_json_load(Config.NOTIFICATIONS_FILE, [])


def save_notifications_data(notifications: List[Dict]) -> bool:
    """Save notifications to local JSON (PRIMARY storage)"""
    return _safe_json_dump(Config.NOTIFICATIONS_FILE, notifications)


# ============================================
# SETTINGS
# ============================================

def get_settings_data() -> Dict:
    """Get settings from local JSON (PRIMARY source)"""
    return _safe_json_load(Config.SETTINGS_FILE, {})


def save_settings_data(settings: Dict) -> bool:
    """Save settings to local JSON (PRIMARY storage)"""
    return _safe_json_dump(Config.SETTINGS_FILE, settings)


# ============================================
# USER STORES
# ============================================

def get_user_stores_data() -> List[Dict]:
    """Get user stores from local JSON (PRIMARY source)"""
    return _safe_json_load(Config.USERSTORES_FILE, [])


def save_user_stores_data(userstores: List[Dict]) -> bool:
    """Save user stores to local JSON (PRIMARY storage)"""
    return _safe_json_dump(Config.USERSTORES_FILE, userstores)


# ============================================
# STORE INVENTORY
# ============================================

def get_store_inventory_data() -> List[Dict]:
    """Get store inventory from local JSON"""
    return _safe_json_load(Config.STOREINVENTORY_FILE, [])


def save_store_inventory_data(inventory: List[Dict]) -> bool:
    """Save store inventory to local JSON"""
    return _safe_json_dump(Config.STOREINVENTORY_FILE, inventory)


# ============================================
# USER SESSIONS
# ============================================

def get_user_sessions() -> List[Dict]:
    """Get user sessions from local JSON"""
    return _safe_json_load(Config.SESSIONS_FILE, [])


def save_user_sessions(sessions: List[Dict]) -> bool:
    """Save user sessions to local JSON"""
    return _safe_json_dump(Config.SESSIONS_FILE, sessions)
