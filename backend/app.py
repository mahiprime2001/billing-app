# app.py - Updated with Enhanced Sync Integration
# This replaces your existing app.py with enhanced sync functionality

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
from utils import sync_utils  # Keep existing sync_utils for compatibility
from scripts.sync import apply_change_to_db  # Keep apply_change_to_db for direct DB operations
from scripts.export_data import export_formatted_data # NEW: Import export function
from utils.print_TSPL import generate_tspl, send_raw_to_printer
from collections import defaultdict

# NEW: Import enhanced sync manager
try:
    from scripts.sync_manager import get_sync_manager, log_json_crud_operation
    ENHANCED_SYNC_AVAILABLE = True
except ImportError:
    ENHANCED_SYNC_AVAILABLE = False
    print("Enhanced sync manager not available, falling back to legacy sync")

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
os.environ['APP_BASE_DIR'] = os.getcwd()

# NEW: Initialize enhanced sync manager if available
if ENHANCED_SYNC_AVAILABLE:
    sync_manager = get_sync_manager(os.environ['APP_BASE_DIR'])
else:
    sync_manager = None

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

# --- NEW DATA PATHS ---
DATA_BASE_DIR = os.path.join(os.getcwd(), 'data')
JSON_DIR = os.path.join(DATA_BASE_DIR, 'json')
LOGS_DIR = os.path.join(DATA_BASE_DIR, 'logs')

# Ensure data directories exist
os.makedirs(JSON_DIR, exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)

PRODUCTS_FILE = os.path.join(JSON_DIR, 'products.json')
USERS_FILE = os.path.join(JSON_DIR, 'users.json')
BILLS_FILE = os.path.join(JSON_DIR, 'bills.json')
NOTIFICATIONS_FILE = os.path.join(JSON_DIR, 'notifications.json')
SETTINGS_FILE = os.path.join(JSON_DIR, 'settings.json')
STORES_FILE = os.path.join(JSON_DIR, 'stores.json')
SESSIONS_FILE = os.path.join(JSON_DIR, 'user_sessions.json')

# Configure logging for the Flask app
LOG_DIR = LOGS_DIR # Use the new LOGS_DIR
LOG_FILE = os.path.join(LOG_DIR, 'app.log')
file_handler = logging.FileHandler(LOG_FILE)
file_handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s')
file_handler.setFormatter(formatter)
app.logger.addHandler(file_handler)
app.logger.setLevel(logging.DEBUG)

# Redirect stdout and stderr to the log file
class DualLogger:
    def __init__(self, filename, encoding='utf-8'):
        self.terminal = sys.stdout
        self.log = open(filename, 'a', encoding=encoding)

    def write(self, message):
        self.terminal.write(message)
        self.log.write(message)
        self.log.flush() # Ensure immediate write to file

    def flush(self):
        self.terminal.flush()
        self.log.flush()

sys.stdout = DualLogger(LOG_FILE)
sys.stderr = DualLogger(LOG_FILE)

# Verify base directories
app.logger.info(f"APP_BASE_DIR: {os.environ.get('APP_BASE_DIR', 'Not Set')}")
app.logger.info(f"JSON_DIR: {JSON_DIR}")
app.logger.info(f"LOGS_DIR: {LOGS_DIR}")

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

def _get_user_sessions():
    return _safe_json_load(SESSIONS_FILE, [])

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

# NEW: Enhanced logging function
def log_crud_operation(json_type: str, operation: str, record_id: str, data: dict):
    """Enhanced CRUD logging that uses either new or legacy sync system"""
    if ENHANCED_SYNC_AVAILABLE and sync_manager:
        # Use enhanced sync system
        log_json_crud_operation(json_type, operation, record_id, data)
    else:
        # Fall back to legacy sync system
        table_mapping = {
            'products': 'Products',
            'users': 'Users',
            'bills': 'Bills',
            'customers': 'Customers',
            'stores': 'Stores',
            'notifications': 'Notifications',
            'settings': 'SystemSettings'
        }
        table_name = table_mapping.get(json_type, json_type.title())
        sync_utils.add_to_sync_table(table_name, operation, record_id, data)

