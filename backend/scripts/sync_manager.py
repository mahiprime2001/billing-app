# sync_manager.py - Enhanced with MySQL sync_table Integration

import os
import sys
import json
import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import schedule
import glob

# Determine the base directory for resource loading
if getattr(sys, 'frozen', False):
    PROJECT_ROOT = os.path.dirname(sys._MEIPASS)
else:
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Setup logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

if not logger.handlers:
    log_dir = os.path.join(PROJECT_ROOT, 'data', 'logs')
    if not os.path.exists(log_dir):
        try:
            os.makedirs(log_dir, exist_ok=True)
            logger.info(f"Created log directory: {log_dir}")
        except Exception as e:
            logger.error(f"Failed to create log directory {log_dir}: {e}")
    
    log_file_name = datetime.now().strftime("sync_manager-%Y-%m-%d.log")
    file_handler = logging.FileHandler(os.path.join(log_dir, log_file_name))
    file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(file_handler)
    
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(stream_handler)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.db import DatabaseConnection

class EnhancedSyncManager:
    """
    Enhanced Sync Manager with MySQL sync_table integration
    """
    MAX_RETRY_ATTEMPTS = 3

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
        self.log_dir = os.path.join(PROJECT_ROOT, 'data', 'logs')

    def _ensure_directory_exists(self, path: str) -> None:
        """Safely ensures a directory exists"""
        if not os.path.exists(path):
            try:
                os.makedirs(path, exist_ok=True)
                logger.info(f"Created directory: {path}")
            except Exception as e:
                logger.error(f"Failed to create directory {path}: {e}")

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
        return self._safe_json_load(self.local_sync_table_file, [])

    def save_local_sync_table(self, data: List[Dict]) -> None:
        self._safe_json_dump(self.local_sync_table_file, data)

    def get_sync_logs(self) -> List[Dict]:
        return self._safe_json_load(self.sync_logs_file, [])

    def save_sync_logs(self, data: List[Dict]) -> None:
        self._safe_json_dump(self.sync_logs_file, data)

    def get_settings(self) -> Dict:
        return self._safe_json_load(self.settings_file, {})

    def save_settings(self, data: Dict) -> None:
        self._safe_json_dump(self.settings_file, data)

    def get_last_sync_timestamp(self) -> Optional[str]:
        settings = self.get_settings()
        return settings.get('systemSettings', {}).get('last_sync_time')

    def set_last_sync_timestamp(self, timestamp: str) -> None:
        settings = self.get_settings()
        if 'systemSettings' not in settings:
            settings['systemSettings'] = {}
        settings['systemSettings']['last_sync_time'] = timestamp
        self.save_settings(settings)

    def log_crud_operation(self, table_name: str, operation_type: str, record_id: str, data: Dict) -> None:
        """
        Log CRUD operation to local sync table
        """
        sync_table = self.get_local_sync_table()
        
        # Deduplicate pending changes
        sync_table = [
            entry for entry in sync_table
            if not (entry.get('table_name') == table_name and
                    entry.get('record_id') == record_id and
                    entry.get('status') == 'pending')
        ]
        
        max_id = max([entry.get('id', 0) for entry in sync_table], default=0)
        new_entry = {
            "id": max_id + 1,
            "sync_time": datetime.now().isoformat(),
            "table_name": table_name,
            "change_type": operation_type,
            "record_id": record_id,
            "change_data": data,
            "status": "pending",
            "retry_count": 0,
            "last_retry": None,
            "error_message": None,
            "created_at": datetime.now().isoformat()
        }
        
        sync_table.append(new_entry)
        self.save_local_sync_table(sync_table)
        logger.info(f"Logged CRUD operation: {table_name} - {operation_type} - {record_id}")
        
        self.log_sync_event(f"{table_name}_{operation_type.lower()}_logged", "pending", {
            "table_name": table_name,
            "record_id": record_id,
            "operation_type": operation_type
        })

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

    def _find_all_products_json(self) -> List[str]:
        """
        Discover likely `products.json` files across common locations in the repo.
        Returns an ordered, de-duplicated list of file paths.
        """
        candidates = []

        # Common locations relative to the sync manager base_dir and PROJECT_ROOT
        try:
            # 1) base_dir/data/json/products.json
            candidates.append(os.path.join(self.base_dir, 'data', 'json', 'products.json'))
        except Exception:
            pass

        try:
            # 2) PROJECT_ROOT/data/json/products.json (if different)
            candidates.append(os.path.join(PROJECT_ROOT, '..', 'data', 'json', 'products.json'))
            candidates.append(os.path.join(PROJECT_ROOT, 'data', 'json', 'products.json'))
            # 3) src-tauri copy
            candidates.append(os.path.join(PROJECT_ROOT, '..', 'src-tauri', 'data', 'json', 'products.json'))
            candidates.append(os.path.join(PROJECT_ROOT, 'src-tauri', 'data', 'json', 'products.json'))
        except Exception:
            pass

        # Also glob for any other products.json under the repo (keep it focused to data/json folders)
        try:
            search_root = self.base_dir or PROJECT_ROOT
            glob_paths = glob.glob(os.path.join(search_root, '**', 'data', 'json', 'products.json'), recursive=True)
            for p in glob_paths:
                candidates.append(p)
        except Exception:
            pass

        # De-dup, keep only existing files (but allow non-existing; _safe_json_dump will create folders)
        normalized = []
        for p in candidates:
            if not p:
                continue
            p_norm = os.path.abspath(p)
            if p_norm not in normalized:
                normalized.append(p_norm)

        return normalized

    def pull_from_mysql_sync_table(self, table_name: Optional[str] = None, force_full_pull: bool = False) -> Dict:
        """
        Pull changes from MySQL sync_table and apply to local JSON.
        Can be optionally filtered by table_name and forced for a full pull.
        """
        try:
            with DatabaseConnection.get_connection_ctx() as conn:
                cursor = conn.cursor(dictionary=True)
                
                last_sync = self.get_last_sync_timestamp()
                logger.info(f"Pulling from MySQL sync_table. Last sync: {last_sync or 'Never'}. Table: {table_name or 'All'}, Full Pull: {force_full_pull}")
                
                query_parts = []
                query_params = []

                # Condition for remote pending changes
                remote_pending_condition = "(`source` = 'remote' AND `status` = 'pending')"
                if table_name:
                    remote_pending_condition += " AND `table_name` = %s"
                    query_params.append(table_name)
                query_parts.append(remote_pending_condition)

                # Condition for local synced changes
                local_synced_condition = "(`source` = 'local' AND `status` = 'synced')"
                if table_name:
                    local_synced_condition += " AND `table_name` = %s"
                    query_params.append(table_name)

                if not force_full_pull and last_sync:
                    local_synced_condition += " AND `created_at` > %s"
                    query_params.append(last_sync)
                elif not force_full_pull and not last_sync:
                    local_synced_condition += " AND `created_at` >= DATE_SUB(NOW(), INTERVAL 1 DAY)"

                query_parts.append(local_synced_condition)

                base_query = "SELECT * FROM `sync_table` WHERE " + " OR ".join(query_parts)
                base_query += " ORDER BY `created_at` ASC"
                
                cursor.execute(base_query, tuple(query_params))
                
                new_entries = cursor.fetchall()
                
                if not new_entries:
                    logger.info("No new changes to pull")
                    return {"status": "success", "message": "No new entries", "pulled": 0}
                
                logger.info(f"Found {len(new_entries)} changes to apply")
                
                applied = 0
                failed_ids = []
                
                for entry in new_entries:
                    try:
                        sync_id = entry['id']
                        entry_table_name = entry['table_name']
                        operation = entry['operation_type']
                        record_id = entry['record_id']
                        
                        # Parse change data with robust error handling
                        change_data_raw = entry['change_data']
                        change_data = {}
                        if isinstance(change_data_raw, (str, bytes)):
                            try:
                                change_data = json.loads(change_data_raw)
                            except json.JSONDecodeError as json_err:
                                logger.error(f"JSONDecodeError for entry {sync_id} ({entry_table_name} {record_id}): {json_err}")
                                cursor.execute("""
                                    UPDATE `sync_table`
                                    SET `status` = 'failed', `error_message` = %s, `sync_attempts` = `sync_attempts` + 1
                                    WHERE `id` = %s
                                """, (f"JSONDecodeError: {json_err}", sync_id))
                                failed_ids.append(sync_id)
                                continue
                        elif isinstance(change_data_raw, dict):
                            change_data = change_data_raw
                        else:
                            logger.warning(f"Unexpected change_data type for entry {sync_id}: {type(change_data_raw)}")
                            cursor.execute("""
                                UPDATE `sync_table`
                                SET `status` = 'failed', `error_message` = %s, `sync_attempts` = `sync_attempts` + 1
                                WHERE `id` = %s
                            """, (f"Unexpected change_data type: {type(change_data_raw)}", sync_id))
                            failed_ids.append(sync_id)
                            continue
                        
                        logger.debug(f"Applying: {entry_table_name} - {operation} - {record_id}")
                        
                        # Apply to local JSON files
                        self._apply_to_local_json(entry_table_name, operation, change_data)
                        
                        # Mark as synced in MySQL
                        cursor.execute("""
                            UPDATE `sync_table` 
                            SET `status` = 'synced', `synced_at` = NOW()
                            WHERE `id` = %s
                        """, (sync_id,))
                        
                        applied += 1
                        
                    except Exception as e:
                        logger.error(f"Failed to apply entry {entry.get('id')}: {e}", exc_info=True)
                        failed_ids.append(entry.get('id'))
                        
                        cursor.execute("""
                            UPDATE `sync_table`
                            SET `sync_attempts` = `sync_attempts` + 1,
                                `status` = CASE 
                                    WHEN `sync_attempts` >= %s THEN 'failed'
                                    ELSE 'pending'
                                END,
                                `error_message` = %s
                            WHERE `id` = %s
                        """, (self.MAX_RETRY_ATTEMPTS, str(e), entry.get('id'),))
                
                conn.commit()
                
                # Update last sync timestamp
                if new_entries:
                    latest = max(e['created_at'] for e in new_entries if e.get('created_at'))
                    if latest:
                        self.set_last_sync_timestamp(latest.isoformat())
                
                logger.info(f"Pull complete: {applied} applied, {len(failed_ids)} failed")
                
                return {
                    "status": "success",
                    "message": f"Applied {applied}/{len(new_entries)} changes",
                    "pulled": len(new_entries),
                    "applied": applied,
                    "failed": len(failed_ids)
                }
                
        except Exception as e:
            logger.error(f"Error pulling from MySQL sync_table: {e}", exc_info=True)
            return {"status": "error", "message": str(e)}

    def _apply_to_local_json(self, table_name: str, operation: str, change_data: Dict) -> None:
        """Apply pulled changes to local JSON files"""
        # Map DB table names to local JSON files
        json_file_mapping = {
            'Products': 'products.json',
            'Users': 'users.json',
            'Bills': 'bills.json',
            'Customers': 'customers.json',
            'Stores': 'stores.json',
            'SystemSettings': 'settings.json',
            'Notifications': 'notifications.json',
            'batch': 'batches.json',
            'StoreInventory': 'storeinventory.json',  # ADD THIS LINE
        }

        # Normalize table_name for case-insensitive matching
        tn_normalized = (table_name or '').strip()

        # ✅ Special handling for ProductBarcodes: update products.json barcodes list
        if tn_normalized.lower() in ('productbarcodes', 'product_barcodes'):
            # Accept multiple common key variants for product id
            pid = (
                change_data.get('productId') or change_data.get('product_id') or
                change_data.get('productID') or change_data.get('productid') or
                change_data.get('id')
            )
            barcode_val = change_data.get('barcode') or change_data.get('code')

            if not pid:
                logger.warning(f"ProductBarcodes entry missing productId (keys tried: productId, product_id, productID, productid, id): {change_data}")
                return

            # Update all discovered products.json files to keep copies in sync
            updated_any = False
            prod_json_paths = self._find_all_products_json()
            for products_path in prod_json_paths:
                products = self._safe_json_load(products_path, [])
                
                # Find product
                found = False
                for i, p in enumerate(products):
                    if str(p.get('id')) == str(pid):
                        found = True

                        # Always fetch and update barcodes from the database, but store only a single `barcode` string
                        try:
                            product_barcodes = DatabaseConnection.get_product_barcodes(pid)
                            if product_barcodes:
                                products[i]['barcode'] = product_barcodes[0]
                            else:
                                # If no barcode found, remove any existing `barcode` key to avoid `null` values
                                products[i].pop('barcode', None)
                                logger.debug(f"No barcodes returned from DB for product {pid}; change_data barcode value: {barcode_val}")
                        except Exception as e:
                            logger.error(f"Error fetching barcodes for product {pid}: {e}", exc_info=True)

                        # Ensure we don't leave an old `barcodes` list behind
                        if 'barcodes' in products[i]:
                            products[i].pop('barcodes', None)

                        products[i]['updatedAt'] = datetime.now().isoformat()
                        updated_any = True
                        break

                if not found:
                    logger.debug(f"Product for barcode update not found in {products_path}: productId={pid}")

                # Persist changes to this file
                try:
                    self._safe_json_dump(products_path, products)
                except Exception as e:
                    logger.error(f"Failed to write products.json at {products_path}: {e}")

            if updated_any:
                logger.info(f"Applied ProductBarcodes {operation} to {len(prod_json_paths)} products.json files for product {pid}")
            else:
                logger.warning(f"Product for barcode update not found in any products.json: productId={pid}")

            return  # Early return after handling ProductBarcodes

        # ✅ Continue with regular table handling
        json_file = json_file_mapping.get(tn_normalized)
        if not json_file:
            logger.warning(f"No local JSON file mapping found for table name: {table_name}")
            return

        file_path = os.path.join(self.base_dir, 'data', 'json', json_file)
        logger.debug(f"Applying {operation} operation to local JSON file: {file_path}")

        # Special handling for settings.json
        if json_file == 'settings.json':
            settings = self._safe_json_load(file_path, {})
            if operation in ['CREATE', 'UPDATE']:
                settings.update(change_data)
            self._safe_json_dump(file_path, settings)
            logger.info(f"Applied {operation} to {json_file}")
            return

        # Get record_id from change_data
        record_id = change_data.get('id')

        # ✅ If this is products.json, update all discovered copies
        if json_file == 'products.json':
            prod_paths = self._find_all_products_json()
            updated_any = False
            for products_path in prod_paths:
                data = self._safe_json_load(products_path, [])

                if operation in ['CREATE', 'UPDATE']:
                    found = False
                    for i, item in enumerate(data):
                        if item.get('id') == record_id:
                            merged = dict(item)
                            merged.update(change_data)
                            # Always fetch and update barcodes from the database for products, store single `barcode`
                            try:
                                product_barcodes = DatabaseConnection.get_product_barcodes(record_id)
                                if product_barcodes:
                                    merged['barcode'] = product_barcodes[0]
                                else:
                                    merged.pop('barcode', None)
                                    logger.debug(f"No barcodes for product {record_id} when updating products.json")
                            except Exception as e:
                                logger.error(f"Error fetching barcodes for product {record_id}: {e}", exc_info=True)

                            # Remove any `barcodes` list to keep canonical shape
                            if 'barcodes' in merged:
                                merged.pop('barcodes', None)

                            data[i] = merged
                            found = True
                            updated_any = True
                            break
                    if not found:
                        # Fetch barcode for new product and store single `barcode`
                        if record_id:
                            try:
                                product_barcodes = DatabaseConnection.get_product_barcodes(record_id)
                                if product_barcodes:
                                    change_data['barcode'] = product_barcodes[0]
                                else:
                                    change_data.pop('barcode', None)
                            except Exception as e:
                                logger.error(f"Error fetching barcodes for new product {record_id}: {e}", exc_info=True)

                        # Remove any 'barcodes' list if present
                        if 'barcodes' in change_data:
                            change_data.pop('barcodes', None)

                        data.append(change_data)
                        updated_any = True
                elif operation == 'DELETE':
                    new_data = [item for item in data if item.get('id') != record_id]
                    if len(new_data) != len(data):
                        data = new_data
                        updated_any = True

                try:
                    self._safe_json_dump(products_path, data)
                except Exception as e:
                    logger.error(f"Failed to write products.json at {products_path}: {e}")

            if updated_any:
                logger.info(f"Applied {operation} to products.json in {len(prod_paths)} locations for record {record_id}")
            else:
                logger.warning(f"No products.json copy updated for {operation} record {record_id}")

            return

        # Non-products JSON (single file)
        data = self._safe_json_load(file_path, [])

        if operation in ['CREATE', 'UPDATE']:
            found = False
            for i, item in enumerate(data):
                if item.get('id') == record_id:
                    merged = dict(item)
                    merged.update(change_data)
                    data[i] = merged
                    found = True
                    break
            if not found:
                data.append(change_data)
        elif operation == 'DELETE':
            data = [item for item in data if item.get('id') != record_id]

        self._safe_json_dump(file_path, data)
        logger.info(f"Applied {operation} to {json_file} for record {record_id}")

    def process_pending_logs(self) -> Dict:
        """
        Process pending logs sequentially
        """
        sync_table = self.get_local_sync_table()
        pending_logs = [log for log in sync_table if log.get('status') == 'pending']
        
        if not pending_logs:
            logger.info("No pending sync logs to process")
            return {"status": "success", "message": "No pending logs", "processed": 0, "failed": 0}
        
        logger.info(f"Processing {len(pending_logs)} pending sync logs")
        
        processed = 0
        failed = 0
        
        for log_entry in pending_logs:
            log_id = log_entry.get('id')
            table_name = log_entry.get('table_name')
            change_type = log_entry.get('change_type')
            record_id = log_entry.get('record_id')
            change_data = log_entry.get('change_data', {})
            
            logger.info(f"Processing log ID {log_id}: {table_name} - {change_type} - {record_id}")
            
            # Apply change to MySQL database
            success = self.apply_change_to_mysql_db(table_name, change_type, record_id, change_data)
            
            if success:
                for entry in sync_table:
                    if entry.get('id') == log_id:
                        entry['status'] = 'completed'
                        entry['completed_at'] = datetime.now().isoformat()
                        break
                processed += 1
                logger.info(f"Successfully processed log ID {log_id}")
            else:
                for entry in sync_table:
                    if entry.get('id') == log_id:
                        entry['status'] = 'failed'
                        entry['retry_count'] = entry.get('retry_count', 0) + 1
                        entry['last_retry'] = datetime.now().isoformat()
                        entry['error_message'] = "Database operation failed"
                        break
                failed += 1
                logger.warning(f"Failed to process log ID {log_id}")
        
        self.save_local_sync_table(sync_table)
        logger.info(f"Finished processing: {processed} processed, {failed} failed")
        
        return {
            "status": "success",
            "message": f"Processed {processed} logs, {failed} failed",
            "processed": processed,
            "failed": failed
        }

    def apply_change_to_mysql_db(self, table_name: str, change_type: str, record_id: str, change_data: Dict) -> bool:
        """
        Apply change to MySQL database
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
                        
                        cursor.execute(f"DELETE FROM `{table_name}` WHERE `id` = %s", (record_id,))
                        logger.info(f"DELETE operation on {table_name} for {record_id} successful")
                        
                    elif change_type in ['CREATE', 'UPDATE']:
                        # Get table columns
                        cursor.execute(f"DESCRIBE `{table_name}`")
                        table_columns = [row['Field'] for row in cursor.fetchall()]
                        
                        # Filter data by valid columns
                        filtered_data = {k: v for k, v in change_data.items() if k in table_columns}
                        
                        if 'id' not in filtered_data and record_id:
                            filtered_data['id'] = record_id
                        
                        if not filtered_data:
                            logger.warning(f"No valid columns found for {table_name}")
                            conn.rollback()
                            return False
                        
                        # Build upsert query
                        columns = ', '.join([f"`{key}`" for key in filtered_data.keys()])
                        placeholders = ', '.join(['%s'] * len(filtered_data))
                        update_placeholders = ', '.join([f"`{col}` = VALUES(`{col}`)" for col in filtered_data.keys()])
                        
                        query = f"""
                            INSERT INTO `{table_name}` ({columns})
                            VALUES ({placeholders})
                            ON DUPLICATE KEY UPDATE {update_placeholders}
                        """
                        
                        values = list(filtered_data.values())
                        cursor.execute(query, values)
                        logger.info(f"{change_type} operation on {table_name} for {record_id} successful")
                    
                    conn.commit()
                    return True
                    
                except Exception as e:
                    conn.rollback()
                    logger.error(f"Error in database operation for {table_name} (ID: {record_id}): {e}", exc_info=True)
                    return False
                    
        except Exception as e:
            logger.error(f"Error connecting to database for {table_name} (ID: {record_id}): {e}", exc_info=True)
            return False

    def retry_failed_logs(self) -> Dict:
        """
        Retry failed logs (max 3 attempts)
        """
        sync_table = self.get_local_sync_table()
        failed_logs = [log for log in sync_table if log.get('status') == 'failed']
        
        if not failed_logs:
            logger.info("No failed logs to retry")
            return {"status": "success", "message": "No failed logs", "retried": 0}
        
        logger.info(f"Attempting to retry {len(failed_logs)} failed sync logs")
        
        retried = 0
        for log_entry in failed_logs:
            log_id = log_entry.get('id')
            retry_count = log_entry.get('retry_count', 0)
            
            if retry_count >= self.MAX_RETRY_ATTEMPTS:
                logger.warning(f"Log ID {log_id} exceeded max retry attempts")
                for entry in sync_table:
                    if entry.get('id') == log_id:
                        entry['status'] = 'skipped'
                        entry['error_message'] = f"Exceeded max retry attempts ({self.MAX_RETRY_ATTEMPTS})"
                        break
                continue
            
            for entry in sync_table:
                if entry.get('id') == log_id:
                    entry['status'] = 'pending'
                    break
            retried += 1
        
        self.save_local_sync_table(sync_table)
        
        if retried > 0:
            logger.info(f"Reset {retried} failed logs to pending")
            result = self.process_pending_logs()
            result['retried'] = retried
            return result
        
        return {"status": "success", "message": "No logs eligible for retry", "retried": 0}

    def cleanup_old_logs(self) -> Dict:
        """
        Clean up logs older than 30 days
        """
        cutoff_date = datetime.now() - timedelta(days=30)
        logger.info(f"Cleaning up logs older than {cutoff_date.isoformat()}")
        
        # Local sync table
        sync_table = self.get_local_sync_table()
        original_count = len(sync_table)
        sync_table = [
            entry for entry in sync_table
            if datetime.fromisoformat(entry.get('created_at', datetime.now().isoformat())) > cutoff_date
        ]
        local_cleaned = original_count - len(sync_table)
        self.save_local_sync_table(sync_table)
        
        # MySQL sync_table
        mysql_cleaned = 0
        try:
            with DatabaseConnection.get_connection_ctx() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM `sync_table` WHERE `created_at` < %s", (cutoff_date,))
                mysql_cleaned = cursor.rowcount
                conn.commit()
                logger.info(f"MySQL sync_table cleanup: {mysql_cleaned} entries removed")
        except Exception as e:
            logger.error(f"Error cleaning MySQL sync_table: {e}", exc_info=True)
        
        return {
            "status": "success",
            "local_cleaned": local_cleaned,
            "mysql_cleaned": mysql_cleaned
        }

    def start_background_sync(self) -> None:
        """
        Start background sync with 15-minute intervals
        """
        if self.is_running:
            logger.info("Background sync already running")
            return
        
        self.is_running = True
        logger.info("Starting background sync scheduler")
        
        # Schedule tasks every 15 minutes
        schedule.every(15).minutes.do(self.scheduled_push_and_pull)
        schedule.every(15).minutes.do(self.retry_failed_logs)
        
        def run_scheduler():
            logger.info("Sync scheduler thread started")
            
            # Initial sync on startup
            logger.info("Performing initial sync and immediate cleanup")
            self.cleanup_old_logs()
            self.scheduled_push_and_pull()
            
            while self.is_running:
                schedule.run_pending()
                time.sleep(30)  # Check every 30 seconds
            
            logger.info("Sync scheduler thread stopped")
        
        self.sync_thread = threading.Thread(target=run_scheduler, daemon=True)
        self.sync_thread.start()
        logger.info("Background sync started successfully")

    def scheduled_push_and_pull(self) -> None:
        """
        Combined push and pull operation - runs every 15 minutes
        """
        logger.info("=== Starting scheduled sync cycle ===")
        
        try:
            # Step 1: Push local pending logs to MySQL
            logger.info("Step 1: Pushing pending logs to MySQL")
            push_result = self.process_pending_logs()
            logger.info(f"Push result: {push_result}")
            
            # Step 2: Pull remote changes from MySQL sync_table
            logger.info("Step 2: Pulling remote changes from MySQL")
            pull_result = self.pull_from_mysql_sync_table()
            logger.info(f"Pull result: {pull_result}")
            
            # Log the sync event
            self.log_sync_event("scheduled_sync", "completed", {
                "push": push_result,
                "pull": pull_result,
                "timestamp": datetime.now().isoformat()
            })
            
            logger.info("=== Scheduled sync cycle completed successfully ===")
            
        except Exception as e:
            logger.error(f"Error in scheduled sync: {e}", exc_info=True)
            self.log_sync_event("scheduled_sync", "failed", {
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            })

    def stop_background_sync(self) -> None:
        """Stop background sync process"""
        self.is_running = False
        if self.sync_thread:
            self.sync_thread.join(timeout=5)
        logger.info("Background sync process stopped")

    def get_sync_status(self) -> Dict:
        """Get current sync status"""
        sync_table = self.get_local_sync_table()
        return {
            "is_running": self.is_running,
            "last_sync": self.get_last_sync_timestamp(),
            "pending_logs": len([log for log in sync_table if log.get('status') == 'pending']),
            "failed_logs": len([log for log in sync_table if log.get('status') == 'failed']),
            "completed_logs": len([log for log in sync_table if log.get('status') == 'completed']),
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

def log_json_crud_operation(json_type: str, operation: str, record_id: str, data: Dict) -> None:
    """
    Integration function to log CRUD operations from Flask app
    """
    json_to_table_mapping = {
        'products': 'Products',
        'users': 'Users',
        'bills': 'Bills',
        'customers': 'Customers',
        'stores': 'Stores',
        'notifications': 'Notifications',
        'settings': 'SystemSettings',
        'batches': 'batch',
        'storeinventory': 'StoreInventory' # ADDED THIS LINE
    }
    
    table_name = json_to_table_mapping.get(json_type)
    if table_name:
        manager = get_sync_manager()
        manager.log_crud_operation(table_name, operation, record_id, data)
