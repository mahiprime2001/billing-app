// Offline create/edit for the Products admin page -- same shape as
// lib/bill-creation.ts: serialize through withLock, write the local mirror
// row immediately (so the UI isn't stuck showing stale data while offline),
// then queue a sync_queue row for lib/sync-processor.ts to replay once back
// online.
import { getDb } from "./local-db";
import { withLock } from "./async-lock";
import { getLocalProductById } from "./resilient-client";

export interface ProductWriteInput {
  name: string;
  price: number;
  stock: number;
  sellingPrice?: number;
  barcode?: string; // already comma-joined by the caller, matches products/page.tsx's payload shape
  batchid?: string;
  hsnCode?: string;
}

export interface ProductWriteResult {
  success: boolean;
  productId?: string;
  error?: string;
}

export async function createProductOffline(input: ProductWriteInput): Promise<ProductWriteResult> {
  return withLock("product-write", async () => {
    if (!input.name || input.price == null || input.price < 0) {
      return { success: false, error: "Invalid product data" };
    }
    const db = await getDb();
    const productId = `LOCAL-PROD-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO products (id, name, price, selling_price, stock, global_stock, barcode, hsn_code_id, tax, synced_at)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7, NULL, $8)`,
      [productId, input.name, input.price, input.sellingPrice ?? 0, input.stock, input.barcode ?? "", input.hsnCode ?? null, now]
    );

    const queueId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO sync_queue (queue_id, queue_type, table_name, operation, payload_json, status, attempts, consecutive_permanent_failures, created_at, updated_at)
       VALUES ($1, 'products', 'products', 'insert', $2, 'pending', 0, 0, $3, $3)`,
      [queueId, JSON.stringify({ localId: productId, ...input }), now]
    );

    return { success: true, productId };
  });
}

export async function updateProductOffline(
  id: string,
  input: Partial<ProductWriteInput>
): Promise<ProductWriteResult> {
  return withLock("product-write", async () => {
    const existing = await getLocalProductById(id);
    if (!existing) {
      return { success: false, error: `Product ${id} not found locally` };
    }
    const db = await getDb();
    const now = new Date().toISOString();

    const name = input.name ?? existing.name;
    const price = input.price ?? existing.price ?? 0;
    const sellingPrice = input.sellingPrice ?? existing.selling_price ?? 0;
    const stock = input.stock ?? existing.stock;
    const barcode = input.barcode ?? existing.barcode ?? "";
    const hsnCode = input.hsnCode ?? existing.hsn_code_id ?? null;

    await db.execute(
      `UPDATE products SET name = $1, price = $2, selling_price = $3, stock = $4, barcode = $5, hsn_code_id = $6, synced_at = $7 WHERE id = $8`,
      [name, price, sellingPrice, stock, barcode, hsnCode, now, id]
    );

    const queueId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO sync_queue (queue_id, queue_type, table_name, operation, payload_json, status, attempts, consecutive_permanent_failures, created_at, updated_at)
       VALUES ($1, 'products', 'products', 'update', $2, 'pending', 0, 0, $3, $3)`,
      [queueId, JSON.stringify({ id, ...input }), now]
    );

    return { success: true, productId: id };
  });
}
