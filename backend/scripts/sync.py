import os
import sys
import logging
import json
import re
from datetime import datetime
from typing import Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

# Resolve project root for imports (supports both development and PyInstaller bundle)
if getattr(sys, 'frozen', False):
    PROJECT_ROOT = os.path.dirname(sys._MEIPASS)  # type: ignore
else:
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Import database connection pool
from utils.supabase_db import SupabaseDB, db as SupabaseDBInstance # noqa: E402
from utils.json_utils import convert_camel_to_snake # NEW: Import conversion utility

logger = logging.getLogger(__name__)
if not logger.handlers:
    # Local logger fallback if caller doesn't pass logger_instance
    import io
    utf8_stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    handler = logging.StreamHandler(utf8_stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)


def get_table_columns(table_name: str, logger_instance: logging.Logger) -> list:
    """
    Fetch column names for a given table from Supabase PostgreSQL by querying one row.
    """
    try:
        # Assuming SupabaseDBInstance directly exposes the client
        client = SupabaseDBInstance.client 
        # Fetch one row to get column structure
        result = client.table(table_name.lower()).select("*").limit(1).execute()
        if result.data and len(result.data) > 0:
            columns = list(result.data[0].keys())
            logger_instance.debug(f"Table '{table_name}' has columns: {columns}")
            return columns
        else:
            logger_instance.debug(f"Table '{table_name}' is empty, cannot infer columns from data.")
            # For Supabase, if table is empty, we might need to rely on pre-defined schema
            # or a separate schema introspection tool. For now, return empty.
            return []
    except Exception as e:
        logger_instance.error(f"Could not retrieve columns for table '{table_name}': {e}", exc_info=True)
        return []


