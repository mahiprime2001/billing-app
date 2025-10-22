# sync_manager.py - Main Enhanced Sync System
# This is the core sync manager that handles all sync operations

import os
import sys
import json
import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import schedule
import glob # Import glob for file pattern matching

# Determine the base directory for resource loading
if getattr(sys, 'frozen', False):
    PROJECT_ROOT = os.path.dirname(sys._MEIPASS)  # type: ignore
else:
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Setup logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

if not logger.handlers:
    # Ensure logs directory exists
    log_dir = os.path.join(PROJECT_ROOT, 'backend', 'data', 'logs')
    # Safely ensure log directory exists
    if not os.path.exists(log_dir):
        try:
            os.makedirs(log_dir, exist_ok=True)
            logger.info(f"Created log directory: {log_dir}")
        except Exception as e:
            logger.error(f"Failed to create log directory {log_dir}: {e}")
    else:
        logger.debug(f"Log directory already exists: {log_dir}")

    # File handler for daily logs
    log_file_name = datetime.now().strftime("sync_manager-%Y-%m-%d.log")
    file_handler = logging.FileHandler(os.path.join(log_dir, log_file_name))
    file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(file_handler)

    # Stream handler for console output (optional, can be removed if only file logging is desired)
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(stream_handler)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.db import DatabaseConnection  # noqa: E402