# Helper functions for new inventory endpoints
def _to_date_only(dt_str):
    """Convert datetime string to date-only string (YYYY-MM-DD)"""
    try:
        return datetime.fromisoformat(dt_str).date().isoformat()
    except Exception:
        return None

def _price_of(p):
    """Extract price from product as float"""
    try:
        return float(p.get('price') or 0)
    except Exception:
        return 0.0

def _stock_of(p):
    """Extract stock from product as int"""
    try:
        return int(p.get('stock') or 0)
    except Exception:
        return 0

@app.route('/')
def home():
    return "Hello from Flask Backend!"

@app.errorhandler(404)
def not_found(error):
    app.logger.warning(f"404 Not Found: Path={request.path}, Method={request.method}, Origin={request.headers.get('Origin')}")
    return jsonify({"status": "error", "message": "Resource not found"}), 404

# ---------------------------
# Products - ENHANCED WITH SYNC LOGGING
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
    
    # ENHANCED: Log CRUD operation to sync system
    log_crud_operation('products', 'CREATE', new_product['id'], new_product)
    
    return jsonify(new_product), 201

@app.route('/api/products/<product_id>', methods=['PUT'])
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
        
        # ENHANCED: Log CRUD operation to sync system
        log_crud_operation('products', 'UPDATE', product_id, products[idx])
        
        return jsonify(products[idx])
    
    return jsonify({"message": "Product not found"}), 404

@app.route('/api/products/<product_id>', methods=['DELETE'])
def delete_product(product_id):
    products = get_products_data()
    initial_len = len(products)
    
    # Find product before deletion to get its data
    deleted_product = None
    for product in products:
        if product['id'] == product_id:
            deleted_product = product
            break
    
    products = [product for product in products if product['id'] != product_id]
    
    if len(products) < initial_len:
        save_products_data(products)
        
        # ENHANCED: Log CRUD operation to sync system
        log_crud_operation('products', 'DELETE', product_id, deleted_product or {})
        
        return jsonify({"message": "Product deleted"}), 200
    
    return jsonify({"message": "Product not found"}), 404

# ---------------------------
# Product Assignment Endpoints
# ---------------------------

@app.route('/api/stores/<store_id>/assign-products', methods=['POST'])
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
        products[idx]['assignedAt'] = datetime.now().isoformat()  # NEW: Add assigned timestamp
        
        if deduct_stock:
            curr = int(products[idx].get('stock') or 0)
            products[idx]['stock'] = max(0, curr - qty)
        
        products[idx]['updatedAt'] = datetime.now().isoformat()
        updated_ids.append(pid)
    
    save_products_data(products)
    
    # ENHANCED: Log updates for assigned products
    for pid in updated_ids:
        idx = index_by_id[pid]
        log_crud_operation('products', 'UPDATE', pid, products[idx])
    
    return jsonify({"message": "Products assigned successfully", "updated": updated_ids}), 200

@app.route('/api/stores/<store_id>/assigned-products', methods=['GET'])
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
# NEW: Store Inventory Calendar and Detail Endpoints
# ---------------------------

@app.route('/api/stores/<store_id>/inventory-calendar', methods=['GET'])
def store_inventory_calendar(store_id):
    """Get inventory data grouped by date for the past N days"""
    days = int(request.args.get('days', 60))
    products = get_products_data()
    today = datetime.now().date()
    cutoff = today - timedelta(days=days)
    buckets = defaultdict(lambda: {"date": "", "count": 0, "totalStock": 0, "totalValue": 0.0})

    for p in products:
        if str(p.get('assignedStoreId') or '') != store_id:
            continue
        
        # Use assignedAt, falling back to updatedAt or createdAt
        d = _to_date_only(p.get('assignedAt') or p.get('updatedAt') or p.get('createdAt') or "")
        if not d:
            continue
        
        if datetime.fromisoformat(d).date() < cutoff:
            continue
        
        b = buckets[d]
        b["date"] = d
        b["count"] += 1
        stk = _stock_of(p)
        price = _price_of(p)
        b["totalStock"] += stk
        b["totalValue"] += stk * price

    # Sort newest first
    data = sorted(buckets.values(), key=lambda x: x["date"], reverse=True)
    return jsonify({"days": days, "data": data}), 200