def apply_change_to_db(
    table_name: str,
    change_type: str,
    record_id: str,
    change_data: Dict[str, Any],
    logger_instance: logging.Logger,
) -> bool:
    """
    Apply a CREATE, UPDATE, or DELETE change to Supabase PostgreSQL.
    Also logs the operation to the 'sync_table' for tracking.
    
    Args:
        table_name: Name of the table (will be converted to lowercase)
        change_type: 'CREATE', 'UPDATE', or 'DELETE'
        record_id: ID of the record
        change_data: Dictionary containing the record data
        logger_instance: Logger instance for logging
        
    Returns:
        bool: True if successful, False otherwise
    """
    logger_instance.info(f"Attempting to apply change: Type={change_type}, Table={table_name}, ID={record_id}")
    
    change_type = (change_type or "").upper().strip()
    if change_type not in ("CREATE", "UPDATE", "DELETE"):
        logger_instance.error(f"Invalid change_type: '{change_type}'. Must be CREATE, UPDATE, or DELETE.")
        return False
    
    try:
        client = SupabaseDBInstance.client # Using the SupabaseDBInstance for client
        
        # Convert table name to lowercase for PostgreSQL
        table_name_lower = table_name.lower()
        
        # Convert all keys to snake_case for database compatibility
        # This is CRUCIAL for tables like storeinventory which expect 'productid' instead of 'productId'
        snake_cased_data = convert_camel_to_snake(change_data)
        
        # Ensure barcode is a comma-separated string if it's a list (from frontend) for products
        if table_name_lower == 'products' and 'barcodes' in snake_cased_data:
            barcodes_val = snake_cased_data.pop('barcodes')
            if isinstance(barcodes_val, list):
                snake_cased_data['barcode'] = ','.join(str(b).strip() for b in barcodes_val if str(b).strip())
            elif isinstance(barcodes_val, str):
                snake_cased_data['barcode'] = barcodes_val
            else:
                snake_cased_data['barcode'] = str(barcodes_val) if barcodes_val else ''
        elif table_name_lower == 'products' and 'barcode' not in snake_cased_data:
            snake_cased_data['barcode'] = ''
        
        if change_type == "DELETE":
            # DELETE operation
            logger_instance.debug(f"Deleting from {table_name_lower} where id={record_id}")
            try:
                # Handle some known dependency relationships to avoid FK violations.
                # 1) When deleting a product, remove any BillItems referencing it first.
                if table_name_lower == 'products':
                    def delete_dependent_table(table, column, record_id):
                        """Helper function to delete dependent records from a single table."""
                        try:
                            logger_instance.debug(f"Cleaning up {table} for product {record_id}")
                            result = client.table(table).delete().eq(column, record_id).execute()
                            deleted_count = len(result.data) if result.data else 0
                            logger_instance.debug(f"Deleted {deleted_count} {table} records referencing product {record_id}")
                            return (table, True, deleted_count)
                        except Exception as cleanup_exc:
                            logger_instance.warning(f"Could not delete {table} for product {record_id}: {cleanup_exc}")
                            return (table, False, 0)
                    
                    # Parallel cleanup of all dependent tables
                    logger_instance.info(f"Starting parallel cleanup for product {record_id}")
                    
                    with ThreadPoolExecutor(max_workers=3) as executor:
                        # Submit all cleanup tasks simultaneously
                        future_to_table = {
                            executor.submit(delete_dependent_table, 'billitems', 'productid', record_id): 'billitems',
                            executor.submit(delete_dependent_table, 'returns', 'product_id', record_id): 'returns',
                            executor.submit(delete_dependent_table, 'storeinventory', 'productid', record_id): 'storeinventory'
                        }
                        
                        # Wait for all deletions to complete
                        cleanup_results = {}
                        for future in as_completed(future_to_table):
                            table_name_dep = future_to_table[future]
                            try:
                                table, success, count = future.result()
                                cleanup_results[table] = {'success': success, 'count': count}
                            except Exception as e:
                                logger_instance.error(f"Exception during parallel cleanup of {table_name_dep}: {e}")
                                cleanup_results[table_name_dep] = {'success': False, 'count': 0}
                    
                    logger_instance.info(f"Parallel cleanup completed for product {record_id}: {cleanup_results}")

                if table_name_lower == 'batch':
                    def cleanup_product_for_batch(pid, record_id):
                        """Helper to clean up a single product when batch is deleted."""
                        results = {'product_id': pid, 'success': True}
                        try:
                            # Delete billitems
                            client.table('billitems').delete().eq('productid', pid).execute()
                            results['billitems'] = 'deleted'
                        except Exception as be:
                            logger_instance.warning(f"Failed to delete billitems for product {pid}: {be}")
                            results['billitems'] = 'failed'
                        
                        try:
                            # Delete returns
                            client.table('returns').delete().eq('product_id', pid).execute()
                            results['returns'] = 'deleted'
                        except Exception as rexc:
                            logger_instance.warning(f"Failed to delete returns for product {pid}: {rexc}")
                            results['returns'] = 'failed'
                        
                        try:
                            # Delete storeinventory
                            client.table('storeinventory').delete().eq('productid', pid).execute()
                            results['storeinventory'] = 'deleted'
                        except Exception as siexc:
                            logger_instance.warning(f"Failed to delete storeinventory for product {pid}: {siexc}")
                            results['storeinventory'] = 'failed'
                        
                        try:
                            # Delete product
                            client.table('products').delete().eq('id', pid).execute()
                            results['product'] = 'deleted'
                        except Exception as pe:
                            logger_instance.warning(f"Failed to delete product {pid}: {pe}")
                            results['product'] = 'failed'
                            results['success'] = False
                        
                        return results
                    
                    try:
                        logger_instance.debug(f"Looking up products for batch {record_id}")
                        prod_ids = []
                        
                        # Try 'batch' column
                        try:
                            resp = client.table('products').select('id').eq('batch', record_id).execute()
                            if resp.data:
                                prod_ids = [r.get('id') for r in resp.data if r.get('id')]
                        except Exception:
                            prod_ids = []
                        
                        # Fallback to 'batchid'
                        if not prod_ids:
                            try:
                                resp = client.table('products').select('id').eq('batchid', record_id).execute()
                                if resp.data:
                                    prod_ids = [r.get('id') for r in resp.data if r.get('id')]
                            except Exception:
                                prod_ids = []
                        
                        if prod_ids:
                            logger_instance.info(f"Found {len(prod_ids)} products for batch {record_id}. Starting parallel cleanup.")
                            
                            # Clean up all products in parallel
                            with ThreadPoolExecutor(max_workers=5) as executor:
                                futures = {executor.submit(cleanup_product_for_batch, pid, record_id): pid for pid in prod_ids}
                                
                                for future in as_completed(futures):
                                    pid = futures[future]
                                    try:
                                        result = future.result()
                                        logger_instance.debug(f"Cleanup result for product {pid}: {result}")
                                    except Exception as e:
                                        logger_instance.error(f"Exception during product cleanup {pid}: {e}")
                        else:
                            logger_instance.info(f"No products found for batch {record_id}")
                    
                    except Exception as batch_exc:
                        logger_instance.warning(f"Failed during batch cleanup for batch {record_id}: {batch_exc}")

                if table_name_lower == 'users':
                    def delete_user_dependent_table(dep_table, candidates, record_id):
                        """Helper to delete from a user-dependent table."""
                        try:
                            cols = get_table_columns(dep_table, logger_instance)
                        except Exception:
                            cols = []
                        
                        deleted = False
                        for c in cols:
                            if c.lower() in (cc.lower() for cc in candidates):
                                try:
                                    result = client.table(dep_table).delete().eq(c, record_id).execute()
                                    count = len(result.data) if result.data else 0
                                    logger_instance.debug(f"Deleted {count} {dep_table} entries matching {c} for user {record_id}")
                                    deleted = True
                                    break
                                except Exception as de:
                                    logger_instance.warning(f"Failed to delete from {dep_table} where {c}={record_id}: {de}")
                        
                        if not deleted:
                            for c in candidates:
                                try:
                                    result = client.table(dep_table).delete().eq(c, record_id).execute()
                                    count = len(result.data) if result.data else 0
                                    logger_instance.debug(f"Deleted {count} {dep_table} entries using fallback {c} for user {record_id}")
                                    deleted = True
                                    break
                                except Exception:
                                    pass
                        
                        return (dep_table, deleted)
                    
                    def update_bills_createdby(record_id):
                        """Helper to null out bills.createdby."""
                        try:
                            result = client.table('bills').update({'createdby': None}).eq('createdby', record_id).execute()
                            count = len(result.data) if result.data else 0
                            logger_instance.debug(f"Nullified bills.createdby for {count} bills")
                            return ('bills_update', True)
                        except Exception as b_exc:
                            logger_instance.warning(f"Could not update bills.createdby for user {record_id}: {b_exc}")
                            return ('bills_update', False)
                    
                    # Parallel cleanup of all user-related tables
                    logger_instance.info(f"Starting parallel cleanup for user {record_id}")
                    
                    with ThreadPoolExecutor(max_workers=4) as executor:
                        futures = {
                            executor.submit(delete_user_dependent_table, 'userstores', ['user_id', 'userid', 'userId'], record_id): 'userstores',
                            executor.submit(delete_user_dependent_table, 'password_reset_tokens', ['user_id'], record_id): 'password_reset_tokens',
                            executor.submit(delete_user_dependent_table, 'password_change_log', ['user_id'], record_id): 'password_change_log',
                            executor.submit(update_bills_createdby, record_id): 'bills_update'
                        }
                        
                        for future in as_completed(futures):
                            table_name_dep = futures[future]
                            try:
                                result = future.result()
                                logger_instance.debug(f"User cleanup result for {table_name_dep}: {result}")
                            except Exception as e:
                                logger_instance.error(f"Exception during user cleanup of {table_name_dep}: {e}")
                    
                    logger_instance.info(f"Parallel cleanup completed for user {record_id}")

                # Proceed with the intended DELETE
                result = client.table(table_name_lower).delete().eq('id', record_id).execute()
                logger_instance.info(f"âœ“ DELETE completed for {table_name_lower}:{record_id}")
                return True # Indicate success
            except Exception as e:
                # Catch specific foreign key violation error (Postgres code '23503')
                try:
                    code = e.code if hasattr(e, 'code') else (e.args[0].get('code') if isinstance(e.args[0], dict) and 'code' in e.args[0] else None)
                except Exception:
                    code = None

                if code == '23503':
                    details = getattr(e, 'message', str(e))
                    logger_instance.error(
                        f"Failed to delete {table_name_lower}:{record_id} due to foreign key constraint violation. "
                        f"Dependent records in other tables (e.g., 'billitems') must be deleted first or "
                        f"the database schema modified to include ON DELETE CASCADE. Error: {details}"
                    )
                else:
                    logger_instance.error(f"DB DELETE operation failed for {table_name_lower}/{record_id}: {e}", exc_info=True)
            return False # Indicate failure
        elif change_type == "DELETE_ALL_FOR_USER" and table_name_lower == 'userstores':
            # Specific handling for deleting all userstores for a given user
            user_id_to_delete_stores_for = change_data.get('userId') or change_data.get('userid') # Allow either camel or snake case
            if not user_id_to_delete_stores_for:
                logger_instance.error(f"Cannot perform DELETE_ALL_FOR_USER on userstores: 'userId'/'userid' missing in change_data.")
                return False
            
            logger_instance.debug(f"Deleting all userstores for userId={user_id_to_delete_stores_for}")
            result = client.table(table_name_lower).delete().eq('userId', user_id_to_delete_stores_for).execute() # Use 'userId' (camelCase)
            logger_instance.info(f"âœ“ DELETE_ALL_FOR_USER completed for userstores: deleted {len(result.data)} records for user {user_id_to_delete_stores_for}")
            
            # Ensure the log for this specific operation correctly reflects the action
            # Reconstruct a meaningful record_id for sync_table for this operation
            composite_record_id_for_sync = f"userstores-deleteAll-{user_id_to_delete_stores_for}"
            log_data = {'userId': user_id_to_delete_stores_for}
            try:
                sync_data = {
                    'table_name': table_name,
                    'record_id': composite_record_id_for_sync, # Use the reconstructed ID
                    'operation_type': change_type,
                    'change_data': json.dumps(log_data, default=str, ensure_ascii=False),
                    'source': 'local',
                    'status': 'synced',
                    'created_at': datetime.now().isoformat()
                }
                client.table('sync_table').insert(sync_data).execute()
                logger_instance.debug(f"Logged to sync_table: {table_name}/{composite_record_id_for_sync}/{change_type}")
            except Exception as sync_err:
                logger_instance.warning(f"Could not log DELETE_ALL_FOR_USER to sync_table: {sync_err}")
            return True # Successfully handled this special delete

        elif change_type == "CREATE" or change_type == "UPDATE":
            # Handle soft-delete flag for products within an UPDATE operation
            should_hard_delete_product = False
            if table_name_lower == 'products' and change_type == 'UPDATE' and snake_cased_data.get('_deleted') is True:
                logger_instance.info(f"Product {record_id} has _deleted=true in UPDATE. Treating as hard delete.")
                should_hard_delete_product = True
                # Remove _deleted flag from change_data before proceeding to actual DB operation
                snake_cased_data.pop('_deleted', None)

            if should_hard_delete_product:
                # Perform the same cleanup as a direct DELETE operation for products
                try:
                    logger_instance.debug(f"Cleaning up dependent billitems for product {record_id} due to soft delete")
                    client.table('billitems').delete().eq('productid', record_id).execute()
                    logger_instance.debug(f"Deleted billitems referencing product {record_id}")
                except Exception as cleanup_exc:
                    logger_instance.warning(f"Could not delete dependent billitems for product {record_id}: {cleanup_exc}")
                try:
                    logger_instance.debug(f"Cleaning up returns for product {record_id} due to soft delete")
                    client.table('returns').delete().eq('product_id', record_id).execute()
                    logger_instance.debug(f"Deleted returns referencing product {record_id}")
                except Exception as ret_exc:
                    logger_instance.warning(f"Could not delete dependent returns for product {record_id}: {ret_exc}")
                try:
                    logger_instance.debug(f"Cleaning up storeinventory for product {record_id} due to soft delete")
                    client.table('storeinventory').delete().eq('productid', record_id).execute()
                    logger_instance.debug(f"Deleted storeinventory entries for product {record_id}")
                except Exception as si_exc:
                    logger_instance.warning(f"Could not delete storeinventory for product {record_id}: {si_exc}")

                # Finally, perform the actual hard delete of the product
                result = client.table(table_name_lower).delete().eq('id', record_id).execute()
                logger_instance.info(f"✓ Hard DELETE completed for {table_name_lower}:{record_id} after soft delete flag detection.")
                return True # Indicate success for this "soft-delete-turned-hard-delete" operation

            # UPSERT operation for both CREATE and UPDATE to handle potential conflicts
            filtered_data: Dict[str, Any] = {} # Initialize empty filtered_data

            if table_name_lower == 'userstores':
                # Explicitly filter for userstores to only include its primary keys (camelCase as per schema)
                # This ensures no unexpected columns like 'createdat' are sent
                allowed_userstores_columns = ['userId', 'storeId'] # Use camelCase as per Supabase schema
                
                # Check original change_data first for camelCase keys, then fallback to snake_cased_data
                # to handle cases where input might already be snake_case or needs conversion
                for key_camel in allowed_userstores_columns:
                    key_snake = key_camel.lower() # Simple snake_case for comparison if needed
                    if key_camel in change_data:
                        filtered_data[key_camel] = change_data[key_camel]
                    elif key_snake in snake_cased_data: # Use snake_cased_data if original was snake, or after conversion
                        filtered_data[key_camel] = snake_cased_data[key_snake] 
                
                logger_instance.debug(f"Filtered data for userstores (explicit): {filtered_data})")

                # Ensure required keys are present for userstores composite primary key
                on_conflict_keys = ["userId", "storeId"] # Use camelCase as per Supabase schema
                if not all(k in filtered_data for k in on_conflict_keys):
                    logger_instance.error(f"Missing required keys for userstores upsert: {on_conflict_keys}. Data: {filtered_data}")
                    return False
                on_conflict_value = ",".join(on_conflict_keys) # Join keys with comma for composite primary key
                # For userstores, create a composite record_id for sync_table tracking
                composite_record_id_for_sync = f"{filtered_data.get('userId', 'UNKNOWN')}-{filtered_data.get('storeId', 'UNKNOWN')}" # Use camelCase keys
            else:
                columns = get_table_columns(table_name_lower, logger_instance)
                
                # If columns are empty (e.g., table is empty), provide a fallback for known tables
                if not columns:
                    if table_name_lower == 'products':
                        columns = [
                            'id', 'name', 'price', 'stock', 'assignedstoreid', 'batchid',
                            'selling_price', 'createdat', 'updatedat', 'barcode',
                            'description', 'category', 'supplier', 'imageurl'
                        ]
                        logger_instance.warning(f"Fallback columns used for empty products table: {columns}")
                    # For other tables, if columns still empty, proceed with all data from snake_cased_data
                    # This implies schema introspection failed or is not strictly needed for this table.

                # Filter snake_cased_data to only include columns that exist in the schema or fallback list
                if columns:
                    filtered_data = {k: v for k, v in snake_cased_data.items() if k in columns}
                else:
                    # If no column info (and not userstores), use all snake_cased_data
                    filtered_data = snake_cased_data
                
                logger_instance.debug(f"Upserting into {table_name_lower} (data: {filtered_data})")
                on_conflict_value = "id" # Most tables use 'id' as primary key
                composite_record_id_for_sync = record_id # Default to existing record_id

            # NEW: Handle specific column adjustments before upsert
            if table_name_lower == 'products':
                # If batchid is an empty string, convert it to None to satisfy foreign key constraints
                # assuming the FK column is nullable.
                if 'batchid' in filtered_data and filtered_data['batchid'] == '':
                    filtered_data['batchid'] = None
                    logger_instance.debug(f"Converted empty batchid to None for products table.")


            if not filtered_data:
                logger_instance.warning(f"No valid data to {change_type} for table '{table_name_lower}' after filtering.")
                return False

            try:
                result = client.table(table_name_lower).upsert(filtered_data, on_conflict=on_conflict_value).execute()
                logger_instance.info(f"âœ“ {change_type} (UPSERT) completed for {table_name_lower}:{composite_record_id_for_sync}")
            except Exception as e:
                # Try to detect Postgres foreign key violation
                code = None
                details = None
                try:
                    # postgrest.APIError often contains a dict as the first arg
                    if isinstance(e.args and e.args[0], dict):
                        code = e.args[0].get('code')
                        details = e.args[0].get('details') or e.args[0].get('message')
                    else:
                        # fallback to string parsing
                        details = str(e)
                except Exception:
                    details = str(e)

                logger_instance.error(f"DB operation failed (Supabase UPSERT): Table={table_name_lower}, Data={filtered_data}, OnConflict={on_conflict_value}, Error: {code} - {details}", exc_info=True)


                # If FK violation, attempt parent resolution
                if code == '23503' or (details and 'violates foreign key constraint' in str(details).lower()):
                    msg = str(details or e)
                    m = re.search(r"Key \((?P<col>[^)]+)\)=\((?P<val>[^)]+)\).*table \"(?P<table>[^\"]+)\"", msg)
                    if m:
                        missing_col = m.group('col')
                        missing_val = m.group('val')
                        parent_table = m.group('table')
                        parent_table_lower = parent_table.lower()
                        logger_instance.warning(f"Foreign key failure detected: missing parent {parent_table_lower} id={missing_val} (col {missing_col}). Attempting to push parent record from local JSON.")

                        # First: try to locate the parent in the local table JSON (e.g., data/json/stores.json)
                        candidate = None
                        try:
                            local_json_path = os.path.join(PROJECT_ROOT, 'data', 'json', f"{parent_table_lower}.json")
                            if os.path.exists(local_json_path):
                                with open(local_json_path, 'r', encoding='utf-8') as f:
                                    parent_records = json.load(f)
                                if isinstance(parent_records, list):
                                    for r in parent_records:
                                        if str(r.get('id')) == str(missing_val) or str(r.get(missing_col)) == str(missing_val):
                                            candidate = r
                                            break
                        except Exception as jerr:
                            logger_instance.debug(f"Failed to read local JSON for {parent_table_lower}: {jerr}")

                        # Second: if not found, look in local sync_table.json for a CREATE/DELETE event
                        if not candidate:
                            try:
                                sync_table_path = os.path.join(PROJECT_ROOT, 'data', 'json', 'sync_table.json')
                                if os.path.exists(sync_table_path):
                                    with open(sync_table_path, 'r', encoding='utf-8') as sf:
                                        sync_entries = json.load(sf)
                                    # look for entries matching parent table and id, prefer CREATE completed
                                    found_create = None
                                    found_delete = None
                                    for entry in reversed(sync_entries if isinstance(sync_entries, list) else []):
                                        if str(entry.get('table_name', '')).lower() == parent_table_lower and str(entry.get('record_id')) == str(missing_val):
                                            st = entry.get('status', '').lower()
                                            ctype = entry.get('change_type', '').lower()
                                            if ctype == 'create' and st in ('completed', 'success') and not found_create:
                                                found_create = entry
                                            if ctype == 'delete' and st in ('completed', 'success') and not found_delete:
                                                found_delete = entry
                                    # If a delete for this parent was completed, parent intentionally removed.
                                    # If a create exists, check if the delete happened after the create.
                                    if found_delete:
                                        delete_time_str = found_delete.get('created_at')
                                        create_time_str = found_create.get('created_at') if found_create else None

                                        delete_dt = datetime.min
                                        if isinstance(delete_time_str, str):
                                            try:
                                                delete_dt = datetime.fromisoformat(delete_time_str)
                                            except ValueError:
                                                logger_instance.warning(f"Invalid ISO format for delete_time: {delete_time_str}")

                                        create_dt = datetime.min
                                        if isinstance(create_time_str, str):
                                            try:
                                                create_dt = datetime.fromisoformat(create_time_str)
                                            except ValueError:
                                                logger_instance.warning(f"Invalid ISO format for create_time: {create_time_str}")

                                        if not found_create or (delete_dt > create_dt):
                                            logger_instance.error(f"Parent {parent_table_lower}:{missing_val} has a completed DELETE in local sync table; cannot create child. Parent was deleted at {delete_time_str}.")
                                            # Do not attempt to create child, as parent is gone.
                                            return False # Or raise a specific error that signals this condition to the caller.
                                    if found_create:
                                        candidate = found_create.get('change_data')
                                        logger_instance.debug(f"Found parent data in local sync_table for {parent_table_lower}:{missing_val}")
                            except Exception as serr:
                                logger_instance.debug(f"Failed to read local sync_table for parent lookup: {serr}")

                        # If we found a candidate parent (from either direct JSON or sync_table), push it
                        if candidate:
                            logger_instance.info(f"Found local parent record for {parent_table_lower}:{missing_val}, attempting to push it to Supabase.")
                            try:
                                # Normalize keys to snake_case before upsert
                                try:
                                    from utils.json_utils import convert_camel_to_snake as _conv
                                    parent_candidate_snake = _conv(candidate)
                                except Exception:
                                    parent_candidate_snake = candidate

                                # Need to use the correct on_conflict for the parent table too
                                parent_on_conflict = ",".join(["userId", "storeId"]) if parent_table_lower == 'userstores' else "id" # Join keys with comma for composite primary key
                                client.table(parent_table_lower).upsert(parent_candidate_snake, on_conflict=parent_on_conflict).execute()
                                logger_instance.info(f"Successfully pushed parent {parent_table_lower}:{missing_val} to Supabase. Retrying child upsert.")
                                # Retry child upsert
                                result = client.table(table_name_lower).upsert(filtered_data, on_conflict=on_conflict_value).execute()
                                logger_instance.info(f"âœ“ {change_type} (UPSERT) completed for {table_name_lower}:{composite_record_id_for_sync} after parent push")
                            except Exception as retry_exc:
                                logger_instance.error(f"Retry after pushing parent failed for {table_name_lower}:{composite_record_id_for_sync}: {retry_exc}", exc_info=True)
                                raise
                        else:
                            # If local JSON and sync_table don't have the parent, optionally create placeholder
                            create_placeholders = os.environ.get('SYNC_CREATE_PLACEHOLDERS', '').lower() in ('1', 'true', 'yes')
                            if create_placeholders:
                                logger_instance.warning(f"Local parent {parent_table_lower} with id={missing_val} not found. Creating minimal placeholder because SYNC_CREATE_PLACEHOLDERS is enabled.")
                                now_iso = datetime.now().isoformat()
                                placeholder = {'id': missing_val, 'createdat': now_iso, 'updatedat': now_iso}
                                if parent_table_lower == 'stores':
                                    placeholder.update({'name': f'__placeholder_store__{missing_val}', 'address': '', 'phone': '', 'status': 'unknown'})
                                elif parent_table_lower == 'users':
                                    placeholder.update({'username': f'__placeholder_user__{missing_val}', 'email': ''})
                                elif parent_table_lower == 'products':
                                    placeholder.update({'name': f'__placeholder_product__{missing_val}', 'price': 0})
                                try:
                                    parent_on_conflict = ",".join(["userId", "storeId"]) if parent_table_lower == 'userstores' else "id" # Join keys with comma for composite primary key
                                    client.table(parent_table_lower).upsert(placeholder, on_conflict=parent_on_conflict).execute()
                                    logger_instance.info(f"Inserted placeholder parent {parent_table_lower}:{missing_val}; retrying child upsert.")
                                    result = client.table(table_name_lower).upsert(filtered_data, on_conflict=on_conflict_value).execute()
                                    logger_instance.info(f"âœ“ {change_type} (UPSERT) completed for {table_name_lower}:{composite_record_id_for_sync} after placeholder parent creation")
                                except Exception as ph_exc:
                                    logger_instance.error(f"Failed to insert placeholder parent {parent_table_lower}:{missing_val}: {ph_exc}", exc_info=True)
                                    raise
                            else:
                                logger_instance.error(f"Could not find parent {parent_table_lower} record with id={missing_val} in local sources; cannot resolve FK. Original error: {details}")
                                raise
                else:
                    # Not an FK issue we can resolve here; re-raise
                    raise
        
        # Log to sync_table for tracking
        try:
            sync_data = {
                'table_name': table_name,
                'record_id': str(record_id),
                'operation_type': change_type,
                'change_data': json.dumps(snake_cased_data, default=str, ensure_ascii=False), # Use snake_cased_data here
                'source': 'local',
                'status': 'synced',
                'created_at': datetime.now().isoformat()
            }
            client.table('sync_table').insert(sync_data).execute()
            logger_instance.debug(f"Logged to sync_table: {table_name}/{record_id}/{change_type}")
        except Exception as sync_err:
            logger_instance.warning(f"Could not log to sync_table: {sync_err}")
        
        return True
        
    except Exception as e:
        logger_instance.error(f"DB operation failed for {table_name}/{record_id} (Type: {change_type}): {e}", exc_info=True)
        return False
