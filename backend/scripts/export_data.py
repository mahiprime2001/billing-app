import os
import json
from datetime import datetime
from utils.db import DatabaseConnection

JSON_DIR = os.path.join(os.getcwd(), 'app', 'data', 'json')

def ensure_output_dir():
    """Ensures the output directory for JSON files exists."""
    os.makedirs(JSON_DIR, exist_ok=True)

def get_tables_from_db():
    """Fetches all table names from the database."""
    conn = None
    try:
        conn = DatabaseConnection.get_connection()
        cursor = conn.cursor()
        cursor.execute('SHOW TABLES')
        tables = [row[0] for row in cursor.fetchall()]
        return tables
    except Exception as e:
        print(f"Error fetching table names: {e}")
        return []
    finally:
        if conn:
            cursor.close()
            conn.close()

async def export_formatted_data():
    """Exports formatted data from MySQL to JSON files."""
    ensure_output_dir()
    conn = None
    try:
        conn = DatabaseConnection.get_connection()
        cursor = conn.cursor(dictionary=True) # Return rows as dictionaries

        tables = get_tables_from_db()

        # Export Bills
        cursor.execute('SELECT * FROM Bills')
        bills = cursor.fetchall()
        cursor.execute('SELECT * FROM BillItems')
        bill_items = cursor.fetchall()
        
        formatted_bills = []
        for bill in bills:
            bill['items'] = [item for item in bill_items if item['billId'] == bill['id']]
            # Convert datetime objects to ISO format strings
            for key, value in bill.items():
                if isinstance(value, datetime):
                    bill[key] = value.isoformat()
            formatted_bills.append(bill)
        save_json_data('bills.json', formatted_bills)
        print('Successfully exported formatted data to bills.json')

        # Export Products
        cursor.execute('SELECT * FROM Products')
        products = cursor.fetchall()
        cursor.execute('SELECT productId, barcode FROM ProductBarcodes')
        product_barcodes = cursor.fetchall()

        formatted_products = []
        for product in products:
            product['barcodes'] = [pb['barcode'] for pb in product_barcodes if pb['productId'] == product['id']]
            for key, value in product.items():
                if isinstance(value, datetime):
                    product[key] = value.isoformat()
            formatted_products.append(product)
        save_json_data('products.json', formatted_products)
        print('Successfully exported data to products.json')

        # Export Stores
        cursor.execute('SELECT * FROM Stores')
        stores = cursor.fetchall()
        for store in stores:
            for key, value in store.items():
                if isinstance(value, datetime):
                    store[key] = value.isoformat()
        save_json_data('stores.json', stores)
        print('Successfully exported data to stores.json')

        # Export Users
        cursor.execute('SELECT * FROM Users')
        users = cursor.fetchall()
        cursor.execute('SELECT userId, storeId FROM UserStores')
        user_stores = cursor.fetchall()

        formatted_users = []
        for user in users:
            user['assignedStores'] = [us['storeId'] for us in user_stores if us['userId'] == user['id']]
            for key, value in user.items():
                if isinstance(value, datetime):
                    user[key] = value.isoformat()
            formatted_users.append(user)
        save_json_data('users.json', formatted_users)
        print('Successfully exported data to users.json')

        # Export Settings (SystemSettings and BillFormats combined)
        cursor.execute('SELECT * FROM SystemSettings')
        system_settings = cursor.fetchone() # Assuming single row for system settings
        
        cursor.execute('SELECT name, format FROM BillFormats')
        bill_formats_rows = cursor.fetchall()
        bill_formats = {row['name']: json.loads(row['format']) for row in bill_formats_rows}

        settings_data = {
            'systemSettings': system_settings,
            'billFormats': bill_formats
        }
        # Convert datetime objects in system_settings to ISO format strings
        if system_settings:
            for key, value in system_settings.items():
                if isinstance(value, datetime):
                    system_settings[key] = value.isoformat()

        save_json_data('settings.json', settings_data)
        print('Successfully exported data to settings.json')

        # Export Notifications
        if 'notifications' in tables:
            cursor.execute('SELECT * FROM notifications')
            notifications = cursor.fetchall()
            for notification in notifications:
                for key, value in notification.items():
                    if isinstance(value, datetime):
                        notification[key] = value.isoformat()
            save_json_data('notifications.json', notifications)
            print('Successfully exported data to notifications.json')

    except Exception as e:
        print(f'Error exporting formatted data: {e}')
    finally:
        if conn:
            cursor.close()
            conn.close()
        DatabaseConnection.close_pool()

def save_json_data(filename: str, data):
    """Helper function to save data to a JSON file."""
    filepath = os.path.join(JSON_DIR, filename)
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)

if __name__ == "__main__":
    import asyncio
    asyncio.run(export_formatted_data())
