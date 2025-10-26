# scripts/sync.py - Cleaned and Enhanced Core DB Apply Logic
# Keeps only essential functions used by the app:
#  - apply_change_to_db(table_name, change_type, record_id, change_data, logger)

import os
import sys
import logging
from datetime import datetime
from typing import Dict, Any

# Resolve project root for imports (supports both development and PyInstaller bundle)
if getattr(sys, "frozen", False):
    PROJECT_ROOT = os.path.dirname(sys._MEIPASS)  # type: ignore
else:
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Import database connection pool
from utils.db import DatabaseConnection  # noqa: E402

# Local logger (fallback if caller doesn't pass logger_instance)
logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.DEBUG)


def _get_table_columns(cursor, table_name: str, logger_instance: logging.Logger):
    """
    Fetch column names for a given table to safely filter incoming change_data.
    """
    logger_instance.debug(f"Fetching columns for table: {table_name}")
    cursor.execute(f"DESCRIBE `{table_name}`")
    columns = [row[0] for row in cursor.fetchall()]
    logger_instance.debug(f"Columns for {table_name}: {columns}")
    return columns


def _handle_related_tables(cursor, table_name: str, record_id: str, change_data: Dict[str, Any], logger_instance: logging.Logger):
    """
    Handle operations on related tables that must be kept consistent.

    - Products: sync ProductBarcodes based on 'barcodes' list in change_data
    - Bills: replace BillItems with items[] from change_data
    """
    logger_instance.debug(f"Handling related tables for {table_name} with record ID: {record_id}")
    try:
        if table_name == "Products" and "barcodes" in change_data:
            logger_instance.debug(f"Syncing ProductBarcodes for product {record_id}")
            incoming = change_data.get("barcodes")
            if not isinstance(incoming, list):
                logger_instance.warning(f"Invalid 'barcodes' data for product {record_id}, expected list but got {type(incoming)}. Using empty list.")
                incoming = []

            cursor.execute("SELECT `barcode` FROM `ProductBarcodes` WHERE `productId` = %s", (record_id,))
            existing_barcodes = {row["barcode"] for row in cursor.fetchall()}
            new_barcodes = set(str(b) for b in incoming)

            to_add = new_barcodes - existing_barcodes
            to_remove = existing_barcodes - new_barcodes

            for b in to_add:
                logger_instance.debug(f"Adding barcode {b} to product {record_id}")
                cursor.execute(
                    "INSERT INTO `ProductBarcodes` (`productId`, `barcode`) VALUES (%s, %s)",
                    (record_id, b),
                )

            for b in to_remove:
                logger_instance.debug(f"Removing barcode {b} from product {record_id}")
                cursor.execute(
                    "DELETE FROM `ProductBarcodes` WHERE `productId` = %s AND `barcode` = %s",
                    (record_id, b),
                )

            logger_instance.info(f"Synced ProductBarcodes for product {record_id}. Added: {len(to_add)}, Removed: {len(to_remove)}")

        elif table_name == "Bills" and "items" in change_data:
            logger_instance.debug(f"Replacing BillItems for bill {record_id}")
            items = change_data.get("items") or []
            if not isinstance(items, list):
                logger_instance.warning(f"Invalid 'items' data for bill {record_id}, expected list but got {type(items)}. Using empty list.")
                items = []

            logger_instance.debug(f"Clearing existing BillItems for bill {record_id}")
            cursor.execute("DELETE FROM `BillItems` WHERE `billId` = %s", (record_id,))

            bill_item_columns = _get_table_columns(cursor, "BillItems", logger_instance)

            for item in items:
                if not isinstance(item, dict):
                    logger_instance.warning(f"Skipping invalid bill item for bill {record_id}: {item} (expected dict)")
                    continue

                filtered = {k: v for k, v in item.items() if k in bill_item_columns}
                filtered["billId"] = record_id

                if "productId" not in filtered:
                    logger_instance.warning(f"Skipping bill item for bill {record_id} due to missing 'productId': {item}")
                    continue

                cols = ", ".join(f"`{k}`" for k in filtered.keys())
                vals = ", ".join(["%s"] * len(filtered))
                logger_instance.debug(f"Inserting bill item for bill {record_id}: {filtered}")
                cursor.execute(f"INSERT INTO `BillItems` ({cols}) VALUES ({vals})", list(filtered.values()))

            logger_instance.info(f"Replaced BillItems for bill {record_id}. Total items: {len(items)}")

    except Exception as e:
        logger_instance.error(f"Error syncing related tables for {table_name}:{record_id} -> {e}", exc_info=True)
        raise


