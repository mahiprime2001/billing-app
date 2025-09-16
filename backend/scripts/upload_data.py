import os
import sys
import json
from datetime import datetime

# Add the project root to sys.path for module imports
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.utils.db import DatabaseConnection

def get_json_data(filename):
    """Reads and returns data from a JSON file."""
    filepath = os.path.join(os.getcwd(), 'app', 'data', 'json', filename)
    with open(filepath, 'r') as f:
        return json.load(f)

async def upload_data():
    """Uploads data from JSON files to the MySQL database."""
    
    # Define sync log file path
    log_dir = os.path.join(PROJECT_ROOT, 'backend', 'data', 'logs')
    log_filepath = os.path.join(log_dir, 'sync.log')

    # Check if initial upload has already occurred
    if os.path.exists(log_filepath):
        print(f"Initial data upload already completed (sync log found at {log_filepath}). Skipping.")
        return

    conn = None
    try:
        conn = DatabaseConnection.get_connection()
        cursor = conn.cursor()

        # Start transaction
        conn.start_transaction()

        # Upload stores
        stores = get_json_data('stores.json')
        for store in stores:
            now = datetime.now()
            created_at = datetime.fromisoformat(store.get('createdAt', now.isoformat()).replace('Z', '+00:00'))
            updated_at = datetime.fromisoformat(store.get('updatedAt', now.isoformat()).replace('Z', '+00:00'))
            cursor.execute(
                'INSERT IGNORE INTO Stores (id, name, address, phone, status, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s)',
                (store.get('id'), store.get('name'), store.get('address'), store.get('phone'), store.get('status'), created_at, updated_at)
            )

        # Upload users
        users = get_json_data('users.json')
        for user in users:
            cursor.execute(
                'INSERT IGNORE INTO Users (id, name, email, password, role, status, sessionDuration, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)',
                (user.get('id'), user.get('name'), user.get('email'), user.get('password'), user.get('role'), user.get('status'), user.get('sessionDuration'), user.get('createdAt'), user.get('updatedAt'))
            )
            if user.get('assignedStores'):
                for store_id in user['assignedStores']:
                    cursor.execute(
                        'INSERT IGNORE INTO UserStores (userId, storeId) VALUES (%s, %s)',
                        (user.get('id'), store_id)
                    )

        # Upload products
        products = get_json_data('products.json')
        for product in products:
            cursor.execute(
                'INSERT IGNORE INTO Products (id, name, price, stock, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s)',
                (product.get('id'), product.get('name'), product.get('price'), product.get('stock'), product.get('createdAt'), product.get('updatedAt'))
            )
            if product.get('barcodes'):
                for barcode in product['barcodes']:
                    cursor.execute(
                        'INSERT IGNORE INTO ProductBarcodes (productId, barcode) VALUES (%s, %s)',
                        (product.get('id'), barcode)
                    )

        # Upload customers and bills
        bills = get_json_data('bills.json')
        for bill in bills:
            customer_id = None
            if bill.get('customerPhone'):
                customer_id = bill['customerPhone'] # Use phone number as customer ID
                now = datetime.now()
                cursor.execute(
                    'INSERT IGNORE INTO Customers (id, name, phone, email, address, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s)',
                    (customer_id, bill.get('customerName'), bill.get('customerPhone'), bill.get('customerEmail'), bill.get('customerAddress'), now, now)
                )

            cursor.execute(
                'INSERT IGNORE INTO Bills (id, storeId, storeName, storeAddress, customerName, customerPhone, customerEmail, customerAddress, customerId, subtotal, taxPercentage, taxAmount, discountPercentage, discountAmount, total, paymentMethod, timestamp, notes, gstin, companyName, companyAddress, companyPhone, companyEmail, billFormat, createdBy) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
                (bill.get('id'), bill.get('storeId'), bill.get('storeName'), bill.get('storeAddress'), bill.get('customerName'), bill.get('customerPhone'), bill.get('customerEmail'), bill.get('customerAddress'), customer_id, bill.get('subtotal'), bill.get('taxPercentage'), bill.get('taxAmount'), bill.get('discountPercentage'), bill.get('discountAmount'), bill.get('total'), bill.get('paymentMethod'), bill.get('timestamp'), bill.get('notes'), bill.get('gstin'), bill.get('companyName'), bill.get('companyAddress'), bill.get('companyPhone'), bill.get('companyEmail'), bill.get('billFormat'), bill.get('createdBy'))
            )
            if bill.get('items'):
                for item in bill['items']:
                    cursor.execute(
                        'INSERT IGNORE INTO BillItems (billId, productId, productName, quantity, price, total) VALUES (%s, %s, %s, %s, %s, %s)',
                        (bill.get('id'), item.get('productId'), item.get('productName'), item.get('quantity'), item.get('price'), item.get('total'))
                    )

        # Upload settings
        settings_data = get_json_data('settings.json')
        print(f"DEBUG: settings_data from settings.json: {settings_data}")
        
        system_settings = {}
        if isinstance(settings_data, list) and settings_data:
            # If settings_data is a list, take the first item as the system settings
            system_settings = settings_data[0]
            print(f"DEBUG: settings_data was a list, taking first element: {system_settings}")
        elif isinstance(settings_data, dict):
            # If settings_data is already a dictionary, use it directly
            system_settings = settings_data
            print(f"DEBUG: settings_data was a dict: {system_settings}")
        else:
            print(f"WARNING: Unexpected format for settings_data: {type(settings_data)}. Skipping system settings upload.")
            # Skip the rest of the settings upload if format is unexpected
            system_settings = {} # Ensure system_settings is a dict to prevent further errors

        if system_settings: # Only proceed if system_settings is a valid dictionary
            # Check if settings already exist (assuming a single settings entry, e.g., with ID 1)
            cursor.execute('SELECT COUNT(*) FROM SystemSettings WHERE id = 1')
            settings_count = cursor.fetchone()[0]

            if settings_count == 0:
                # Insert if no settings exist
                cursor.execute(
                    'INSERT INTO SystemSettings (id, gstin, taxPercentage, companyName, companyAddress, companyPhone, companyEmail) VALUES (%s, %s, %s, %s, %s, %s, %s)',
                    (1, system_settings.get('gstin'), system_settings.get('taxPercentage'), system_settings.get('companyName'), system_settings.get('companyAddress'), system_settings.get('companyPhone'), system_settings.get('companyEmail'))
                )
                print("Initial system settings inserted.")
            else:
                print("System settings already exist, skipping initial insert.")
        
        # The commented-out billFormats section is not relevant to the current task
        # and can be ignored or removed if not used elsewhere.

        conn.commit()
        print('Data uploaded successfully!')

        # Update sync log file
        log_dir = os.path.join(os.getcwd(), 'app', 'data', 'logs')
        os.makedirs(log_dir, exist_ok=True)
        log_filepath = os.path.join(log_dir, 'sync.log')
        log_message = f"Last sync: {datetime.now().isoformat()}\n"
        with open(log_filepath, 'w') as f:
            f.write(log_message)
        print(f"Sync log updated at {log_filepath}")

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Error uploading data: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
        # DatabaseConnection.close_pool() is no longer needed here as the pool manages itself

if __name__ == "__main__":
    import asyncio
    asyncio.run(upload_data())
