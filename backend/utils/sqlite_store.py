"""
SQLite-backed replacement for json_helpers.py's file-based storage.

Same data model as before -- one loosely-typed JSON blob per domain (a list
of dicts for most domains, a dict for settings) -- just held as one row in a
single SQLite database instead of one loose file per domain on disk. This
only swaps out what's *underneath* json_helpers.py's get_X_data()/
save_X_data() functions; every route and service in this backend keeps
calling those exact same functions, unchanged.

What this actually fixes vs. the old per-file JSON approach:
- Atomic writes: a SQLite transaction commit is all-or-nothing. The old
  approach's tmp-file-then-os.replace() dance was already trying to get
  this property by hand; SQLite gives it natively.
- Real concurrent-access safety: WAL mode + busy_timeout means a second
  writer waits for the first to finish instead of racing it. The old
  file_write_lock.py was a single process-local lock file -- real enough
  for "don't tear a read mid-write within one process," but not real
  cross-process safety the way SQLite's own locking is.
- One file to reason about/back up instead of 24 loose JSON files (plus
  their .tmp siblings mid-write).

JSON files are left on disk, untouched, after migration -- not deleted.
They're dead weight once this is live, but keeping them costs nothing and
means there's a plain-text copy of the pre-migration data sitting right
there if anything about the SQLite path ever looks wrong.
"""
import json
import logging
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from config import Config

logger = logging.getLogger(__name__)

_DB_PATH = os.environ.get("SQLITE_STORE_FILE", os.path.join(Config.DATA_BASE_DIR, "local_store.db"))


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(_DB_PATH, timeout=5.0)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def _get_connection():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def initialize_schema() -> None:
    with _get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS json_store (
                table_name TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def get_table_data(table_name: str, default: Any) -> Any:
    try:
        with _get_connection() as conn:
            row = conn.execute(
                "SELECT payload_json FROM json_store WHERE table_name = ?", (table_name,)
            ).fetchone()
        if row is None:
            return default
        return json.loads(row["payload_json"])
    except Exception as e:
        logger.error(f"Error reading '{table_name}' from SQLite store: {e}")
        return default


def save_table_data(table_name: str, data: Any) -> bool:
    try:
        payload = json.dumps(data, ensure_ascii=False, default=str)
        with _get_connection() as conn:
            conn.execute(
                "INSERT INTO json_store (table_name, payload_json, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(table_name) DO UPDATE SET "
                "payload_json = excluded.payload_json, updated_at = excluded.updated_at",
                (table_name, payload, datetime.now(timezone.utc).isoformat()),
            )
        return True
    except Exception as e:
        logger.error(f"Failed to write '{table_name}' to SQLite store: {e}")
        return False


# table_name -> the JSON file it was previously stored as. Used only by
# migrate_json_files_if_needed() below, to seed the SQLite store with
# whatever's currently on disk the first time this runs against each table.
_JSON_MIGRATION_MAP: dict[str, str] = {
    "products": Config.PRODUCTS_FILE,
    "users": Config.USERS_FILE,
    "bills": Config.BILLS_FILE,
    "billitems": Config.BILL_ITEMS_FILE,
    "customers": Config.CUSTOMERS_FILE,
    "stores": Config.STORES_FILE,
    "batches": Config.BATCHES_FILE,
    "returns": Config.RETURNS_FILE,
    "store_damage_returns": Config.STORE_DAMAGE_RETURNS_FILE,
    "discounts": Config.DISCOUNTS_FILE,
    "notifications": Config.NOTIFICATIONS_FILE,
    "settings": Config.SETTINGS_FILE,
    "user_sessions": Config.SESSIONS_FILE,
    "userstores": Config.USERSTORES_FILE,
    "storeinventory": Config.STOREINVENTORY_FILE,
    "orders": Config.ORDERS_FILE,
    "inventory_transfer_orders": Config.INVENTORY_TRANSFER_ORDERS_FILE,
    "inventory_transfer_items": Config.INVENTORY_TRANSFER_ITEMS_FILE,
    "inventory_transfer_verifications": Config.INVENTORY_TRANSFER_VERIFICATIONS_FILE,
    "inventory_transfer_scans": Config.INVENTORY_TRANSFER_SCANS_FILE,
    "hsn_codes": Config.HSN_CODES_FILE,
    "gst_registrations": Config.GST_REGISTRATIONS_FILE,
    "store_audits": Config.STORE_AUDITS_FILE,
    "store_audit_items": Config.STORE_AUDIT_ITEMS_FILE,
}


def migrate_json_files_if_needed() -> None:
    """Seeds the SQLite store from whatever's on disk, per table, the first
    time that table is seen (i.e. it has no row yet). Safe to call on every
    startup: a table that's already been migrated is left alone even if its
    JSON file still exists, so this never clobbers post-migration writes
    with a stale on-disk snapshot."""
    initialize_schema()
    for table_name, json_path in _JSON_MIGRATION_MAP.items():
        with _get_connection() as conn:
            already_migrated = conn.execute(
                "SELECT 1 FROM json_store WHERE table_name = ?", (table_name,)
            ).fetchone()
        if already_migrated:
            continue
        if not os.path.exists(json_path):
            continue
        try:
            with open(json_path, "r", encoding="utf-8-sig") as f:
                data = json.load(f)
        except Exception as e:
            logger.error(f"Migration: failed to read {json_path} for '{table_name}': {e}")
            continue
        if save_table_data(table_name, data):
            count = len(data) if isinstance(data, list) else "dict"
            logger.info(f"Migrated '{table_name}' from {json_path} into SQLite store ({count})")
