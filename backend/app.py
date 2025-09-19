import os
import sys # Add this import
import json
import uuid
import re # Import re for regex operations
import threading # Import threading for running scripts in background
import time # Import time for sleep function
from datetime import datetime, timedelta, timezone
import logging # Import logging module
from flask import Flask, jsonify, request, make_response, redirect, url_for, g
from flask_cors import CORS # Import CORS
from dotenv import load_dotenv # Import load_dotenv
from urllib.parse import urlparse # Import urlparse
from utils.db import DatabaseConnection # Import DatabaseConnection
from scripts.sync import log_and_apply_sync # Import log_and_apply_sync
from scripts.sync_check import start_sync_process # Import start_sync_process
from utils.print_TSPL import generate_tspl, send_raw_to_printer

# Determine the base directory for resource loading
if getattr(sys, 'frozen', False):
    # Running in a PyInstaller bundle
    # In a frozen environment, sys._MEIPASS is the path to the bundle's temporary directory
    # We need to find the actual project root relative to this.
    # Assuming the backend directory is directly inside the project root in the bundle.
    PROJECT_ROOT = os.path.dirname(sys._MEIPASS) 
else:
    # Running in a normal Python environment
    # BASE_DIR is the directory of app.py (backend/)
    # PROJECT_ROOT is the parent directory of backend/
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Add PROJECT_ROOT to sys.path for module imports
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# BASE_DIR should still point to the directory of app.py for file loading within the Flask app
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

load_dotenv(os.path.join(PROJECT_ROOT, '.env')) # Load environment variables from .env file (assuming .env is in the project root)

app = Flask(__name__)

@app.before_request
def log_request_info():
    app.logger.info(f"Incoming Request: Method={request.method}, Path={request.path}, Origin={request.headers.get('Origin')}")

# Enable CORS for specific origins and methods
CORS(app, resources={r"/api/*": {"origins": "*"}}, 
     supports_credentials=True, 
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], 
     headers=["Content-Type", "Authorization"])

# Secret key for session management (replace with a strong, random key in production)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'super_secret_key_for_dev')

PRODUCTS_FILE = os.path.join(BASE_DIR, 'data', 'json', 'products.json')
USERS_FILE = os.path.join(BASE_DIR, 'data', 'json', 'users.json')
BILLS_FILE = os.path.join(BASE_DIR, 'data', 'json', 'bills.json')
NOTIFICATIONS_FILE = os.path.join(BASE_DIR, 'data', 'json', 'notifications.json')
SETTINGS_FILE = os.path.join(BASE_DIR, 'data', 'json', 'settings.json')
STORES_FILE = os.path.join(BASE_DIR, 'data', 'json', 'stores.json')
# Configure logging for the Flask app
LOG_DIR = os.path.join(PROJECT_ROOT, 'backend', 'data', 'logs')
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, 'app.log')

file_handler = logging.FileHandler(LOG_FILE)
file_handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)
app.logger.addHandler(file_handler)
app.logger.setLevel(logging.INFO)

