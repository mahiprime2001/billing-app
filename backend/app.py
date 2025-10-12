# app.py (updated)

import os
import sys
import json
import uuid
import re
import threading
import time
from datetime import datetime, timedelta, timezone
import logging
import traceback
from flask import Flask, jsonify, request, make_response, redirect, url_for, g
from flask_cors import CORS
from dotenv import load_dotenv
from urllib.parse import urlparse
import requests

from utils.db import DatabaseConnection
from scripts.sync import log_and_apply_sync
from scripts.sync_check import start_sync_process, perform_full_sync
from utils.print_TSPL import generate_tspl, send_raw_to_printer

# Optional Windows printing support
try:
    import win32print
except Exception:
    win32print = None

# Determine the base directory for resource loading
if getattr(sys, 'frozen', False):
    # Running in a PyInstaller bundle
    PROJECT_ROOT = os.path.dirname(sys._MEIPASS)
else:
    # Running in a normal Python environment
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Add PROJECT_ROOT to sys.path for module imports
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# BASE_DIR should still point to the directory of app.py for file loading within the Flask app
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Load environment variables
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

app = Flask(__name__)

@app.before_request
def log_request_info():
    app.logger.info(f"Incoming Request: Method={request.method}, Path={request.path}, Origin={request.headers.get('Origin')}")

