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

    # 1) Count ProductBarcodes rows and show a sample
    try:
        with DatabaseConnection.get_connection_ctx() as conn:
            with DatabaseConnection.get_cursor_ctx(conn, dictionary=True) as cursor:
                try:
                    cursor.execute("SELECT COUNT(*) AS cnt FROM ProductBarcodes")
                    cnt_row = cursor.fetchone()
                    print("ProductBarcodes count:", cnt_row.get('cnt') if cnt_row else 'unknown')
                except Exception as e:
                    print("Error counting ProductBarcodes:", e)

                try:
                    cursor.execute("SELECT id, productId, barcode FROM ProductBarcodes LIMIT 50")
                    rows = cursor.fetchall()
                    print(f"Sample ProductBarcodes rows ({len(rows)}):")
                    for r in rows:
                        print(r)
                except Exception as e:
                    print("Error selecting ProductBarcodes rows:", e)
    except Exception as e:
        print("Error connecting to DB to inspect ProductBarcodes:")
        traceback.print_exc()

    # 2) For each product in products.json, call get_product_barcodes
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

    print(f"Loaded {len(products)} products from products.json")
    for p in products:
        pid = p.get('id')
        try:
            b = DatabaseConnection.get_product_barcodes(pid)
            print(f"Product id={pid} -> barcodes={b}")
        except Exception as e:
            print(f"Error calling get_product_barcodes for {pid}: {e}")
            traceback.print_exc()


if __name__ == '__main__':
    main()
