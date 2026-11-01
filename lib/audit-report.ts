// Printable audit report: a table of the items that were found, a table of the items that
// are missing (name, barcode, price, quantity, value) and a totals block.
//
// The numbers are worked out in `buildAuditReport` (pure, no DOM) so the popup and the
// printed page always agree. `printAuditReport` renders it to a hidden iframe and prints
// that, which works in a normal browser and in the desktop webview without a popup window.

import { isShortage, lineGap, type AuditItem, type AuditOutcome, type AuditRecord } from "@/lib/audit"

export interface ReportLine {
  name: string
  barcode: string
  price: number
  expected: number
  counted: number
  // Completed table: counted units. Missing table: units short.
  qty: number
  // qty x price.
  value: number
  status: string
}

export interface ReportTotals {
  stock: number
  value: number
}

export interface AuditReport {
  storeName: string
  storeCode: string
  auditedBy: string
  startedAt: string
  completedAt: string
  accuracyPct: number
  completed: ReportLine[]
  missing: ReportLine[]
  completedTotal: ReportTotals
  missingTotal: ReportTotals
  // Everything the system said the store should hold.
  expectedTotal: ReportTotals
  // Everything that was physically counted.
  countedTotal: ReportTotals
  // Stock that was never scanned at all (kept neutral, not a confirmed loss).
  notScannedTotal: ReportTotals
}

const COMPLETED_LABEL: Partial<Record<AuditOutcome, string>> = {
  verified: "Verified",
  over: "Over-count",
  found: "New (not in system)",
}

const MISSING_LABEL: Partial<Record<AuditOutcome, string>> = {
  missing: "Missing",
  short: "Short",
  unscanned: "Not scanned",
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const sum = (rows: ReportLine[], pick: (r: ReportLine) => number) => rows.reduce((s, r) => s + pick(r), 0)
const totalsOf = (rows: ReportLine[]): ReportTotals => ({
  stock: sum(rows, (r) => r.qty),
  value: sum(rows, (r) => r.value),
})

const toLine = (it: AuditItem, qty: number, status: string): ReportLine => {
  const price = num(it.price)
  return {
    name: it.name || "Unknown product",
    barcode: it.barcode || "",
    price,
    expected: num(it.systemQty),
    counted: num(it.countedQty),
    qty,
    value: qty * price,
    status,
  }
}

const byName = (a: ReportLine, b: ReportLine) => a.name.localeCompare(b.name)

export function buildAuditReport(audit: AuditRecord): AuditReport {
  const completed: ReportLine[] = []
  const missing: ReportLine[] = []
  const notScanned: ReportLine[] = []

  for (const it of audit.items || []) {
    if (isShortage(it.outcome)) {
      const gap = lineGap(it)
      if (gap <= 0) continue
      const line = toLine(it, gap, MISSING_LABEL[it.outcome] || "Missing")
      missing.push(line)
      if (it.outcome === "unscanned") notScanned.push(line)
    } else if (num(it.countedQty) > 0) {
      completed.push(toLine(it, num(it.countedQty), COMPLETED_LABEL[it.outcome] || "Verified"))
    }
  }
  completed.sort(byName)
  missing.sort(byName)

  const expectedTotal: ReportTotals = {
    stock: (audit.items || []).reduce((s, it) => s + num(it.systemQty), 0),
    value: (audit.items || []).reduce((s, it) => s + num(it.systemQty) * num(it.price), 0),
  }
  const countedTotal: ReportTotals = {
    stock: (audit.items || []).reduce((s, it) => s + num(it.countedQty), 0),
    value: (audit.items || []).reduce((s, it) => s + num(it.countedQty) * num(it.price), 0),
  }

  return {
    storeName: audit.storeName,
    storeCode: audit.storeCode,
    auditedBy: audit.auditedBy,
    startedAt: audit.startedAt,
    completedAt: audit.completedAt,
    accuracyPct: audit.totals?.accuracyPct ?? 0,
    completed,
    missing,
    completedTotal: totalsOf(completed),
    missingTotal: totalsOf(missing),
    expectedTotal,
    countedTotal,
    notScannedTotal: totalsOf(notScanned),
  }
}

// ---- HTML ------------------------------------------------------------------

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const money = (v: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0)
const whole = (v: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v || 0)

const dateTime = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(d)
}

