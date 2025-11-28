import os
import sys
import logging
import json
from datetime import datetime
from typing import Dict, Any

# Resolve project root for imports (supports both development and PyInstaller bundle)
if getattr(sys, 'frozen', False):
    PROJECT_ROOT = os.path.dirname(sys._MEIPASS)  # type: ignore
else:
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Import database connection pool
from utils.db import DatabaseConnection  # noqa: E402

logger = logging.getLogger(__name__)
if not logger.handlers:
    # Local logger fallback if caller doesn't pass logger_instance
    import io
    utf8_stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    handler = logging.StreamHandler(utf8_stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)


def get_table_columns(cursor, table_name: str, logger_instance: logging.Logger):
    """
    Fetch column names for a given table.
    Returns a list of column names or empty list if table doesn't exist.
    """
    try:
        cursor.execute(f"SHOW COLUMNS FROM {table_name}")
        columns = [row[0] for row in cursor.fetchall()]
        logger_instance.debug(f"Table '{table_name}' has columns: {columns}")
        return columns
    except Exception as e:
        logger_instance.error(f"Could not retrieve columns for table '{table_name}': {e}")
        return []


def apply_change_to_db(
    table_name: str,
    change_type: str,
    record_id: str,
    change_data: Dict[str, Any],
    logger_instance: logging.Logger,
) -> bool:
    """
    Apply a CREATE, UPDATE, or DELETE change to the target MySQL table.
    Also logs the operation to the 'synctable' for tracking.
    
    **DOES NOT CREATE OR MODIFY TABLE SCHEMAS**
    - Assumes all tables already exist in the database
    - Only performs INSERT, UPDATE, DELETE operations on records
    """
    logger_instance.info(f"Attempting to apply change: Type={change_type}, Table={table_name}, ID={record_id}")
    
    change_type = (change_type or "").upper().strip()
    
    if change_type not in ("CREATE", "UPDATE", "DELETE"):
        logger_instance.error(f"Invalid change_type: '{change_type}'. Must be CREATE, UPDATE, or DELETE.")
        return False
    
    try:
        with DatabaseConnection.get_connection_ctx() as conn:
            cursor = conn.cursor(dictionary=True)
            conn.start_transaction()
            
            try:
                # === HANDLE EACH OPERATION TYPE ===
                
                if change_type == "DELETE":
                    if table_name == "Bills":
                        # Delete in order: deepest children first, then parent
                        
                        # 1. Delete Returns records (references Bills)
                        cursor.execute("DELETE FROM Returns WHERE bill_id = %s", (record_id,))
                        deleted_returns = cursor.rowcount
                        logger_instance.debug(f"Deleted {deleted_returns} Returns for bill {record_id}")
                        
                        # 2. Delete BillItems (references Bills)
                        cursor.execute("DELETE FROM BillItems WHERE billId = %s", (record_id,))
                        deleted_items = cursor.rowcount
                        logger_instance.debug(f"Deleted {deleted_items} BillItems for bill {record_id}")
                        
                        # 3. Now delete the Bill itself
                        delete_query = f"DELETE FROM {table_name} WHERE id = %s"
                        logger_instance.debug(f"Executing: {delete_query} with id={record_id}")
                        cursor.execute(delete_query, (record_id,))
                        
                    elif table_name == "Products":
                        # Delete in order: deepest children first, then parent
                        
                        # 1. Delete ProductBarcodes (references Products)
                        cursor.execute("DELETE FROM ProductBarcodes WHERE productId = %s", (record_id,))
                        logger_instance.debug(f"Deleted {cursor.rowcount} ProductBarcodes for product {record_id}")
                        
                        # 2. Update BillItems (set productId to NULL to preserve billing history)
                        cursor.execute("UPDATE BillItems SET productId = NULL WHERE productId = %s", (record_id,))
                        logger_instance.debug(f"Set productId to NULL for {cursor.rowcount} BillItems for product {record_id}")
                        
                        # 3. Update Returns (set product_id to NULL to preserve history)
                        cursor.execute("UPDATE Returns SET product_id = NULL WHERE product_id = %s", (record_id,))
                        logger_instance.debug(f"Set product_id to NULL for {cursor.rowcount} Returns for product {record_id}")
                        
                        # 4. Delete StoreInventory (references Products)
                        cursor.execute("DELETE FROM StoreInventory WHERE productId = %s", (record_id,))
                        logger_instance.debug(f"Deleted {cursor.rowcount} StoreInventory for product {record_id}")
                        
                        # 5. Now delete the Product itself
                        delete_query = f"DELETE FROM {table_name} WHERE id = %s"
                        logger_instance.debug(f"Executing: {delete_query} with id={record_id}")
                        cursor.execute(delete_query, (record_id,))
                        
                    else:
                        # Standard delete for tables without children
                        delete_query = f"DELETE FROM {table_name} WHERE id = %s"
                        logger_instance.debug(f"Executing: {delete_query} with id={record_id}")
                        cursor.execute(delete_query, (record_id,))
                    
                elif change_type == "CREATE":
                    # INSERT operation
                    columns = get_table_columns(cursor, table_name, logger_instance)
                    if not columns:
                        logger_instance.error(f"Cannot CREATE - table '{table_name}' not found or has no columns")
                        return False
                    
                    # Filter change_data to only include columns that exist in the table
                    filtered_data = {k: v for k, v in change_data.items() if k in columns}
                    
                    if not filtered_data:
                        logger_instance.warning(f"No valid columns to INSERT for table '{table_name}'")
                        return False
                    
                    col_names = ", ".join(filtered_data.keys())
                    placeholders = ", ".join(["%s"] * len(filtered_data))
                    values = tuple(filtered_data.values())
                    
                    insert_query = f"INSERT INTO {table_name} ({col_names}) VALUES ({placeholders})"
                    logger_instance.debug(f"Executing: {insert_query} with values={values}")
                    cursor.execute(insert_query, values)
                    
                elif change_type == "UPDATE":
                    # UPDATE operation
                    columns = get_table_columns(cursor, table_name, logger_instance)
                    if not columns:
                        logger_instance.error(f"Cannot UPDATE - table '{table_name}' not found or has no columns")
                        return False
                    
                    # Filter change_data to only include columns that exist
                    filtered_data = {k: v for k, v in change_data.items() if k in columns and k != "id"}
                    
                    if not filtered_data:
                        logger_instance.warning(f"No valid columns to UPDATE for table '{table_name}'")
                        return False
                    
                    set_clause = ", ".join([f"{k} = %s" for k in filtered_data.keys()])
                    values = tuple(list(filtered_data.values()) + [record_id])
                    
                    update_query = f"UPDATE {table_name} SET {set_clause} WHERE id = %s"
                    logger_instance.debug(f"Executing: {update_query} with values={values}")
                    cursor.execute(update_query, values)
                
                # === LOG TO SYNC TABLE ===
                try:
                    change_data_json = json.dumps(change_data, default=str, ensure_ascii=False)
                    sync_query = """
                        INSERT INTO synctable 
                        (tablename, recordid, operationtype, changedata, source, status, createdat)
                        VALUES (%s, %s, %s, %s, 'local', 'synced', NOW())
                    """
                    cursor.execute(sync_query, (
                        table_name,
                        str(record_id),
                        change_type,
                        change_data_json
                    ))
                    logger_instance.debug(f"Logged to synctable: {table_name}/{record_id}/{change_type}")
                except Exception as sync_err:
                    logger_instance.warning(f"Could not log to synctable (table may not exist): {sync_err}")
                    # Don't fail the main operation if sync logging fails
                
                # === COMMIT TRANSACTION ===
                conn.commit()
                logger_instance.info(f"✓ Commit done. Total affected: {cursor.rowcount}")
                return True
                
            except Exception as op_err:
                conn.rollback()
                logger_instance.error(
                    f"DB operation failed for {table_name}/{record_id} (Type: {change_type}): {op_err}",
                    exc_info=True
                )
                return False
                
    except Exception as conn_err:
        logger_instance.error(f"DB connection error: {conn_err}")
        return False
