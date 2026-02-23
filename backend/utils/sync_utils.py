import os
import sys
import json
import logging
from datetime import datetime, timedelta

# Import database connection pool
from utils.supabase_db import db as SupabaseDBInstance
from scripts.sync import apply_change_to_db # This is for applying changes to the DB

# Setup a logger for this script
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler(sys.stdout)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

# Determine the base directory for resource loading
# Use APP_BASE_DIR from environment, fallback to current working directory
BASE_DIR = os.environ.get('APP_BASE_DIR', os.getcwd())

SYNC_TABLE_FILE = os.path.join(BASE_DIR, 'data', 'json', 'sync_table.json')
SYNC_LOGS_FILE = os.path.join(BASE_DIR, 'data', 'json', 'sync_logs.json')
SETTINGS_FILE = os.path.join(BASE_DIR, 'data', 'json', 'settings.json') # For last_sync_time

def _safe_json_load(path, default_value):
    """Safely loads JSON data from a file, returning a default if file is missing or invalid."""
    logger.debug(f"Attempting to load JSON from: {path}")
    if not os.path.exists(path):
        logger.debug(f"File not found: {path}. Returning default value.")
        return default_value
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            logger.debug(f"Successfully loaded JSON from: {path}")
            return data
    except json.JSONDecodeError as e:
        logger.error(f"Error decoding JSON from {path}: {e}", exc_info=True)
        return default_value
    except Exception as e:
        logger.error(f"Unexpected error loading {path}: {e}", exc_info=True)
        return default_value

def _safe_json_dump(path, data):
    """Safely dumps JSON data to a file, creating directories if necessary."""
    logger.debug(f"Attempting to dump JSON to: {path}")
    _ensure_directory_exists(os.path.dirname(path))
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            logger.debug(f"Successfully dumped JSON to: {path}")
    except Exception as e:
        logger.error(f"Error dumping JSON to {path}: {e}", exc_info=True)

def _ensure_directory_exists(path: str) -> None:
    """Safely ensures a directory exists, logging creation or existence."""
    if not os.path.exists(path):
        try:
            os.makedirs(path, exist_ok=True)
            logger.info(f"Created directory: {path}")
        except Exception as e:
            logger.error(f"Failed to create directory {path}: {e}")
    else:
        logger.debug(f"Directory already exists: {path}")

def get_sync_table_data():
    """Loads the local sync_table.json."""
    return _safe_json_load(SYNC_TABLE_FILE, [])

def save_sync_table_data(data):
    """Saves data to the local sync_table.json."""
    _safe_json_dump(SYNC_TABLE_FILE, data)

def get_sync_logs_data():
    """Loads the local sync_logs.json."""
    return _safe_json_load(SYNC_LOGS_FILE, [])

def save_sync_logs_data(data):
    """Saves data to the local sync_logs.json."""
    _safe_json_dump(SYNC_LOGS_FILE, data)

def get_settings_data():
    """Loads the local settings.json."""
    return _safe_json_load(SETTINGS_FILE, {})

def save_settings_data(data):
    """Saves data to the local settings.json."""
    _safe_json_dump(SETTINGS_FILE, data)

def get_last_sync_timestamp():
    """Retrieves the last sync timestamp from SystemSettings."""
    settings = get_settings_data()
    return settings.get('systemSettings', {}).get('last_sync_time')

def set_last_sync_timestamp(timestamp: str):
    """Sets the last sync timestamp in SystemSettings."""
    settings = get_settings_data()
    if 'systemSettings' not in settings:
        settings['systemSettings'] = {}
    settings['systemSettings']['last_sync_time'] = timestamp
    save_settings_data(settings)

def add_to_sync_table(table_name: str, change_type: str, record_id: str, change_data: dict):
    """Adds a new entry to the local sync_table."""
    logger.info(f"Adding change to local sync_table: {table_name} - {change_type} - {record_id}")
    logger.debug(f"Incoming change data for sync_table: {change_data}")
    sync_table = get_sync_table_data()
    
    # Remove any existing pending changes for the same record to avoid redundant entries
    initial_sync_table_len = len(sync_table)
    sync_table = [
        entry for entry in sync_table 
        if not (entry.get('table_name') == table_name and entry.get('record_id') == record_id and entry.get('status') == 'pending')
    ]
    if len(sync_table) < initial_sync_table_len:
        logger.debug(f"Removed {initial_sync_table_len - len(sync_table)} redundant pending entries for {table_name}:{record_id} from sync_table.")

    new_entry = {
        "sync_time": datetime.now().isoformat(),
        "table_name": table_name,
        "change_type": change_type,
        "record_id": record_id,
        "change_data": change_data,
        "status": "pending" # Mark as pending until successfully pushed to server
    }
    sync_table.append(new_entry)
    save_sync_table_data(sync_table)
    logger.info(f"Successfully added to local sync_table: {table_name} - {change_type} - {record_id}")
    logger.debug(f"Current sync_table size: {len(sync_table)}")