@app.route('/api/stores/<store_id>/inventory-by-date/<date_str>', methods=['GET'])
def store_inventory_by_date(store_id, date_str):
    """Get detailed inventory for a specific date"""
    products = get_products_data()
    rows = []
    
    for p in products:
        if str(p.get('assignedStoreId') or '') != store_id:
            continue
        
        # Use assignedAt, falling back to updatedAt or createdAt
        d = _to_date_only(p.get('assignedAt') or p.get('updatedAt') or p.get('createdAt') or "")
        if d != date_str:
            continue
        
        price = _price_of(p)
        stk = _stock_of(p)
        
        rows.append({
            "id": p.get("id"),
            "barcode": get_primary_barcode(p),
            "name": p.get("name") or p.get("productName") or "",
            "price": price,
            "stock": stk,
            "rowValue": round(price * stk, 2),
        })

    total_stock = sum(r["stock"] for r in rows)
    total_value = round(sum(r["rowValue"] for r in rows), 2)
    
    return jsonify({
        "date": date_str, 
        "rows": rows, 
        "totalStock": total_stock, 
        "totalValue": total_value
    }), 200

# ---------------------------
# Printers (proxied to Tauri)
# ---------------------------

PRINTER_NAME = os.environ.get('PRINTER_NAME', 'SNBC TVSE LP46 Dlite BPLE')

