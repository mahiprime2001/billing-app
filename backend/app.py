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

# NEW: Add field name conversion utility
def convert_camel_to_snake(data):
    """Convert camelCase keys to snake_case for database compatibility"""
    converted = {}
    for key, value in data.items():
        # Convert sellingPrice -> selling_price
        if key == 'sellingPrice':
            converted['selling_price'] = value
        else:
            converted[key] = value
    return converted

# NEW: Import enhanced sync manager
try:
    from scripts.sync_manager import get_sync_manager, log_json_crud_operation
    ENHANCED_SYNC_AVAILABLE = True
except ImportError:
    ENHANCED_SYNC_AVAILABLE = False
    print("Enhanced sync manager not available, falling back to legacy sync")

# At the top of app.py, add these imports
# The SyncController and json_serial are now part of the EnhancedSyncManager or not directly used here.

# Initialize connection pool on startup (handled by DatabaseConnection.get_connection_pool() on first use)

# Create sync controller instance (will be replaced by sync_manager if enhanced sync is available)
sync_controller = None # Placeholder, will be set below

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
    sync_controller = sync_manager # Align sync_controller with the enhanced sync manager
else:
    sync_manager = None
    # If enhanced sync is not available, sync_controller remains None or can be set to a legacy fallback if needed.
    # For now, we'll assume the legacy sync_utils functions are called directly where sync_controller is not available.

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
def ensure_data_directories():
    """Safely ensure data directories exist without overwriting"""
    dirs_to_check = [JSON_DIR, LOGS_DIR]
    
    for directory in dirs_to_check:
        if not os.path.exists(directory):
            try:
                os.makedirs(directory, exist_ok=True)
                app.logger.info(f"Created directory: {directory}")
            except Exception as e:
                app.logger.error(f"Failed to create directory {directory}: {e}")
        else:
            app.logger.debug(f"Directory already exists: {directory}")

# Call once during startup
ensure_data_directories()

PRODUCTS_FILE = os.path.join(JSON_DIR, 'products.json')
USERS_FILE = os.path.join(JSON_DIR, 'users.json')
BILLS_FILE = os.path.join(JSON_DIR, 'bills.json')
NOTIFICATIONS_FILE = os.path.join(JSON_DIR, 'notifications.json')
SETTINGS_FILE = os.path.join(JSON_DIR, 'settings.json')
STORES_FILE = os.path.join(JSON_DIR, 'stores.json')
SESSIONS_FILE = os.path.join(JSON_DIR, 'user_sessions.json')
BATCHES_FILE = os.path.join(JSON_DIR, 'batches.json') # NEW
SETTINGS_FILE = os.path.join(JSON_DIR, 'settings.json') # NEW

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
    # Only create directory if parent doesn't exist
    parent_dir = os.path.dirname(path)
    if not os.path.exists(parent_dir):
        try:
            os.makedirs(parent_dir, exist_ok=True)
            app.logger.debug(f"Created parent directory: {parent_dir}")
        except Exception as e:
            app.logger.error(f"Failed to create directory {parent_dir}: {e}")
            return
    
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        app.logger.error(f"Failed to write JSON to {path}: {e}")

# ============================================
# OFFLINE-FIRST JSON DATA HELPERS
# ============================================

def get_products_data():
    """Get products from local JSON (PRIMARY source)"""
    return _safe_json_load(PRODUCTS_FILE, [])

def save_products_data(products):
    """Save products to local JSON (PRIMARY storage)"""
    _safe_json_dump(PRODUCTS_FILE, products)

def get_users_data():
    """Get users from local JSON (PRIMARY source)"""
    return _safe_json_load(USERS_FILE, [])

def save_users_data(users):
    """Save users to local JSON (PRIMARY storage)"""
    _safe_json_dump(USERS_FILE, users)

def get_stores_data():
    """Get stores from local JSON (PRIMARY source)"""
    return _safe_json_load(STORES_FILE, [])

def save_stores_data(stores):
    """Save stores to local JSON (PRIMARY storage)"""
    _safe_json_dump(STORES_FILE, stores)

def get_batches_data():
    """Get batches from local JSON (PRIMARY source)"""
    return _safe_json_load(BATCHES_FILE, [])

def save_batches_data(batches):
    """Save batches to local JSON (PRIMARY storage)"""
    _safe_json_dump(BATCHES_FILE, batches)

def get_notifications_data():
    """Get notifications from local JSON (PRIMARY source)"""
    return _safe_json_load(NOTIFICATIONS_FILE, [])

def save_notifications_data(notifications):
    """Save notifications to local JSON (PRIMARY storage)"""
    _safe_json_dump(NOTIFICATIONS_FILE, notifications)

# NEW: Customers file path
CUSTOMERS_FILE = os.path.join(JSON_DIR, 'customers.json')

def get_customers_data():
    """Get customers from local JSON (PRIMARY source)"""
    return _safe_json_load(CUSTOMERS_FILE, [])

def save_customers_data(customers):
    """Save customers to local JSON (PRIMARY storage)"""
    _safe_json_dump(CUSTOMERS_FILE, customers)

def get_bills_data():
    return _safe_json_load(BILLS_FILE, [])

def save_bills_data(bills):
    _safe_json_dump(BILLS_FILE, bills)

def get_settings_data():
    """Get settings from local JSON (PRIMARY source)"""
    return _safe_json_load(SETTINGS_FILE, {})

def save_settings_data(settings):
    """Save settings to local JSON (PRIMARY storage)"""
    _safe_json_dump(SETTINGS_FILE, settings)

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

def queue_for_sync(table_name: str, record_data: dict, operation_type: str):
    """
    Queue data changes for background sync to MySQL.
    This is the OFFLINE-FIRST approach - write locally first, sync later.
    """
    try:
        # Use sync_manager to log CRUD operation
        if ENHANCED_SYNC_AVAILABLE and sync_manager:
            sync_manager.log_crud_operation(table_name, operation_type, record_data.get('id'), record_data)
            app.logger.info(f"Queued {operation_type} for {table_name} ID {record_data.get('id')} using EnhancedSyncManager.")
        else:
            # Fallback: log to sync_table directly (legacy behavior)
            log_to_sync_table_only(table_name, record_data, operation_type)
    except Exception as e:
        app.logger.error(f"Error queuing for sync: {e}", exc_info=True)