def get_sync_priority(table_name: str) -> int:
    """Return processing priority (lower = earlier)"""
    priority_map = {
        'users': 10,
        'stores': 10,
        'products': 20,
        'customers': 20,
        'userstores': 30,  # After users and stores
        'storeinventory': 40,  # After products and stores
        'inventory_transfer_orders': 42,
        'inventory_transfer_items': 43,
        'inventory_transfer_scans': 44,
        'inventory_transfer_verifications': 45,
        'damaged_inventory_events': 46,
        'bills': 50,
        'billitems': 55,  # NEW: After bills
        'systemsettings': 60,  # NEW: Added systemsettings
        'returns': 65,
        'notifications': 70,
        'batch': 75
    }
    return priority_map.get(table_name.lower(), 100)

def log_sync_event(eventType: str, status: str, details: dict):
    """Logs a sync event to the local SyncLogs.json."""
    sync_logs = get_sync_logs_data()
    new_log_entry = {
        "timestamp": datetime.now().isoformat(),
        "eventType": eventType,
        "status": status,
        "details": details
    }
    sync_logs.append(new_log_entry)
    save_sync_logs_data(sync_logs)
    logger.info(f"Logged sync event: {eventType} - {status}")

def process_push_sync(logger_instance: logging.Logger):
    """
    Processes pending changes from local sync_table.json and applies them to MySQL.
    Also handles conflict resolution and logs to SyncLogs.json.
    """
    logger_instance.info("Starting push sync process.")
    sync_table = get_sync_table_data()
    pending_changes = [entry for entry in sync_table if entry.get('status') == 'pending']
    
    if not pending_changes:
        logger_instance.info("No pending changes in local sync_table to push. Push sync finished.")
        return {"status": "success", "message": "No pending changes."}

    # Sort pending changes to ensure referential integrity:
    # 1. Process all CREATE/UPDATEs before all DELETEs.
    # 2. Within CREATE/UPDATEs: process parent tables (lower priority) before child tables (higher priority).
    # 3. Within DELETEs: process child tables (higher priority) before parent tables (lower priority).
    def custom_sync_sort_key(change):
        table_name = change.get('table_name', '').lower()
        change_type = change.get('change_type', '').upper()
        priority = get_sync_priority(table_name)

        if change_type in ('CREATE', 'UPDATE'):
            # Group 0: CREATE/UPDATE operations. Sort by priority ascending (parents first).
            return (0, priority)
        elif change_type == 'DELETE':
            # Group 1: DELETE operations. Sort by priority descending (children first).
            # Use a negative priority to achieve descending order while keeping the tuple sort ascending.
            return (1, -priority)
        else:
            # Fallback for unknown types (shouldn't happen with validation)
            return (2, priority)

    pending_changes = sorted(pending_changes, key=custom_sync_sort_key)
    logger_instance.info(f"Found {len(pending_changes)} pending changes to push.")
    successful_pushes = []
    failed_pushes = []
    
    # Initialize sets to track deleted parent records for cleanup
    deleted_user_ids = set()
    deleted_store_ids = set()
    deleted_product_ids = set()

    for change in pending_changes:
        table_name = change['table_name']
        change_type = change['change_type']
        record_id = change['record_id']
        change_data = change['change_data']
        local_updated_at = change_data.get('updatedAt') # Assuming updatedAt is always present for C/U

        logger_instance.debug(f"Processing pending change: Table={table_name}, Type={change_type}, ID={record_id}")
        try:
            server_record = None
            if change_type == 'CREATE':
                # Check for parent existence for child tables
                parent_missing = False
                if table_name == 'userstores':
                    user_id = change_data.get('user_id')
                    store_id = change_data.get('store_id')
                    if not user_id or not store_id:
                        logger_instance.error(f"Missing user_id or store_id for userstores CREATE: {change_data}")
                        parent_missing = True
                    else:
                        user_exists = SupabaseDBInstance.client.table('users').select("id").eq("id", user_id).limit(1).execute().data
                        store_exists = SupabaseDBInstance.client.table('stores').select("id").eq("id", store_id).limit(1).execute().data
                        if not user_exists:
                            logger_instance.warning(f"Parent user (ID: {user_id}) missing for userstores CREATE (ID: {record_id}). Skipping.")
                            parent_missing = True
                        if not store_exists:
                            logger_instance.warning(f"Parent store (ID: {store_id}) missing for userstores CREATE (ID: {record_id}). Skipping.")
                            parent_missing = True
                elif table_name == 'storeinventory':
                    product_id = change_data.get('product_id')
                    store_id = change_data.get('store_id')
                    if not product_id or not store_id:
                        logger_instance.error(f"Missing product_id or store_id for storeinventory CREATE: {change_data}")
                        parent_missing = True
                    else:
                        product_exists = SupabaseDBInstance.client.table('products').select("id").eq("id", product_id).limit(1).execute().data
                        store_exists = SupabaseDBInstance.client.table('stores').select("id").eq("id", store_id).limit(1).execute().data
                        if not product_exists:
                            logger_instance.warning(f"Parent product (ID: {product_id}) missing for storeinventory CREATE (ID: {record_id}). Skipping.")
                            parent_missing = True
                        if not store_exists:
                            logger_instance.warning(f"Parent store (ID: {store_id}) missing for storeinventory CREATE (ID: {record_id}). Skipping.")
                            parent_missing = True
                elif table_name == 'inventory_transfer_items':
                    order_id = change_data.get('transfer_order_id')
                    product_id = change_data.get('product_id')
                    if not order_id or not product_id:
                        logger_instance.error(f"Missing transfer_order_id or product_id for inventory_transfer_items CREATE: {change_data}")
                        parent_missing = True
                    else:
                        order_exists = SupabaseDBInstance.client.table('inventory_transfer_orders').select("id").eq("id", order_id).limit(1).execute().data
                        product_exists = SupabaseDBInstance.client.table('products').select("id").eq("id", product_id).limit(1).execute().data
                        if not order_exists or not product_exists:
                            parent_missing = True
                elif table_name == 'inventory_transfer_scans':
                    transfer_item_id = change_data.get('transfer_item_id')
                    if not transfer_item_id:
                        logger_instance.error(f"Missing transfer_item_id for inventory_transfer_scans CREATE: {change_data}")
                        parent_missing = True
                elif table_name == 'inventory_transfer_verifications':
                    order_id = change_data.get('order_id')
                    store_id = change_data.get('store_id')
                    if not order_id or not store_id:
                        logger_instance.error(f"Missing order_id or store_id for inventory_transfer_verifications CREATE: {change_data}")
                        parent_missing = True
                elif table_name == 'damaged_inventory_events':
                    product_id = change_data.get('product_id')
                    if not product_id:
                        logger_instance.error(f"Missing product_id for damaged_inventory_events CREATE: {change_data}")
                        parent_missing = True
                
                if parent_missing:
                    log_sync_event(
                        eventType=f"{table_name}_push_skipped",
                        status="skipped_parent_missing",
                        details={
                            "record_id": record_id,
                            "table_name": table_name,
                            "change_type": change_type,
                            "message": "Child CREATE skipped due to missing parent record."
                        }
                    )
                    failed_pushes.append({"id": record_id, "table": table_name, "reason": "parent_missing"})
                    for entry in sync_table:
                        if entry.get('table_name') == table_name and entry.get('record_id') == record_id and entry.get('status') == 'pending':
                            entry['status'] = 'skipped'
                            entry['resolution'] = 'parent_missing'
                            break
                    save_sync_table_data(sync_table)
                    continue
            
            # Conflict resolution for UPDATEs
            elif change_type == 'UPDATE':
                logger_instance.debug(f"Fetching server record for {table_name}:{record_id} for conflict resolution (Supabase).")
                response = SupabaseDBInstance.client.table(table_name.lower()).select("*").eq("id", record_id).limit(1).execute()
                if response.data:
                    server_record = response.data[0]
                else:
                    logger_instance.debug(f"No server record found for {table_name}:{record_id}.")

                if server_record and local_updated_at:
                    server_updated_at = server_record.get('updatedAt')
                    if server_updated_at:
                        local_dt = datetime.fromisoformat(local_updated_at)
                        server_dt = datetime.fromisoformat(server_updated_at)
                        logger_instance.debug(f"Comparing timestamps for {table_name}:{record_id}. Local: {local_dt}, Server: {server_dt}")

                        if local_dt < server_dt:
                            logger_instance.warning(f"Conflict detected for {table_name}:{record_id}. Local change is older than server. Server wins.")
                            log_sync_event(
                                eventType=f"{table_name}_push_conflict",
                                status="conflict_resolved",
                                details={
                                    "record_id": record_id,
                                    "table_name": table_name,
                                    "local_change_type": change_type,
                                    "local_updated_at": local_updated_at,
                                    "server_updated_at": server_updated_at,
                                    "resolution": "server_wins",
                                    "message": "Server record was newer, local change skipped."
                                }
                            )
                            failed_pushes.append({"id": record_id, "table": table_name, "reason": "conflict_server_newer"})
                            for entry in sync_table:
                                if entry.get('table_name') == table_name and entry.get('record_id') == record_id and entry.get('status') == 'pending':
                                    entry['status'] = 'skipped'
                                    entry['resolution'] = 'server_wins'
                                    break
                            save_sync_table_data(sync_table)
                            continue

            logger_instance.debug(f"Applying change to MySQL for {table_name}:{record_id} (Type: {change_type}).")
            success = apply_change_to_db(table_name, change_type, record_id, change_data, logger_instance)

            if success:
                logger_instance.info(f"Successfully applied {change_type} to {table_name}:{record_id} in MySQL.")
                log_sync_event(
                    eventType=f"{table_name}_{change_type.lower()}",
                    status="success",
                    details={"record_id": record_id, "table_name": table_name, "change_type": change_type}
                )
                successful_pushes.append({"id": record_id, "table": table_name})
                # Update status in sync_table
                for entry in sync_table:
                    if entry.get('table_name') == table_name and entry.get('record_id') == record_id and entry.get('status') == 'pending':
                        entry['status'] = 'completed'
                        break
                # Save immediately after updating status for successful push, to ensure consistency before child cleanup
                save_sync_table_data(sync_table)

                # If a parent was deleted, clean up its pending children
                if change_type == 'DELETE':
                    # Collect IDs of successfully deleted parents
                    if table_name == 'users':
                        deleted_user_ids.add(record_id)
                    elif table_name == 'stores':
                        deleted_store_ids.add(record_id)
                    elif table_name == 'products':
                        deleted_product_ids.add(record_id)
            else:
                logger_instance.error(f"Failed to apply {change_type} to {table_name}:{record_id} in MySQL.")
                log_sync_event(
                    eventType=f"{table_name}_{change_type.lower()}",
                    status="failed",
                    details={"record_id": record_id, "table_name": table_name, "change_type": change_type, "error": "DB application failed"}
                )
                failed_pushes.append({"id": record_id, "table": table_name, "reason": "db_error"})

        except Exception as e:
            logger_instance.error(f"Unhandled exception during push sync for {table_name} (ID: {record_id}): {e}", exc_info=True)
            log_sync_event(
                eventType=f"{table_name}_{change_type.lower()}",
                status="failed",
                details={"record_id": record_id, "table_name": table_name, "change_type": change_type, "error": str(e)}
            )
            failed_pushes.append({"id": record_id, "table": table_name, "reason": "exception"})
    
    # After processing all pending changes, perform cleanup for deleted parents
    if deleted_user_ids or deleted_store_ids or deleted_product_ids:
        logger_instance.info(f"Cleaning up pending child entries for {len(deleted_user_ids)} deleted users, {len(deleted_store_ids)} deleted stores, {len(deleted_product_ids)} deleted products.")
        
        updated_sync_table = []
        cleanup_count = 0
        for entry in sync_table:
            if entry.get('status') == 'pending':
                child_table_name = entry.get('table_name')
                child_change_data = entry.get('change_data', {})
                
                skip_child = False
                if child_table_name == 'userstores':
                    user_id = child_change_data.get('user_id') or child_change_data.get('userId')
                    store_id = child_change_data.get('store_id') or child_change_data.get('storeId')
                    if (user_id and user_id in deleted_user_ids) or \
                       (store_id and store_id in deleted_store_ids):
                        skip_child = True
                        
                elif child_table_name == 'storeinventory':
                    product_id = child_change_data.get('product_id') or child_change_data.get('productId')
                    store_id = child_change_data.get('store_id') or child_change_data.get('storeId')
                    if (product_id and product_id in deleted_product_ids) or \
                       (store_id and store_id in deleted_store_ids):
                        skip_child = True
                        
                # If child needs to be skipped, update its status
                if skip_child:
                    entry['status'] = 'skipped'
                    entry['resolution'] = 'parent_deleted'
                    log_sync_event(
                        eventType=f"{child_table_name}_child_skipped",
                        status="skipped_parent_deleted",
                        details={
                            "record_id": entry.get('record_id'),
                            "table_name": child_table_name,
                            "change_type": entry.get('change_type'),
                            "message": "Child operation skipped due to deleted parent record."
                        }
                    )
                    failed_pushes.append({"id": entry.get('record_id'), "table": child_table_name, "reason": "parent_deleted"})
                    cleanup_count += 1
            updated_sync_table.append(entry)
        
        if cleanup_count > 0:
            save_sync_table_data(updated_sync_table)
            logger_instance.info(f"Cleaned up {cleanup_count} pending child entries.")
        sync_table = updated_sync_table # Ensure further operations use the updated list

    logger_instance.info("Cleaning up old completed sync_table entries.")
    cutoff_date = datetime.now() - timedelta(days=30)
    initial_sync_table_len = len(sync_table)
    sync_table = [
        entry for entry in sync_table
        if not (entry.get('status') == 'completed' and datetime.fromisoformat(entry['sync_time']) < cutoff_date)
    ]
    if len(sync_table) < initial_sync_table_len:
        logger_instance.debug(f"Removed {initial_sync_table_len - len(sync_table)} old completed entries from sync_table.")
    save_sync_table_data(sync_table)

    result_message = f"Push sync completed. Successful: {len(successful_pushes)}, Failed: {len(failed_pushes)}"
    logger_instance.info(result_message)
    return {
        "status": "success",
        "message": result_message,
        "successful_pushes": successful_pushes,
        "failed_pushes": failed_pushes
    }

