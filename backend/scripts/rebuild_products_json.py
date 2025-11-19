import os
import sys
import json
from decimal import Decimal
from datetime import datetime, date
import traceback

# Ensure backend dir on sys.path
base_dir = os.environ.get('APP_BASE_DIR')
if not base_dir:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from utils.db import DatabaseConnection


class CustomEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super().default(obj)


def find_products_json_paths(root):
    candidates = [
        os.path.join(root, 'backend', 'data', 'json', 'products.json'),
        os.path.join(root, 'data', 'json', 'products.json'),
        os.path.join(root, 'src-tauri', 'data', 'json', 'products.json'),
    ]
    results = []
    for p in candidates:
        p_abs = os.path.abspath(p)
        if p_abs not in results:
            results.append(p_abs)
    return results


def rebuild_and_write_all():
    root = os.path.abspath(os.path.join(base_dir, '..'))
    targets = find_products_json_paths(root)

    print('Will update these products.json files:')
    for t in targets:
        print(' -', t)

    try:
        with DatabaseConnection.get_connection_ctx() as conn:
            with DatabaseConnection.get_cursor_ctx(conn, dictionary=True) as cursor:
                cursor.execute('SELECT * FROM Products')
                products = cursor.fetchall()

                cursor.execute('SELECT productId, barcode FROM ProductBarcodes')
                pbs = cursor.fetchall()

                pb_map = {}
                for r in pbs:
                    pid = r.get('productId')
                    code = r.get('barcode')
                    if pid is None:
                        continue
                    pb_map.setdefault(pid, []).append(code)

                canonical = []
                for p in products:
                    item = {}
                    for k, v in p.items():
                        if isinstance(v, Decimal):
                            item[k] = float(v)
                        elif isinstance(v, (datetime, date)):
                            item[k] = v.isoformat()
                        else:
                            item[k] = v

                    # Attach single primary barcode (first barcode) and drop barcodes list
                    barcodes = pb_map.get(item.get('id'), [])
                    if barcodes:
                        item['barcode'] = barcodes[0]
                    else:
                        item.pop('barcode', None)

                    if 'barcodes' in item:
                        item.pop('barcodes', None)

                    canonical.append(item)

        for path in targets:
            # Ensure parent exists
            parent = os.path.dirname(path)
            os.makedirs(parent, exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(canonical, f, indent=2, ensure_ascii=False, cls=CustomEncoder)
            print('Wrote', path)

        print('Rebuild complete.')

    except Exception as e:
        print('Error rebuilding products.json:', e)
        traceback.print_exc()


if __name__ == '__main__':
    rebuild_and_write_all()
