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
logger.setLevel(logging.INFO)


def _get_table_columns(cursor, table_name: str):
    """
    Fetch column names for a given table to safely filter incoming change_data.
    """
    cursor.execute(f"DESCRIBE `{table_name}`")
    return [row[0] for row in cursor.fetchall()]


def _handle_related_tables(cursor, table_name: str, record_id: str, change_data: Dict[str, Any], logger_instance: logging.Logger):
    """
    Handle operations on related tables that must be kept consistent.

    - Products: sync ProductBarcodes based on 'barcodes' list in change_data
    - Bills: replace BillItems with items[] from change_data
    """
    try:
        if table_name == "Products" and "barcodes" in change_data:
            # Sync ProductBarcodes table with incoming list
            incoming = change_data.get("barcodes")
            if not isinstance(incoming, list):
                incoming = []

            # Fetch existing barcodes for this product
            cursor.execute("SELECT `barcode` FROM `ProductBarcodes` WHERE `productId` = %s", (record_id,))
            existing_barcodes = {row["barcode"] for row in cursor.fetchall()}
            new_barcodes = set(str(b) for b in incoming)

            # Add new barcodes
            for b in (new_barcodes - existing_barcodes):
                cursor.execute(
                    "INSERT INTO `ProductBarcodes` (`productId`, `barcode`) VALUES (%s, %s)",
                    (record_id, b),
                )

            # Remove deleted barcodes
            for b in (existing_barcodes - new_barcodes):
                cursor.execute(
                    "DELETE FROM `ProductBarcodes` WHERE `productId` = %s AND `barcode` = %s",
                    (record_id, b),
                )

            logger_instance.info(f"Synced ProductBarcodes for product {record_id}")

        elif table_name == "Bills" and "items" in change_data:
            # Replace BillItems for this bill
            items = change_data.get("items") or []
            if not isinstance(items, list):
                items = []

            # Clear existing items for idempotency
            cursor.execute("DELETE FROM `BillItems` WHERE `billId` = %s", (record_id,))

            # Insert filtered items
            cursor.execute("DESCRIBE `BillItems`")
            bill_item_columns = [row[0] for row in cursor.fetchall()]

            for item in items:
                if not isinstance(item, dict):
                    continue

                filtered = {k: v for k, v in item.items() if k in bill_item_columns}
                filtered["billId"] = record_id

                # Skip if required relation is missing
                if "productId" not in filtered:
                    continue

                cols = ", ".join(f"`{k}`" for k in filtered.keys())
                vals = ", ".join(["%s"] * len(filtered))
                cursor.execute(f"INSERT INTO `BillItems` ({cols}) VALUES ({vals})", list(filtered.values()))

            logger_instance.info(f"Replaced BillItems for bill {record_id}")

        # Extend here if you add more related-table syncing rules

    except Exception as e:
        logger_instance.error(f"Error syncing related tables for {table_name}:{record_id} -> {e}")
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
                    # Handle known FK dependencies first
                    if table_name == "Bills":
                        cursor.execute("DELETE FROM `BillItems` WHERE `billId` = %s", (record_id,))
                    elif table_name == "Products":
                        cursor.execute("DELETE FROM `ProductBarcodes` WHERE `productId` = %s", (record_id,))
                    elif table_name == "Users":
                        cursor.execute("DELETE FROM `UserStores` WHERE `userId` = %s", (record_id,))

                    # Now delete the primary record
                    cursor.execute(f"DELETE FROM `{table_name}` WHERE `id` = %s", (record_id,))
                    logger_instance.info(f"DELETE applied to {table_name} for ID: {record_id}")

                elif change_type in ("CREATE", "UPDATE"):
                    # Filter incoming fields to known columns
                    table_columns = _get_table_columns(cursor, table_name)
                    filtered_data = {k: v for k, v in change_data.items() if k in table_columns}

                    # Ensure primary key is present for UPSERT logic
                    if "id" not in filtered_data and record_id:
                        # Best-effort to set 'id' if caller forgot; only if column exists
                        if "id" in table_columns:
                            filtered_data["id"] = record_id

                    if not filtered_data:
                        logger_instance.warning(f"No valid columns found for table {table_name}")
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
                    cursor.execute(upsert_sql, values)

                    # Handle related tables after primary UPSERT
                    _handle_related_tables(cursor, table_name, record_id, change_data, logger_instance)

                    logger_instance.info(f"{change_type} applied to {table_name} for ID: {record_id}")

                else:
                    logger_instance.error(f"Unsupported change_type: {change_type}")
                    conn.rollback()
                    return False

                conn.commit()
                return True

            except Exception as op_err:
                conn.rollback()
                logger_instance.error(f"DB operation failed for {table_name}:{record_id} -> {op_err}")
                return False

    except Exception as conn_err:
        logger_instance.error(f"DB connection error: {conn_err}")
        return False
