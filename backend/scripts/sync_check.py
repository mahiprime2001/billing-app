import os
import sys
import json
import time
from datetime import datetime, timedelta
import mysql.connector # Import mysql.connector for error handling
import logging # Import logging module

# Add the project root to sys.path for module imports
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.db import DatabaseConnection

LOG_DIR = os.path.join(os.getcwd(), 'app', 'data', 'logs')
JSON_DIR = os.path.join(os.getcwd(), 'app', 'data', 'json')
SYNC_STATE_FILE = os.path.join(LOG_DIR, 'sync_state.json')
NOTIFICATIONS_FILE = os.path.join(JSON_DIR, 'notifications.json')
POLLING_INTERVAL = 15 * 60 # 15 minutes in seconds
LOG_RETENTION_DAYS = 30

class SyncRecord:
    def __init__(self, id, sync_time, change_type, change_data):
        self.id = id
        self.sync_time = sync_time
        self.change_type = change_type
        self.change_data = change_data

class Notification:
    def __init__(self, id, type, title, message, userId, userName, userEmail, isRead, createdAt, syncLogId):
        self.id = id
        self.type = type
        self.title = title
        self.message = message
        self.userId = userId
        self.userName = userName
        self.userEmail = userEmail
        self.isRead = isRead
        self.createdAt = createdAt
        self.syncLogId = syncLogId

def execute_with_retry(query: str, params: tuple = (), retries: int = 3):
    """Executes a MySQL query with retry logic."""
    for attempt in range(1, retries + 1):
        conn = None
        try:
            conn = DatabaseConnection.get_connection()
            cursor = conn.cursor(dictionary=True) # Return rows as dictionaries
            cursor.execute(query, params)
            if query.strip().upper().startswith('SELECT'):
                return cursor.fetchall()
            else:
                conn.commit()
                return None # For INSERT/UPDATE/DELETE
        except mysql.connector.Error as err:
            if conn:
                conn.rollback()
            if attempt == retries:
                raise
            print(f"[MySQL] Query failed (attempt {attempt}) - retrying... {err.errno}")
            time.sleep(2) # wait before retry
        finally:
            if conn:
                cursor.close()
                conn.close()