def log_to_sync_table_only(table_name: str, record_data: dict, operation_type: str):
    """
    Fallback method to log to sync_table when sync_controller is not available.
    """
    try:
        conn = DatabaseConnection.get_connection()
        if not conn:
            app.logger.warning("No database connection - change stored locally only")
            return
        
        cursor = conn.cursor()
        change_data_json = json.dumps(record_data, default=str, ensure_ascii=False)
        
        query = """
            INSERT INTO sync_table 
            (table_name, record_id, operation_type, change_data, source, status, created_at)
            VALUES (%s, %s, %s, %s, 'local', 'pending', NOW())
        """
        
        cursor.execute(query, (
            table_name,
            str(record_data.get('id', '')),
            operation_type.upper(),
            change_data_json
        ))
        
        conn.commit()
        cursor.close()
        conn.close()
        
    except Exception as e:
        app.logger.error(f"Error logging to sync_table: {e}")

# Enhanced sync logging function with DIRECT MySQL table writes
def log_crud_operation(json_type: str, operation: str, record_id: str, data: dict):
    """
    Enhanced CRUD logging that:
    1. Writes directly to the MySQL table (Products, Users, Bills, etc.)
    2. Logs to MySQL sync_table for tracking
    3. Logs to local sync system (existing)
    """
    # Map JSON types to database table names
    table_mapping = {
        'products': 'Products',
        'users': 'Users',
        'bills': 'Bills',
        'customers': 'Customers',
        'stores': 'Stores',
        'notifications': 'Notifications',
        'settings': 'SystemSettings',
        'batches': 'batch'
    }
    
    table_name = table_mapping.get(json_type, json_type.title())
    
    # STEP 1: Write directly to the actual MySQL table
    try:
        success = _write_to_mysql_table(table_name, operation, record_id, data)
        if not success:
            app.logger.error(f"Failed to write {operation} to MySQL table {table_name}")
    except Exception as e:
        app.logger.error(f"Error writing to MySQL table {table_name}: {e}", exc_info=True)
    
    # STEP 2: Log to enhanced sync manager (existing)
    if ENHANCED_SYNC_AVAILABLE and sync_manager:
        log_json_crud_operation(json_type, operation, record_id, data)
    else:
        # Fall back to legacy sync system
        sync_utils.add_to_sync_table(table_name, operation, record_id, data)
    
    # STEP 3: Log to MySQL sync_table for tracking
    try:
        _log_to_mysql_sync_table(table_name, operation, record_id, data)
    except Exception as e:
        app.logger.error(f"Failed to log to MySQL sync_table: {e}", exc_info=True)

def _write_to_mysql_table(table_name: str, operation: str, record_id: str, data: dict) -> bool:
    """
    Write data directly to the actual MySQL table
    """
    try:
        from scripts.sync import apply_change_to_db
        
        # Use the existing apply_change_to_db function from sync.py
        success = apply_change_to_db(
            table_name=table_name,
            change_type=operation.upper(),
            record_id=record_id,
            change_data=data,
            logger_instance=app.logger
        )
        
        if success:
            app.logger.info(f"Successfully wrote {operation} to MySQL table {table_name} for record {record_id}")
        else:
            app.logger.warning(f"Failed to write {operation} to MySQL table {table_name} for record {record_id}")
        
        return success
        
    except Exception as e:
        app.logger.error(f"Error in _write_to_mysql_table for {table_name}: {e}", exc_info=True)
        return False

def _log_to_mysql_sync_table(table_name: str, operation: str, record_id: str, data: dict):
    """
    Log changes to MySQL sync_table for tracking (audit trail)
    """
    try:
        with DatabaseConnection.get_connection_ctx() as conn:
            cursor = conn.cursor()
            
            # Serialize change data to JSON
            change_data_json = json.dumps(data, default=str, ensure_ascii=False)
            
            query = """
                INSERT INTO `sync_table` 
                (`table_name`, `record_id`, `operation_type`, `change_data`, `source`, `status`, `created_at`)
                VALUES (%s, %s, %s, %s, 'local', 'synced', NOW())
            """
            
            cursor.execute(query, (table_name, str(record_id), operation.upper(), change_data_json))
            conn.commit()
            
            app.logger.info(f"Logged to MySQL sync_table: {table_name} - {operation} - {record_id}")
            
    except Exception as e:
        app.logger.error(f"Error logging to MySQL sync_table: {e}", exc_info=True)
        raise

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

# ============================================
# PRODUCTS API - OFFLINE FIRST
# ============================================

@app.route("/api/products", methods=["GET"])
def get_products():
    """Get products from LOCAL JSON (offline-capable)"""
    try:
        products = get_products_data()
        
        # Transform to use selling_price
        for product in products:
            if 'selling_price' in product and product['selling_price']:
                product['displayPrice'] = product['selling_price']
            elif 'price' in product:
                product['displayPrice'] = product['price']
        
        return jsonify(products), 200
    except Exception as e:
        app.logger.error(f"Error getting products: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/products", methods=["POST"])
