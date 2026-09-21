// Local SQLite offline database (tauri-plugin-sql, registered desktop-only
// in src-tauri/src/main.rs). Schema grows one domain at a time as each is
// migrated off the Flask sidecar -- bills is the first real domain (the
// actual point of "offline mode": a store must be able to bill with no
// internet). See lib/resilient-client.ts and lib/bill-creation.ts.
import Database from "@tauri-apps/plugin-sql";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      // A bare "sqlite:siri_local.db" connection string resolves relative
      // to Tauri's app_config_dir (AppData\Roaming\<identifier> on Windows)
      // -- the plugin hardcodes that internally (see wrapper.rs::path_mapper).
      // An ABSOLUTE path bypasses that entirely (PathBuf::push replaces the
      // base on an absolute path), which is what lets the DB live next to
      // the installed exe instead, as requested.
      //
      // NOTE: the path plugin's own executableDir() is NOT "directory of the
      // running exe" -- it's the XDG "user executable dir" concept and is
      // explicitly unsupported on Windows (rejects there). get_exe_dir is a
      // real std::env::current_exe()-backed command in main.rs instead.
      const dir = await invoke<string>("get_exe_dir");
      const dbPath = await join(dir, "siri_local.db");
      return Database.load(`sqlite:${dbPath}`);
    })();
  }
  return dbPromise;
}

// tauri-plugin-sql's execute() prepares exactly one statement at a time
// (sqlx::query() under the hood, no multi-statement batching) -- each
// CREATE must be its own execute() call, not one combined ;-separated string.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS _phase2_proof (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // Mirrors, refreshed opportunistically whenever a resilient read
  // succeeds against the live backend (see resilient-client.ts).
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price REAL,
    selling_price REAL,
    stock REAL NOT NULL DEFAULT 0,
    barcode TEXT,
    hsn_code_id TEXT,
    tax REAL,
    synced_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`,

  `CREATE TABLE IF NOT EXISTS storeinventory (
    id TEXT PRIMARY KEY,
    storeid TEXT NOT NULL,
    productid TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    synced_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_storeinventory_product ON storeinventory(productid)`,

  // Generic key/value mirror -- only taxPercentage is read today, kept
  // generic so other flat settings can reuse this without a schema change.
  `CREATE TABLE IF NOT EXISTS local_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    synced_at TEXT NOT NULL
  )`,

  // Local-primary: this is where an offline-created bill actually lives
  // until it's synced. tax/tax_percentage are persisted here even though
  // the old Python backend silently dropped them -- the client already
  // sends this data, no reason to keep discarding it.
  `CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    customer_id TEXT,
    user_id TEXT,
    subtotal REAL NOT NULL,
    discount_amount REAL NOT NULL DEFAULT 0,
    discount_percentage REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    tax_percentage REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    status TEXT NOT NULL DEFAULT 'completed',
    timestamp TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    -- Filled in by lib/sync-processor.ts once this bill syncs. siri-api's
    -- POST /api/bills always assigns its own invoice id server-side (the
    -- unchanged super_admin path has no client-supplied-id support), so a
    -- synced bill's real id can differ from the offline id above -- this
    -- column makes that visible instead of hiding it.
    synced_bill_id TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bills_store_created ON bills(store_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_bills_sync_status ON bills(sync_status)`,

  `CREATE TABLE IF NOT EXISTS billitems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL,
    hsn_code TEXT,
    tax_percentage REAL,
    FOREIGN KEY (bill_id) REFERENCES bills(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_billitems_bill ON billitems(bill_id)`,

  // Same shape as siri-api's proven offline_queue_items (queue_common.py):
  // transient failures retry forever and reset the streak, only 5
  // CONSECUTIVE permanent failures quarantine, nothing's ever deleted.
  `CREATE TABLE IF NOT EXISTS sync_queue (
    queue_id TEXT PRIMARY KEY,
    queue_type TEXT NOT NULL,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    consecutive_permanent_failures INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    last_error_class TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    quarantined_at TEXT,
    quarantine_reason TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_type_status ON sync_queue(queue_type, status)`,

  // Stores: one table, not a mirror+shadow split like products/bills --
  // Stores is low-volume/low-write-frequency, so sync_status alone ('synced'
  // for pulled rows, 'pending' for a not-yet-synced local create/edit) is
  // enough to distinguish origin without the bookkeeping of a second table.
  // No `manager` column on purpose: siri-api's create_store silently drops
  // it server-side, so storing it locally would just be a field that lies
  // about being persisted.
  `CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    storecode TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    gst_registration_id TEXT,
    createdat TEXT,
    updatedat TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    synced_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_stores_storecode ON stores(storecode)`,

  // Customers: pure read mirror (no offline-create/edit flow for customers
  // yet), same shape convention as stores.
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    createdat TEXT,
    updatedat TEXT,
    synced_at TEXT NOT NULL
  )`,

  // Users: pure read mirror, small dataset, used to resolve names elsewhere
  // (e.g. Discounts' approver display) as well as its own page.
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    role TEXT,
    status TEXT,
    synced_at TEXT NOT NULL
  )`,

  // Generic response cache for pages whose data doesn't need to be
  // queryable/joinable locally -- see lib/api-cache.ts. cache_key is the
  // exact request path+query, so different filter/pagination combinations
  // for the same endpoint are cached independently.
  `CREATE TABLE IF NOT EXISTS api_read_cache (
    cache_key TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    cached_at TEXT NOT NULL
  )`,
]

let schemaReady: Promise<void> | null = null;

export function initializeSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = await getDb();
      for (const statement of SCHEMA_STATEMENTS) {
        await db.execute(statement);
      }
      // Best-effort migration for DBs created before synced_bill_id existed
      // -- CREATE TABLE IF NOT EXISTS above won't add it to an already-
      // created bills table. Swallowed on purpose: fails harmlessly with
      // "duplicate column" once the column is already there.
      try {
        await db.execute("ALTER TABLE bills ADD COLUMN synced_bill_id TEXT");
      } catch {
        // already migrated
      }
      // products.stock is already spoken for -- pullProductsForBilling()
      // writes the billing-AVAILABLE number there (server-computed as
      // stock - storeinventory allocations), and bill-creation.ts's stock
      // check already depends on that exact meaning. global_stock is a
      // separate, additive column for the RAW global stock number (used by
      // the Products admin page + future stock math), so the two pull
      // functions never fight over what one column means.
      try {
        await db.execute("ALTER TABLE products ADD COLUMN global_stock REAL");
      } catch {
        // already migrated
      }
    })();
  }
  return schemaReady;
}

export async function runSqlProof(): Promise<{ id: number; message: string; created_at: string }[]> {
  await initializeSchema();
  const db = await getDb();

  await db.execute("INSERT INTO _phase2_proof (message) VALUES ($1)", [
    `SQL plugin proof write at ${new Date().toISOString()}`,
  ]);

  return await db.select<{ id: number; message: string; created_at: string }[]>(
    "SELECT id, message, created_at FROM _phase2_proof ORDER BY id DESC LIMIT 5"
  );
}
