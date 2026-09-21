// TypeScript mirror of siri-api's resilient_db.py pattern: try the network
// first, refresh the local SQLite mirror on success, fall back to the
// mirror on failure. Uses the same API_BASE + adminToken every other
// authenticated request in this app already uses (see AppProviders.tsx's
// fetch patch / app/utils/api.ts) -- API_BASE resolves straight to siri-api.
import { API_BASE } from "./api-base";
import { getDb, initializeSchema } from "./local-db";

async function authedFetch(path: string): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
  return fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export interface LocalProduct {
  id: string;
  name: string;
  price: number | null;
  selling_price: number | null;
  // Holds the *available-for-billing* stock (already computed server-side
  // as stock - storeinventory allocations by /api/local/products-for-billing)
  // -- not raw global stock. Decrementing this locally on offline bill
  // creation keeps subsequent offline creations correctly aware of reduced
  // availability.
  stock: number;
  barcode: string | null;
  hsn_code_id: string | null;
  tax: number | null;
}

export async function pullProductsForBilling(): Promise<"network" | "cache"> {
  await initializeSchema();
  try {
    const response = await authedFetch("/api/local/products-for-billing");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const products: any[] = await response.json();
    const db = await getDb();
    const now = new Date().toISOString();
    for (const p of products) {
      // Upsert, not INSERT OR REPLACE -- a REPLACE deletes+reinserts the
      // whole row, which would silently wipe global_stock (owned by
      // pullAllProducts()) back to NULL on every billing-page refresh.
      await db.execute(
        `INSERT INTO products (id, name, price, selling_price, stock, barcode, hsn_code_id, tax, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           price = excluded.price,
           selling_price = excluded.selling_price,
           stock = excluded.stock,
           barcode = excluded.barcode,
           hsn_code_id = excluded.hsn_code_id,
           tax = excluded.tax,
           synced_at = excluded.synced_at`,
        [
          p.id,
          p.name,
          p.price ?? null,
          p.sellingPrice ?? p.selling_price ?? null,
          p.stock ?? 0,
          p.barcode ?? null,
          p.hsnCodeId ?? p.hsn_code_id ?? null,
          p.tax ?? null,
          now,
        ]
      );
    }
    return "network";
  } catch {
    return "cache";
  }
}

export async function getLocalProducts(): Promise<LocalProduct[]> {
  const db = await getDb();
  return db.select<LocalProduct[]>("SELECT * FROM products ORDER BY name");
}

export async function getLocalProductById(id: string): Promise<LocalProduct | null> {
  const db = await getDb();
  const rows = await db.select<LocalProduct[]>("SELECT * FROM products WHERE id = $1", [id]);
  return rows[0] ?? null;
}

