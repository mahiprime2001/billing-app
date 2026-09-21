// Drains billing-app's local sync_queue -- bills created offline via
// lib/bill-creation.ts get pushed to siri-api here once connectivity
// returns. Mirrors siri-api's own offline queue processor
// (services/queue_processor.py): transient failures just get retried on
// the next drain, nothing is ever deleted, only synced/left-pending.
//
// KNOWN LIMITATION (disclosed, not silently papered over): siri-api's
// POST /api/bills (the unchanged super_admin path -- see routes/bills.py)
// always generates its own invoice id server-side; it does not honor a
// client-supplied id the way Siri-billing-app's create_bill_transaction's
// forced_bill_id does. So a bill created offline may sync under a
// DIFFERENT invoice number than the one shown/printed while offline.
// Fixing that would mean changing the super_admin path, which this phase
// deliberately leaves byte-for-byte untouched. The synced id is recorded
// in bills.synced_bill_id so the mismatch is at least visible locally.
import { getDb } from "./local-db";
import { withLock } from "./async-lock";
import { API_BASE } from "./api-base";

interface SyncQueueRow {
  queue_id: string;
  queue_type: string;
  table_name: string;
  operation: string;
  payload_json: string;
  status: string;
  attempts: number;
}

async function authedPost(path: string, body: unknown): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function authedPut(path: string, body: unknown): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
  return fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function replayBillQueueItem(row: SyncQueueRow): Promise<void> {
  const db = await getDb();
  const payload = JSON.parse(row.payload_json) as Record<string, any>;
  const { billId, storeCode, items, ...rest } = payload;

  const replayItems = (items || []).map((item: any) => ({
    productId: item.productId,
    productName: item.productName,
    price: item.price,
    quantity: item.quantity,
    total: Math.round(item.quantity * item.price * 100) / 100,
    hsnCode: item.hsnCode,
    taxPercentage: item.taxPercentage,
  }));

  const response = await authedPost("/api/bills", { ...rest, items: replayItems });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json().catch(() => ({} as any));
  const syncedBillId = data?.id || billId;

  await db.execute(
    "UPDATE bills SET sync_status = 'synced', synced_bill_id = $1 WHERE id = $2",
    [syncedBillId, billId]
  );
}

async function replayProductQueueItem(row: SyncQueueRow): Promise<void> {
  const db = await getDb();
  const payload = JSON.parse(row.payload_json) as Record<string, any>;

  if (row.operation === "insert") {
    const { localId, ...body } = payload;
    const response = await authedPost("/api/products", body);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json().catch(() => ({} as any));
    const realId = data?.id;
    if (realId && realId !== localId) {
      // Re-key the mirror row from its LOCAL-PROD-... placeholder to the real server id.
      await db.execute("UPDATE products SET id = $1 WHERE id = $2", [realId, localId]);
    }
  } else if (row.operation === "update") {
    const { id, ...body } = payload;
    const response = await authedPut(`/api/products/${id}`, body);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }
}

async function replayStoreQueueItem(row: SyncQueueRow): Promise<void> {
  const db = await getDb();
  const payload = JSON.parse(row.payload_json) as Record<string, any>;

  if (row.operation === "insert") {
    const { localId, ...body } = payload;
    const response = await authedPost("/api/stores", body);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json().catch(() => ({} as any));
    const realId = data?.id;
    const now = new Date().toISOString();
    if (realId && realId !== localId) {
      await db.execute(
        "UPDATE stores SET id = $1, sync_status = 'synced', synced_at = $2 WHERE id = $3",
        [realId, now, localId]
      );
    } else {
      await db.execute(
        "UPDATE stores SET sync_status = 'synced', synced_at = $1 WHERE id = $2",
        [now, localId]
      );
    }
  } else if (row.operation === "update") {
    const { id, ...body } = payload;
    const response = await authedPut(`/api/stores/${id}`, body);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await db.execute(
      "UPDATE stores SET sync_status = 'synced', synced_at = $1 WHERE id = $2",
      [new Date().toISOString(), id]
    );
  }
}

const REPLAY_HANDLERS: Record<string, (row: SyncQueueRow) => Promise<void>> = {
  bills: replayBillQueueItem,
  products: replayProductQueueItem,
  stores: replayStoreQueueItem,
};

export async function processSyncQueue(): Promise<{ processed: number; failed: number }> {
  return withLock("sync-queue-drain", async () => {
    const db = await getDb();
    const rows = await db.select<SyncQueueRow[]>(
      "SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 20"
    );

    let processed = 0;
    let failed = 0;
    const now = new Date().toISOString();

    for (const row of rows) {
      const handler = REPLAY_HANDLERS[row.queue_type];
      try {
        if (!handler) {
          // Unknown queue_type -- mark failed with a clear reason rather
          // than silently marking it synced without ever replaying it.
          throw new Error(`Unknown queue_type: ${row.queue_type}`);
        }
        await handler(row);
        await db.execute(
          "UPDATE sync_queue SET status = 'synced', updated_at = $1 WHERE queue_id = $2",
          [now, row.queue_id]
        );
        processed++;
      } catch (err) {
        failed++;
        await db.execute(
          "UPDATE sync_queue SET attempts = attempts + 1, last_error = $1, updated_at = $2 WHERE queue_id = $3",
          [String(err), now, row.queue_id]
        );
      }
    }

    return { processed, failed };
  });
}

let loopHandle: ReturnType<typeof setInterval> | null = null;

// Call once (e.g. on the billing page mount) and call the returned cleanup
// on unmount. Safe to call multiple times -- reuses the single interval.
export function startSyncQueueLoop(intervalMs = 15000): () => void {
  if (typeof window === "undefined") return () => {};

  const run = () => {
    if (navigator.onLine) {
      processSyncQueue().catch(() => {});
    }
  };

  run();
  if (!loopHandle) {
    loopHandle = setInterval(run, intervalMs);
  }
  window.addEventListener("online", run);

  return () => {
    window.removeEventListener("online", run);
  };
}
