import json
import os
from datetime import datetime, timedelta

# Assuming BASE_DIR is the root of your project
# Adjust this path if your script is not in backend/scripts
BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SYNC_TABLE_FILE = os.path.join(BASE_DIR, 'backend', 'data', 'json', 'sync_table.json')
STORES_FILE = os.path.join(BASE_DIR, 'backend', 'data', 'json', 'stores.json')

def _safe_json_load(filepath, default_value=None):
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f'Error decoding JSON from {filepath}. Returning default value.')
            # Optionally, back up the corrupted file and create a new empty one
            # os.rename(filepath, filepath + '.bak')
            # _safe_json_dump(filepath, default_value if default_value is not None else [])
    return default_value if default_value is not None else []

def _safe_json_dump(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def get_sync_table_data():
    return _safe_json_load(SYNC_TABLE_FILE, [])

def save_sync_table_data(data):
    _safe_json_dump(SYNC_TABLE_FILE, data)

def get_stores_data():
    return _safe_json_load(STORES_FILE, [])

def clean_orphaned_sync_entries():
    deleted_users_ids = [
        '078b829d-9ef9-4271-8431-b8438409f7c4',
        'fcda9e06-0d39-43bd-ae90-e44b96f4b5a5',
        'edd52b96-e309-48eb-82a8-bb8b60e891ea',
        'ea333da9-113e-44db-a890-cca795591757',
        '5a030a5f-0ff8-42a3-b2a2-83f5b0323c36',
        '63f19d62-342d-4406-844d-150bfd5f56c4',
        '3be750ac-973b-476c-8653-3cec4d5e228c',
        'e4ecb647-0ee0-4ef3-a297-95ea98a7e39a'
    ]

    sync_table = get_sync_table_data()
    stores = get_stores_data()

    if not stores:
        print('No stores data found. Cannot determine record_ids for UserStores cleanup.')
        return

    store_ids = [store['id'] for store in stores]

    records_to_delete = set()
    for user_id in deleted_users_ids:
        for store_id in store_ids:
            records_to_delete.add(f'{user_id}-{store_id}')

    initial_count = len(sync_table)
    new_sync_table = [
        entry for entry in sync_table
        if not (
            entry.get('table_name', '').lower() in ('userstores', 'userstores') and
            entry.get('operation_type', '') == 'CREATE' and
            entry.get('record_id') in records_to_delete
        )
    ]

    if len(new_sync_table) < initial_count:
        save_sync_table_data(new_sync_table)
        print(f'Removed {initial_count - len(new_sync_table)} orphaned UserStores entries from sync_table.json.')
    else:
        print('No orphaned UserStores entries found to delete.')

if __name__ == '__main__':
    clean_orphaned_sync_entries()