def get_pull_sync_data(last_sync_timestamp: str, logger_instance: logging.Logger):
    """
    Fetches data from Supabase that changed after the last_sync_timestamp.
    Returns a dictionary of changes grouped by table.
    """
    logger_instance.info(f"Starting pull sync process from timestamp: {last_sync_timestamp}")
    changes = {}
    
    try:
        # Tables with timestamp columns
        tables_to_sync = [
            ("stores", "updatedat"),
            ("products", "updatedat"),
            ("customers", "updatedat"),
            ("users", "updatedat"),
            ("bills", "updated_at"),  # UPDATED: Now using updated_at
            ("billitems", "updated_at"),  # NEW: Added billitems
            ("batch", "updatedat"),
            ("returns", "created_at"),
            ("notifications", "created_at"),
            ("app_config", "updated_at"),
            ("sync_table", "created_at"),
            ("storeinventory", "updatedat"),
            ("userstores", "updated_at"),  # NEW: Added userstores
            ("systemsettings", "updated_at"),  # UPDATED: Now using updated_at instead of fetching all
            ("inventory_transfer_orders", "updated_at"),
            ("inventory_transfer_items", "updated_at"),
            ("inventory_transfer_scans", "created_at"),
            ("inventory_transfer_verifications", "submitted_at"),
            ("damaged_inventory_events", "updated_at"),
        ]
        
        for table_name, timestamp_column in tables_to_sync:
            logger_instance.debug(f"Fetching updated records from Supabase table: {table_name} since {last_sync_timestamp} using column '{timestamp_column}'")
            try:
                # Fetch updated records
                response = SupabaseDBInstance.client.table(table_name).select("*").gte(timestamp_column, last_sync_timestamp).execute()
                
                if response.data:
                    # Filter out soft-deleted products
                    if table_name.lower() == 'products':
                        filtered_data = [record for record in response.data if not record.get('_deleted', False)]
                        if filtered_data:
                            changes[table_name] = filtered_data
                            logger_instance.info(f"Pulled {len(filtered_data)} updated records from {table_name} (filtered {len(response.data) - len(filtered_data)} deleted).")
                        else:
                            logger_instance.debug(f"No non-deleted records found for {table_name} since {last_sync_timestamp}.")
                    else:
                        changes[table_name] = response.data
                        logger_instance.info(f"Pulled {len(response.data)} updated records from {table_name}.")
                else: # This else is for the inner try's response.data check
                    logger_instance.debug(f"No updated records found for {table_name} since {last_sync_timestamp}.")
            except Exception as e: # This except is for the inner try
                logger_instance.error(f"Error fetching data from Supabase table '{table_name}' using column '{timestamp_column}': {e}")
                continue
                
    except Exception as e: # This except is for the outer try
        logger_instance.error(f"Error during pull sync: {e}", exc_info=True)
        log_sync_event(
            eventType="pull_sync_failed",
            status="failed",
            details={"error": str(e), "last_sync_timestamp": last_sync_timestamp}
        )
        return {"status": "error", "message": f"Failed to pull data: {e}"}
    
    log_sync_event(
        eventType="pull_sync_success",
        status="success",
        details={"last_sync_timestamp": last_sync_timestamp, "pulled_tables": list(changes.keys()), "total_tables_pulled": len(changes)}
    )
    
    logger_instance.info(f"Pull sync completed. Pulled data from {len(changes)} tables.")
    return {"status": "success", "changes": changes}
