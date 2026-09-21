// Offline bill creation -- the actual point of "offline mode": a store
// must be able to bill with no internet. Ported from
// billing-app/backend/services/bills_service.py's create_bill and its
// invoice-numbering helpers, faithfully for the business logic, with two
// deliberate fixes (per an explicit decision, not a default):
//
// 1. The original has no locking around invoice-number generation + stock
//    decrement, so two concurrent checkouts can produce duplicate invoice
//    numbers or oversell stock. Fixed here with an application-level lock
//    (see async-lock.ts) around the whole critical section -- tauri-plugin-sql
//    doesn't expose a real cross-call transaction, so this is the correct
//    fix for a single desktop process, not a DB-level transaction.
// 2. The original trusts client-sent subtotal/discountAmount/tax/total
//    verbatim with no server-side recomputation. This version recomputes
//    and validates them against the actual line items and the current tax
//    rate, rejecting on mismatch (with an epsilon tolerance, since the
//    original calculation -- app/dashboard/billing/page.tsx's
//    calculateTotals() -- never rounds).
//
// Replacement/exchange bills use a completely different total formula (not
// this one) and are explicitly out of scope for this phase -- total
// validation is skipped for them, not misapplied.
import { getDb } from "./local-db";
import { withLock } from "./async-lock";
import { getLocalProductById, getLocalTaxPercentage } from "./resilient-client";

const INVOICE_ID_REGEX = /^INV-([A-Z0-9]+)-(\d{8})(\d{4})$/;
const EPSILON = 0.01;

function getISTDateParts(): { day: string; month: string; year: string } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const parts = formatter.formatToParts(new Date());
  return {
    day: parts.find((p) => p.type === "day")!.value,
    month: parts.find((p) => p.type === "month")!.value,
    year: parts.find((p) => p.type === "year")!.value,
  };
}

function getTodayInvoicePrefix(storeCode: string): string {
  const { day, month, year } = getISTDateParts();
  return `INV-${storeCode}-${day}${month}${year}`;
}

function extractSerialForPrefix(invoiceId: string, prefix: string): number {
  if (!invoiceId || !invoiceId.startsWith(prefix)) return 0;
  const match = INVOICE_ID_REGEX.exec(invoiceId);
  if (!match) return 0;
  const serial = parseInt(match[3], 10);
  return Number.isNaN(serial) ? 0 : serial;
}

async function generateDailyInvoiceId(storeId: string, storeCode: string): Promise<string> {
  const prefix = getTodayInvoicePrefix(storeCode);
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    "SELECT id FROM bills WHERE store_id = $1 AND id LIKE $2",
    [storeId, `${prefix}%`]
  );
  let maxSerial = 0;
  for (const row of rows) {
    maxSerial = Math.max(maxSerial, extractSerialForPrefix(row.id, prefix));
  }
  return `${prefix}${String(maxSerial + 1).padStart(4, "0")}`;
}

export interface BillItemInput {
  productId: string;
  productName?: string;
  price: number;
  quantity: number;
  hsnCode?: string;
  taxPercentage?: number;
}

export interface CreateBillInput {
  storeId: string;
  storeCode: string;
  customerId?: string;
  createdBy?: string;
  paymentMethod?: string;
  items: BillItemInput[];
  subtotal: number;
  discountAmount: number;
  discountPercentage?: number;
  tax: number;
  taxPercentage: number;
  total: number;
  isReplacement?: boolean;
}

export interface CreateBillResult {
  success: boolean;
  billId?: string;
  error?: string;
}