def create_product():
    """Create product - OFFLINE FIRST approach"""
    try:
        product_data = request.json
        
        if not product_data:
            return jsonify({"error": "No product data provided"}), 400
        
        # ADD THIS LINE - Convert field names
        product_data = convert_camel_to_snake(product_data)
        
        # Generate ID if not present
        if 'id' not in product_data:
            product_data['id'] = str(uuid.uuid4())
        
        # Add timestamps
        now = datetime.now(timezone.utc).isoformat()
        product_data['createdAt'] = now
        product_data['updatedAt'] = now
        
        # STEP 1: Save to LOCAL JSON FIRST (offline-first)
        products = get_products_data()
        products.append(product_data)
        save_products_data(products)
        
        # STEP 2: Write to MySQL IMMEDIATELY (use log_crud_operation instead of queue_for_sync)
        log_crud_operation('products', 'CREATE', product_data['id'], product_data)
        # ↑ This function writes to:
        #   1. MySQL Products table (immediate)
        #   2. MySQL sync_table (audit trail)
        #   3. Local sync system (enhanced sync manager)
        
        # STEP 3: If barcodes exist, save them too
        if 'barcodes' in product_data and product_data['barcodes']:
            barcodes_list = product_data['barcodes'].split(',') if isinstance(product_data['barcodes'], str) else product_data['barcodes']
            for barcode in barcodes_list:
                barcode_data = {
                    'productId': product_data['id'],
                    'barcode': barcode.strip()
                }
                log_crud_operation('productbarcodes', 'CREATE', barcode, barcode_data)
        
        app.logger.info(f"Product created: {product_data['id']} (local JSON + MySQL)")
        return jsonify({"message": "Product created", "id": product_data['id']}), 201
        
    except Exception as e:
        app.logger.error(f"Error creating product: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route("/api/products/<product_id>", methods=["PUT"])
def update_product(product_id):
    """Update product - OFFLINE FIRST approach"""
    try:
        update_data = request.json
        
        if not update_data:
            return jsonify({"error": "No update data provided"}), 400
        
        # ADD THIS LINE - Convert field names
        update_data = convert_camel_to_snake(update_data)
        
        # STEP 1: Update in LOCAL JSON FIRST
        products = get_products_data()
        product_index = next((i for i, p in enumerate(products) if p.get('id') == product_id), -1)
        
        if product_index == -1:
            return jsonify({"error": "Product not found"}), 404
        
        # Merge updates
        products[product_index].update(update_data)
        products[product_index]['updatedAt'] = datetime.now(timezone.utc).isoformat()
        
        save_products_data(products)
        
        # STEP 2: Write to MySQL IMMEDIATELY
        log_crud_operation('products', 'UPDATE', product_id, products[product_index])
        
        app.logger.info(f"Product updated: {product_id} (local JSON + MySQL)")
        return jsonify({"message": "Product updated", "id": product_id}), 200
        
    except Exception as e:
        app.logger.error(f"Error updating product: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route("/api/products/<product_id>", methods=["DELETE"])
def delete_product(product_id):
    """Delete product - OFFLINE FIRST approach"""
    try:
        # STEP 1: Delete from LOCAL JSON FIRST
        products = get_products_data()
        product_index = next((i for i, p in enumerate(products) if p.get('id') == product_id), -1)
        
        if product_index == -1:
            return jsonify({"error": "Product not found"}), 404
        
        deleted_product = products.pop(product_index)
        save_products_data(products)
        
        # STEP 2: Write to MySQL IMMEDIATELY
        log_crud_operation('products', 'DELETE', product_id, deleted_product)
        
        app.logger.info(f"Product deleted: {product_id} (local JSON + MySQL)")
        return jsonify({"message": "Product deleted"}), 200
        
    except Exception as e:
        app.logger.error(f"Error deleting product: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

# ---------------------------
# Batches - NEW
# ---------------------------

@app.route('/api/batches', methods=['GET'])
def get_batches():
    batches = get_batches_data()
    return jsonify(batches)

@app.route('/api/batches', methods=['POST'])
def add_batch():
    new_batch = request.json or {}
    batches = get_batches_data()
    
    if not new_batch.get('batchNumber') or not new_batch.get('place'):
        return jsonify({"message": "Batch number and place are required"}), 400

    new_batch['id'] = str(uuid.uuid4())
    new_batch['createdAt'] = datetime.now().isoformat()
    new_batch['updatedAt'] = datetime.now().isoformat()
    
    batches.append(new_batch)
    save_batches_data(batches)
    
    log_crud_operation('batches', 'CREATE', new_batch['id'], new_batch)
    
    return jsonify(new_batch), 201

@app.route('/api/batches/<batch_id>', methods=['PUT'])
def update_batch(batch_id):
    updated_data = request.json or {}
    batches = get_batches_data()
    batch_found = False
    idx = -1

    for i, batch in enumerate(batches):
        if batch['id'] == batch_id:
            batches[i].update(updated_data)
            batches[i]['updatedAt'] = datetime.now().isoformat()
            batch_found = True
            idx = i
            break

    if batch_found:
        save_batches_data(batches)
        log_crud_operation('batches', 'UPDATE', batch_id, batches[idx])
        return jsonify(batches[idx])

    return jsonify({"message": "Batch not found"}), 404

@app.route('/api/batches/<batch_id>', methods=['DELETE'])
def delete_batch(batch_id):
    batches = get_batches_data()
    initial_len = len(batches)

    deleted_batch = None
    for batch in batches:
        if batch['id'] == batch_id:
            deleted_batch = batch
            break

    batches = [batch for batch in batches if batch['id'] != batch_id]

    if len(batches) < initial_len:
        save_batches_data(batches)
        log_crud_operation('batches', 'DELETE', batch_id, deleted_batch or {})
        return jsonify({"message": "Batch deleted"}), 200

    return jsonify({"message": "Batch not found"}), 404

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

@app.route('/api/admin-users', methods=['GET'])
def get_admin_users():
    users = get_users_data()
    admin_users = [
        {"name": u.get('name'), "email": u.get('email')}
        for u in users
        if u.get('role') in ["super_admin", "billing_user"]
    ]
    return jsonify({"adminUsers": admin_users})

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
# Flush Data Endpoint - NEW
# ---------------------------

@app.route('/api/flush-data', methods=['POST'])
def flush_data():
    """
    Flush data by category WITHOUT touching ANY billing tables (Bills, BillItems)
    
    Categories:
    - products: Delete Products & ProductBarcodes, set BillItems.productId to NULL
    - stores: Delete Stores & UserStores, set Bills.storeId to NULL
    - users: Delete non-admin Users, set Bills.createdBy to NULL
    - customers: Delete Customers, set Bills.customerId to NULL
    - batches: Delete batch records, set Products.batchId to NULL
    """
    data = request.json or {}
    category = data.get('category')
    admin_users_to_keep = data.get('adminUsersToKeep', [])
    
    if not category:
        return jsonify(status="error", message="Category to flush is required"), 400
    
    try:
        with DatabaseConnection.get_connection_ctx() as conn:
            cursor = conn.cursor()
            
            # ====== PRODUCTS FLUSH ======
            if category == 'products':
                save_products_data([])
                
                cursor.execute("""
                    UPDATE `BillItems` 
                    SET `productId` = NULL 
                    WHERE `productId` IS NOT NULL
                """)
                affected_bill_items = cursor.rowcount
                app.logger.info(f"Set productId to NULL for {affected_bill_items} BillItems records")
                
                cursor.execute("DELETE FROM `ProductBarcodes`")
                deleted_barcodes = cursor.rowcount
                
                cursor.execute("DELETE FROM `Products`")
                deleted_products = cursor.rowcount
                
                conn.commit()
                
                log_crud_operation('products', 'FLUSH', 'all', {
                    'deleted_products': deleted_products,
                    'deleted_barcodes': deleted_barcodes,
                    'preserved_bill_items': affected_bill_items
                })
                
                return jsonify(
                    status="success", 
                    message=f"Flushed {deleted_products} products. Billing history preserved.",
                    details={
                        'products_deleted': deleted_products,
                        'barcodes_deleted': deleted_barcodes,
                        'bill_items_preserved': affected_bill_items
                    }
                ), 200
            
            # ====== STORES FLUSH ======
            elif category == 'stores':
                save_stores_data([])
                
                cursor.execute("""
                    UPDATE `Bills` 
                    SET `storeId` = NULL 
                    WHERE `storeId` IS NOT NULL
                """)
                affected_bills = cursor.rowcount
                
                cursor.execute("""
                    UPDATE `Products` 
                    SET `assignedStoreId` = NULL 
                    WHERE `assignedStoreId` IS NOT NULL
                """)
                affected_products = cursor.rowcount
                
                cursor.execute("DELETE FROM `UserStores`")
                deleted_user_stores = cursor.rowcount
                
                cursor.execute("DELETE FROM `Stores`")
                deleted_stores = cursor.rowcount
                
                conn.commit()
                
                log_crud_operation('stores', 'FLUSH', 'all', {
                    'deleted_stores': deleted_stores,
                    'preserved_bills': affected_bills
                })
                
                return jsonify(
                    status="success", 
                    message=f"Flushed {deleted_stores} stores. Billing history preserved.",
                    details={
                        'stores_deleted': deleted_stores,
                        'bills_preserved': affected_bills,
                        'products_updated': affected_products
                    }
                ), 200
            
            # ====== USERS FLUSH ======
            elif category == 'users':
                users = get_users_data()
                users_to_keep = []
                deleted_user_ids = []
                
                for user in users:
                    if user.get('role') == 'admin':
                        if not admin_users_to_keep or user.get('id') in admin_users_to_keep:
                            users_to_keep.append(user)
                        else:
                            deleted_user_ids.append(user.get('id'))
                    else:
                        deleted_user_ids.append(user.get('id'))
                
                if not deleted_user_ids:
                    return jsonify(status="success", message="No users to delete."), 200
                
                save_users_data(users_to_keep)
                
                placeholders = ','.join(['%s'] * len(deleted_user_ids))
                
                cursor.execute(
                    f"UPDATE `Bills` SET `createdBy` = NULL WHERE `createdBy` IN ({placeholders})",
                    tuple(deleted_user_ids)
                )
                affected_bills = cursor.rowcount
                
                cursor.execute(
                    f"DELETE FROM `UserStores` WHERE `userId` IN ({placeholders})",
                    tuple(deleted_user_ids)
                )
                cursor.execute(
                    f"DELETE FROM `password_change_log` WHERE `user_id` IN ({placeholders})",
                    tuple(deleted_user_ids)
                )
                cursor.execute(
                    f"DELETE FROM `password_reset_tokens` WHERE `user_id` IN ({placeholders})",
                    tuple(deleted_user_ids)
                )
                cursor.execute(
                    f"DELETE FROM `Users` WHERE `id` IN ({placeholders})",
                    tuple(deleted_user_ids)
                )
                deleted_count = cursor.rowcount
                
                conn.commit()
                
                for user_id in deleted_user_ids:
                    log_crud_operation('users', 'DELETE', user_id, {'reason': 'flushed'})
                
                return jsonify(
                    status="success",
                    message=f"Deleted {deleted_count} users. Billing history preserved.",
                    details={
                        'users_deleted': deleted_count,
                        'bills_preserved': affected_bills
                    }
                ), 200
            
            # ====== CUSTOMERS FLUSH ======
            elif category == 'customers':
                save_customers_data([])
                
                cursor.execute("""
                    UPDATE `Bills` 
                    SET `customerId` = NULL 
                    WHERE `customerId` IS NOT NULL
                """)
                affected_bills = cursor.rowcount
                
                cursor.execute("DELETE FROM `Customers`")
                deleted_customers = cursor.rowcount
                
                conn.commit()
                
                log_crud_operation('customers', 'FLUSH', 'all', {
                    'deleted_customers': deleted_customers,
                    'preserved_bills': affected_bills
                })
                
                return jsonify(
                    status="success",
                    message=f"Flushed {deleted_customers} customers. Billing history preserved.",
                    details={
                        'customers_deleted': deleted_customers,
                        'bills_preserved': affected_bills
                    }
                ), 200
            
            # ====== BATCHES FLUSH ======
            elif category == 'batches':
                save_batches_data([])
                
                cursor.execute("""
                    UPDATE `Products` 
                    SET `batchId` = NULL 
                    WHERE `batchId` IS NOT NULL
                """)
                affected_products = cursor.rowcount
                
                cursor.execute("DELETE FROM `batch`")
                deleted_batches = cursor.rowcount
                
                conn.commit()
                
                log_crud_operation('batches', 'FLUSH', 'all', {
                    'deleted_batches': deleted_batches,
                    'preserved_products': affected_products
                })
                
                return jsonify(
                    status="success",
                    message=f"Flushed {deleted_batches} batches. Products and billing preserved.",
                    details={
                        'batches_deleted': deleted_batches,
                        'products_preserved': affected_products
                    }
                ), 200
            
            else:
                return jsonify(status="error", message="Invalid category specified"), 400
            
    except Exception as e:
        app.logger.error(f"Error flushing {category} data: {e}", exc_info=True)
        return jsonify(status="error", message=f"Failed to flush {category} data: {str(e)}"), 500

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

@app.route("/api/settings", methods=["POST"])
def update_settings():
    data = request.json or {}
    existing_settings = get_settings_data()
    
    if "systemSettings" in data:
        existing_settings["systemSettings"] = data["systemSettings"]
    if "billFormats" in data:
        existing_settings["billFormats"] = data["billFormats"]
    if "storeFormats" in data:
        existing_settings["storeFormats"] = data["storeFormats"]
    
    # Save to JSON
    save_settings_data(existing_settings)
    
    setting_id = existing_settings.get("systemSettings", {}).get("id", "1")
    system_settings = existing_settings.get("systemSettings", {})
    
    # DIRECTLY UPDATE MySQL DATABASE
    try:
        with DatabaseConnection.get_connection() as conn:
            cursor = conn.cursor(dictionary=True)
            
            # Check if record exists
            cursor.execute("SELECT * FROM SystemSettings WHERE id = %s", (setting_id,))
            existing_record = cursor.fetchone()
            
            if existing_record:
                # UPDATE existing record
                update_query = """
                    UPDATE SystemSettings 
                    SET gstin = %s, taxPercentage = %s, companyName = %s, 
                        companyAddress = %s, companyPhone = %s, companyEmail = %s
                    WHERE id = %s
                """
                cursor.execute(update_query, (
                    system_settings.get("gstin", ""),
                    system_settings.get("taxPercentage", 0),
                    system_settings.get("companyName", ""),
                    system_settings.get("companyAddress", ""),
                    system_settings.get("companyPhone", ""),
                    system_settings.get("companyEmail", ""),
                    setting_id
                ))
            else:
                # INSERT new record
                insert_query = """
                    INSERT INTO SystemSettings 
                    (id, gstin, taxPercentage, companyName, companyAddress, companyPhone, companyEmail)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """
                cursor.execute(insert_query, (
                    setting_id,
                    system_settings.get("gstin", ""),
                    system_settings.get("taxPercentage", 0),
                    system_settings.get("companyName", ""),
                    system_settings.get("companyAddress", ""),
                    system_settings.get("companyPhone", ""),
                    system_settings.get("companyEmail", "")
                ))
            
            conn.commit()
            app.logger.info("SystemSettings updated in database")
            
    except Exception as e:
        app.logger.error(f"Error updating SystemSettings in database: {e}", exc_info=True)
        return jsonify({"error": "Failed to update database", "message": str(e)}), 500
    
    # Log to sync system for audit trail
    log_crud_operation("settings", "UPDATE", setting_id, existing_settings)
    
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
# ENHANCED ANALYTICS ENDPOINTS
# ---------------------------

@app.route('/api/analytics/dashboard', methods=['GET'])
def get_analytics_dashboard():
    """Comprehensive dashboard with all key metrics"""
    try:
        products = get_products_data()
        bills = get_bills_data()
        stores = get_stores_data()
        
        # Date range parameters
        days = int(request.args.get('days', 30))
        cutoff_date = datetime.now() - timedelta(days=days)
        
        # Filter bills by date range
        recent_bills = [
            b for b in bills 
            if datetime.fromisoformat(b.get('createdAt', '')) >= cutoff_date
        ]
        
        # Calculate revenue metrics
        total_revenue = sum(float(b.get('total', 0)) for b in recent_bills)
        
        # Previous period comparison
        previous_cutoff = cutoff_date - timedelta(days=days)
        previous_bills = [
            b for b in bills 
            if previous_cutoff <= datetime.fromisoformat(b.get('createdAt', '')) < cutoff_date
        ]
        previous_revenue = sum(float(b.get('total', 0)) for b in previous_bills)
        revenue_growth = ((total_revenue - previous_revenue) / previous_revenue * 100) if previous_revenue > 0 else 0
        
        # Calculate other metrics
        total_bills = len(recent_bills)
        avg_bill_value = total_revenue / total_bills if total_bills > 0 else 0
        
        # Calculate total items sold
        total_items = sum(
            sum(int(item.get('quantity', 0)) for item in b.get('items', []))
            for b in recent_bills
        )
        
        # Product metrics
        total_products = len(products)
        total_inventory_value = sum(
            float(p.get('price', 0)) * int(p.get('stock', 0))
            for p in products
        )
        low_stock_count = sum(1 for p in products if int(p.get('stock', 0)) < 10)
        
        # Customer metrics (unique phone numbers from bills)
        unique_customers = len(set(b.get('customerPhone', '') for b in recent_bills if b.get('customerPhone')))
        
        return jsonify({
            'period': f'Last {days} days',
            'revenue': {
                'current': round(total_revenue, 2),
                'previous': round(previous_revenue, 2),
                'growth': round(revenue_growth, 2)
            },
            'bills': {
                'total': total_bills,
                'averageValue': round(avg_bill_value, 2)
            },
            'items': {
                'totalSold': total_items,
                'perTransaction': round(total_items / total_bills, 2) if total_bills > 0 else 0
            },
            'inventory': {
                'totalProducts': total_products,
                'totalValue': round(total_inventory_value, 2),
                'lowStockCount': low_stock_count
            },
            'customers': {
                'unique': unique_customers,
                'repeatRate': 0  # Will implement with customer tracking
            },
            'stores': {
                'total': len(stores),
                'active': len([s for s in stores if s.get('status') == 'active'])
            }
        }), 200
    except Exception as e:
        app.logger.error(f"Error getting dashboard analytics: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/analytics/revenue/trends', methods=['GET'])
def get_revenue_trends():
    """Get revenue trends by day, week, or month"""
    try:
        period = request.args.get('period', 'daily')  # daily, weekly, monthly
        days = int(request.args.get('days', 30))
        
        bills = get_bills_data()
        cutoff_date = datetime.now() - timedelta(days=days)
        
        # Group bills by period
        revenue_by_period = defaultdict(float)
        bills_by_period = defaultdict(int)
        
        for bill in bills:
            try:
                bill_date = datetime.fromisoformat(bill.get('createdAt', ''))
                if bill_date < cutoff_date:
                    continue
                
                # Group by period
                if period == 'daily':
                    key = bill_date.strftime('%Y-%m-%d')
                elif period == 'weekly':
                    key = bill_date.strftime('%Y-W%U')
                else:  # monthly
                    key = bill_date.strftime('%Y-%m')
                
                revenue_by_period[key] += float(bill.get('total', 0))
                bills_by_period[key] += 1
            except Exception as e:
                app.logger.error(f"Error processing bill: {e}")
                continue
        
        # Format response
        trend_data = [
            {
                'period': period_key,
                'revenue': round(revenue, 2),
                'bills': bills_by_period[period_key],
                'averageBill': round(revenue / bills_by_period[period_key], 2) if bills_by_period[period_key] > 0 else 0
            }
            for period_key, revenue in sorted(revenue_by_period.items())
        ]
        
        return jsonify({
            'period': period,
            'days': days,
            'data': trend_data
        }), 200
    except Exception as e:
        app.logger.error(f"Error getting revenue trends: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/analytics/products/top', methods=['GET'])
def get_top_products():
    """Get top selling products by revenue and quantity"""
    try:
        limit = int(request.args.get('limit', 10))
        days = int(request.args.get('days', 30))
        sort_by = request.args.get('sortBy', 'revenue')  # revenue or quantity
        
        bills = get_bills_data()
        products = get_products_data()
        cutoff_date = datetime.now() - timedelta(days=days)
        
        # Create product lookup
        product_lookup = {p['id']: p for p in products}
        
        # Aggregate product sales
        product_stats = defaultdict(lambda: {'revenue': 0, 'quantity': 0, 'bills': 0})
        
        for bill in bills:
            try:
                bill_date = datetime.fromisoformat(bill.get('createdAt', ''))
                if bill_date < cutoff_date:
                    continue
                
                for item in bill.get('items', []):
                    product_id = item.get('productId')
                    if product_id:
                        quantity = int(item.get('quantity', 0))
                        price = float(item.get('price', 0))
                        
                        product_stats[product_id]['revenue'] += price * quantity
                        product_stats[product_id]['quantity'] += quantity
                        product_stats[product_id]['bills'] += 1
            except Exception as e:
                app.logger.error(f"Error processing bill for products: {e}")
                continue
        
        # Format and sort results
        results = []
        for product_id, stats in product_stats.items():
            product = product_lookup.get(product_id, {})
            results.append({
                'productId': product_id,
                'productName': product.get('name', 'Unknown Product'),
                'barcode': get_primary_barcode(product),
                'category': product.get('category', 'Uncategorized'),
                'revenue': round(stats['revenue'], 2),
                'quantitySold': stats['quantity'],
                'billsCount': stats['bills'],
                'currentStock': int(product.get('stock', 0)),
                'averagePrice': round(stats['revenue'] / stats['quantity'], 2) if stats['quantity'] > 0 else 0
            })
        
        # Sort by selected metric
        results.sort(key=lambda x: x[sort_by] if sort_by in x else x['revenue'], reverse=True)
        
        return jsonify({
            'period': f'Last {days} days',
            'sortBy': sort_by,
            'data': results[:limit]
        }), 200
    except Exception as e:
        app.logger.error(f"Error getting top products: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/analytics/inventory/health', methods=['GET'])
def get_inventory_health():
    """Get inventory health metrics including turnover and slow-moving items"""
    try:
        products = get_products_data()
        bills = get_bills_data()
        days = int(request.args.get('days', 30))
        cutoff_date = datetime.now() - timedelta(days=days)
        
        # Calculate sold quantities per product
        sold_quantities = defaultdict(int)
        for bill in bills:
            try:
                bill_date = datetime.fromisoformat(bill.get('createdAt', ''))
                if bill_date < cutoff_date:
                    continue
                
                for item in bill.get('items', []):
                    product_id = item.get('productId')
                    if product_id:
                        sold_quantities[product_id] += int(item.get('quantity', 0))
            except Exception:
                continue
        
        # Calculate metrics for each product
        inventory_data = []
        slow_moving = []
        out_of_stock = []
        
        for product in products:
            product_id = product['id']
            current_stock = int(product.get('stock', 0))
            price = float(product.get('price', 0))
            sold = sold_quantities.get(product_id, 0)
            
            # Calculate turnover ratio (sold / current stock)
            turnover_ratio = (sold / current_stock) if current_stock > 0 else 0
            
            product_data = {
                'productId': product_id,
                'productName': product.get('name', 'Unknown'),
                'barcode': get_primary_barcode(product),
                'currentStock': current_stock,
                'stockValue': round(current_stock * price, 2),
                'soldQuantity': sold,
                'turnoverRatio': round(turnover_ratio, 2),
                'daysOfStock': round(days / turnover_ratio, 1) if turnover_ratio > 0 else 999
            }
            
            inventory_data.append(product_data)
            
            # Identify slow-moving items (turnover < 0.2)
            if turnover_ratio < 0.2 and current_stock > 0:
                slow_moving.append(product_data)
            
            # Track out of stock
            if current_stock == 0:
                out_of_stock.append(product_data)
        
        # Calculate overall metrics
        total_inventory_value = sum(p['stockValue'] for p in inventory_data)
        avg_turnover = sum(p['turnoverRatio'] for p in inventory_data) / len(inventory_data) if inventory_data else 0
        
        return jsonify({
            'period': f'Last {days} days',
            'summary': {
                'totalProducts': len(products),
                'totalInventoryValue': round(total_inventory_value, 2),
                'averageTurnover': round(avg_turnover, 2),
                'slowMovingCount': len(slow_moving),
                'outOfStockCount': len(out_of_stock)
            },
            'slowMoving': sorted(slow_moving, key=lambda x: x['stockValue'], reverse=True)[:20],
            'outOfStock': sorted(out_of_stock, key=lambda x: x['soldQuantity'], reverse=True)[:20],
            'allProducts': sorted(inventory_data, key=lambda x: x['turnoverRatio'])
        }), 200
    except Exception as e:
        app.logger.error(f"Error getting inventory health: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/analytics/stores/performance', methods=['GET'])
def get_store_performance():
    """Get detailed performance metrics for all stores"""
    try:
        days = int(request.args.get('days', 30))
        cutoff_date = datetime.now() - timedelta(days=days)
        
        stores = get_stores_data()
        bills = get_bills_data()
        products = get_products_data()
        
        store_metrics = {}
        
        for store in stores:
            store_id = store['id']
            store_metrics[store_id] = {
                'storeId': store_id,
                'storeName': store.get('name', 'Unknown Store'),
                'revenue': 0,
                'bills': 0,
                'items': 0,
                'assignedProducts': 0,
                'inventoryValue': 0
            }
        
        # Aggregate bill data by store
        for bill in bills:
            try:
                bill_date = datetime.fromisoformat(bill.get('createdAt', ''))
                if bill_date < cutoff_date:
                    continue
                
                store_id = bill.get('storeId')
                if store_id and store_id in store_metrics:
                    store_metrics[store_id]['revenue'] += float(bill.get('total', 0))
                    store_metrics[store_id]['bills'] += 1
                    store_metrics[store_id]['items'] += sum(int(item.get('quantity', 0)) for item in bill.get('items', []))
            except Exception:
                continue
        
        # Calculate inventory value per store
        for product in products:
            store_id = product.get('assignedStoreId')
            if store_id and store_id in store_metrics:
                store_metrics[store_id]['assignedProducts'] += 1
                store_metrics[store_id]['inventoryValue'] += float(product.get('price', 0)) * int(product.get('stock', 0))
        
        # Calculate derived metrics
        results = []
        for store_id, metrics in store_metrics.items():
            metrics['averageBillValue'] = round(metrics['revenue'] / metrics['bills'], 2) if metrics['bills'] > 0 else 0
            metrics['itemsPerBill'] = round(metrics['items'] / metrics['bills'], 2) if metrics['bills'] > 0 else 0
            metrics['revenue'] = round(metrics['revenue'], 2)
            metrics['inventoryValue'] = round(metrics['inventoryValue'], 2)
            results.append(metrics)
        
        # Sort by revenue
        results.sort(key=lambda x: x['revenue'], reverse=True)
        
        return jsonify({
            'period': f'Last {days} days',
            'data': results
        }), 200
    except Exception as e:
        app.logger.error(f"Error getting store performance: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/analytics/category/breakdown', methods=['GET'])
def get_category_breakdown():
    """Get sales breakdown by product category"""
    try:
        days = int(request.args.get('days', 30))
        cutoff_date = datetime.now() - timedelta(days=days)
        
        products = get_products_data()
        bills = get_bills_data()
        
        # Create product lookup
        product_lookup = {p['id']: p for p in products}
        
        # Aggregate by category
        category_stats = defaultdict(lambda: {'revenue': 0, 'quantity': 0, 'bills': set()})
        
        for bill in bills:
            try:
                bill_date = datetime.fromisoformat(bill.get('createdAt', ''))
                if bill_date < cutoff_date:
                    continue
                
                for item in bill.get('items', []):
                    product_id = item.get('productId')
                    product = product_lookup.get(product_id, {})
                    category = product.get('category', 'Uncategorized')
                    
                    quantity = int(item.get('quantity', 0))
                    price = float(item.get('price', 0))
                    
                    category_stats[category]['revenue'] += price * quantity
                    category_stats[category]['quantity'] += quantity
                    category_stats[category]['bills'].add(bill['id'])
            except Exception:
                continue
        
        # Format results
        results = [
            {
                'category': category,
                'revenue': round(stats['revenue'], 2),
                'quantity': stats['quantity'],
                'billsCount': len(stats['bills']),
                'averagePrice': round(stats['revenue'] / stats['quantity'], 2) if stats['quantity'] > 0 else 0
            }
            for category, stats in category_stats.items()
        ]
        
        # Sort by revenue
        results.sort(key=lambda x: x['revenue'], reverse=True)
        
        # Calculate percentages
        total_revenue = sum(r['revenue'] for r in results)
        for result in results:
            result['revenuePercentage'] = round((result['revenue'] / total_revenue * 100), 2) if total_revenue > 0 else 0
        
        return jsonify({
            'period': f'Last {days} days',
            'data': results
        }), 200
    except Exception as e:
        app.logger.error(f"Error getting category breakdown: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/analytics/alerts', methods=['GET'])
def get_business_alerts():
    """Get business alerts and notifications"""
    try:
        products = get_products_data()
        bills = get_bills_data()
        
        alerts = []
        
        # Low stock alerts
        low_stock_products = [p for p in products if int(p.get('stock', 0)) < 10]
        if low_stock_products:
            alerts.append({
                'type': 'warning',
                'category': 'inventory',
                'title': 'Low Stock Alert',
                'message': f'{len(low_stock_products)} products have low stock (< 10 units)',
                'priority': 'high',
                'actionUrl': '/inventory'
            })
        
        # Out of stock alerts
        out_of_stock = [p for p in products if int(p.get('stock', 0)) == 0]
        if out_of_stock:
            alerts.append({
                'type': 'error',
                'category': 'inventory',
                'title': 'Out of Stock',
                'message': f'{len(out_of_stock)} products are out of stock',
                'priority': 'critical',
                'actionUrl': '/inventory'
            })
        
        # Revenue drop detection (comparing last 7 days to previous 7 days)
        now = datetime.now()
        recent_revenue = sum(
            float(b.get('total', 0)) for b in bills
            if now - timedelta(days=7) <= datetime.fromisoformat(b.get('createdAt', '')) <= now
        )
        previous_revenue = sum(
            float(b.get('total', 0)) for b in bills
            if now - timedelta(days=14) <= datetime.fromisoformat(b.get('createdAt', '')) < now - timedelta(days=7)
        )
        
        if previous_revenue > 0:
            revenue_change = ((recent_revenue - previous_revenue) / previous_revenue) * 100
            if revenue_change < -10:
                alerts.append({
                    'type': 'warning',
                    'category': 'revenue',
                    'title': 'Revenue Drop Detected',
                    'message': f'Revenue decreased by {abs(revenue_change):.1f}% compared to previous week',
                    'priority': 'high',
                    'actionUrl': '/analytics'
                })
        
        # High inventory value sitting (products with high value but low turnover)
        high_value_slow = []
        for product in products:
            stock = int(product.get('stock', 0))
            price = float(product.get('price', 0))
            value = stock * price
            
            if value > 50000:  # High value threshold
                # Check recent sales
                product_sales = sum(
                    int(item.get('quantity', 0))
                    for bill in bills[-30:]  # Last 30 bills
                    for item in bill.get('items', [])
                    if item.get('productId') == product['id']
                )
                
                if product_sales < stock * 0.1:  # Less than 10% sold
                    high_value_slow.append(product)
        
        if high_value_slow:
            alerts.append({
                'type': 'info',
                'category': 'inventory',
                'title': 'High Value Slow-Moving Inventory',
                'message': f'{len(high_value_slow)} high-value products have low turnover',
                'priority': 'medium',
                'actionUrl': '/inventory'
            })
        
        return jsonify({
            'alerts': alerts,
            'count': len(alerts)
        }), 200
    except Exception as e:
        app.logger.error(f"Error getting business alerts: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


#-------------------------------------------------
# Legacy sync endpoints (keep for compatibility) 
#-------------------------------------------------
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

# ============================================
# BACKGROUND SYNC SCHEDULER
# ============================================

def background_sync_task():
    """
    Background task that runs every 5 minutes to sync local changes to MySQL.
    This is the OFFLINE-FIRST approach.
    """
    while True:
        try:
            time.sleep(300)  # Wait 5 minutes
            
            app.logger.info("Starting background sync to MySQL...")
            
            # Push pending changes from local JSON to MySQL
            if ENHANCED_SYNC_AVAILABLE and sync_manager:
                result = sync_manager.process_pending_logs()
                app.logger.info(f"Push sync result: {result}")
            
            # Pull remote changes from MySQL to local JSON
            if ENHANCED_SYNC_AVAILABLE and sync_manager:
                pull_result = sync_manager.pull_from_mysql_sync_table()
                if pull_result.get('status') == 'success':
                    # The pull_from_mysql_sync_table already applies changes to local JSON,
                    # so no explicit merge logic is needed here for Bills/Customers.
                    app.logger.info(f"Pull result: {pull_result}")
            
            # Note: The merge logic for Bills and Customers was previously here,
            # but EnhancedSyncManager's pull_from_mysql_sync_table handles local JSON updates directly.
            # If ENHANCED_SYNC_AVAILABLE is False, the legacy background_sync_task would handle this.
            
            app.logger.info("Background sync completed")
            
        except Exception as e:
            app.logger.error(f"Error in background sync: {e}", exc_info=True)


# Background sync is started via run_sync_process_in_background() in __main__
# No need to start a separate thread here

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

    # NEW: Ensure batch table is created (and updated if schema changed)
    try:
        DatabaseConnection.create_batch_table()
    except Exception as e:
        app.logger.error(f"Failed to create/update batch table: {e}")

    # NEW: Ensure ProductBarcodes table is created
    try:
        DatabaseConnection.create_product_barcodes_table()
    except Exception as e:
        app.logger.error(f"Failed to create ProductBarcodes table: {e}")

    # NEW: Ensure UserStores table is created
    try:
        DatabaseConnection.create_user_stores_table()
    except Exception as e:
        app.logger.error(f"Failed to create UserStores table: {e}")
    
    # ============================================
    # INITIALIZE LOCAL DATA ON STARTUP
    # ============================================

    def initialize_local_data():
        """
        Initialize local JSON files on first startup.
        Pull data from MySQL if local files are empty.
        """
        try:
            # Check if products file exists and is not empty
            if not os.path.exists(PRODUCTS_FILE) or os.path.getsize(PRODUCTS_FILE) == 0:
                app.logger.info("Initializing products from MySQL...")
                
                if ENHANCED_SYNC_AVAILABLE and sync_manager:
                    result = sync_manager.pull_from_mysql_sync_table() # This pulls all changes and applies to local JSON
                    
                    if result.get('status') == 'success':
                        app.logger.info(f"Initialized local data from MySQL using EnhancedSyncManager pull: {result.get('applied', 0)} records applied.")
                else:
                    # Fallback to legacy pull if enhanced sync is not available
                    app.logger.info("Enhanced sync manager not available, skipping initial data pull from MySQL.")
            
            # The EnhancedSyncManager.pull_from_mysql_sync_table handles updating local JSON files directly.
            # No need for separate pull calls for Products, Users, Stores here if using EnhancedSyncManager.
            # If ENHANCED_SYNC_AVAILABLE is False, this block would need a legacy pull implementation.
            
        except Exception as e:
            app.logger.error(f"Error initializing local data: {e}")


    # Call on startup
    initialize_local_data()

    def merge_pulled_data(pulled_data: dict):
        """Merge pulled MySQL data into local JSON files with conflict resolution"""
        try:
            for table_name, records in pulled_data.items():
                if not records:
                    continue
                
                if table_name == 'Products':
                    local_data = get_products_data()
                    merged = merge_records(local_data, records)
                    save_products_data(merged)
                elif table_name == 'Users':
                    local_data = get_users_data()
                    merged = merge_records(local_data, records)
                    save_users_data(merged)
                elif table_name == 'Stores':
                    local_data = get_stores_data()
                    merged = merge_records(local_data, records)
                    save_stores_data(merged)
                # Add more tables as needed
                
        except Exception as e:
            app.logger.error(f"Error merging pulled data: {e}", exc_info=True)


    def merge_records(local_records: list, remote_records: list) -> list:
        """Merge remote records into local with timestamp comparison"""
        local_by_id = {r['id']: r for r in local_records}
        
        for remote_record in remote_records:
            record_id = remote_record['id']
            if record_id in local_by_id:
                # Compare timestamps - newer wins
                local_updated = local_by_id[record_id].get('updatedAt', '')
                remote_updated = remote_record.get('updatedAt', '')
                if remote_updated > local_updated:
                    local_by_id[record_id] = remote_record
            else:
                # New record from remote
                local_by_id[record_id] = remote_record
        
        return list(local_by_id.values())

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