@app.route('/api/printers', methods=['GET'])
def get_printers():
    """
    Proxies to Tauri's /api/printers; falls back to local win32print if Tauri is unavailable.
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
            "tsplCommands": tspl_commands,
        }
        
        try:
            resp = requests.post(f"{TAURI_BASE}/api/print", json=tauri_payload, timeout=5)
            
            try:
                body = resp.json()
            except Exception:
                body = {"status": "error", "message": resp.text or "Invalid response from Tauri"}
            
            app.logger.info(f"Tauri print response: Status={resp.status_code}, Body={body}")
            return jsonify(body), resp.status_code
            
        except requests.exceptions.ConnectionError as ce:
            app.logger.warning(f"Tauri connection failed ({ce}), falling back to direct printing.")
            
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
# Users - ENHANCED WITH SYNC LOGGING
# ---------------------------

@app.route('/api/users', methods=['GET'])
def get_users():
    users = get_users_data()
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
    
    # ENHANCED: Log CRUD operation to sync system
    log_crud_operation('users', 'CREATE', new_user['id'], new_user)
    
    return jsonify(new_user), 201

@app.route('/api/users/<user_id>', methods=['PUT'])
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
        
        # ENHANCED: Log CRUD operation to sync system
        log_crud_operation('users', 'UPDATE', user_id, users[idx])
        
        return jsonify(users[idx])
    
    return jsonify({"message": "User not found"}), 404

@app.route('/api/users/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    users = get_users_data()
    initial_len = len(users)
    
    # Find user before deletion
    deleted_user = None
    for user in users:
        if user['id'] == user_id:
            deleted_user = user
            break
    
    users = [user for user in users if user['id'] != user_id]
    
    if len(users) < initial_len:
        save_users_data(users)
        
        # ENHANCED: Log CRUD operation to sync system
        log_crud_operation('users', 'DELETE', user_id, deleted_user or {})
        
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
# Bills - ENHANCED WITH SYNC LOGGING
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
    
    # Ensure bill has an ID
    if 'id' not in new_bill:
        new_bill['id'] = str(uuid.uuid4())
    
    bills.append(new_bill)
    save_bills_data(bills)
    
    # Handle stock updates
    updated_products = []
    for item in new_bill.get('items', []):
        product_id = item.get('productId')
        quantity = item.get('quantity')
        
        if product_id and quantity is not None:
            for product in products:
                if product['id'] == product_id:
                    product['stock'] = int(product.get('stock') or 0) - int(quantity or 0)
                    product['updatedAt'] = datetime.now().isoformat()
                    updated_products.append(product)
                    app.logger.info(f"ACTION: STOCK_UPDATE - Stock updated for product {product_id}: new stock {product['stock']}")
                    break
    
    save_products_data(products)
    
    # ENHANCED: Log product stock updates
    for product in updated_products:
        log_crud_operation('products', 'UPDATE', product['id'], product)
    
    # ENHANCED: Log CRUD operation to sync system
    log_crud_operation('bills', 'CREATE', new_bill['id'], new_bill)
    
    return jsonify(new_bill), 201

@app.route('/api/bills/<bill_id>', methods=['DELETE'])
def delete_bill(bill_id):
    bills = get_bills_data()
    products = get_products_data()
    
    bill_to_delete = next((b for b in bills if b['id'] == bill_id), None)
    if not bill_to_delete:
        return jsonify({"message": "Bill not found"}), 404
    
    # Restore stock
    updated_products = []
    for item in bill_to_delete.get('items', []):
        product_id = item.get('productId')
        quantity = item.get('quantity')
        
        if product_id and quantity is not None:
            for product in products:
                if product['id'] == product_id:
                    product['stock'] = int(product.get('stock') or 0) + int(quantity or 0)
                    product['updatedAt'] = datetime.now().isoformat()
                    updated_products.append(product)
                    app.logger.info(f"ACTION: STOCK_RESTORE - Stock restored for product {product_id}: new stock {product['stock']}")
                    break
    
    save_products_data(products)
    
    # ENHANCED: Log product stock updates
    for product in updated_products:
        log_crud_operation('products', 'UPDATE', product['id'], product)
    
    bills = [b for b in bills if b['id'] != bill_id]
    save_bills_data(bills)
    
    # ENHANCED: Log CRUD operation to sync system
    log_crud_operation('bills', 'DELETE', bill_id, bill_to_delete)
    
    return jsonify({"message": "Bill deleted"}), 200

# ---------------------------
# Notifications - ENHANCED WITH SYNC LOGGING
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
        
        # ENHANCED: Log CRUD operation to sync system
        log_crud_operation('notifications', 'UPDATE', 'all', {"action": "markAllRead"})
        
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
    
    # ENHANCED: Log CRUD operation to sync system
    log_crud_operation('notifications', 'DELETE', 'old_notifications', {
        "olderThanDays": older_than_days, 
        "deletedCount": deleted_count
    })
    
    return jsonify({
        "success": True,
        "message": f"Deleted {deleted_count} old notifications",
        "deletedCount": deleted_count
    })

@app.route('/api/notifications/<notification_id>', methods=['GET'])
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

@app.route('/api/notifications/<notification_id>', methods=['PUT'])
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
    
    # ENHANCED: Log CRUD operation to sync system
    log_crud_operation('notifications', 'UPDATE', notification_id, notifications[idx])
    
    return jsonify({
        "success": True,
        "message": "Notification marked as read",
        "notification": notifications[idx]
    })

@app.route('/api/notifications/<notification_id>', methods=['DELETE'])
def delete_notification(notification_id):
    notifications = get_notifications_data()
    initial_len = len(notifications)
    
    # Find notification before deletion
    deleted_notification = None
    for notification in notifications:
        if notification['id'] == notification_id:
            deleted_notification = notification
            break
    
    notifications = [n for n in notifications if n['id'] != notification_id]
    
    if len(notifications) == initial_len:
        return jsonify({
            "success": False,
            "error": "Notification not found"
        }), 404
    
    save_notifications_data(notifications)
    
    # ENHANCED: Log CRUD operation to sync system
    log_crud_operation('notifications', 'DELETE', notification_id, deleted_notification or {})
    
    return jsonify({
        "success": True,
        "message": "Notification deleted"
    })

# ---------------------------
# Settings - ENHANCED WITH SYNC LOGGING
# ---------------------------

@app.route('/api/settings', methods=['GET'])
def get_settings():
    all_settings = get_settings_data()
    
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
    existing_settings = get_settings_data()
    
    if "systemSettings" in data:
        existing_settings["systemSettings"] = data["systemSettings"]
    if "billFormats" in data:
        existing_settings["billFormats"] = data["billFormats"]
    if "storeFormats" in data:
        existing_settings["storeFormats"] = data["storeFormats"]
    
    save_settings_data(existing_settings)
    
    setting_id = existing_settings.get('systemSettings', {}).get('id', '1')
    
    # ENHANCED: Log CRUD operation to sync system
    log_crud_operation('settings', 'UPDATE', setting_id, existing_settings)
    
    return jsonify(existing_settings), 200

# ---------------------------
# Stores - ENHANCED WITH SYNC LOGGING
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
    
    # ENHANCED: Log CRUD operation to sync system
    log_crud_operation('stores', 'CREATE', new_store_data['id'], new_store_data)
    
    return jsonify(new_store_data), 201

@app.route('/api/stores/<store_id>', methods=['GET'])
def get_store(store_id):
    stores = get_stores_data()
    store = next((s for s in stores if s['id'] == store_id), None)
    if not store:
        return jsonify({"message": "Store not found"}), 404
    return jsonify(store)

@app.route('/api/stores/<store_id>', methods=['PUT'])
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
    
    # ENHANCED: Log CRUD operation to sync system
    log_crud_operation('stores', 'UPDATE', store_id, stores[idx])
    
    return jsonify(stores[idx])

@app.route('/api/stores/<store_id>', methods=['DELETE'])
def delete_store(store_id):
    stores = get_stores_data()
    initial_len = len(stores)
    
    # Find store before deletion
    deleted_store = None
    for store in stores:
        if store['id'] == store_id:
            deleted_store = store
            break
    
    stores = [s for s in stores if s['id'] != store_id]
    
    if len(stores) == initial_len:
        return jsonify({"message": "Store not found"}), 404
    
    save_stores_data(stores)
    
    # ENHANCED: Log CRUD operation to sync system
    log_crud_operation('stores', 'DELETE', store_id, deleted_store or {})
    
    return '', 204

# ---------------------------
# ENHANCED Sync Endpoints
# ---------------------------

@app.route('/api/sync/status', methods=['GET'])
def get_sync_status():
    """Get current sync status"""
    try:
        if ENHANCED_SYNC_AVAILABLE and sync_manager:
            status = sync_manager.get_sync_status()
            return jsonify(status), 200
        else:
            # Legacy sync status
            return jsonify({
                "is_running": False,
                "last_sync": sync_utils.get_last_sync_timestamp(),
                "pending_logs": 0,
                "failed_logs": 0,
                "completed_logs": 0,
                "total_logs": 0,
                "sync_type": "legacy"
            }), 200
    except Exception as e:
        app.logger.error(f"Error getting sync status: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/sync/push', methods=['POST'])
def trigger_push_sync():
    """Manually trigger push sync"""
    try:
        if ENHANCED_SYNC_AVAILABLE and sync_manager:
            result = sync_manager.process_pending_logs()
            return jsonify(result), 200
        else:
            # Legacy push sync
            result = sync_utils.process_push_sync(app.logger)
            return jsonify(result), 200
    except Exception as e:
        app.logger.error(f"Error in push sync: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/sync/pull', methods=['POST'])
def trigger_pull_sync():
    """Manually trigger pull sync"""
    try:
        if ENHANCED_SYNC_AVAILABLE and sync_manager:
            result = sync_manager.pull_from_mysql_sync_table()
            return jsonify(result), 200
        else:
            # Legacy pull sync
            last_sync_timestamp = sync_utils.get_last_sync_timestamp()
            if not last_sync_timestamp:
                last_sync_timestamp = (datetime.now() - timedelta(days=1)).isoformat()
            result = sync_utils.get_pull_sync_data(last_sync_timestamp, app.logger)
            return jsonify(result), 200
    except Exception as e:
        app.logger.error(f"Error in pull sync: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/sync/retry', methods=['POST'])
def retry_failed_sync():
    """Retry failed sync logs"""
    try:
        if ENHANCED_SYNC_AVAILABLE and sync_manager:
            result = sync_manager.retry_failed_logs()
            return jsonify(result), 200
        else:
            # Legacy doesn't have retry mechanism
            return jsonify({"status": "success", "message": "Retry not available in legacy sync", "retried": 0}), 200
    except Exception as e:
        app.logger.error(f"Error retrying sync: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/sync/cleanup', methods=['POST'])
def cleanup_old_logs():
    """Clean up old sync logs"""
    try:
        if ENHANCED_SYNC_AVAILABLE and sync_manager:
            result = sync_manager.cleanup_old_logs()
            return jsonify(result), 200
        else:
            # Legacy cleanup (basic implementation)
            return jsonify({"status": "success", "message": "Cleanup not available in legacy sync"}), 200
    except Exception as e:
        app.logger.error(f"Error cleaning up logs: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# ---------------------------
# Analytics Endpoints
# ---------------------------

@app.route('/api/analytics/users/online', methods=['GET'])
def analytics_users_online():
    # windowMinutes=5 by default
    try:
        window_minutes = int(request.args.get('windowMinutes', 5))
    except Exception:
        window_minutes = 5
    cutoff = datetime.now() - timedelta(minutes=window_minutes)

    rows = _get_user_sessions()
    last_by_user = {}
    for r in rows:
        try:
            ts = datetime.fromisoformat(r.get('timestamp', ''))
        except Exception:
            continue
        uid = r.get('userId')
        if not uid:
            continue
        if uid not in last_by_user or ts > last_by_user[uid]['ts']:
            last_by_user[uid] = {'ts': ts, 'type': (r.get('type') or '').upper(), 'details': r.get('details')}
    online = []
    for uid, info in last_by_user.items():
        if info['ts'] >= cutoff and info['type'] == 'LOGIN':
            online.append({'userId': uid, 'lastEvent': info['type'], 'lastSeen': info['ts'].isoformat(), 'details': info['details']})

    return jsonify({
        'windowMinutes': window_minutes,
        'onlineCount': len(online),
        'online': online
    }), 200

@app.route('/api/analytics/users/sessions', methods=['GET'])
def analytics_users_sessions():
    # Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
    q_from = request.args.get('from')
    q_to = request.args.get('to')
    start = datetime.fromisoformat(q_from) if q_from else datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    end = datetime.fromisoformat(q_to) + timedelta(days=1) if q_to else datetime.now()

    rows = _get_user_sessions()
    # Group by user sorted by timestamp
    by_user = {}
    for r in rows:
        try:
            ts = datetime.fromisoformat(r.get('timestamp', ''))
        except Exception:
            continue
        if ts < start or ts > end:
            continue
        uid = r.get('userId')
        if not uid:
            continue
        by_user.setdefault(uid, []).append({'ts': ts, 'type': (r.get('type') or '').upper()})

    # Pair LOGINS with next LOGOUT/CLOSE_NO_LOGOUT
    sessions = []
    for uid, events in by_user.items():
        events.sort(key=lambda x: x['ts'])
        open_login = None
        for ev in events:
            if ev['type'] == 'LOGIN':
                open_login = ev['ts']
            elif ev['type'] in {'LOGOUT', 'CLOSE_NO_LOGOUT'} and open_login:
                dur = (ev['ts'] - open_login).total_seconds()
                sessions.append({'userId': uid, 'loginAt': open_login.isoformat(), 'logoutAt': ev['ts'].isoformat(), 'durationSec': int(max(0, dur))})
                open_login = None
        # If session still open within window, count up to end bound
        if open_login:
            dur = (min(end, datetime.now()) - open_login).total_seconds()
            sessions.append({'userId': uid, 'loginAt': open_login.isoformat(), 'logoutAt': None, 'durationSec': int(max(0, dur))})

    total = len(sessions)
    avg_sec = int(sum(s['durationSec'] for s in sessions) / total) if total > 0 else 0
    return jsonify({
        'from': start.isoformat(),
        'to': end.isoformat(),
        'totalSessions': total,
        'avgSessionSec': avg_sec,
        'sessions': sessions
    }), 200

# Legacy sync endpoints (keep for compatibility)
@app.route('/api/push-sync', methods=['POST'])
def push_sync():
    """Legacy endpoint - redirects to new enhanced sync"""
    return trigger_push_sync()

@app.route('/api/pull-sync', methods=['GET'])
def pull_sync():
    """Legacy endpoint - redirects to new enhanced sync"""
    last_sync_timestamp = request.args.get('last_sync_timestamp')
    if not last_sync_timestamp:
        last_sync_timestamp = sync_utils.get_last_sync_timestamp()
        if not last_sync_timestamp:
            return jsonify({"status": "error", "message": "last_sync_timestamp is required"}), 400

    app.logger.info(f"Pull sync request received with timestamp: {last_sync_timestamp}")
    try:
        if ENHANCED_SYNC_AVAILABLE and sync_manager:
            result = sync_manager.pull_from_mysql_sync_table()
            return jsonify(result), 200
        else:
            changes_from_server = sync_utils.get_pull_sync_data(last_sync_timestamp, app.logger)
            
            if changes_from_server['status'] == 'error':
                return jsonify(changes_from_server), 500

            # Update last sync timestamp in local settings after successful pull
            sync_utils.set_last_sync_timestamp(datetime.now().isoformat())

            return jsonify(changes_from_server), 200
    except Exception as e:
        app.logger.error(f"Error during pull sync: {e}")
        sync_utils.log_sync_event(
            eventType="pull_sync_failed_api",
            status="failed",
            details={"error": str(e), "last_sync_timestamp": last_sync_timestamp}
        )
        return jsonify({
            "status": "error",
            "message": f"Failed to pull data from MySQL: {e}"
        }), 500

# ---------------------------
# Enhanced Background sync process
# ---------------------------

def run_sync_process_in_background():
    """Starts the enhanced sync process in a background thread."""
    try:
        if ENHANCED_SYNC_AVAILABLE and sync_manager:
            sync_manager.start_background_sync()
            app.logger.info("Enhanced background sync process started successfully")
        else:
            # Legacy background sync
            def sync_continuously():
                while True:
                    app.logger.info("Legacy background sync process started.")
                    # Perform push sync
                    sync_utils.process_push_sync(app.logger)
                    
                    # Perform pull sync
                    last_sync_time = sync_utils.get_last_sync_timestamp()
                    if last_sync_time:
                        sync_utils.get_pull_sync_data(last_sync_time, app.logger)
                    else:
                        app.logger.warning("No last_sync_time found for pull sync.")
                    
                    time.sleep(60)  # Sync every 60 seconds
            
            thread = threading.Thread(target=sync_continuously)
            thread.daemon = True
            thread.start()
            app.logger.info("Legacy background sync process started")
    except Exception as e:
        app.logger.error(f"Error starting background sync: {e}")

if __name__ == '__main__':
    backend_api_url = os.environ.get('NEXT_PUBLIC_BACKEND_API_URL', 'http://127.0.0.1:8080')
    parsed_url = urlparse(backend_api_url)
    port = parsed_url.port if parsed_url.port else 8080

    # NEW: Check if JSON data exists, if not, export from DB
    if not os.path.exists(PRODUCTS_FILE) or os.path.getsize(PRODUCTS_FILE) == 0:
        app.logger.info("JSON data files not found or empty. Attempting to export from database.")
        try:
            export_formatted_data()
            app.logger.info("Database data successfully exported to JSON files.")
        except Exception as e:
            app.logger.error(f"Failed to export data from database to JSON: {e}")
    
    # Start background sync based on environment
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        run_sync_process_in_background()
    elif not app.debug:
        run_sync_process_in_background()
    
    if getattr(sys, 'frozen', False):
        app.run(debug=False, port=port, use_reloader=False)
    else:
        app.run(debug=True, port=port)

# Graceful shutdown
import atexit

def cleanup():
    """Clean up resources on app shutdown"""
    try:
        if ENHANCED_SYNC_AVAILABLE and sync_manager:
            sync_manager.stop_background_sync()
            app.logger.info("Enhanced sync manager stopped gracefully")
    except Exception as e:
        app.logger.error(f"Error stopping sync manager: {e}")

atexit.register(cleanup)