class EnhancedSyncManager:
    """
    Enhanced Sync Manager that handles:
    1. CRUD operation logging to a local sync table (JSON)
    2. Sequential log processing with retry mechanism
    3. Pulling changes from MySQL sync_table every 15 minutes
    4. Cleanup of logs older than 30 days
    """

    MAX_RETRY_ATTEMPTS = 3 # Define max retry attempts for failed sync logs

    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        self.local_sync_table_file = os.path.join(base_dir, 'data', 'json', 'local_sync_table.json')
        self.sync_logs_file = os.path.join(base_dir, 'data', 'json', 'sync_logs.json')
        self.settings_file = os.path.join(base_dir, 'data', 'json', 'settings.json')
        self.is_running = False
        self.sync_thread = None

        # Ensure directories exist
        self._ensure_directory_exists(os.path.dirname(self.local_sync_table_file))
        self._ensure_directory_exists(os.path.dirname(self.sync_logs_file))
        self._ensure_directory_exists(os.path.dirname(self.settings_file))
        self.user_sessions_file = os.path.join(base_dir, 'data', 'json', 'user_sessions.json')
        self._ensure_directory_exists(os.path.dirname(self.user_sessions_file))
        self.log_dir = os.path.join(PROJECT_ROOT, 'backend', 'data', 'logs') # Store log directory

    def _cleanup_log_files(self, days_to_keep: int = 15) -> None:
        """
        Cleans up old sync_manager log files from the log directory.
        Files older than `days_to_keep` will be deleted.
        """
        logger.info(f"Starting cleanup of log files older than {days_to_keep} days.")
        cutoff_date = datetime.now() - timedelta(days=days_to_keep)
        log_files = glob.glob(os.path.join(self.log_dir, "sync_manager-*.log"))

        cleaned_count = 0
        for log_file in log_files:
            try:
                # Extract date from filename (e.g., sync_manager-YYYY-MM-DD.log)
                file_date_str = os.path.basename(log_file).replace('sync_manager-', '').replace('.log', '')
                file_date = datetime.strptime(file_date_str, "%Y-%m-%d")

                if file_date < cutoff_date:
                    os.remove(log_file)
                    logger.debug(f"Deleted old log file: {log_file}")
                    cleaned_count += 1
            except ValueError:
                logger.warning(f"Could not parse date from log file name: {log_file}. Skipping.")
            except Exception as e:
                logger.error(f"Error deleting log file {log_file}: {e}", exc_info=True)
        logger.info(f"Finished log file cleanup. Removed {cleaned_count} old log files.")

    def _get_user_sessions(self) -> List[Dict]:
        return self._safe_json_load(self.user_sessions_file, [])

    def _save_user_sessions(self, rows: List[Dict]) -> None:
        self._safe_json_dump(self.user_sessions_file, rows)

    def _append_user_session(self, event: Dict) -> None:
        rows = self._get_user_sessions()
        rows.append(event)
        self._save_user_sessions(rows)

    def _ensure_directory_exists(self, path: str) -> None:
        """Safely ensures a directory exists, logging creation or existence."""
        if not os.path.exists(path):
            try:
                os.makedirs(path, exist_ok=True)
                logger.info(f"Created directory: {path}")
            except Exception as e:
                logger.error(f"Failed to create directory {path}: {e}")
        else:
            logger.debug(f"Directory already exists: {path}")

    # ---------- JSON helpers ----------

    def _safe_json_load(self, path: str, default_value: Any) -> Any:
        """Safely load JSON data from file"""
        if not os.path.exists(path):
            return default_value
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading JSON from {path}: {e}")
            return default_value

    def _safe_json_dump(self, path: str, data: Any) -> None:
        """Safely dump JSON data to file"""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Error saving JSON to {path}: {e}")

    def get_local_sync_table(self) -> List[Dict]:
        """Get local sync table data"""
        return self._safe_json_load(self.local_sync_table_file, [])

    def save_local_sync_table(self, data: List[Dict]) -> None:
        """Save local sync table data"""
        self._safe_json_dump(self.local_sync_table_file, data)

    def get_sync_logs(self) -> List[Dict]:
        """Get sync logs data"""
        return self._safe_json_load(self.sync_logs_file, [])

    def save_sync_logs(self, data: List[Dict]) -> None:
        """Save sync logs data"""
        self._safe_json_dump(self.sync_logs_file, data)

    def get_settings(self) -> Dict:
        """Get settings data"""
        return self._safe_json_load(self.settings_file, {})

    def save_settings(self, data: Dict) -> None:
        """Save settings data"""
        self._safe_json_dump(self.settings_file, data)

    def get_last_sync_timestamp(self) -> Optional[str]:
        """Get last sync timestamp"""
        settings = self.get_settings()
        return settings.get('systemSettings', {}).get('last_sync_time')

    def set_last_sync_timestamp(self, timestamp: str) -> None:
        """Set last sync timestamp"""
        settings = self.get_settings()
        if 'systemSettings' not in settings:
            settings['systemSettings'] = {}
        settings['systemSettings']['last_sync_time'] = timestamp
        self.save_settings(settings)

    # ---------- Public logging APIs ----------

    def log_crud_operation(self, table_name: str, operation_type: str, record_id: str, data: Dict) -> None:
        """
        Log CRUD operation to local sync table (main entrypoint to queue changes).
        """
        sync_table = self.get_local_sync_table()

        # Deduplicate pending changes for same record and table
        sync_table = [
            entry for entry in sync_table
            if not (entry.get('table_name') == table_name and
                    entry.get('record_id') == record_id and
                    entry.get('status') == 'pending')
        ]

        # Generate unique ID
        max_id = max([entry.get('id', 0) for entry in sync_table], default=0)

        new_entry = {
            "id": max_id + 1,
            "sync_time": datetime.now().isoformat(),
            "table_name": table_name,      # e.g., 'Products'
            "change_type": operation_type, # 'CREATE' | 'UPDATE' | 'DELETE'
            "record_id": record_id,
            "change_data": data,
            "status": "pending",           # 'pending' | 'completed' | 'failed' | 'skipped'
            "retry_count": 0,
            "last_retry": None,
            "error_message": None,
            "created_at": datetime.now().isoformat()
        }

        sync_table.append(new_entry)
        self.save_local_sync_table(sync_table)

        logger.info(f"Logged CRUD operation: {table_name} - {operation_type} - {record_id}")

        # Also log to sync logs
        self.log_sync_event(f"{table_name}_{operation_type.lower()}_logged", "pending", {
            "table_name": table_name,
            "record_id": record_id,
            "operation_type": operation_type
        })

        # Immediately process pending logs after a new operation is logged
        logger.info(f"Triggering immediate processing for {table_name} - {operation_type} - {record_id}")
        self.process_pending_logs()

    def log_sync_event(self, event_type: str, status: str, details: Dict) -> None:
        """Log sync event to sync logs"""
        sync_logs = self.get_sync_logs()
        max_id = max([log.get('id', 0) for log in sync_logs], default=0)

        new_log = {
            "id": max_id + 1,
            "timestamp": datetime.now().isoformat(),
            "eventType": event_type,
            "status": status,
            "details": details
        }

        sync_logs.append(new_log)
        self.save_sync_logs(sync_logs)
        logger.info(f"Logged sync event: {event_type} - {status}")

    # ---------- DB write pipeline ----------

    def apply_change_to_mysql_db(self, table_name: str, change_type: str, record_id: str, change_data: Dict) -> bool:
        """
        Apply change to MySQL database with upsert/related-table handling.
        """
        try:
            with DatabaseConnection.get_connection_ctx() as conn:
                cursor = conn.cursor(dictionary=True)
                conn.start_transaction()

                try:
                    if change_type == 'DELETE':
                        # Handle foreign keys first
                        if table_name == 'Bills':
                            cursor.execute("DELETE FROM `BillItems` WHERE `billId` = %s", (record_id,))
                        elif table_name == 'Products':
                            cursor.execute("DELETE FROM `ProductBarcodes` WHERE `productId` = %s", (record_id,))
                        elif table_name == 'Users':
                            cursor.execute("DELETE FROM `UserStores` WHERE `userId` = %s", (record_id,))
                        elif table_name == 'Stores':
                            cursor.execute("DELETE FROM `UserStores` WHERE `storeId` = %s", (record_id,))

                        cursor.execute(f"DELETE FROM `{table_name}` WHERE `id` = %s", (record_id,))
                        logger.info(f"DELETE operation on table `{table_name}` for record ID: {record_id} successful.")

                    elif change_type in ['CREATE', 'UPDATE']:
                        logger.debug(f"Attempting {change_type} operation on table `{table_name}` for record ID: {record_id}")
                        # Get table columns
                        cursor.execute(f"DESCRIBE `{table_name}`")
                        table_columns = [row['Field'] for row in cursor.fetchall()]
                        logger.debug(f"Table `{table_name}` columns: {table_columns}")

                        # Apply specific mappings for 'batch' table to match DB schema
                        processed_change_data = dict(change_data) # Create a mutable copy
                        if table_name == 'batch':
                            if 'batchNumber' in processed_change_data and 'batch_number' in table_columns:
                                processed_change_data['batch_number'] = processed_change_data.pop('batchNumber')
                            # 'place' is already correctly named as 'place' in both frontend and DB, no change needed.

                        # Filter data by valid columns
                        filtered_data = {k: v for k, v in processed_change_data.items() if k in table_columns}
                        logger.debug(f"Filtered data for {change_type} on `{table_name}`: {filtered_data}")

                        # Ensure primary key exists for upsert path
                        if 'id' not in filtered_data and record_id and 'id' in table_columns:
                            filtered_data['id'] = record_id
                            logger.debug(f"Added record_id {record_id} to filtered_data for {table_name}.")

                        if not filtered_data:
                            logger.warning(f"No valid columns found for {table_name} after filtering. Rolling back transaction.")
                            conn.rollback()
                            return False

                        # Build upsert
                        columns = ', '.join([f"`{key}`" for key in filtered_data.keys()])
                        placeholders = ', '.join(['%s'] * len(filtered_data))
                        update_placeholders = ', '.join([f"`{col}` = VALUES(`{col}`)" for col in filtered_data.keys()])

                        query = f"""
                        INSERT INTO `{table_name}` ({columns})
                        VALUES ({placeholders})
                        ON DUPLICATE KEY UPDATE {update_placeholders}
                        """
                        values = list(filtered_data.values())
                        logger.debug(f"Executing UPSERT query for `{table_name}`: {query} with values: {values}")
                        cursor.execute(query, values)

                        # Handle related tables
                        self._handle_related_tables(cursor, table_name, record_id, change_data)

                        logger.info(f"{change_type} operation on table `{table_name}` for record ID: {record_id} successful.")

                    conn.commit()
                    logger.debug(f"Transaction committed for {change_type} on `{table_name}` for record ID: {record_id}.")
                    return True

                except Exception as e:
                    conn.rollback()
                    logger.error(f"Error in database operation for {table_name} (ID: {record_id}): {e}", exc_info=True)
                    return False

        except Exception as e:
            logger.error(f"Error connecting to database for operation on {table_name} (ID: {record_id}): {e}", exc_info=True)
            return False

    def _handle_related_tables(self, cursor, table_name: str, record_id: str, change_data: Dict) -> None:
        """Handle related table operations"""
        logger.debug(f"Handling related tables for {table_name} with record ID: {record_id} and change data: {change_data}")
        if table_name == 'Products' and 'barcodes' in change_data:
            # ProductBarcodes maintenance
            barcodes = change_data.get('barcodes')
            barcodes = barcodes if isinstance(barcodes, list) else []
            logger.debug(f"Processing barcodes for product ID {record_id}: {barcodes}")

            cursor.execute("SELECT `barcode` FROM `ProductBarcodes` WHERE `productId` = %s", (record_id,))
            existing_barcodes = {row['barcode'] for row in cursor.fetchall()}
            new_barcodes = {str(b) for b in barcodes}
            logger.debug(f"Existing barcodes: {existing_barcodes}, New barcodes: {new_barcodes}")

            # Add new
            for b in (new_barcodes - existing_barcodes):
                logger.debug(f"Adding new barcode {b} for product ID {record_id}")
                cursor.execute(
                    "INSERT INTO `ProductBarcodes` (`productId`, `barcode`) VALUES (%s, %s)",
                    (record_id, b)
                )

            # Remove old
            for b in (existing_barcodes - new_barcodes):
                logger.debug(f"Removing old barcode {b} for product ID {record_id}")
                cursor.execute(
                    "DELETE FROM `ProductBarcodes` WHERE `productId` = %s AND `barcode` = %s",
                    (record_id, b)
                )
            logger.debug(f"Finished barcode maintenance for product ID {record_id}")

        elif table_name == 'Bills' and 'items' in change_data:
            # Replace BillItems
            bill_items = change_data.get('items') or []
            bill_items = bill_items if isinstance(bill_items, list) else []
            logger.debug(f"Processing bill items for bill ID {record_id}: {bill_items}")

            logger.debug(f"Deleting existing bill items for bill ID {record_id}")
            cursor.execute("DELETE FROM `BillItems` WHERE `billId` = %s", (record_id,))

            cursor.execute("DESCRIBE `BillItems`")
            bill_item_columns = [row['Field'] for row in cursor.fetchall()]
            logger.debug(f"BillItems table columns: {bill_item_columns}")

            for item in bill_items:
                if not isinstance(item, dict):
                    logger.warning(f"Skipping invalid bill item format: {item}")
                    continue

                filtered_item_data = {k: v for k, v in item.items() if k in bill_item_columns}
                filtered_item_data['billId'] = record_id

                if 'productId' not in filtered_item_data:
                    logger.warning(f"Bill item missing 'productId', skipping: {item}")
                    continue

                item_columns = ', '.join([f"`{key}`" for key in filtered_item_data.keys()])
                item_placeholders = ', '.join(['%s'] * len(filtered_item_data))
                item_query = f"INSERT INTO `BillItems` ({item_columns}) VALUES ({item_placeholders})"
                logger.debug(f"Inserting bill item for bill ID {record_id}: {item_query} with values {list(filtered_item_data.values())}")
                cursor.execute(item_query, list(filtered_item_data.values()))
            logger.debug(f"Finished bill item maintenance for bill ID {record_id}")

    # ---------- Process pipeline ----------

    def process_pending_logs(self) -> Dict:
        """
        Process pending logs sequentially (1-by-1).
        Marks success/failed and records retry metadata.
        """
        sync_table = self.get_local_sync_table()
        pending_logs = [log for log in sync_table if log.get('status') == 'pending']

        if not pending_logs:
            logger.info("No pending sync logs to process.")
            return {"status": "success", "message": "No pending logs", "processed": 0, "failed": 0}

        logger.info(f"Processing {len(pending_logs)} pending sync logs sequentially...")

        processed = 0
        failed = 0

        for log_entry in pending_logs:
            log_id = log_entry.get('id')
            table_name = log_entry.get('table_name')
            change_type = log_entry.get('change_type')
            record_id = log_entry.get('record_id')
            change_data = log_entry.get('change_data', {})

            logger.info(f"Attempting to process log ID {log_id}: Table `{table_name}`, Type `{change_type}`, Record ID `{record_id}`.")
            logger.debug(f"Log ID {log_id} details: {log_entry}")

            # Attempt to apply change
            success = self.apply_change_to_mysql_db(table_name, change_type, record_id, change_data)

            if success:
                for entry in sync_table:
                    if entry.get('id') == log_id:
                        entry['status'] = 'completed'
                        entry['completed_at'] = datetime.now().isoformat()
                        logger.debug(f"Log ID {log_id} marked as 'completed'.")
                        break

                self.log_sync_event(f"{table_name}_{change_type.lower()}_success", "completed", {
                    "log_id": log_id,
                    "table_name": table_name,
                    "record_id": record_id
                })

                processed += 1
                logger.info(f"Successfully processed log ID {log_id}.")

            else:
                for entry in sync_table:
                    if entry.get('id') == log_id:
                        entry['status'] = 'failed'
                        entry['retry_count'] = entry.get('retry_count', 0) + 1
                        entry['last_retry'] = datetime.now().isoformat()
                        entry['error_message'] = "Database operation failed"
                        logger.debug(f"Log ID {log_id} marked as 'failed'. Retry count: {entry['retry_count']}")
                        break

                self.log_sync_event(f"{table_name}_{change_type.lower()}_failed", "failed", {
                    "log_id": log_id,
                    "table_name": table_name,
                    "record_id": record_id
                })

                failed += 1
                logger.warning(f"Failed to process log ID {log_id}. Will retry later if attempts remain.")

        self.save_local_sync_table(sync_table)
        logger.info(f"Finished processing pending logs. Processed: {processed}, Failed: {failed}.")

        return {
            "status": "success",
            "message": f"Processed {processed} logs, {failed} failed",
            "processed": processed,
            "failed": failed
        }

    def retry_failed_logs(self) -> Dict:
        """
        Retry failed logs by resetting them back to 'pending' (max 3 attempts).
        """
        sync_table = self.get_local_sync_table()
        failed_logs = [log for log in sync_table if log.get('status') == 'failed']

        if not failed_logs:
            logger.info("No failed logs to retry.")
            return {"status": "success", "message": "No failed logs", "retried": 0}

        logger.info(f"Attempting to retry {len(failed_logs)} failed sync logs...")

        retried = 0

        for log_entry in failed_logs:
            log_id = log_entry.get('id')
            retry_count = log_entry.get('retry_count', 0)

            # Limit retries
            if retry_count >= self.MAX_RETRY_ATTEMPTS:
                logger.warning(f"Log ID {log_id} has exceeded max retry attempts ({retry_count}). Marking as 'skipped'.")
                for entry in sync_table:
                    if entry.get('id') == log_id:
                        entry['status'] = 'skipped' # Mark as skipped to prevent further retries
                        entry['error_message'] = f"Exceeded max retry attempts ({self.MAX_RETRY_ATTEMPTS})"
                        break
                continue

            for entry in sync_table:
                if entry.get('id') == log_id:
                    entry['status'] = 'pending'
                    logger.debug(f"Log ID {log_id} status reset to 'pending' for retry. Current retry count: {retry_count}.")
                    break

            retried += 1

        self.save_local_sync_table(sync_table)

        if retried > 0:
            logger.info(f"Successfully reset {retried} failed logs to 'pending'. Now processing them.")
            result = self.process_pending_logs()
            result['retried'] = retried
            return result

        logger.info("No logs eligible for retry after checking retry counts.")
        return {"status": "success", "message": "No logs eligible for retry", "retried": 0}

    # ---------- Pull pipeline ----------

    def pull_from_mysql_sync_table(self) -> Dict:
        """
        Pull changes from MySQL sync_table since last_sync_time and apply to local JSON.
        """
        try:
            with DatabaseConnection.get_connection_ctx() as conn:
                cursor = conn.cursor(dictionary=True)

                last_sync = self.get_last_sync_timestamp()
                logger.info(f"Starting pull from MySQL sync_table. Last sync timestamp: {last_sync or 'None (fetching last 1 day)'}")

                if last_sync:
                    cursor.execute("""
                        SELECT * FROM `sync_table`
                        WHERE `timestamp` > %s
                        ORDER BY `timestamp` ASC
                    """, (last_sync,))
                else:
                    cursor.execute("""
                        SELECT * FROM `sync_table`
                        WHERE `timestamp` >= DATE_SUB(NOW(), INTERVAL 1 DAY)
                        ORDER BY `timestamp` ASC
                    """)

                new_entries = cursor.fetchall()

                if not new_entries:
                    logger.info("No new entries found in MySQL sync_table.")
                    return {"status": "success", "message": "No new entries", "pulled": 0}

                logger.info(f"Pulled {len(new_entries)} new entries from MySQL sync_table.")

                applied = 0
                for entry in new_entries:
                    try:
                        change_type = (entry.get('change_type') or '').upper()
                        ts = entry.get('timestamp')
                        payload = json.loads(entry.get('change_data') or '{}') if isinstance(entry.get('change_data'), (str, bytes)) else (entry.get('change_data') or {})
                        logger.debug(f"Processing pulled entry: Type `{change_type}`, Timestamp `{ts}`, Payload: {payload}")

                        # Handle session events
                        if change_type in {'LOGIN', 'LOGOUT', 'CLOSE_NO_LOGOUT'}:
                            self._append_user_session({
                                'timestamp': (ts.isoformat() if hasattr(ts, 'isoformat') else str(ts)),
                                'type': change_type,
                                'userId': payload.get('user_id') or payload.get('id') or payload.get('email'),
                                'details': payload.get('details')
                            })
                            logger.info(f"Logged user session event: {change_type} for user {payload.get('user_id') or payload.get('id') or payload.get('email')}")
                            continue
                        # Existing CRUD path:
                        change_data = json.loads(entry.get('change_data', '{}'))
                        parts = (change_type or '').split('_')
                        if len(parts) >= 2:
                            table_name = '_'.join(parts[:-1])
                            operation = parts[-1].upper()
                            logger.debug(f"Applying pulled CRUD change to local JSON: Table `{table_name}`, Operation `{operation}`, Data: {change_data}")
                            self._apply_to_local_json(table_name, operation, change_data)
                            applied += 1
                        else:
                            logger.warning(f"Skipping malformed change_type from MySQL sync_table: {change_type}")
                    except Exception as e:
                        logger.error(f"Error applying pulled change from MySQL sync_table (entry ID: {entry.get('id')}): {e}", exc_info=True)

                if new_entries:
                    latest_timestamp = max(entry['timestamp'] for entry in new_entries if entry.get('timestamp'))
                    if latest_timestamp:
                        self.set_last_sync_timestamp(latest_timestamp.isoformat())
                        logger.info(f"Updated last sync timestamp to: {latest_timestamp.isoformat()}")

                logger.info(f"Finished pulling from MySQL sync_table. Pulled: {len(new_entries)}, Applied: {applied}.")
                return {
                    "status": "success",
                    "message": f"Pulled {len(new_entries)} entries, applied {applied}",
                    "pulled": len(new_entries),
                    "applied": applied
                }

        except Exception as e:
            logger.error(f"Error pulling from MySQL sync_table: {e}", exc_info=True)
            return {"status": "error", "message": str(e)}

    def _apply_to_local_json(self, table_name: str, operation: str, change_data: Dict) -> None:
        """Apply pulled changes to local JSON files"""
        json_file_mapping = {
            'Products': 'products.json',
            'Users': 'users.json',
            'Bills': 'bills.json',
            'Customers': 'customers.json',
            'Stores': 'stores.json',
            'SystemSettings': 'settings.json',
            'Notifications': 'notifications.json'
        }

        json_file = json_file_mapping.get(table_name)
        if not json_file:
            logger.warning(f"No local JSON file mapping found for table name: {table_name}. Skipping local application.")
            return

        file_path = os.path.join(self.base_dir, 'data', 'json', json_file)
        logger.debug(f"Applying {operation} operation to local JSON file: {file_path} for table `{table_name}`.")

        if json_file == 'settings.json':
            settings = self._safe_json_load(file_path, {})
            if operation in ['CREATE', 'UPDATE']:
                settings.update(change_data)
                logger.debug(f"Updating settings.json with data: {change_data}")
            self._safe_json_dump(file_path, settings)
            logger.info(f"Applied {operation} to {json_file}.")
            return

        data = self._safe_json_load(file_path, [])
        record_id = change_data.get('id')
        logger.debug(f"Current data in {json_file}: {data}")

        if operation in ['CREATE', 'UPDATE']:
            found = False
            for i, item in enumerate(data):
                if item.get('id') == record_id:
                    data[i] = change_data
                    found = True
                    logger.debug(f"Record ID {record_id} found and updated in {json_file}.")
                    break
            if not found:
                data.append(change_data)
                logger.debug(f"Record ID {record_id} not found, appended to {json_file}.")

        elif operation == 'DELETE':
            initial_len = len(data)
            data = [item for item in data if item.get('id') != record_id]
            if len(data) < initial_len:
                logger.debug(f"Record ID {record_id} deleted from {json_file}.")
            else:
                logger.debug(f"Record ID {record_id} not found for deletion in {json_file}.")

        self._safe_json_dump(file_path, data)
        logger.info(f"Applied {operation} to {json_file} for record {record_id}.")

    # ---------- Maintenance ----------

    def cleanup_old_logs(self) -> Dict:
        """
        Clean up logs older than 30 days (local sync table, local sync logs, and MySQL sync_table).
        """
        cutoff_date = datetime.now() - timedelta(days=30)
        logger.info(f"Starting cleanup of logs older than 30 days. Cutoff date: {cutoff_date.isoformat()}")

        # Local sync table
        sync_table = self.get_local_sync_table()
        original_count = len(sync_table)
        sync_table = [
            entry for entry in sync_table
            if datetime.fromisoformat(entry.get('created_at', entry.get('sync_time', datetime.now().isoformat()))) > cutoff_date
        ]
        local_cleaned = original_count - len(sync_table)
        self.save_local_sync_table(sync_table)
        logger.info(f"Local sync table cleanup: {local_cleaned} entries removed.")

        # Local sync logs
        sync_logs = self.get_sync_logs()
        original_logs_count = len(sync_logs)
        sync_logs = [
            log for log in sync_logs
            if datetime.fromisoformat(log.get('timestamp', datetime.now().isoformat())) > cutoff_date
        ]
        logs_cleaned = original_logs_count - len(sync_logs)
        self.save_sync_logs(sync_logs)
        logger.info(f"Local sync logs cleanup: {logs_cleaned} entries removed.")

        # MySQL sync_table
        mysql_cleaned = 0
        try:
            with DatabaseConnection.get_connection_ctx() as conn:
                cursor = conn.cursor()
                logger.debug(f"Deleting entries from MySQL `sync_table` older than {cutoff_date.isoformat()}")
                cursor.execute("DELETE FROM `sync_table` WHERE `timestamp` < %s", (cutoff_date,))
                mysql_cleaned = cursor.rowcount
                conn.commit()
                logger.info(f"MySQL sync_table cleanup: {mysql_cleaned} entries removed.")
        except Exception as e:
            logger.error(f"Error cleaning MySQL sync_table: {e}", exc_info=True)

        logger.info(f"Cleanup completed: {local_cleaned} local entries, {logs_cleaned} logs, {mysql_cleaned} MySQL entries.")

        return {
            "status": "success",
            "local_cleaned": local_cleaned,
            "logs_cleaned": logs_cleaned,
            "mysql_cleaned": mysql_cleaned
        }

    # ---------- Scheduler / Status ----------

    def start_background_sync(self) -> None:
        """
        Start background sync process on schedule:
        - every 15 minutes: push pending logs and pull from MySQL
        - every 15 minutes: retry failed logs
        - daily 02:00: cleanup old logs
        """
        if self.is_running:
            logger.info("Background sync already running.")
            return

        self.is_running = True
        logger.info("Starting background sync scheduler setup.")

        schedule.every(15).minutes.do(self.scheduled_sync)
        schedule.every(15).minutes.do(self.retry_failed_logs)
        schedule.every().day.at("02:00").do(self.cleanup_old_logs)
        schedule.every().day.at("02:00").do(self._cleanup_log_files, days_to_keep=15) # Schedule log file cleanup
        logger.debug("Scheduled tasks: scheduled_sync (15min), retry_failed_logs (15min), cleanup_old_logs (daily 02:00), _cleanup_log_files (daily 02:00).")

        def run_scheduler():
            logger.info("Background sync scheduler thread started.")

            # Initial run
            logger.info("Performing initial scheduled sync run.")
            self.scheduled_sync()

            while self.is_running:
                schedule.run_pending()
                time.sleep(60)  # Check every minute
            logger.info("Background sync scheduler thread stopped.")

        self.sync_thread = threading.Thread(target=run_scheduler, daemon=True)
        self.sync_thread.start()

        logger.info("Background sync process started.")

    def scheduled_sync(self) -> None:
        """Scheduled sync operation - runs every 15 minutes"""
        logger.info("Initiating scheduled sync operation.")

        try:
            push_result = self.process_pending_logs()
            logger.info(f"Push sync result: {push_result}")

            pull_result = self.pull_from_mysql_sync_table()
            logger.info(f"Pull sync result: {pull_result}")

            self.log_sync_event("scheduled_sync", "completed", {
                "push_result": push_result,
                "pull_result": pull_result,
                "sync_time": datetime.now().isoformat()
            })
            logger.info("Scheduled sync operation completed successfully.")

        except Exception as e:
            logger.error(f"Error during scheduled sync: {e}", exc_info=True)
            self.log_sync_event("scheduled_sync", "failed", {
                "error": str(e),
                "sync_time": datetime.now().isoformat()
            })
            logger.error("Scheduled sync operation failed.")

    def stop_background_sync(self) -> None:
        """Stop background sync process"""
        self.is_running = False
        if self.sync_thread:
            logger.info("Attempting to join sync thread.")
            self.sync_thread.join(timeout=5)
            if self.sync_thread.is_alive():
                logger.warning("Sync thread did not terminate within timeout.")
        logger.info("Background sync process stopped.")

    def get_sync_status(self) -> Dict:
        """Get current sync status"""
        sync_table = self.get_local_sync_table()

        pending_count = len([log for log in sync_table if log.get('status') == 'pending'])
        failed_count = len([log for log in sync_table if log.get('status') == 'failed'])
        completed_count = len([log for log in sync_table if log.get('status') == 'completed'])
        logger.debug(f"Current sync status: Pending={pending_count}, Failed={failed_count}, Completed={completed_count}")

        return {
            "is_running": self.is_running,
            "last_sync": self.get_last_sync_timestamp(),
            "pending_logs": pending_count,
            "failed_logs": failed_count,
            "completed_logs": completed_count,
            "total_logs": len(sync_table)
        }


