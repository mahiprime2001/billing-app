# scripts/sync_check.py (updated)

import os
import sys
import json
import asyncio
import logging
from datetime import date, datetime
from decimal import Decimal

# Resolve project paths
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # .../backend
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.db import DatabaseConnection  # noqa: E402

# JSON/log directories align with app.py
JSON_DIR = os.path.join(BACKEND_DIR, 'data', 'json')
LOG_DIR = os.path.join(BACKEND_DIR, 'data', 'logs')
os.makedirs(JSON_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)

PRODUCTS_FILE = os.path.join(JSON_DIR, 'products.json')
USERS_FILE = os.path.join(JSON_DIR, 'users.json')
BILLS_FILE = os.path.join(JSON_DIR, 'bills.json')
NOTIFICATIONS_FILE = os.path.join(JSON_DIR, 'notifications.json')
SETTINGS_FILE = os.path.join(JSON_DIR, 'settings.json')
STORES_FILE = os.path.join(JSON_DIR, 'stores.json')

def _json_default(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, bytes):
        return o.decode('utf-8', 'ignore')
    return o

def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=_json_default)

def _fetch_all(cursor, sql: str, params: tuple = ()):
    cursor.execute(sql, params)
    cols = [c[0] for c in cursor.description]
    out = []
    for row in cursor.fetchall():
        item = {}
        for k, v in zip(cols, row):
            item[k] = _json_default(v) if isinstance(v, (datetime, date, Decimal, bytes)) else v
        out.append(item)
    return out

async def perform_full_sync(logger: logging.Logger):
    """
    Pull all relevant tables from MySQL and write to local JSON files using
    the exact table names from the schema and the JSON shape used by the app.
    """
    logger.info("Starting full sync pull from MySQL into JSON files...")

    db = DatabaseConnection()
    conn = db.get_connection() if hasattr(db, "get_connection") else db
    try:
        cur = conn.cursor()

        # Products + barcodes
        products_rows = _fetch_all(cur, """
            SELECT p.id, p.name, p.price, p.stock, p.tax, p.createdAt, p.updatedAt
            FROM `Products` p
        """)
        barcode_rows = _fetch_all(cur, """
            SELECT productId, barcode
            FROM `ProductBarcodes`
        """)
        barcodes_by_pid = {}
        for r in barcode_rows:
            pid = str(r.get('productId') or '')
            if not pid:
                continue
            barcodes_by_pid.setdefault(pid, []).append(r.get('barcode'))

        products = []
        for p in products_rows:
            pid = str(p.get('id'))
            prod = dict(p)
            prod['barcodes'] = barcodes_by_pid.get(pid, [])
            products.append(prod)

        # Users
        users = _fetch_all(cur, """
            SELECT id, name, email, password, role, status, sessionDuration,
                   createdAt, updatedAt, lastLogin, lastLogout, totalSessionDuration
            FROM `Users`
        """)

        # Stores
        stores = _fetch_all(cur, """
            SELECT id, name, address, phone, status, createdAt, updatedAt
            FROM `Stores`
        """)

        # Bills and nested BillItems
        bills_rows = _fetch_all(cur, """
            SELECT id, storeId, storeName, storeAddress, customerName, customerPhone,
                   customerEmail, customerAddress, customerId, subtotal, taxPercentage,
                   taxAmount, discountPercentage, discountAmount, total, paymentMethod,
                   timestamp, notes, gstin, companyName, companyAddress, companyPhone,
                   companyEmail, billFormat, createdBy
            FROM `Bills`
        """)
        # Fetch items and group by billId
        items_rows = _fetch_all(cur, """
            SELECT id, billId, productId, productName, quantity, price, total,
                   tax, gstRate, barcodes
            FROM `BillItems`
        """)
        items_by_bill = {}
        for it in items_rows:
            bid = str(it.get('billId') or '')
            if not bid:
                continue
            # Normalize barcodes text into list if it looks like JSON/CSV
            btxt = it.get('barcodes')
            if isinstance(btxt, str):
                btxt_stripped = btxt.strip()
                if btxt_stripped.startswith('[') and btxt_stripped.endswith(']'):
                    try:
                        it['barcodes'] = json.loads(btxt_stripped)
                    except Exception:
                        pass
                elif ',' in btxt_stripped:
                    it['barcodes'] = [s.strip() for s in btxt_stripped.split(',') if s.strip()]
            items_by_bill.setdefault(bid, []).append({
                "id": it.get('id'),
                "billId": it.get('billId'),
                "productId": it.get('productId'),
                "productName": it.get('productName'),
                "quantity": it.get('quantity'),
                "price": it.get('price'),
                "total": it.get('total'),
                "tax": it.get('tax'),
                "gstRate": it.get('gstRate'),
                "barcodes": it.get('barcodes'),
            })
        bills = []
        for b in bills_rows:
            bid = str(b.get('id'))
            bill = dict(b)
            bill['items'] = items_by_bill.get(bid, [])
            bills.append(bill)

        # Notifications: map snake_case to app’s camelCase fields
        notif_rows = _fetch_all(cur, """
            SELECT id, type, notification, related_id, is_read, created_at, updated_at
            FROM `Notifications`
        """)
        notifications = []
        for n in notif_rows:
            notifications.append({
                "id": n.get('id'),
                "type": n.get('type'),
                "notification": n.get('notification'),
                "relatedId": n.get('related_id'),
                "isRead": bool(n.get('is_read') or 0),
                "createdAt": n.get('created_at'),
                "updatedAt": n.get('updated_at'),
            })

        # SystemSettings: collapse to a single dict (first row wins)
        settings_rows = _fetch_all(cur, """
            SELECT id, gstin, taxPercentage, companyName, companyAddress,
                   companyPhone, companyEmail
            FROM `SystemSettings`
            ORDER BY id ASC
        """)
        settings = {}
        if settings_rows:
            row = settings_rows[0]
            settings = {
                "id": row.get('id'),
                "gstin": row.get('gstin'),
                "taxPercentage": row.get('taxPercentage'),
                "companyName": row.get('companyName'),
                "companyAddress": row.get('companyAddress'),
                "companyPhone": row.get('companyPhone'),
                "companyEmail": row.get('companyEmail'),
            }

        # Write files
        _write_json(PRODUCTS_FILE, products)
        _write_json(USERS_FILE, users)
        _write_json(BILLS_FILE, bills)
        _write_json(NOTIFICATIONS_FILE, notifications)
        _write_json(SETTINGS_FILE, settings)
        _write_json(STORES_FILE, stores)

        logger.info(f"Wrote {len(products)} products to products.json")
        logger.info(f"Wrote {len(users)} users to users.json")
        logger.info(f"Wrote {len(bills)} bills to bills.json")
        logger.info(f"Wrote {len(notifications)} notifications to notifications.json")
        logger.info(f"Wrote {1 if settings else 0} settings row to settings.json")
        logger.info(f"Wrote {len(stores)} stores to stores.json")

    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

    logger.info("Full sync pull completed.")

async def start_sync_process(logger: logging.Logger, interval_seconds: int = 15 * 60):
    """
    Background loop to periodically refresh JSON files from MySQL.
    """
    logger.info(f"Background sync process started (interval={interval_seconds}s).")
    while True:
        try:
            await perform_full_sync(logger)
        except Exception as e:
            logger.error(f"Background sync failed: {e}")
        await asyncio.sleep(interval_seconds)
