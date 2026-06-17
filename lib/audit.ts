// Audit domain types + data layer.
//
// UI-FIRST NOTE: the read/write functions below currently persist completed
// audits to localStorage so the full flow (scan -> Done -> report -> history)
// is clickable without a backend. When the backend + Supabase are ready, only
// the functions in the "DATA LAYER" section need to point at fetch() calls —
// the pages and types stay exactly the same.

// `unscanned` = a system line never touched during the audit (counted 0).
// It is kept distinct from `missing` (which is a deliberate "confirmed not here"
// chosen by the auditor at Done time).
export type AuditOutcome = "verified" | "short" | "unscanned" | "missing" | "found" | "over"

// How to treat lines that were never scanned (counted 0) when finishing.
export type UnscannedAs = "unscanned" | "missing"

// A single product line in an audit.
export interface AuditItem {
  productId: string
  name: string
  barcode: string
  barcodes?: string[]
  price: number
  systemQty: number
  countedQty: number
  outcome: AuditOutcome
  // Set during reconciliation (post-audit). Absent until then.
  resolution?: Resolution
}

// ---- Reconciliation ----------------------------------------------------

// Shortage = system claims more than physically counted.
export type ShortageAction = "sold_offline" | "lost" | "damaged" | "topup_from_owner" | "ignore"
// Surplus = physically present but not (fully) in the store's system.
export type SurplusAction = "add_to_store" | "allocate_from_owner" | "create_order" | "flag_only"
export type ResolutionAction = ShortageAction | SurplusAction

export interface Resolution {
  action: ResolutionAction
  quantity: number
  amount?: number // ₹ captured for sold_offline
  note?: string
}

export const SHORTAGE_OUTCOMES: AuditOutcome[] = ["missing", "short", "unscanned"]
export const SURPLUS_OUTCOMES: AuditOutcome[] = ["found", "over"]

export const isShortage = (o: AuditOutcome) => SHORTAGE_OUTCOMES.includes(o)
export const isSurplus = (o: AuditOutcome) => SURPLUS_OUTCOMES.includes(o)

// The unit gap a line needs reconciled.
export function lineGap(it: AuditItem): number {
  if (isSurplus(it.outcome)) return Math.max(0, it.countedQty - it.systemQty)
  // shortage: unscanned counts the whole system qty
  return Math.max(0, it.systemQty - it.countedQty)
}

export const SHORTAGE_ACTION_META: Record<ShortageAction, { label: string; hint: string }> = {
  sold_offline: { label: "Sold offline", hint: "Sold outside billing — not a loss" },
  lost: { label: "Missing / lost", hint: "Shrinkage — recorded as a loss" },
  damaged: { label: "Damaged", hint: "Send to damaged stock" },
  topup_from_owner: { label: "Top-up from owner", hint: "Transfer the shortfall from owner" },
  ignore: { label: "Ignore", hint: "Record only, no stock change" },
}

export const SURPLUS_ACTION_META: Record<SurplusAction, { label: string; hint: string }> = {
  add_to_store: { label: "Add to store inventory", hint: "Increase store stock to match" },
  allocate_from_owner: { label: "Allocate from owner pool", hint: "Draw units from owner stock" },
  create_order: { label: "Create order & assign", hint: "New owner→store transfer order" },
  flag_only: { label: "Flag only", hint: "Record only, no stock change" },
}

export function defaultAction(outcome: AuditOutcome): ResolutionAction {
  switch (outcome) {
    case "missing":
    case "short":
      return "lost"
    case "unscanned":
      return "ignore"
    case "found":
    case "over":
      return "add_to_store"
    default:
      return "ignore"
  }
}

export interface ReconcileSummary {
  storeStockDelta: number
  ownerUnitsUsed: number
  transfersToCreate: number
  lossUnits: number
  lossValue: number
  offlineSalesUnits: number
  offlineSalesValue: number
  damagedUnits: number
  damagedEvents: number
  resolvedLines: number
}

// Net effect of one resolved line, folded into a running summary.
export function applyLineEffect(
  summary: ReconcileSummary,
  it: AuditItem,
  r: Resolution,
): void {
  const qty = Math.max(0, Math.min(r.quantity, lineGap(it) || r.quantity))
  if (qty <= 0 && r.action !== "ignore" && r.action !== "flag_only") return
  summary.resolvedLines++
  switch (r.action) {
    case "sold_offline":
      summary.storeStockDelta -= qty
      summary.offlineSalesUnits += qty
      summary.offlineSalesValue += r.amount ?? qty * it.price
      break
    case "lost":
      summary.storeStockDelta -= qty
      summary.lossUnits += qty
      summary.lossValue += qty * it.price
      break
    case "damaged":
      summary.storeStockDelta -= qty
      summary.damagedUnits += qty
      summary.damagedEvents += 1
      break
    case "topup_from_owner":
      summary.storeStockDelta += qty
      summary.ownerUnitsUsed += qty
      summary.transfersToCreate += 1
      break
    case "add_to_store":
      summary.storeStockDelta += qty
      break
    case "allocate_from_owner":
      summary.storeStockDelta += qty
      summary.ownerUnitsUsed += qty
      break
    case "create_order":
      summary.storeStockDelta += qty
      summary.ownerUnitsUsed += qty
      summary.transfersToCreate += 1
      break
    case "ignore":
    case "flag_only":
      summary.resolvedLines-- // not really an action
      break
  }
}