def apply_change_to_db(
    table_name: str,
    change_type: str,
    record_id: str,
    change_data: Dict[str, Any],
    logger_instance: logging.Logger,
) -> bool:
    """
    Apply a CREATE, UPDATE, or DELETE change to the target MySQL table.

    logger_instance.info(f"Attempting to apply change: Type={change_type}, Table={table_name}, ID={record_id}")
    logger_instance.debug(f"Change data: {change_data}")
    Behavior:
    - DELETE:
        - For Bills: delete BillItems before deleting Bill
        - For Products: delete ProductBarcodes before deleting Product
        - For Users: delete UserStores links before deleting User
    - CREATE/UPDATE:
        - UPSERT into target table (INSERT ... ON DUPLICATE KEY UPDATE ...)
        - After upsert, sync related tables (e.g., BillItems, ProductBarcodes)

    Returns True on success (committed) and False if rolled back.
    """
    change_type = (change_type or "").upper().strip()

    try:
        with DatabaseConnection.get_connection_ctx() as conn:
            cursor = conn.cursor(dictionary=True)
            conn.start_transaction()

            try:
                if change_type == "DELETE":
                    logger_instance.debug(f"Processing DELETE for {table_name} with ID: {record_id}")
                    if table_name == "Bills":
                        logger_instance.debug(f"Deleting BillItems for bill {record_id}")
                        cursor.execute("DELETE FROM `BillItems` WHERE `billId` = %s", (record_id,))
                    elif table_name == "Products":
                        logger_instance.debug(f"Deleting ProductBarcodes for product {record_id}")
                        cursor.execute("DELETE FROM `ProductBarcodes` WHERE `productId` = %s", (record_id,))
                    elif table_name == "Users":
                        logger_instance.debug(f"Deleting UserStores for user {record_id}")
                        cursor.execute("DELETE FROM `UserStores` WHERE `userId` = %s", (record_id,))

                    logger_instance.debug(f"Deleting primary record from {table_name} with ID: {record_id}")
                    cursor.execute(f"DELETE FROM `{table_name}` WHERE `id` = %s", (record_id,))
                    logger_instance.info(f"DELETE applied to {table_name} for ID: {record_id}. Rows affected: {cursor.rowcount}")

                elif change_type in ("CREATE", "UPDATE"):
                    logger_instance.debug(f"Processing {change_type} for {table_name} with ID: {record_id}")
                    table_columns = _get_table_columns(cursor, table_name, logger_instance)
                    filtered_data = {k: v for k, v in change_data.items() if k in table_columns}
                    logger_instance.info(f"Filtered change_data for {table_name}: {filtered_data}")
                    if "id" not in filtered_data and record_id:
                        if "id" in table_columns:
                            filtered_data["id"] = record_id
                            logger_instance.debug(f"Added record_id {record_id} to filtered_data as 'id'.")

                    if not filtered_data:
                        logger_instance.warning(f"No valid columns found in change_data for table {table_name} after filtering. Rolling back.")
                        conn.rollback()
                        return False

                    cols = ", ".join(f"`{k}`" for k in filtered_data.keys())
                    placeholders = ", ".join(["%s"] * len(filtered_data))
                    updates = ", ".join(f"`{k}` = VALUES(`{k}`)" for k in filtered_data.keys())

                    upsert_sql = f"""
                        INSERT INTO `{table_name}` ({cols})
                        VALUES ({placeholders})
                        ON DUPLICATE KEY UPDATE {updates}
                    """
                    values = list(filtered_data.values())
                    logger_instance.debug(f"Executing UPSERT for {table_name} with data: {filtered_data}")
                    cursor.execute(upsert_sql, values)
                    logger_instance.info(f"Primary {change_type} applied to {table_name} for ID: {record_id}. Rows affected: {cursor.rowcount}")

                    _handle_related_tables(cursor, table_name, record_id, change_data, logger_instance)

                else:
                    logger_instance.error(f"Unsupported change_type: {change_type}. Rolling back.")
                    conn.rollback()
                    return False

                logger_instance.info(f"Connected to DB: {conn.database}")
                conn.commit()
                logger_instance.info(f"✅ Commit done. Total affected: {cursor.rowcount}")
                return True

            except Exception as op_err:
                conn.rollback()
                logger_instance.error(f"DB operation failed for {table_name}:{record_id} (Type: {change_type}) -> {op_err}", exc_info=True)
                return False

    except Exception as conn_err:
        logger_instance.error(f"DB connection error during sync operation: {conn_err}", exc_info=True)
        return False

    except Exception as conn_err:
        logger_instance.error(f"DB connection error: {conn_err}")
        return False