# Global instance holder
sync_manager_instance: Optional[EnhancedSyncManager] = None

def get_sync_manager(base_dir: Optional[str] = None) -> EnhancedSyncManager:
    """Get or create sync manager instance"""
    global sync_manager_instance
    if sync_manager_instance is None:
        base = base_dir or os.environ.get('APP_BASE_DIR', os.getcwd())
        sync_manager_instance = EnhancedSyncManager(base)
    return sync_manager_instance


# Integration helper for app endpoints
def log_json_crud_operation(json_type: str, operation: str, record_id: str, data: Dict) -> None:
    """
    Integration function to log CRUD operations from Flask app.
    Map JSON collections to DB table names and queue the change.
    """
    json_to_table_mapping = {
        'products': 'Products',
        'users': 'Users',
        'bills': 'Bills',
        'customers': 'Customers',
        'stores': 'Stores',
        'notifications': 'Notifications',
        'settings': 'SystemSettings',
        'batches': 'batch' # NEW: Add batches to mapping
    }

    table_name = json_to_table_mapping.get(json_type)
    if table_name:
        # reuse existing instance created in app.py; do not recompute base_dir
        manager = get_sync_manager()
        manager.log_crud_operation(table_name, operation, record_id, data)


if __name__ == "__main__":
    # Example standalone run (for debugging)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    manager = EnhancedSyncManager(base_dir)

    # Start background sync
    manager.start_background_sync()

    try:
        while True:
            time.sleep(10)
            status = manager.get_sync_status()
            print(f"Sync Status: {status}")
    except KeyboardInterrupt:
        manager.stop_background_sync()
        print("Sync manager stopped")