export function emptyReconcileSummary(): ReconcileSummary {
  return {
    storeStockDelta: 0,
    ownerUnitsUsed: 0,
    transfersToCreate: 0,
    lossUnits: 0,
    lossValue: 0,
    offlineSalesUnits: 0,
    offlineSalesValue: 0,
    damagedUnits: 0,
    damagedEvents: 0,
    resolvedLines: 0,
  }
}

export function computeReconcileSummary(
  items: AuditItem[],
  resolutions: Record<string, Resolution>,
): ReconcileSummary {
  const summary = emptyReconcileSummary()
  for (const it of items) {
    const r = resolutions[it.productId]
    if (r) applyLineEffect(summary, it, r)
  }
  return summary
}

export interface AuditTotals {
  verifiedLines: number
  shortLines: number
  unscannedLines: number
  missingLines: number
  foundLines: number
  overCountLines: number
  scannedUnits: number
  systemUnits: number
  // Net signed difference: positive = surplus on hand, negative = shortage.
  discrepancyUnits: number
  discrepancyValue: number
  // Value broken out for the financial lens (selling price basis).
  shortageValue: number
  surplusValue: number
  accuracyPct: number
}

export interface AuditRecord {
  id: string
  storeId: string
  storeName: string
  storeCode: string
  auditedBy: string
  startedAt: string
  completedAt: string
  totals: AuditTotals
  items: AuditItem[]
  status?: string
  note?: string
  reconciledAt?: string
  reconciledBy?: string
}

// In-progress scan state, auto-saved per store for crash/close recovery.
export interface AuditDraft {
  storeId: string
  leftItems: AuditItem[]
  rightItems: AuditItem[]
  lastScan: { text: string; tone: "ok" | "found" | "warn" } | null
  startedAt: string
  savedAt: string
}

const DRAFT_PREFIX = "audit-draft:"

const isBrowser = () => typeof window !== "undefined"

// ============================================================
// CLASSIFICATION + TOTALS
// ============================================================

// Decide the outcome for a single line given which panel it ended up on.
// `unexpected` lines (scanned but not in system) become "found".
export function classifyOutcome(
  item: { systemQty: number; countedQty: number; unexpected?: boolean },
  side: "left" | "right",
  unscannedAs: UnscannedAs = "unscanned",
): AuditOutcome {
  if (item.unexpected) return "found"
  if (side === "right") {
    return item.countedQty > item.systemQty ? "over" : "verified"
  }
  // Never counted -> auditor decides at Done: unscanned (neutral) or missing.
  if (item.countedQty <= 0) return unscannedAs
  return "short"
}

// Count system lines that were never scanned (still need a decision at Done).
export function countUnscanned(
  leftItems: Array<{ systemQty: number; countedQty: number; unexpected?: boolean }>,
): number {
  return leftItems.filter((it) => !it.unexpected && it.countedQty <= 0).length
}

// Build the immutable item list + rolled-up totals from the two live panels.
// `unscannedAs` decides how never-scanned system lines are recorded.
export function buildAuditResult(
  leftItems: Array<AuditItem & { unexpected?: boolean }>,
  rightItems: Array<AuditItem & { unexpected?: boolean }>,
  unscannedAs: UnscannedAs = "unscanned",
): { items: AuditItem[]; totals: AuditTotals } {
  const left = leftItems.map((it) => ({
    ...it,
    outcome: classifyOutcome(it, "left", unscannedAs),
  }))
  const right = rightItems.map((it) => ({
    ...it,
    outcome: classifyOutcome(it, "right"),
  }))
  const items: AuditItem[] = [...right, ...left].map(stripItem)

  let verifiedLines = 0
  let shortLines = 0
  let unscannedLines = 0
  let missingLines = 0
  let foundLines = 0
  let overCountLines = 0
  let scannedUnits = 0
  let systemUnits = 0
  let shortageValue = 0
  let surplusValue = 0

  for (const it of items) {
    scannedUnits += it.countedQty
    if (it.outcome !== "found") systemUnits += it.systemQty

    switch (it.outcome) {
      case "verified":
        verifiedLines++
        break
      case "short": {
        shortLines++
        shortageValue += Math.max(0, it.systemQty - it.countedQty) * it.price
        break
      }
      case "unscanned": {
        // Neutral — not judged, so no value impact and excluded from accuracy.
        unscannedLines++
        break
      }
      case "missing": {
        missingLines++
        shortageValue += it.systemQty * it.price
        break
      }
      case "found": {
        foundLines++
        surplusValue += it.countedQty * it.price
        break
      }
      case "over": {
        overCountLines++
        surplusValue += Math.max(0, it.countedQty - it.systemQty) * it.price
        break
      }
    }
  }

  // Accuracy is judged only over lines we actually assessed (unscanned excluded).
  const expectedLines = verifiedLines + shortLines + missingLines + overCountLines
  const accuracyPct = expectedLines === 0 ? 100 : Math.round((verifiedLines / expectedLines) * 100)

  const totals: AuditTotals = {
    verifiedLines,
    shortLines,
    unscannedLines,
    missingLines,
    foundLines,
    overCountLines,
    scannedUnits,
    systemUnits,
    discrepancyUnits: scannedUnits - systemUnits,
    discrepancyValue: surplusValue - shortageValue,
    shortageValue,
    surplusValue,
    accuracyPct,
  }

  return { items, totals }
}