def load_sync_state():
    """Loads the sync state from a JSON file."""
    try:
        with open(SYNC_STATE_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {'lastSyncId': 0}

def save_sync_state(state):
    """Saves the sync state to a JSON file."""
    with open(SYNC_STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def load_notifications():
    """Loads notifications from a JSON file."""
    try:
        with open(NOTIFICATIONS_FILE, 'r') as f:
            return [Notification(**n) for n in json.load(f)]
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def save_notifications_to_file(notifications):
    """Saves notifications to a JSON file."""
    # Convert Notification objects back to dictionaries for JSON serialization
    notifications_data = [n.__dict__ for n in notifications]
    with open(NOTIFICATIONS_FILE, 'w') as f:
        json.dump(notifications_data, f, indent=2)

async def create_password_reset_notification(change: SyncRecord):
    """Creates a password reset notification."""
    try:
        parsed_change_data = json.loads(change.change_data) if isinstance(change.change_data, str) else change.change_data

        user_id = parsed_change_data.get('id')
        user_name = parsed_change_data.get('name')
        user_email = parsed_change_data.get('email', '')
        
        if not user_id or not user_name:
            logger.warning(f'Missing user data in password reset change: {parsed_change_data}')
            return

        notifications = load_notifications()

        # Check if notification for this sync log already exists
        if any(n.syncLogId == change.id for n in notifications):
            logger.info(f'Notification already exists for sync log ID {change.id}')
            return

        notification = Notification(
            id=f"notif_{int(time.time())}_{user_id}",
            type='PASSWORD_RESET',
            title='Password Changed',
            message=f'The user {user_name} has changed the password',
            userId=user_id,
            userName=user_name,
            userEmail=user_email,
            isRead=False,
            createdAt=change.sync_time.isoformat(),
            syncLogId=change.id
        )

        notifications.insert(0, notification) # Add to beginning for newest first
        trimmed_notifications = notifications[:100] # Keep only last 100
        save_notifications_to_file(trimmed_notifications)

        logger.info(f'✅ Created notification: {notification.message}')
        
    except Exception as e:
        logger.error(f'Error creating password reset notification: {e}')

async def cleanup_old_logs(logger: logging.Logger):
    """Cleans up log files older than LOG_RETENTION_DAYS."""
    now = datetime.now()
    retention_period = timedelta(days=LOG_RETENTION_DAYS)

    try:
        files = os.listdir(LOG_DIR)
        for file in files:
            if file.endswith('.log') and file not in ['sync.log', 'processing_state.json', 'sync_state.json']:
                filepath = os.path.join(LOG_DIR, file)
                stats = os.stat(filepath)
                modified_time = datetime.fromtimestamp(stats.st_mtime)
                if now - modified_time > retention_period:
                    os.remove(filepath)
                    logger.info(f'Deleted old log file: {file}')
    except Exception as e:
        logger.error(f'Error cleaning up old logs: {e}')

def save_json_data(filename: str, data: list):
    """Saves data to a JSON file."""
    filepath = os.path.join(JSON_DIR, filename)
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)

async def process_changes(changes: list[SyncRecord], logger: logging.Logger):
    """Processes a list of sync records and updates local JSON files."""
    for change in changes:
        change_type = change.change_type
        change_data = change.change_data
        
        if change_type == 'password_reset':
            await create_password_reset_notification(change)
            continue # Password reset handled, no JSON update needed for this type

        # Handle different types of change_data (str, bytes, or dict)
        if isinstance(change_data, bytes):
            try:
                # Try to decode bytes to string and then parse JSON
                change_data_str = change_data.decode('utf-8')
                parsed_change_data = json.loads(change_data_str)
            except (UnicodeDecodeError, json.JSONDecodeError) as e:
                logger.error(f'Error decoding change_data: {e}')
                continue
        elif isinstance(change_data, str):
            try:
                parsed_change_data = json.loads(change_data)
            except json.JSONDecodeError as e:
                logger.error(f'Error parsing change_data JSON: {e}')
                continue
        else:
            # If it's already a dict, use it as is
            parsed_change_data = change_data
        table = parsed_change_data.get('table') # The original TS script used 'table' in change_data for delete
        record_id = parsed_change_data.get('id')

        if not table or not record_id:
            # If 'table' is not in change_data, try to infer from change_data keys
            # This is a heuristic and might need refinement based on actual log_sync data
            if 'name' in parsed_change_data and 'email' in parsed_change_data:
                table = 'Users'
            elif 'name' in parsed_change_data and 'price' in parsed_change_data:
                table = 'Products'
            elif 'name' in parsed_change_data and 'address' in parsed_change_data and 'phone' in parsed_change_data:
                table = 'Stores'
            elif 'customerName' in parsed_change_data and 'total' in parsed_change_data:
                table = 'Bills'
            elif 'gstin' in parsed_change_data and 'companyName' in parsed_change_data:
                table = 'SystemSettings'
            elif 'title' in parsed_change_data and 'message' in parsed_change_data:
                table = 'Notifications' # Assuming a Notifications table exists in DB
            elif 'name' in parsed_change_data and 'format' in parsed_change_data:
                table = 'BillFormats'
            elif 'name' in parsed_change_data and 'phone' in parsed_change_data and 'email' in parsed_change_data:
                table = 'Customers' # Assuming Customers table exists in DB
            
            if not table:
                logger.warning(f'Could not determine table for change data: {change_data}. Skipping.')
                continue

        # Adjust table name for JSON file naming convention if necessary
        json_filename = table.lower()
        if json_filename.endswith('s'):
            json_filename = json_filename[:-1] # Remove 's' for singular entity type if needed
        if json_filename == 'systemsettings':
            json_filename = 'settings' # Special case for settings.json
        elif json_filename == 'billformats':
            json_filename = 'settings' # Bill formats are part of settings.json
        elif json_filename == 'userstores':
            continue # UserStores are handled as part of Users, no separate JSON
        elif json_filename == 'productbarcodes':
            continue # ProductBarcodes are handled as part of Products, no separate JSON
        elif json_filename == 'billitems':
            continue # BillItems are handled as part of Bills, no separate JSON
        elif json_filename == 'customers':
            json_filename = 'bills' # Customers are embedded in bills.json for now

        json_path = os.path.join(JSON_DIR, f'{json_filename}.json')

        try:
            # Ensure the JSON file exists, create if not
            if not os.path.exists(json_path):
                with open(json_path, 'w') as f:
                    json.dump([], f)

            with open(json_path, 'r') as f:
                records = json.load(f)
            
            records_changed = False
            record_index = next((i for i, r in enumerate(records) if r.get('id') == record_id), -1)
            record_exists = record_index > -1

            if change_type == 'delete':
                if record_exists:
                    records = [r for r in records if r.get('id') != record_id]
                    records_changed = True
                    logger.info(f'Record {record_id} from table {table} deleted from {json_filename}.json.')
                else:
                    logger.info(f'Record {record_id} from table {table} already deleted from {json_filename}.json. Skipping.')
            else: # create or update
                # Fetch the latest record from the database
                db_record_rows = execute_with_retry(f'SELECT * FROM {table} WHERE id = %s', (record_id,))
                updated_record = db_record_rows[0] if db_record_rows else None

                if updated_record:
                    # Special handling for nested data (products, users, bills)
                    if table == 'Products':
                        barcode_rows = execute_with_retry('SELECT barcode FROM ProductBarcodes WHERE productId = %s', (record_id,))
                        updated_record['barcodes'] = [row['barcode'] for row in barcode_rows]
                    elif table == 'Users':
                        user_store_rows = execute_with_retry('SELECT storeId FROM UserStores WHERE userId = %s', (record_id,))
                        updated_record['assignedStores'] = [row['storeId'] for row in user_store_rows]
                    elif table == 'Bills':
                        bill_item_rows = execute_with_retry('SELECT productId, productName, quantity, price, total FROM BillItems WHERE billId = %s', (record_id,))
                        updated_record['items'] = bill_item_rows
                        # Also fetch customer data if available
                        customer_id = updated_record.get('customerId')
                        if customer_id:
                            customer_rows = execute_with_retry('SELECT name, phone, email, address FROM Customers WHERE id = %s', (customer_id,))
                            if customer_rows:
                                customer_data = customer_rows[0]
                                updated_record['customerName'] = customer_data.get('name')
                                updated_record['customerPhone'] = customer_data.get('phone')
                                updated_record['customerEmail'] = customer_data.get('email')
                                updated_record['customerAddress'] = customer_data.get('address')
                    elif table == 'SystemSettings':
                        # SystemSettings are a single entry, replace or update
                        # BillFormats are also part of settings.json
                        bill_format_rows = execute_with_retry('SELECT name, format FROM BillFormats')
                        bill_formats = {row['name']: json.loads(row['format']) for row in bill_format_rows}
                        updated_record = {'systemSettings': updated_record, 'billFormats': bill_formats}
                        records = [] # Clear existing settings to replace
                        
                    # Convert datetime objects to ISO format strings for JSON
                    for key, value in updated_record.items():
                        if isinstance(value, datetime):
                            updated_record[key] = value.isoformat()

                    if record_exists:
                        # Update: Check if data is different before updating
                        if json.dumps(records[record_index], sort_keys=True, default=str) != json.dumps(updated_record, sort_keys=True, default=str):
                            records[record_index] = updated_record
                            records_changed = True
                            logger.info(f'Record {record_id} in table {table} updated in {json_filename}.json.')
                        else:
                            logger.info(f'Record {record_id} in table {table} is already up-to-date in {json_filename}.json. Skipping.')
                    else:
                        # Create
                        records.append(updated_record)
                        records_changed = True
                        logger.info(f'Record {record_id} added to {json_filename}.json.')
                else:
                    logger.warning(f'Record {record_id} not found in database for table {table}. Skipping JSON update.')

            if records_changed:
                save_json_data(f'{json_filename}.json', records)
                logger.info(f'Updated {json_filename}.json for ID: {record_id}')
        except Exception as e:
            logger.error(f'Error processing change for {json_filename}.json: {e}')

async def check_for_changes(logger: logging.Logger):
    """Checks the sync_table for new changes and processes them."""
    logger.info('Checking for changes...')
    try:
        state = load_sync_state()
        rows = execute_with_retry(
            'SELECT id, sync_time, change_type, change_data FROM sync_table WHERE id > %s ORDER BY id ASC',
            (state['lastSyncId'],)
        )

        changes = [SyncRecord(**row) for row in rows]
        if changes:
            logger.info(f'Found {len(changes)} new changes.')
            
            password_reset_changes = [c for c in changes if c.change_type == 'password_reset']
            if password_reset_changes:
                logger.info(f'Found {len(password_reset_changes)} password reset changes - creating notifications.')

            await process_changes(changes, logger)
            new_state = {'lastSyncId': changes[-1].id}
            save_sync_state(new_state)
        else:
            logger.info('No new changes found.')
    except Exception as e:
        logger.error(f'Error checking for changes: {e}')

async def start_sync_process(logger: logging.Logger):
    """Starts the continuous sync process."""
    logger.info('Starting sync process with notification support...')
    
    # Ensure logs and json directories exist
    os.makedirs(LOG_DIR, exist_ok=True)
    os.makedirs(JSON_DIR, exist_ok=True)

    # Ensure notifications file exists
    if not os.path.exists(NOTIFICATIONS_FILE):
        save_notifications_to_file([])
        logger.info('Created notifications.json file')
    
    async def run_checks():
        await check_for_changes(logger)
        await cleanup_old_logs(logger)
        # Keep-alive ping to prevent MySQL idle disconnects
        try:
            execute_with_retry('SELECT MAX(id) FROM sync_table')
            logger.info(f"[MySQL] Sync table check successful at {datetime.now().isoformat()}")
        except Exception as err:
            logger.error(f'[MySQL] Sync table check failed: {err}')
        
        time.sleep(POLLING_INTERVAL) # Use time.sleep for blocking wait
        await run_checks() # Recursive call for continuous polling

    await run_checks()

if __name__ == "__main__":
    import asyncio
    # When run as a script, use a basic logger
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    script_logger = logging.getLogger(__name__)
    asyncio.run(start_sync_process(script_logger))
