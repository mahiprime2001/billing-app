import os
import sys
import json
import logging
from datetime import datetime, timedelta
import os
import sys
import json
import logging
from datetime import datetime, timedelta

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

    logger_instance.info(f"Found {len(pending_changes)} pending changes to push.")
    successful_pushes = []
    failed_pushes = []
    
    for change in pending_changes:
        table_name = change['table_name']
        change_type = change['change_type']
        record_id = change['record_id']
        change_data = change['change_data']
        local_updated_at = change_data.get('updatedAt') # Assuming updatedAt is always present for C/U

        logger_instance.debug(f"Processing pending change: Table={table_name}, Type={change_type}, ID={record_id}")
        try:
            server_record = None
            if change_type == 'UPDATE':
                logger_instance.debug(f"Fetching server record for {table_name}:{record_id} for conflict resolution.")
                with DatabaseConnection.get_connection_ctx() as conn:
                    cursor = conn.cursor(dictionary=True)
                    cursor.execute(f"SELECT * FROM `{table_name}` WHERE `id` = %s", (record_id,))
                    server_record = cursor.fetchone()
                if server_record:
                    logger_instance.debug(f"Server record found for {table_name}:{record_id}.")
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
                for entry in sync_table:
                    if entry.get('table_name') == table_name and entry.get('record_id') == record_id and entry.get('status') == 'pending':
                        entry['status'] = 'completed'
                        break
                save_sync_table_data(sync_table)
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
    Fetches data from MySQL that changed after the last_sync_timestamp.
    Returns a dictionary of changes grouped by table.
    """
    logger_instance.info(f"Starting pull sync process from timestamp: {last_sync_timestamp}")
    changes = {}
    try:
        with DatabaseConnection.get_connection_ctx() as conn:
            cursor = conn.cursor(dictionary=True)
            
            logger_instance.debug("Fetching tables with 'updatedAt' column.")
            cursor.execute("SELECT table_name FROM information_schema.columns WHERE column_name = 'updatedAt' AND table_schema = DATABASE()")
            tables_with_updated_at = [row['table_name'] for row in cursor.fetchall()]
            logger_instance.debug(f"Found tables with 'updatedAt': {tables_with_updated_at}")

            for table_name in tables_with_updated_at:
                query = f"SELECT * FROM `{table_name}` WHERE `updatedAt` > %s"
                logger_instance.debug(f"Executing query for {table_name}: {query} with timestamp {last_sync_timestamp}")
                cursor.execute(query, (last_sync_timestamp,))
                updated_records = cursor.fetchall()
                
                if updated_records:
                    changes[table_name] = updated_records
                    logger_instance.info(f"Pulled {len(updated_records)} updated records from {table_name}.")
                else:
                    logger_instance.debug(f"No updated records found for {table_name} since {last_sync_timestamp}.")

    except Exception as e:
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