function table(title: string, lines: ReportLine[], mode: "completed" | "missing", total: ReportTotals): string {
  const qtyHead = mode === "completed" ? "Counted" : "Missing qty"
  const valueHead = mode === "completed" ? "Value" : "Missing value"
  const body = lines.length
    ? lines
        .map(
          (l, i) => `<tr>
  <td class="n">${i + 1}</td>
  <td>${escapeHtml(l.name)}</td>
  <td class="mono">${escapeHtml(l.barcode) || "&mdash;"}</td>
  <td class="r">${money(l.price)}</td>
  <td class="r">${whole(l.expected)}</td>
  <td class="r">${whole(l.counted)}</td>
  <td class="r b">${whole(l.qty)}</td>
  <td class="r b">${money(l.value)}</td>
  <td>${escapeHtml(l.status)}</td>
</tr>`,
        )
        .join("\n")
    : `<tr><td colspan="9" class="empty">None</td></tr>`
  return `<h2>${escapeHtml(title)} <span class="count">(${lines.length} item${lines.length === 1 ? "" : "s"})</span></h2>
<table>
<thead><tr>
  <th class="n">#</th><th>Product</th><th>Barcode</th><th class="r">Price</th>
  <th class="r">System qty</th><th class="r">Counted</th><th class="r">${qtyHead}</th><th class="r">${valueHead}</th><th>Status</th>
</tr></thead>
<tbody>
${body}
</tbody>
<tfoot><tr>
  <td colspan="6" class="r">Total</td>
  <td class="r">${whole(total.stock)}</td>
  <td class="r">${money(total.value)}</td>
  <td></td>
</tr></tfoot>
</table>`
}

export function auditReportHtml(report: AuditReport): string {
  const totalsRow = (label: string, t: ReportTotals, cls = "") =>
    `<tr class="${cls}"><td>${label}</td><td class="r">${whole(t.stock)}</td><td class="r">${money(t.value)}</td></tr>`

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Audit report - ${escapeHtml(report.storeName)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 6px; }
  .count { font-weight: normal; color: #555; }
  .meta { color: #444; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th, td { border: 1px solid #999; padding: 3px 5px; vertical-align: top; }
  thead th { background: #eee; text-align: left; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  tfoot td { background: #f4f4f4; font-weight: bold; }
  .r { text-align: right; } .n { width: 28px; text-align: right; } .b { font-weight: bold; }
  .mono { font-family: Consolas, monospace; }
  .empty { text-align: center; color: #666; padding: 10px; }
  .totals { width: 55%; margin-top: 6px; }
  .grand td { font-weight: bold; background: #f4f4f4; }
</style></head>
<body>
<h1>Stock audit report</h1>
<div class="meta"><b>${escapeHtml(report.storeName)}</b>${report.storeCode ? ` (${escapeHtml(report.storeCode)})` : ""}</div>
<div class="meta">Audited by ${escapeHtml(report.auditedBy || "-")} &middot; Started ${escapeHtml(dateTime(report.startedAt))} &middot; Completed ${escapeHtml(dateTime(report.completedAt))} &middot; Accuracy ${report.accuracyPct}%</div>

${table("Completed items", report.completed, "completed", report.completedTotal)}
${table("Missing items", report.missing, "missing", report.missingTotal)}

<h2>Totals</h2>
<table class="totals">
<thead><tr><th></th><th class="r">Stock (units)</th><th class="r">Value</th></tr></thead>
<tbody>
${totalsRow("System stock (expected)", report.expectedTotal)}
${totalsRow("Counted stock", report.countedTotal)}
${totalsRow("Missing stock", report.missingTotal, "grand")}
${report.notScannedTotal.stock > 0 ? totalsRow("&nbsp;&nbsp;of which never scanned", report.notScannedTotal) : ""}
</tbody>
</table>
</body></html>`
}

/** Prints the report through a hidden iframe (no popup window, so nothing for a blocker to stop). */
export function printAuditReport(audit: AuditRecord): void {
  const html = auditReportHtml(buildAuditReport(audit))
  const frame = document.createElement("iframe")
  frame.setAttribute("aria-hidden", "true")
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;"
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    frame.remove()
    throw new Error("Could not open the print view")
  }
  doc.open()
  doc.write(html)
  doc.close()

  const cleanup = () => setTimeout(() => frame.remove(), 1000)
  win.addEventListener("afterprint", cleanup)
  // Give the iframe a moment to lay out before the print dialog opens.
  setTimeout(() => {
    win.focus()
    win.print()
    // afterprint doesn't fire everywhere; don't leave the iframe behind.
    setTimeout(cleanup, 60_000)
  }, 150)
}