def get_products_data():
    if not os.path.exists(PRODUCTS_FILE):
        return []
    with open(PRODUCTS_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

def save_products_data(products):
    with open(PRODUCTS_FILE, 'w') as f:
        json.dump(products, f, indent=2)

def get_users_data():
    if not os.path.exists(USERS_FILE):
        return []
    with open(USERS_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

def save_users_data(users):
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)

def get_bills_data():
    if not os.path.exists(BILLS_FILE):
        return []
    with open(BILLS_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

def save_bills_data(bills):
    with open(BILLS_FILE, 'w') as f:
        json.dump(bills, f, indent=2)

def get_notifications_data():
    if not os.path.exists(NOTIFICATIONS_FILE):
        return []
    with open(NOTIFICATIONS_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

def save_notifications_data(notifications):
    with open(NOTIFICATIONS_FILE, 'w') as f:
        json.dump(notifications, f, indent=2)

def get_settings_data():
    if not os.path.exists(SETTINGS_FILE):
        return {}
    with open(SETTINGS_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}

def save_settings_data(settings):
    with open(SETTINGS_FILE, 'w') as f:
        json.dump(settings, f, indent=2)

def get_stores_data():
    if not os.path.exists(STORES_FILE):
        return []
    with open(STORES_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

def save_stores_data(stores):
    with open(STORES_FILE, 'w') as f:
        json.dump(stores, f, indent=2)

@app.route('/')
def home():
    return "Hello from Flask Backend!"

@app.errorhandler(404)
def not_found(error):
    app.logger.warning(f"404 Not Found: Path={request.path}, Method={request.method}, Origin={request.headers.get('Origin')}")
    return jsonify({"status": "error", "message": "Resource not found"}), 404

# All API routes will now require explicit authentication checks within their functions
# or rely on the frontend to send credentials with each request.
# For now, we are removing the global @app.before_request authentication.

@app.route('/api/products', methods=['GET'])
def get_products():
    # For now, no authentication check here as per user's request to remove security
    products = get_products_data()
    return jsonify(products)

@app.route('/api/products', methods=['POST'])
def add_product():
    new_product = request.json
    products = get_products_data()

    new_product['id'] = str(uuid.uuid4())
    new_product['createdAt'] = datetime.now().isoformat()
    new_product['updatedAt'] = datetime.now().isoformat()

    products.append(new_product)
    save_products_data(products)

    log_and_apply_sync("Products", "CREATE", new_product['id'], new_product, app.logger)
    return jsonify(new_product), 201

@app.route('/api/products/<string:product_id>', methods=['PUT'])
def update_product(product_id):
    updated_data = request.json
    products = get_products_data()
    product_found = False
    for i, product in enumerate(products):
        if product['id'] == product_id:
            products[i].update(updated_data)
            products[i]['updatedAt'] = datetime.now().isoformat()
            product_found = True
            break
    
    if product_found:
        save_products_data(products)
        log_and_apply_sync("Products", "UPDATE", product_id, products[i], app.logger)
        return jsonify(products[i])
    return jsonify({"message": "Product not found"}), 404

@app.route('/api/products/<string:product_id>', methods=['DELETE'])
def delete_product(product_id):
    products = get_products_data()
    initial_len = len(products)
    products = [product for product in products if product['id'] != product_id]

    if len(products) < initial_len:
        save_products_data(products)
        log_and_apply_sync("Products", "DELETE", product_id, {}, app.logger)
        return jsonify({"message": "Product deleted"}), 200
    return jsonify({"message": "Product not found"}), 404

# Define the printer name (replace with your actual printer name)
PRINTER_NAME = os.environ.get('PRINTER_NAME', 'SNBC TVSE LP46 Dlite BPLE') # Default to example name

import traceback # Add this import

# Define the printer name (replace with your actual printer name)
PRINTER_NAME = os.environ.get('PRINTER_NAME', 'SNBC TVSE LP46 Dlite BPLE') # Default to example name

import win32print # Add this import

@app.route('/api/printers', methods=['GET'])
def get_printers():
    try:
        printers = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL, None, 1)
        printer_names = [name for flags, description, name, comment in printers]
        return jsonify({"status": "success", "printers": printer_names})
    except Exception as e:
        app.logger.error("Exception in get_printers endpoint:\n" + traceback.format_exc())
        return jsonify({"status": "error", "message": f"Failed to retrieve printers: {e}"}), 500

@app.route('/api/print-label', methods=['POST', 'OPTIONS'])
def api_print_label():
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type, Authorization")
        return response, 200

    try:
        data = request.get_json()
        product_ids = data.get("productIds", [])
        copies = int(data.get("copies", 1))
        printer_name = data.get("printerName", "Your_Printer_Name")
        store_name = data.get("storeName", "Company Name") # Get storeName from request

        app.logger.info(f"Received print request: product_ids={product_ids}, copies={copies}, printer_name={printer_name}, store_name={store_name}")

        products = get_products_data()
        selected_products = [p for p in products if p.get('id') in product_ids]

        if not selected_products:
            app.logger.error("No valid products found for print request.")
            return {"status": "error", "message": "No valid products found"}, 400

        tspl_commands = generate_tspl(selected_products, copies, store_name, app.logger)

        send_raw_to_printer(printer_name, tspl_commands, app.logger)
        return {"status": "success", "message": f"Print job sent to printer {printer_name}"}
    except Exception as e:
        app.logger.error("Exception in print_label endpoint:\n" + traceback.format_exc())
        return {"status": "error", "message": f"Printing failed: {e}"}, 500
    
    
    
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"message": "Email and password are required"}), 400

    users = get_users_data()
    user = next((u for u in users if u['email'].lower() == email.lower()), None)

    if user:
        if user['password'] != password:
            return jsonify({"message": "Invalid email or password"}), 401
    else:
        return jsonify({"message": "Invalid email or password"}), 401

    user_without_password = {k: v for k, v in user.items() if k != 'password'}

    session_data = json.dumps({"user": user_without_password})
    
    # Return auth status and user role directly in the JSON response
    return jsonify({
        "auth_ok": True,
        "user_role": user_without_password.get('role'), # Assuming 'role' exists in user data
        "user": user_without_password,
        "message": "Login successful"
    })

@app.route('/api/auth/forgot-password-proxy', methods=['POST'])
def forgot_password_proxy():
    data = request.json
    email = data.get('email')

    if not email:
        return jsonify({"success": False, "message": "Email is required"}), 400

    # Validate email format
    email_regex = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    if not re.match(email_regex, email):
        return jsonify({"success": False, "message": "Please enter a valid email address"}), 400

    # Placeholder for MySQL logging
    app.logger.info(f"ACTION: PASSWORD_RESET_REQUEST - Logged password reset request for user: {email} (MySQL integration not yet implemented)")

    # Forward request to PHP endpoint
    php_endpoint = 'https://siri.ifleon.com/forgot-password.php'
    
    print('Forwarding admin password reset request to PHP endpoint:', php_endpoint)
    
    headers = {
        'Content-Type': 'application/json',
        'X-API-Key': os.environ.get('PHP_API_KEY', ''), # Get API key from environment variable
        'User-Agent': 'Flask-AdminApp/1.0',
        'X-Source': 'admin-panel',
    }
    
    try:
        # Using requests library for external HTTP requests
        import requests
        response_php = requests.post(php_endpoint, headers=headers, json={'email': email})
        response_php.raise_for_status() # Raise an exception for HTTP errors (4xx or 5xx)
        
        data_php = response_php.json()
        print('PHP response data:', data_php)
        
        return jsonify({
            "success": data_php.get('success', True),
            "message": data_php.get('message', 'If an account with that email exists, we have sent a password reset link.')
        }), 200

    except requests.exceptions.RequestException as e:
        print('Error calling PHP forgot password endpoint:', e)
        return jsonify(
            {"success": False, "message": "Unable to process your request at this time. Please try again later."}
        ), 500

@app.route('/api/bills', methods=['GET'])
def get_bills():
    bills = get_bills_data()
    return jsonify(bills)

@app.route('/api/bills', methods=['POST'])
def add_bill():
    new_bill = request.json
    bills = get_bills_data()
    products = get_products_data()

    # Save bill to JSON
    bills.append(new_bill)
    save_bills_data(bills)

    # Update stock in products.json
    for item in new_bill.get('items', []):
        product_id = item.get('productId')
        quantity = item.get('quantity')
        if product_id and quantity is not None:
            for product in products:
                if product['id'] == product_id:
                    product['stock'] -= quantity
                    print(f"ACTION: STOCK_UPDATE - Stock updated for product {product_id}: new stock {product['stock']}")
                    break
    save_products_data(products)

    # Log bill creation for sync
    log_and_apply_sync("Bills", "CREATE", new_bill['id'], new_bill, app.logger)
    return jsonify(new_bill), 201

@app.route('/api/bills/<string:bill_id>', methods=['DELETE'])
def delete_bill(bill_id):
    bills = get_bills_data()
    products = get_products_data()
    
    bill_to_delete = next((b for b in bills if b['id'] == bill_id), None)

    if not bill_to_delete:
        return jsonify({"message": "Bill not found"}), 404

    # Add stock back to products.json
    for item in bill_to_delete.get('items', []):
        product_id = item.get('productId')
        quantity = item.get('quantity')
        if product_id and quantity is not None:
            for product in products:
                if product['id'] == product_id:
                    product['stock'] += quantity # Add back the stock
                    print(f"ACTION: STOCK_RESTORE - Stock restored for product {product_id}: new stock {product['stock']}")
                    break
    save_products_data(products)

    # Remove bill from bills.json
    bills = [b for b in bills if b['id'] != bill_id]
    save_bills_data(bills)

    # Log bill deletion for sync
    log_and_apply_sync("Bills", "DELETE", bill_id, {}, app.logger)
    return jsonify({"message": "Bill deleted"}), 200

@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    unread_only = request.args.get('unreadOnly') == 'true'
    limit = int(request.args.get('limit', 50))

    notifications = get_notifications_data()

    filtered_notifications = [n for n in notifications if not unread_only or not n.get('isRead', False)]
    filtered_notifications = filtered_notifications[:limit]

    unread_count = sum(1 for n in notifications if not n.get('isRead', False))

    return jsonify({
        "success": True,
        "notifications": filtered_notifications,
        "unreadCount": unread_count,
        "total": len(notifications)
    })

@app.route('/api/notifications', methods=['PUT'])
def update_notifications():
    data = request.json
    action = data.get('action')

    if action == 'markAllRead':
        notifications = get_notifications_data()
        updated_notifications = []
        for n in notifications:
            n['isRead'] = True
            updated_notifications.append(n)
    save_notifications_data(updated_notifications)
    # Assuming a generic ID for marking all as read, or iterate through updated_notifications
    # For 'markAllRead', we'll log a generic update for notifications table.
    log_and_apply_sync("Notifications", "UPDATE", "all", {"action": "markAllRead"}, app.logger)
    return jsonify({
        "success": True,
        "message": "All notifications marked as read"
    })
    
    return jsonify({
        "success": False,
        "error": "Invalid action"
    }), 400

@app.route('/api/notifications', methods=['DELETE'])
def delete_old_notifications():
    older_than_days = int(request.args.get('olderThanDays', 30))

    notifications = get_notifications_data()
    cutoff_date = datetime.now() - timedelta(days=older_than_days)

    filtered_notifications = [
        n for n in notifications 
        if datetime.fromisoformat(n['createdAt']) > cutoff_date
    ]

    save_notifications_data(filtered_notifications)
    deleted_count = len(notifications) - len(filtered_notifications)
    # For 'delete_old_notifications', we'll log a generic delete for notifications table.
    log_and_apply_sync("Notifications", "DELETE", "old_notifications", {"olderThanDays": older_than_days, "deletedCount": deleted_count}, app.logger)
    return jsonify({
        "success": True,
        "message": f"Deleted {deleted_count} old notifications",
        "deletedCount": deleted_count
    })

@app.route('/api/notifications/<string:notification_id>', methods=['GET'])
def get_notification(notification_id):
    notifications = get_notifications_data()
    notification = next((n for n in notifications if n['id'] == notification_id), None)

    if not notification:
        return jsonify({
            "success": False,
            "error": "Notification not found"
        }), 404
    
    return jsonify({
        "success": True,
        "notification": notification
    })

@app.route('/api/notifications/<string:notification_id>', methods=['PUT'])
def mark_notification_read(notification_id):
    notifications = get_notifications_data()
    notification_found = False
    for i, n in enumerate(notifications):
        if n['id'] == notification_id:
            notifications[i]['isRead'] = True
            notification_found = True
            break
    
    if not notification_found:
        return jsonify({
            "success": False,
            "error": "Notification not found"
        }), 404
    
    save_notifications_data(notifications)
    log_and_apply_sync("Notifications", "UPDATE", notification_id, notifications[i], app.logger)
    return jsonify({
        "success": True,
        "message": "Notification marked as read",
        "notification": notifications[i]
    })

@app.route('/api/notifications/<string:notification_id>', methods=['DELETE'])
def delete_notification(notification_id):
    notifications = get_notifications_data()
    initial_len = len(notifications)
    notifications = [n for n in notifications if n['id'] != notification_id]

    if len(notifications) == initial_len:
        return jsonify({
            "success": False,
            "error": "Notification not found"
        }), 404
    
    save_notifications_data(notifications)
    log_and_apply_sync("Notifications", "DELETE", notification_id, {}, app.logger)
    return jsonify({
        "success": True,
        "message": "Notification deleted"
    })

@app.route('/api/settings', methods=['GET'])
def get_settings():
    settings = get_settings_data()
    return jsonify(settings)

@app.route('/api/settings', methods=['POST'])
def update_settings():
    new_settings = request.json
    save_settings_data(new_settings)
    # Assuming settings have a fixed ID, e.g., 1, or derive it from new_settings if applicable
    setting_id = new_settings.get('id', '1') 
    log_and_apply_sync("SystemSettings", "UPDATE", setting_id, new_settings, app.logger)
    return jsonify(new_settings), 200

@app.route('/api/stores', methods=['GET'])
def get_stores():
    stores = get_stores_data()
    return jsonify(stores)

@app.route('/api/stores', methods=['POST'])
def add_store():
    new_store_data = request.json
    stores = get_stores_data()

    new_store_data['id'] = f"STR-{int(datetime.now().timestamp() * 1000)}"
    new_store_data['createdAt'] = datetime.now().isoformat()

    stores.append(new_store_data)
    save_stores_data(stores)
    log_and_apply_sync("Stores", "CREATE", new_store_data['id'], new_store_data, app.logger)
    return jsonify(new_store_data), 201

@app.route('/api/users', methods=['GET'])
def get_users():
    users = get_users_data()
    return jsonify(users)

@app.route('/api/users', methods=['POST'])
def add_user():
    new_user_data = request.json
    users = get_users_data()

    if not new_user_data.get('name') or not new_user_data.get('email') or not new_user_data.get('password'):
        return jsonify({"message": "Missing required fields"}), 400
    
    if any(user.get('email') == new_user_data.get('email') for user in users):
        return jsonify({"message": "Email already exists"}), 409

    new_user_data['id'] = str(uuid.uuid4())
    new_user_data['createdAt'] = datetime.now().isoformat()
    new_user_data['updatedAt'] = datetime.now().isoformat()

    users.append(new_user_data)
    save_users_data(users)
    log_and_apply_sync("Users", "CREATE", new_user_data['id'], new_user_data, app.logger)
    return jsonify(new_user_data), 201

@app.route('/api/users/<string:user_id>', methods=['GET'])
def get_user(user_id):
    users = get_users_data()
    user = next((u for u in users if u['id'] == user_id), None)

    if not user:
        return jsonify({"message": "User not found"}), 404
    
    return jsonify(user)

@app.route('/api/users/<string:user_id>', methods=['PUT'])
def update_user(user_id):
    updated_data = request.json
    users = get_users_data()
    user_found = False
    for i, user in enumerate(users):
        if user['id'] == user_id:
            # Check for duplicate email (excluding current user)
            if any(u.get('email') == updated_data.get('email') and u['id'] != user_id for u in users):
                return jsonify({"message": "Email already exists"}), 409

            if updated_data.get('password'):
                users[i]['password'] = updated_data['password']
            
            users[i].update(updated_data)
            users[i]['updatedAt'] = datetime.now().isoformat()
            user_found = True
            break
    
    if not user_found:
        return jsonify({"message": "User not found"}), 404
    
    save_users_data(users)
    log_and_apply_sync("Users", "UPDATE", user_id, users[i], app.logger)
    return jsonify(users[i])

@app.route('/api/users/<string:user_id>', methods=['DELETE'])
def delete_user(user_id):
    users = get_users_data()
    initial_len = len(users)
    users = [user for user in users if user['id'] != user_id]

    if len(users) == initial_len:
        return jsonify({"message": "User not found"}), 404
    
    save_users_data(users)
    log_and_apply_sync("Users", "DELETE", user_id, {}, app.logger)
    return '', 204

@app.route('/api/stores/<string:store_id>', methods=['GET'])
def get_store(store_id):
    stores = get_stores_data()
    store = next((s for s in stores if s['id'] == store_id), None)

    if not store:
        return jsonify({"message": "Store not found"}), 404
    
    return jsonify(store)

@app.route('/api/stores/<string:store_id>', methods=['PUT'])
def update_store(store_id):
    updated_data = request.json
    stores = get_stores_data()
    store_found = False
    for i, store in enumerate(stores):
        if store['id'] == store_id:
            stores[i].update(updated_data)
            stores[i]['updatedAt'] = datetime.now().isoformat()
            store_found = True
            break
    
    if not store_found:
        return jsonify({"message": "Store not found"}), 404
    
    save_stores_data(stores)
    log_and_apply_sync("Stores", "UPDATE", store_id, stores[i], app.logger)
    return jsonify(stores[i])

@app.route('/api/stores/<string:store_id>', methods=['DELETE'])
def delete_store(store_id):
    stores = get_stores_data()
    initial_len = len(stores)
    stores = [s for s in stores if s['id'] != store_id]

    if len(stores) == initial_len:
        return jsonify({"message": "Store not found"}), 404
    
    save_stores_data(stores)
    log_and_apply_sync("Stores", "DELETE", store_id, {}, app.logger)
    return '', 204

def run_sync_process_in_background():
    """Starts the sync process in a background thread."""
    def sync_continuously():
        import asyncio
        asyncio.run(start_sync_process(app.logger))

    thread = threading.Thread(target=sync_continuously)
    thread.daemon = True # Allow main program to exit even if thread is running
    thread.start()

if __name__ == '__main__':
    backend_api_url = os.environ.get('NEXT_PUBLIC_BACKEND_API_URL', 'http://127.0.0.1:8000')
    parsed_url = urlparse(backend_api_url)
    port = parsed_url.port if parsed_url.port else 8000 # Default to 8000 if port not specified

    # The sync process is now handled directly by log_and_apply_sync in each CUD operation.
    # The sync_check.py script might still be useful for periodic checks or other sync mechanisms.
    # To prevent duplicate runs in debug mode with reloader, check WERKZEUG_RUN_MAIN.
    # The sync process should run only once. In debug mode with reloader, it should run in the main process.
    # In production (debug=False), it should always run.
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        run_sync_process_in_background()
    elif not app.debug: # For production, run without reloader check
        run_sync_process_in_background()

    # Disable reloader and debugger when running as a PyInstaller bundle
    if getattr(sys, 'frozen', False):
        app.run(debug=False, port=port, use_reloader=False)
    else:
        app.run(debug=True, port=port)
