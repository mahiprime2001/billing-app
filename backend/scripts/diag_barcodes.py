import os
import sys
import json
import traceback

# Ensure `backend` directory is on sys.path so `utils` package can be imported
base_dir = os.environ.get('APP_BASE_DIR')
if not base_dir:
    # If APP_BASE_DIR not set, assume this script is in backend/scripts and add backend/
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from utils.db import DatabaseConnection


def main():
    base = os.environ.get('APP_BASE_DIR', os.getcwd())
    print(f"APP_BASE_DIR: {base}")

    # 1) Inspect barcodes in the Products table
    try:
        with DatabaseConnection.get_connection_ctx() as conn:
            with DatabaseConnection.get_cursor_ctx(conn, dictionary=True) as cursor:
                try:
                    cursor.execute("SELECT id, name, barcodes FROM Products WHERE barcodes IS NOT NULL AND barcodes != '' LIMIT 50")
                    rows = cursor.fetchall()
                    print(f"Sample Products with barcodes ({len(rows)}):")
                    for r in rows:
                        print(f"  ID: {r.get('id')}, Name: {r.get('name')}, Barcodes: {r.get('barcodes')}")
                except Exception as e:
                    print("Error selecting products with barcodes:", e)
    except Exception as e:
        print("Error connecting to DB to inspect Products table for barcodes:")
        traceback.print_exc()

    # 2) For each product in products.json, display its barcodes
    products_path = os.path.join(base, 'data', 'json', 'products.json')
    if not os.path.exists(products_path):
        print(f"Products JSON not found at {products_path}")
        return

    try:
        with open(products_path, 'r', encoding='utf-8') as f:
            products = json.load(f)
    except Exception as e:
        print("Failed to load products.json:", e)
        return

    print(f"\nLoaded {len(products)} products from products.json. Displaying barcodes:")
    for p in products:
        pid = p.get('id')
        pname = p.get('name', 'N/A')
        barcodes_str = p.get('barcodes')
        if barcodes_str:
            print(f"  Product ID: {pid}, Name: {pname}, Barcodes: {barcodes_str}")
        else:
            print(f"  Product ID: {pid}, Name: {pname}, Barcodes: (None)")


if __name__ == '__main__':
    main()