# Enable CORS for specific origins and methods
CORS(
    app,
    resources={r"/api/*": {"origins": "*"}},
    supports_credentials=True,
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

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

# Tauri HTTP base
TAURI_BASE = os.environ.get('TAURI_HTTP_BASE', 'http://127.0.0.1:5050')

def _safe_json_load(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError:
        return default

def _safe_json_dump(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def get_products_data():
    return _safe_json_load(PRODUCTS_FILE, [])

def save_products_data(products):
    _safe_json_dump(PRODUCTS_FILE, products)

def get_users_data():
    return _safe_json_load(USERS_FILE, [])

def save_users_data(users):
    _safe_json_dump(USERS_FILE, users)

def get_bills_data():
    return _safe_json_load(BILLS_FILE, [])

def save_bills_data(bills):
    _safe_json_dump(BILLS_FILE, bills)

def get_notifications_data():
    return _safe_json_load(NOTIFICATIONS_FILE, [])

def save_notifications_data(notifications):
    _safe_json_dump(NOTIFICATIONS_FILE, notifications)

def get_settings_data():
    return _safe_json_load(SETTINGS_FILE, {})

def save_settings_data(settings):
    _safe_json_dump(SETTINGS_FILE, settings)

def get_stores_data():
    return _safe_json_load(STORES_FILE, [])

def save_stores_data(stores):
    _safe_json_dump(STORES_FILE, stores)

def get_primary_barcode(product: dict) -> str:
    """
    Helper to expose a single primary barcode for UI (e.g., first barcode in list).
    """
    if isinstance(product.get('barcode'), str) and product['barcode'].strip():
        return product['barcode']
    barcodes = product.get('barcodes')
    if isinstance(barcodes, list) and len(barcodes) > 0:
        return str(barcodes[0])
    return ""

@app.route('/')
def home():
    return "Hello from Flask Backend!"

@app.errorhandler(404)
def not_found(error):
    app.logger.warning(f"404 Not Found: Path={request.path}, Method={request.method}, Origin={request.headers.get('Origin')}")
    return jsonify({"status": "error", "message": "Resource not found"}), 404

# ---------------------------
# Products - enriched GET/CRUD
# ---------------------------
@app.route('/api/products', methods=['GET'])
def get_products():
    products = get_products_data()
    enriched = []
    for p in products:
        q = dict(p)
        q['barcode'] = get_primary_barcode(p)
        enriched.append(q)
    return jsonify(enriched)

@app.route('/api/products', methods=['POST'])
def add_product():
    new_product = request.json or {}
    products = get_products_data()

    new_product['id'] = str(uuid.uuid4())
    new_product['createdAt'] = datetime.now().isoformat()
    new_product['updatedAt'] = datetime.now().isoformat()

    if 'barcode' in new_product and 'barcodes' not in new_product:
        if isinstance(new_product['barcode'], str) and new_product['barcode'].strip():
            new_product['barcodes'] = [new_product['barcode']]

    products.append(new_product)
    save_products_data(products)

    log_and_apply_sync("Products", "CREATE", new_product['id'], new_product, app.logger)
    return jsonify(new_product), 201

@app.route('/api/products/<string:product_id>', methods=['PUT'])
def update_product(product_id):
    updated_data = request.json or {}
    products = get_products_data()
    product_found = False
    idx = -1

    for i, product in enumerate(products):
        if product['id'] == product_id:
            if 'barcode' in updated_data and 'barcodes' not in updated_data:
                if isinstance(updated_data['barcode'], str) and updated_data['barcode'].strip():
                    updated_data['barcodes'] = [updated_data['barcode']]
            products[i].update(updated_data)
            products[i]['updatedAt'] = datetime.now().isoformat()
            product_found = True
            idx = i
            break

    if product_found:
        save_products_data(products)
        log_and_apply_sync("Products", "UPDATE", product_id, products[idx], app.logger)
        return jsonify(products[idx])
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

# ---------------------------
# Product Assignment Endpoints
# ---------------------------
@app.route('/api/stores/<string:store_id>/assign-products', methods=['POST'])
def assign_products_to_store(store_id):
    payload = request.get_json(force=True) or {}
    items = payload.get('products', [])
    deduct_stock = bool(payload.get('deductStock', False))

    if not isinstance(items, list) or len(items) == 0:
        return jsonify({"message": "No products provided"}), 400

    products = get_products_data()
    index_by_id = {p['id']: i for i, p in enumerate(products)}

    errors = []
    for it in items:
        pid = str(it.get('id', '')).strip()
        qty = int(it.get('assignedQuantity') or 0)

        if not pid or pid not in index_by_id:
            errors.append({"productId": pid, "message": "Invalid product id"})
            continue
        if qty <= 0:
            errors.append({"productId": pid, "message": "Quantity must be > 0"})
            continue

        p = products[index_by_id[pid]]
        available = int(p.get('stock') or 0)
        if qty > available:
            errors.append({
                "productId": pid,
                "message": f"Requested {qty} exceeds available stock {available}"
            })

    if errors:
        return jsonify({"message": "Validation failed", "errors": errors}), 400

    updated_ids = []
    for it in items:
        pid = str(it.get('id', '')).strip()
        qty = int(it.get('assignedQuantity') or 0)
        if not pid or pid not in index_by_id or qty <= 0:
            continue

        idx = index_by_id[pid]
        products[idx]['assignedStoreId'] = store_id
        if deduct_stock:
            curr = int(products[idx].get('stock') or 0)
            products[idx]['stock'] = max(0, curr - qty)
        products[idx]['updatedAt'] = datetime.now().isoformat()
        updated_ids.append(pid)

    save_products_data(products)

    for pid in updated_ids:
        idx = index_by_id[pid]
        log_and_apply_sync("Products", "UPDATE", pid, products[idx], app.logger)

    return jsonify({"message": "Products assigned successfully", "updated": updated_ids}), 200

@app.route('/api/stores/<string:store_id>/assigned-products', methods=['GET'])
def get_assigned_products_for_store(store_id):
    products = get_products_data()
    assigned = []
    for p in products:
        if str(p.get('assignedStoreId') or '').strip() == store_id:
            q = dict(p)
            q['barcode'] = get_primary_barcode(p)
            assigned.append(q)
    return jsonify(assigned), 200

# ---------------------------
# Printers (proxied to Tauri)
# ---------------------------
PRINTER_NAME = os.environ.get('PRINTER_NAME', 'SNBC TVSE LP46 Dlite BPLE')  # Default to example name

@app.route('/api/printers', methods=['GET'])
def get_printers():
    """
    Proxies to Tauri’s /api/printers; falls back to local win32print if Tauri is unavailable.
    """
    try:
        r = requests.get(f"{TAURI_BASE}/api/printers", timeout=5)
        return jsonify(r.json()), r.status_code
    except Exception as e:
        app.logger.warning(f"Tauri printers proxy failed: {e}")
        if win32print is None:
            return jsonify({"status": "error", "message": "Tauri unavailable and win32print not available"}), 502
        try:
            printers = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL, None, 1)
            printer_names = [name for flags, description, name, comment in printers]
            return jsonify({"status": "success", "printers": printer_names}), 200
        except Exception as ex:
            app.logger.error("Exception in get_printers fallback:\n" + traceback.format_exc())
            return jsonify({"status": "error", "message": f"Failed to retrieve printers: {ex}"}), 500

# ---------------------------
# Print (Flask builds TSPL, Tauri prints)
# ---------------------------
@app.route('/api/print-label', methods=['POST', 'OPTIONS'])
def api_print_label():
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type, Authorization")
        return response, 200

    try:
        data = request.get_json() or {}
        product_ids = data.get("productIds", [])
        copies = int(data.get("copies", 1))
        printer_name = data.get("printerName", PRINTER_NAME)
        store_name = data.get("storeName", "Company Name")

        app.logger.info(f"Received print request: product_ids={product_ids}, copies={copies}, printer_name={printer_name}, store_name={store_name}")

        products = get_products_data()
        selected_products = [p for p in products if p.get('id') in product_ids]

        if not selected_products:
            app.logger.error("No valid products found for print request.")
            return {"status": "error", "message": "No valid products found"}, 400

        # Build TSPL locally
        tspl_commands = generate_tspl(selected_products, copies, store_name, app.logger)

        # Attempt to delegate to Tauri HTTP API first
        tauri_payload = {
            "productIds": product_ids,
            "copies": copies,
            "printerName": printer_name,
            "storeName": store_name,
            "tsplCommands": tspl_commands,  # exact key required by Tauri
        }

        try:
            resp = requests.post(f"{TAURI_BASE}/api/print", json=tauri_payload, timeout=5)  # Reduced timeout for quicker fallback
            # Forward Tauri response transparently
            try:
                body = resp.json()
            except Exception:
                body = {"status": "error", "message": resp.text or "Invalid response from Tauri"}
            app.logger.info(f"Tauri print response: Status={resp.status_code}, Body={body}")
            return jsonify(body), resp.status_code
        except requests.exceptions.ConnectionError as ce:
            app.logger.warning(f"Tauri connection failed ({ce}), falling back to direct printing.")
            # Fallback to direct printing if Tauri is not running
            if win32print is None:
                app.logger.error("win32print is not available for direct printing.")
                return {"status": "error", "message": "Tauri is not running and direct printing is not available (win32print missing)."}, 500

            try:
                send_raw_to_printer(printer_name, tspl_commands, app.logger)
                app.logger.info(f"Direct print job sent to {printer_name} successfully.")
                return jsonify({"status": "success", "message": "Print job sent directly to printer."}), 200
            except Exception as direct_print_e:
                app.logger.error("Exception in direct print fallback:\n" + traceback.format_exc())
                return {"status": "error", "message": f"Direct printing failed: {direct_print_e}"}, 500
        except Exception as e:
            app.logger.error("Exception in print_label endpoint (Tauri delegation):\n" + traceback.format_exc())
            return {"status": "error", "message": f"Printing failed: {e}"}, 500
    except Exception as e:
        app.logger.error("Exception in print_label endpoint:\n" + traceback.format_exc())
        return {"status": "error", "message": f"Printing failed: {e}"}, 500

# ---------------------------
# Users
# ---------------------------
@app.route('/api/users', methods=['GET'])
def get_users():
    users = get_users_data()
    # Optionally, filter out sensitive information like passwords before sending to frontend
    users_safe = [{k: v for k, v in user.items() if k != 'password'} for user in users]
    return jsonify(users_safe)

@app.route('/api/users', methods=['POST'])
def add_user():
    new_user = request.json or {}
    users = get_users_data()

    new_user['id'] = str(uuid.uuid4())
    new_user['createdAt'] = datetime.now().isoformat()
    new_user['updatedAt'] = datetime.now().isoformat()

    users.append(new_user)
    save_users_data(users)

    log_and_apply_sync("Users", "CREATE", new_user['id'], new_user, app.logger)
    return jsonify(new_user), 201

@app.route('/api/users/<string:user_id>', methods=['PUT'])
def update_user(user_id):
    updated_data = request.json or {}
    users = get_users_data()
    user_found = False
    idx = -1

    for i, user in enumerate(users):
        if user['id'] == user_id:
            users[i].update(updated_data)
            users[i]['updatedAt'] = datetime.now().isoformat()
            user_found = True
            idx = i
            break

    if user_found:
        save_users_data(users)
        log_and_apply_sync("Users", "UPDATE", user_id, users[idx], app.logger)
        return jsonify(users[idx])
    return jsonify({"message": "User not found"}), 404

@app.route('/api/users/<string:user_id>', methods=['DELETE'])
def delete_user(user_id):
    users = get_users_data()
    initial_len = len(users)
    users = [user for user in users if user['id'] != user_id]

    if len(users) < initial_len:
        save_users_data(users)
        log_and_apply_sync("Users", "DELETE", user_id, {}, app.logger)
        return jsonify({"message": "User deleted"}), 200
    return jsonify({"message": "User not found"}), 404

# ---------------------------
# Auth
# ---------------------------
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
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

    return jsonify({
        "auth_ok": True,
        "user_role": user_without_password.get('role'),
        "user": user_without_password,
        "message": "Login successful"
    })

@app.route('/api/auth/forgot-password-proxy', methods=['POST'])
def forgot_password_proxy():
    data = request.json or {}
    email = data.get('email')

    if not email:
        return jsonify({"success": False, "message": "Email is required"}), 400

    email_regex = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    if not re.match(email_regex, email):
        return jsonify({"success": False, "message": "Please enter a valid email address"}), 400

    app.logger.info(f"ACTION: PASSWORD_RESET_REQUEST - Logged password reset request for user: {email} (MySQL integration not yet implemented)")

    php_endpoint = 'https://siri.ifleon.com/forgot-password.php'
    app.logger.info('Forwarding admin password reset request to PHP endpoint: %s', php_endpoint)

    headers = {
        'Content-Type': 'application/json',
        'X-API-Key': os.environ.get('PHP_API_KEY', ''),
        'User-Agent': 'Flask-AdminApp/1.0',
        'X-Source': 'admin-panel',
    }

    try:
        response_php = requests.post(php_endpoint, headers=headers, json={'email': email})
        response_php.raise_for_status()
        data_php = response_php.json()
        return jsonify({
            "success": data_php.get('success', True),
            "message": data_php.get('message', 'If an account with that email exists, we have sent a password reset link.')
        }), 200
    except requests.exceptions.RequestException as e:
        app.logger.error('Error calling PHP forgot password endpoint: %s', e)
        return jsonify({"success": False, "message": "Unable to process your request at this time. Please try again later."}), 500

# ---------------------------
# Bills
# ---------------------------
@app.route('/api/bills', methods=['GET'])
def get_bills():
    bills = get_bills_data()
    return jsonify(bills)

@app.route('/api/bills', methods=['POST'])
def add_bill():
    new_bill = request.json or {}
    bills = get_bills_data()
    products = get_products_data()

    bills.append(new_bill)
    save_bills_data(bills)

    for item in new_bill.get('items', []):
        product_id = item.get('productId')
        quantity = item.get('quantity')
        if product_id and quantity is not None:
            for product in products:
                if product['id'] == product_id:
                    product['stock'] = int(product.get('stock') or 0) - int(quantity or 0)
                    product['updatedAt'] = datetime.now().isoformat()
                    app.logger.info(f"ACTION: STOCK_UPDATE - Stock updated for product {product_id}: new stock {product['stock']}")
                    break
    save_products_data(products)

    log_and_apply_sync("Bills", "CREATE", new_bill.get('id', str(uuid.uuid4())), new_bill, app.logger)
    return jsonify(new_bill), 201

@app.route('/api/bills/<string:bill_id>', methods=['DELETE'])
def delete_bill(bill_id):
    bills = get_bills_data()
    products = get_products_data()

    bill_to_delete = next((b for b in bills if b['id'] == bill_id), None)

    if not bill_to_delete:
        return jsonify({"message": "Bill not found"}), 404

    for item in bill_to_delete.get('items', []):
        product_id = item.get('productId')
        quantity = item.get('quantity')
        if product_id and quantity is not None:
            for product in products:
                if product['id'] == product_id:
                    product['stock'] = int(product.get('stock') or 0) + int(quantity or 0)
                    product['updatedAt'] = datetime.now().isoformat()
                    app.logger.info(f"ACTION: STOCK_RESTORE - Stock restored for product {product_id}: new stock {product['stock']}")
                    break
    save_products_data(products)

    bills = [b for b in bills if b['id'] != bill_id]
    save_bills_data(bills)

    log_and_apply_sync("Bills", "DELETE", bill_id, {}, app.logger)
    return jsonify({"message": "Bill deleted"}), 200

# ---------------------------
# Notifications
# ---------------------------
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
    data = request.json or {}
    action = data.get('action')

    if action == 'markAllRead':
        notifications = get_notifications_data()
        for n in notifications:
            n['isRead'] = True
        save_notifications_data(notifications)
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
    idx = -1
    for i, n in enumerate(notifications):
        if n['id'] == notification_id:
            notifications[i]['isRead'] = True
            notification_found = True
            idx = i
            break

    if not notification_found:
        return jsonify({
            "success": False,
            "error": "Notification not found"
        }), 404

    save_notifications_data(notifications)
    log_and_apply_sync("Notifications", "UPDATE", notification_id, notifications[idx], app.logger)
    return jsonify({
        "success": True,
        "message": "Notification marked as read",
        "notification": notifications[idx]
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

# ---------------------------
# Settings
# ---------------------------
@app.route('/api/settings', methods=['GET'])
def get_settings():
    all_settings = get_settings_data()
    
    # Ensure the response matches the frontend's expected structure
    response_data = {
        "systemSettings": all_settings.get("systemSettings", {
            "gstin": "",
            "taxPercentage": 0,
            "companyName": "",
            "companyAddress": "",
            "companyPhone": "",
            "companyEmail": "",
        }),
        "billFormats": all_settings.get("billFormats", {
            "A4": {"width": 210, "height": 297, "margins": {"top": 10, "bottom": 10, "left": 10, "right": 10}, "unit": "mm"},
            "A5": {"width": 148, "height": 210, "margins": {"top": 10, "bottom": 10, "left": 10, "right": 10}, "unit": "mm"},
            "Thermal_58mm": {"width": 58, "height": "auto", "margins": {"top": 5, "bottom": 5, "left": 5, "right": 5}, "unit": "mm"},
            "Thermal_80mm": {"width": 80, "height": "auto", "margins": {"top": 5, "bottom": 5, "left": 5, "right": 5}, "unit": "mm"},
            "Custom": {"width": 80, "height": "auto", "margins": {"top": 5, "bottom": 5, "left": 5, "right": 5}, "unit": "mm"},
        }),
        "storeFormats": all_settings.get("storeFormats", {}),
    }
    return jsonify(response_data)

@app.route('/api/settings', methods=['POST'])
def update_settings():
    data = request.json or {}
    
    # Load existing settings to merge with new data
    existing_settings = get_settings_data()
    
    # Update specific sections
    if "systemSettings" in data:
        existing_settings["systemSettings"] = data["systemSettings"]
    if "billFormats" in data:
        existing_settings["billFormats"] = data["billFormats"]
    if "storeFormats" in data:
        existing_settings["storeFormats"] = data["storeFormats"]
        
    save_settings_data(existing_settings)
    
    # For logging, use a generic ID or derive from systemSettings if available
    setting_id = existing_settings.get('systemSettings', {}).get('id', '1')
    log_and_apply_sync("SystemSettings", "UPDATE", setting_id, existing_settings, app.logger)
    return jsonify(existing_settings), 200

# ---------------------------
# Stores
# ---------------------------
@app.route('/api/stores', methods=['GET'])
def get_stores():
    stores = get_stores_data()
    return jsonify(stores)

@app.route('/api/stores', methods=['POST'])
def add_store():
    new_store_data = request.json or {}
    stores = get_stores_data()

    new_store_data['id'] = f"STR-{int(datetime.now().timestamp() * 1000)}"
    new_store_data['createdAt'] = datetime.now().isoformat()

    stores.append(new_store_data)
    save_stores_data(stores)
    log_and_apply_sync("Stores", "CREATE", new_store_data['id'], new_store_data, app.logger)
    return jsonify(new_store_data), 201

@app.route('/api/stores/<string:store_id>', methods=['GET'])
def get_store(store_id):
    stores = get_stores_data()
    store = next((s for s in stores if s['id'] == store_id), None)

    if not store:
        return jsonify({"message": "Store not found"}), 404

    return jsonify(store)

@app.route('/api/stores/<string:store_id>', methods=['PUT'])
def update_store(store_id):
    updated_data = request.json or {}
    stores = get_stores_data()
    store_found = False
    idx = -1

    for i, store in enumerate(stores):
        if store['id'] == store_id:
            stores[i].update(updated_data)
            stores[i]['updatedAt'] = datetime.now().isoformat()
            store_found = True
            idx = i
            break

    if not store_found:
        return jsonify({"message": "Store not found"}), 404

    save_stores_data(stores)
    log_and_apply_sync("Stores", "UPDATE", store_id, stores[idx], app.logger)
    return jsonify(stores[idx])

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

# ---------------------------
# Manual Sync Endpoint (waits for completion)
# ---------------------------
@app.route('/api/sync-data', methods=['POST'])
def manual_sync_data():
    app.logger.info("Manual sync request received.")
    try:
        import asyncio
        # perform_full_sync is async; run it to completion in this sync view
        asyncio.run(perform_full_sync(app.logger))
        return jsonify({
            "status": "success",
            "message": "All data pulled from MySQL into local JSON files successfully."
        }), 200
    except Exception as e:
        app.logger.error(f"Error during manual sync: {e}")
        return jsonify({
            "status": "error",
            "message": "Failed to pull data from MySQL into JSON files."
        }), 500
# ---------------------------
# Background sync process
# ---------------------------
def run_sync_process_in_background():
    """Starts the sync process in a background thread."""
    def sync_continuously():
        import asyncio
        asyncio.run(start_sync_process(app.logger))

    thread = threading.Thread(target=sync_continuously)
    thread.daemon = True  # Allow main program to exit even if thread is running
    thread.start()

if __name__ == '__main__':
    backend_api_url = os.environ.get('NEXT_PUBLIC_BACKEND_API_URL', 'http://127.0.0.1:8080')  # Changed default port to 8080
    parsed_url = urlparse(backend_api_url)
    port = parsed_url.port if parsed_url.port else 8080  # Default to 8080 if port not specified

    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        run_sync_process_in_background()
    elif not app.debug:  # For production, run without reloader check
        run_sync_process_in_background()

    if getattr(sys, 'frozen', False):
        app.run(debug=False, port=port, use_reloader=False)
    else:
        app.run(debug=True, port=port)