// Full-catalog pull for the Products admin page -- paginated against
// /api/products/page (page_size confirmed against hooks/useIncrementalProducts.ts),
// separate from pullProductsForBilling() above because the two endpoints
// disagree on what `stock` means: this one is raw global stock, billing's is
// already availability-adjusted. Writing raw stock into the same `stock`
// column bill-creation.ts depends on would silently break its stock check --
// instead this writes into the additive `global_stock` column, and uses an
// upsert (not INSERT OR REPLACE) so it never clobbers the `stock` value the
// billing pull owns, or vice versa.
export async function pullAllProducts(): Promise<"network" | "cache"> {
  await initializeSchema();
  try {
    const db = await getDb();
    // siri-api caps page_size at 1000 server-side -- use its actual max so
    // this needs half as many round trips as 500 would (fewer requests
    // competing with the Products page's own on-screen incremental loader,
    // which hits this same endpoint independently).
    const pageSize = 1000;
    let page = 1;
    const now = new Date().toISOString();
    // Safety cap mirrors the pagination caps siri-api itself uses internally.
    while (page <= 500) {
      const response = await authedFetch(`/api/products/page?page=${page}&page_size=${pageSize}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const rows: any[] = Array.isArray(payload?.data) ? payload.data : [];
      for (const p of rows) {
        await db.execute(
          `INSERT INTO products (id, name, price, selling_price, global_stock, barcode, hsn_code_id, tax, stock, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             price = excluded.price,
             selling_price = excluded.selling_price,
             global_stock = excluded.global_stock,
             barcode = excluded.barcode,
             hsn_code_id = excluded.hsn_code_id,
             tax = excluded.tax`,
          [
            p.id,
            p.name,
            p.price ?? null,
            p.sellingPrice ?? p.selling_price ?? null,
            p.globalStock ?? p.stock ?? 0,
            p.barcode ?? null,
            p.hsnCode ?? p.hsn_code_id ?? null,
            p.tax ?? null,
            now,
          ]
        );
      }
      if (!payload?.hasMore || rows.length === 0) break;
      page += 1;
    }
    return "network";
  } catch {
    return "cache";
  }
}

// Matches the exact fallback chain app/dashboard/billing/page.tsx already
// uses when loading settings: settings.taxPercentage || settings.tax_percentage || 0
export async function pullTaxPercentage(): Promise<"network" | "cache"> {
  await initializeSchema();
  try {
    const response = await authedFetch("/api/settings");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const settings = await response.json();
    const taxPercentage = Number(settings?.taxPercentage ?? settings?.tax_percentage ?? 0);
    const db = await getDb();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT OR REPLACE INTO local_settings (key, value, synced_at) VALUES ('taxPercentage', $1, $2)`,
      [String(taxPercentage), now]
    );
    return "network";
  } catch {
    return "cache";
  }
}

export async function getLocalTaxPercentage(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM local_settings WHERE key = 'taxPercentage'"
  );
  return rows.length > 0 ? Number(rows[0].value) : 0;
}

export interface LocalStore {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  storecode: string;
  status: string;
  gst_registration_id: string | null;
  createdat: string | null;
  updatedat: string | null;
  sync_status: string;
  synced_at: string | null;
}

export async function pullAllStores(): Promise<"network" | "cache"> {
  await initializeSchema();
  try {
    const response = await authedFetch("/api/stores");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rows: any[] = Array.isArray(payload) ? payload : payload?.data ?? [];
    const db = await getDb();
    const now = new Date().toISOString();
    for (const s of rows) {
      // WHERE guard: a store with a not-yet-synced local edit (sync_status
      // = 'pending') must not be silently overwritten by a periodic refresh
      // pulling the OLD server copy -- that would discard the pending edit
      // before it ever gets a chance to sync.
      await db.execute(
        `INSERT INTO stores (id, name, address, phone, storecode, status, gst_registration_id, createdat, updatedat, sync_status, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'synced', $10)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           address = excluded.address,
           phone = excluded.phone,
           storecode = excluded.storecode,
           status = excluded.status,
           gst_registration_id = excluded.gst_registration_id,
           createdat = excluded.createdat,
           updatedat = excluded.updatedat,
           sync_status = 'synced',
           synced_at = excluded.synced_at
         WHERE stores.sync_status != 'pending'`,
        [
          s.id,
          s.name,
          s.address ?? null,
          s.phone ?? null,
          s.storecode ?? s.storeCode ?? "",
          s.status ?? "active",
          s.gstRegistrationId ?? s.gst_registration_id ?? null,
          s.createdat ?? s.createdAt ?? null,
          s.updatedat ?? s.updatedAt ?? null,
          now,
        ]
      );
    }
    return "network";
  } catch {
    return "cache";
  }
}

export async function getLocalStores(): Promise<LocalStore[]> {
  const db = await getDb();
  return db.select<LocalStore[]>("SELECT * FROM stores ORDER BY name");
}

export async function getLocalStoreById(id: string): Promise<LocalStore | null> {
  const db = await getDb();
  const rows = await db.select<LocalStore[]>("SELECT * FROM stores WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export interface LocalCustomer {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdat: string | null;
  updatedat: string | null;
  synced_at: string;
}

// Pure read mirror -- no offline create/edit flow for customers yet, only
// viewing. Hits the same /api/supabase/customers endpoint billing/page.tsx's
// own network path already uses.
export async function pullAllCustomers(): Promise<"network" | "cache"> {
  await initializeSchema();
  try {
    const response = await authedFetch("/api/supabase/customers");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows: any[] = await response.json();
    const db = await getDb();
    const now = new Date().toISOString();
    for (const c of Array.isArray(rows) ? rows : []) {
      if (!c?.id) continue;
      await db.execute(
        `INSERT INTO customers (id, name, email, phone, address, createdat, updatedat, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           email = excluded.email,
           phone = excluded.phone,
           address = excluded.address,
           createdat = excluded.createdat,
           updatedat = excluded.updatedat,
           synced_at = excluded.synced_at`,
        [
          c.id,
          c.name ?? null,
          c.email ?? null,
          c.phone ?? null,
          c.address ?? null,
          c.createdAt ?? c.createdat ?? null,
          c.updatedAt ?? c.updatedat ?? null,
          now,
        ]
      );
    }
    return "network";
  } catch {
    return "cache";
  }
}

export async function getLocalCustomers(): Promise<LocalCustomer[]> {
  const db = await getDb();
  return db.select<LocalCustomer[]>("SELECT * FROM customers ORDER BY name");
}

export interface LocalUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  synced_at: string;
}

export async function pullAllUsers(): Promise<"network" | "cache"> {
  await initializeSchema();
  try {
    const response = await authedFetch("/api/users");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rows: any[] = Array.isArray(payload) ? payload : payload?.data ?? [];
    const db = await getDb();
    const now = new Date().toISOString();
    for (const u of rows) {
      if (!u?.id) continue;
      await db.execute(
        `INSERT INTO users (id, name, email, role, status, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           email = excluded.email,
           role = excluded.role,
           status = excluded.status,
           synced_at = excluded.synced_at`,
        [u.id, u.name ?? null, u.email ?? null, u.role ?? null, u.status ?? null, now]
      );
    }
    return "network";
  } catch {
    return "cache";
  }
}

export async function getLocalUsers(): Promise<LocalUser[]> {
  const db = await getDb();
  return db.select<LocalUser[]>("SELECT * FROM users ORDER BY name");
}

export interface LocalBillMirror {
  id: string;
  store_id: string;
  customer_id: string | null;
  user_id: string | null;
  subtotal: number;
  discount_amount: number;
  discount_percentage: number;
  tax: number;
  tax_percentage: number;
  total: number;
  payment_method: string;
  status: string;
  timestamp: string;
  created_at: string;
  sync_status: string;
  synced_bill_id: string | null;
}

// Bounded to a recent window, not the full unbounded history -- "see recent
// activity while offline" is the realistic need; mirroring years of billing
// history would mean thousands of extra local writes on every refresh for
// marginal value. Reuses the SAME bills/billitems tables the offline
// bill-creation flow (lib/bill-creation.ts) writes into, distinguished by
// sync_status, same convention as pullAllStores().
const RECENT_BILLS_PAGE_CAP = 10;
const RECENT_BILLS_PAGE_SIZE = 200;

export async function pullRecentBills(): Promise<"network" | "cache"> {
  await initializeSchema();
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    let page = 1;
    let requestSucceeded = false;

    while (page <= RECENT_BILLS_PAGE_CAP) {
      const response = await authedFetch(
        `/api/bills?paginate=1&page=${page}&pageSize=${RECENT_BILLS_PAGE_SIZE}&details=1`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      requestSucceeded = true;
      const rows: any[] = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      if (rows.length === 0) break;

      for (const b of rows) {
        const billId = b.id;
        if (!billId) continue;

        // A bill still waiting to sync FROM this device can't be in the
        // server's response yet, but check anyway rather than assume --
        // never let a background pull clobber a not-yet-synced local bill.
        const existing = await db.select<{ sync_status: string }[]>(
          "SELECT sync_status FROM bills WHERE id = $1",
          [billId]
        );
        if (existing[0]?.sync_status === "pending") continue;

        await db.execute(
          `INSERT INTO bills (id, store_id, customer_id, user_id, subtotal, discount_amount, discount_percentage, tax, tax_percentage, total, payment_method, status, timestamp, created_at, sync_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, 'synced')
           ON CONFLICT(id) DO UPDATE SET
             store_id = excluded.store_id,
             customer_id = excluded.customer_id,
             user_id = excluded.user_id,
             subtotal = excluded.subtotal,
             discount_amount = excluded.discount_amount,
             discount_percentage = excluded.discount_percentage,
             tax = excluded.tax,
             tax_percentage = excluded.tax_percentage,
             total = excluded.total,
             payment_method = excluded.payment_method,
             status = excluded.status,
             timestamp = excluded.timestamp,
             sync_status = 'synced'
           WHERE bills.sync_status != 'pending'`,
          [
            billId,
            b.storeId ?? b.storeid ?? "",
            b.customerId ?? b.customerid ?? null,
            b.userId ?? b.userid ?? null,
            Number(b.subtotal ?? 0),
            Number(b.discountAmount ?? b.discount_amount ?? 0),
            Number(b.discountPercentage ?? b.discount_percentage ?? 0),
            Number(b.tax ?? 0),
            Number(b.taxPercentage ?? b.tax_percentage ?? 0),
            Number(b.total ?? 0),
            b.paymentMethod ?? b.payment_method ?? b.paymentmethod ?? "cash",
            b.status ?? "completed",
            b.timestamp ?? b.date ?? now,
          ]
        );

        await db.execute("DELETE FROM billitems WHERE bill_id = $1", [billId]);
        const items = Array.isArray(b.items) ? b.items : [];
        for (const item of items) {
          await db.execute(
            `INSERT INTO billitems (bill_id, product_id, product_name, quantity, price, total, hsn_code, tax_percentage)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              billId,
              item.productId ?? item.productid ?? "",
              item.productName ?? item.productname ?? null,
              Number(item.quantity ?? 0),
              Number(item.price ?? 0),
              Number(item.total ?? 0),
              item.hsnCode ?? item.hsn_code ?? null,
              item.taxPercentage ?? item.tax_percentage ?? null,
            ]
          );
        }
      }

      if (!payload?.hasMore) break;
      page += 1;
    }

    return requestSucceeded ? "network" : "cache";
  } catch {
    return "cache";
  }
}

export async function getLocalBills(): Promise<LocalBillMirror[]> {
  const db = await getDb();
  return db.select<LocalBillMirror[]>("SELECT * FROM bills ORDER BY created_at DESC");
}

export async function getLocalBillItems(billId: string): Promise<any[]> {
  const db = await getDb();
  return db.select<any[]>("SELECT * FROM billitems WHERE bill_id = $1", [billId]);
}