function stripItem(it: AuditItem & { unexpected?: boolean }): AuditItem {
  return {
    productId: it.productId,
    name: it.name,
    barcode: it.barcode,
    barcodes: it.barcodes,
    price: it.price,
    systemQty: it.systemQty,
    countedQty: it.countedQty,
    outcome: it.outcome,
  }
}

// ============================================================
// DRAFT CACHE (localStorage, per store) — survives refresh/close/crash
// ============================================================

export function draftKey(storeId: string) {
  return `${DRAFT_PREFIX}${storeId}`
}

export function getDraft(storeId: string): AuditDraft | null {
  if (!isBrowser() || !storeId) return null
  try {
    const raw = window.localStorage.getItem(draftKey(storeId))
    return raw ? (JSON.parse(raw) as AuditDraft) : null
  } catch {
    return null
  }
}

export function saveDraft(draft: AuditDraft): void {
  if (!isBrowser() || !draft.storeId) return
  try {
    window.localStorage.setItem(draftKey(draft.storeId), JSON.stringify(draft))
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

export function clearDraft(storeId: string): void {
  if (!isBrowser() || !storeId) return
  try {
    window.localStorage.removeItem(draftKey(storeId))
  } catch {
    /* non-fatal */
  }
}

export function hasDraft(storeId: string): boolean {
  return getDraft(storeId) !== null
}

// ============================================================
// DATA LAYER (backend: Flask + Supabase)
// ============================================================

const API = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://127.0.0.1:8080"

// Save a completed audit. POST /api/stores/:id/audits
export async function saveAudit(
  record: Omit<AuditRecord, "id" | "completedAt"> & { completedAt?: string },
): Promise<AuditRecord> {
  const res = await fetch(`${API}/api/stores/${encodeURIComponent(record.storeId)}/audits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  })
  if (!res.ok) throw new Error(`Failed to save audit (${res.status})`)
  return (await res.json()) as AuditRecord
}

// History for one store, newest first. GET /api/stores/:id/audits
export async function listAudits(storeId: string): Promise<AuditRecord[]> {
  if (!storeId) return []
  try {
    const res = await fetch(`${API}/api/stores/${encodeURIComponent(storeId)}/audits`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as AuditRecord[]) : []
  } catch {
    return []
  }
}

// One audit by id. GET /api/audits/:auditId
export async function getAudit(auditId: string): Promise<AuditRecord | null> {
  if (!auditId) return null
  try {
    const res = await fetch(`${API}/api/audits/${encodeURIComponent(auditId)}`)
    if (!res.ok) return null
    return (await res.json()) as AuditRecord
  } catch {
    return null
  }
}

// Record reconciliation decisions and mark the audit reconciled.
// POST /api/audits/:auditId/reconcile
export async function saveReconciliation(
  auditId: string,
  resolutions: Record<string, Resolution>,
  reconciledBy: string,
): Promise<AuditRecord | null> {
  const res = await fetch(`${API}/api/audits/${encodeURIComponent(auditId)}/reconcile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolutions, reconciledBy }),
  })
  if (!res.ok) throw new Error(`Failed to reconcile (${res.status})`)
  const data = await res.json()
  return (data?.audit ?? null) as AuditRecord | null
}

// ============================================================
// FORMAT HELPERS
// ============================================================

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value || 0)

export const formatDateTime = (iso: string) => {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export const OUTCOME_META: Record<
  AuditOutcome,
  { label: string; tone: "ok" | "warn" | "found" | "over" | "neutral" }
> = {
  verified: { label: "Verified", tone: "ok" },
  short: { label: "Short", tone: "warn" },
  unscanned: { label: "Unscanned", tone: "neutral" },
  missing: { label: "Missing", tone: "warn" },
  found: { label: "Newly found", tone: "found" },
  over: { label: "Over-count", tone: "over" },
}