function validateTotals(
  input: CreateBillInput,
  currentTaxRate: number
): { valid: boolean; reason?: string } {
  if (input.isReplacement) {
    // Different formula entirely (pretax price * (1 + tax/100) per
    // exchanged item) -- out of scope this phase, not validated here.
    return { valid: true };
  }

  const computedSubtotal = input.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  if (Math.abs(computedSubtotal - input.subtotal) > EPSILON) {
    return {
      valid: false,
      reason: `Subtotal mismatch: items sum to ${computedSubtotal.toFixed(2)}, bill claims ${input.subtotal.toFixed(2)}`,
    };
  }

  const clampedDiscount = Math.max(0, Math.min(input.discountAmount, computedSubtotal));
  if (Math.abs(clampedDiscount - input.discountAmount) > EPSILON) {
    return {
      valid: false,
      reason: `Discount amount ${input.discountAmount.toFixed(2)} out of bounds for subtotal ${computedSubtotal.toFixed(2)}`,
    };
  }

  const taxableBase = Math.max(0, computedSubtotal - input.discountAmount);
  const computedTax = (taxableBase * currentTaxRate) / 100;
  if (Math.abs(computedTax - input.tax) > EPSILON) {
    return {
      valid: false,
      reason: `Tax mismatch: expected ${computedTax.toFixed(2)} at ${currentTaxRate}%, bill claims ${input.tax.toFixed(2)}`,
    };
  }

  const computedTotal = taxableBase + computedTax;
  if (Math.abs(computedTotal - input.total) > EPSILON) {
    return {
      valid: false,
      reason: `Total mismatch: expected ${computedTotal.toFixed(2)}, bill claims ${input.total.toFixed(2)}`,
    };
  }

  return { valid: true };
}

export async function createBillOffline(input: CreateBillInput): Promise<CreateBillResult> {
  return withLock("bill-creation", async () => {
    const db = await getDb();

    const requestedByProduct = new Map<string, number>();
    for (const item of input.items) {
      if (!item.productId || item.quantity <= 0) continue;
      requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) ?? 0) + item.quantity);
    }

    for (const [productId, qty] of requestedByProduct) {
      const product = await getLocalProductById(productId);
      if (!product) {
        return { success: false, error: `Product ${productId} not found` };
      }
      if (qty > product.stock) {
        return {
          success: false,
          error: `Insufficient available stock for '${product.name}' (productId: ${productId}). Requested: ${qty}, Available: ${product.stock}`,
        };
      }
    }

    const currentTaxRate = await getLocalTaxPercentage();
    const validation = validateTotals(input, currentTaxRate);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const billId = await generateDailyInvoiceId(input.storeId, input.storeCode);
    const now = new Date().toISOString();

    for (const [productId, qty] of requestedByProduct) {
      await db.execute("UPDATE products SET stock = MAX(0, stock - $1) WHERE id = $2", [qty, productId]);
    }

    await db.execute(
      `INSERT INTO bills (id, store_id, customer_id, user_id, subtotal, discount_amount, discount_percentage, tax, tax_percentage, total, payment_method, status, timestamp, created_at, sync_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'completed', $12, $12, 'pending')`,
      [
        billId,
        input.storeId,
        input.customerId ?? null,
        input.createdBy ?? null,
        input.subtotal,
        input.discountAmount,
        input.discountPercentage ?? 0,
        input.tax,
        input.taxPercentage,
        input.total,
        input.paymentMethod ?? "cash",
        now,
      ]
    );

    for (const item of input.items) {
      await db.execute(
        `INSERT INTO billitems (bill_id, product_id, product_name, quantity, price, total, hsn_code, tax_percentage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          billId,
          item.productId,
          item.productName ?? null,
          item.quantity,
          item.price,
          item.quantity * item.price,
          item.hsnCode ?? null,
          item.taxPercentage ?? null,
        ]
      );
    }

    const queueId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO sync_queue (queue_id, queue_type, table_name, operation, payload_json, status, attempts, consecutive_permanent_failures, created_at, updated_at)
       VALUES ($1, 'bills', 'bills', 'insert', $2, 'pending', 0, 0, $3, $3)`,
      [queueId, JSON.stringify({ billId, ...input }), now]
    );

    return { success: true, billId };
  });
}

// Exported for direct testing (diff-testing against the Python originals).
export const _internal = { getTodayInvoicePrefix, extractSerialForPrefix, validateTotals };
