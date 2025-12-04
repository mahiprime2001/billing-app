# export_data.py – Pull all data from Supabase → JSON

import os
import json
import logging
from datetime import datetime
from typing import Any

# Adjust imports to your structure
from utils.supabase_db import db as SupabaseDBInstance
from config import Config

logger = logging.getLogger(__name__)

def ensure_directories():
    """Create data/, data/json/, data/logs/ if missing."""
    os.makedirs(Config.JSON_DIR, exist_ok=True)
    os.makedirs(Config.LOGS_DIR, exist_ok=True)
    logger.info(f"Ensured directories: {Config.JSON_DIR}, {Config.LOGS_DIR}")

def custom_json_serializer(obj: Any) -> Any:
    """JSON serializer for datetime objects."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

def save_json(filename: str, data: Any):
    """Write data to data/json/<filename>."""
    filepath = os.path.join(Config.JSON_DIR, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=custom_json_serializer)
    logger.info(f"Exported {filepath} ({len(data) if isinstance(data, list) else 'N/A'} records)")

def export_all_data_from_supabase():
    """
    Pull all tables from Supabase and write them to JSON files in data/json/.
    Also ensures data/json/ and data/logs/ exist.
    """
    ensure_directories()

    logger.info("Starting full data export from Supabase...")

    try:
        # 1. Stores
        stores = SupabaseDBInstance.get_stores()
        save_json("stores.json", stores)

        # 2. Users
        users = SupabaseDBInstance.get_users()
        save_json("users.json", users)

        # 3. UserStores (many-to-many)
        # We need a method to fetch all – if you don't have one, add it:
        try:
            response = SupabaseDBInstance.client.table("userstores").select("*").execute()
            userstores = response.data or []
        except Exception as e:
            logger.warning(f"Could not fetch userstores: {e}")
            userstores = []
        save_json("userstores.json", userstores)

        # 4. Products
        products = SupabaseDBInstance.get_products()
        save_json("products.json", products)

        # 5. Customers
        customers = SupabaseDBInstance.get_customers()
        save_json("customers.json", customers)

        # 6. Bills
        bills = SupabaseDBInstance.get_bills(limit=10000)  # Adjust limit as needed
        save_json("bills.json", bills)

        # 7. BillItems
        try:
            response = SupabaseDBInstance.client.table("billitems").select("*").execute()
            billitems = response.data or []
        except Exception as e:
            logger.warning(f"Could not fetch billitems: {e}")
            billitems = []
        save_json("billitems.json", billitems)

        # 8. Batches
        batches = SupabaseDBInstance.get_batches()
        save_json("batches.json", batches)

        # 9. Returns
        returns = SupabaseDBInstance.get_returns(limit=10000)
        save_json("returns.json", returns)

        # 10. Notifications
        notifications = SupabaseDBInstance.get_notifications(limit=10000)
        save_json("notifications.json", notifications)

        # 11. StoreInventory
        try:
            response = SupabaseDBInstance.client.table("storeinventory").select("*").execute()
            storeinventory = response.data or []
        except Exception as e:
            logger.warning(f"Could not fetch storeinventory: {e}")
            storeinventory = []
        save_json("storeinventory.json", storeinventory)

        # 12. SystemSettings
        system_settings = SupabaseDBInstance.get_system_settings() or {}
        # Wrap in dict for consistency with your structure
        settings_data = {
            "systemSettings": system_settings,
            # If you have billFormats in a separate table, fetch them here:
            # "billFormats": ...
        }
        save_json("settings.json", settings_data)

        # 13. Optional: synctable if you want a local backup
        try:
            response = SupabaseDBInstance.client.table("sync_table").select("*").execute()
            synctable = response.data or []
            save_json("synctable.json", synctable)
        except Exception as e:
            logger.warning(f"Could not fetch sync_table: {e}")

        logger.info("✅ Full Supabase export complete.")

    except Exception as e:
        logger.error(f"Error during export_all_data_from_supabase: {e}", exc_info=True)
        raise

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    export_all_data_from_supabase()
