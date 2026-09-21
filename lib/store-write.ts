// Offline create/edit for the Stores admin page -- same shape as
// lib/product-write.ts / lib/bill-creation.ts.
//
// Validation deliberately stays light, matching what's actually knowable
// offline: storecode is passed through as-is (confirmed siri-api's
// create_store does no case normalization -- uppercasing is a client-side
// form convention only), and gst_registration_id is checked for presence
// but NOT existence -- the server's own check is itself best-effort (it
// logs a warning and proceeds if the verification call fails rather than
// blocking), so a client-side approximation is consistent with that, and a
// genuinely invalid id will be caught and surfaced when the queued write
// syncs.
import { getDb } from "./local-db";
import { withLock } from "./async-lock";
import { getLocalStoreById } from "./resilient-client";

export interface StoreWriteInput {
  name: string;
  address?: string;
  phone?: string;
  storecode: string;
  status?: string;
  gstRegistrationId: string;
}

export interface StoreWriteResult {
  success: boolean;
  storeId?: string;
  error?: string;
}

export async function createStoreOffline(input: StoreWriteInput): Promise<StoreWriteResult> {
  return withLock("store-write", async () => {
    if (!input.name || !input.storecode) {
      return { success: false, error: "Store name and store code are required" };
    }
    if (!input.gstRegistrationId) {
      return { success: false, error: "GST registration is required" };
    }
    const db = await getDb();
    const storeId = `LOCAL-STORE-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO stores (id, name, address, phone, storecode, status, gst_registration_id, createdat, updatedat, sync_status, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, 'pending', NULL)`,
      [
        storeId,
        input.name,
        input.address ?? null,
        input.phone ?? null,
        input.storecode,
        input.status ?? "active",
        input.gstRegistrationId,
        now,
      ]
    );

    const queueId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO sync_queue (queue_id, queue_type, table_name, operation, payload_json, status, attempts, consecutive_permanent_failures, created_at, updated_at)
       VALUES ($1, 'stores', 'stores', 'insert', $2, 'pending', 0, 0, $3, $3)`,
      [queueId, JSON.stringify({ localId: storeId, ...input }), now]
    );

    return { success: true, storeId };
  });
}

export async function updateStoreOffline(
  id: string,
  input: Partial<StoreWriteInput>
): Promise<StoreWriteResult> {
  return withLock("store-write", async () => {
    const existing = await getLocalStoreById(id);
    if (!existing) {
      return { success: false, error: `Store ${id} not found locally` };
    }
    const db = await getDb();
    const now = new Date().toISOString();

    const name = input.name ?? existing.name;
    const address = input.address ?? existing.address ?? null;
    const phone = input.phone ?? existing.phone ?? null;
    const storecode = input.storecode ?? existing.storecode;
    const status = input.status ?? existing.status;
    const gstRegistrationId = input.gstRegistrationId ?? existing.gst_registration_id ?? null;

    await db.execute(
      `UPDATE stores SET name = $1, address = $2, phone = $3, storecode = $4, status = $5, gst_registration_id = $6, updatedat = $7, sync_status = 'pending' WHERE id = $8`,
      [name, address, phone, storecode, status, gstRegistrationId, now, id]
    );

    const queueId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO sync_queue (queue_id, queue_type, table_name, operation, payload_json, status, attempts, consecutive_permanent_failures, created_at, updated_at)
       VALUES ($1, 'stores', 'stores', 'update', $2, 'pending', 0, 0, $3, $3)`,
      [queueId, JSON.stringify({ id, ...input }), now]
    );

    return { success: true, storeId: id };
  });
}
