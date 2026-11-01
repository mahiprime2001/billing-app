"use client"

import { useMemo, useState } from "react"
import { ExternalLink, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatDateTime, type AuditRecord } from "@/lib/audit"
import { buildAuditReport, printAuditReport } from "@/lib/audit-report"

const whole = (v: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v || 0)
const money = (v: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0)

/**
 * Shown from the audit history and right after an audit is finished: a quick summary with
 * Print (completed + missing tables and totals) and Close.
 */
export default function AuditReportDialog({
  audit,
  onClose,
  onOpenFull,
}: {
  audit: AuditRecord | null
  onClose: () => void
  // Optional link to the detailed page (where shortages are reconciled).
  onOpenFull?: (auditId: string) => void
}) {
  const report = useMemo(() => (audit ? buildAuditReport(audit) : null), [audit])
  const [printError, setPrintError] = useState<string | null>(null)

  const print = () => {
    if (!audit) return
    try {
      setPrintError(null)
      printAuditReport(audit)
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Could not print the report")
    }
  }

  return (
    <Dialog open={!!audit} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {audit && report && (
          <>
            <DialogHeader>
              <DialogTitle>Audit report</DialogTitle>
              <DialogDescription>
                {audit.storeName}
                {audit.storeCode ? ` (${audit.storeCode})` : ""} · {formatDateTime(audit.completedAt)} · by{" "}
                {audit.auditedBy}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-emerald-50 py-2">
                <div className="text-lg font-semibold tabular-nums text-emerald-700">{report.completed.length}</div>
                <div className="text-[11px] text-muted-foreground">Completed items</div>
              </div>
              <div className="rounded-md bg-amber-50 py-2">
                <div className="text-lg font-semibold tabular-nums text-amber-700">{report.missing.length}</div>
                <div className="text-[11px] text-muted-foreground">Missing items</div>
              </div>
              <div className="rounded-md bg-muted/40 py-2">
                <div className="text-lg font-semibold tabular-nums">{report.accuracyPct}%</div>
                <div className="text-[11px] text-muted-foreground">Accuracy</div>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1 text-left font-medium" />
                  <th className="py-1 text-right font-medium">Stock</th>
                  <th className="py-1 text-right font-medium">Value (₹)</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr>
                  <td className="py-1">System stock</td>
                  <td className="py-1 text-right">{whole(report.expectedTotal.stock)}</td>
                  <td className="py-1 text-right">{money(report.expectedTotal.value)}</td>
                </tr>
                <tr>
                  <td className="py-1">Counted stock</td>
                  <td className="py-1 text-right">{whole(report.countedTotal.stock)}</td>
                  <td className="py-1 text-right">{money(report.countedTotal.value)}</td>
                </tr>
                <tr className="border-t font-semibold text-amber-700">
                  <td className="py-1">Missing stock</td>
                  <td className="py-1 text-right">{whole(report.missingTotal.stock)}</td>
                  <td className="py-1 text-right">{money(report.missingTotal.value)}</td>
                </tr>
              </tbody>
            </table>

            {printError && <p className="text-xs text-red-600">{printError}</p>}

            <DialogFooter className="gap-2 sm:justify-between">
              {onOpenFull ? (
                <Button variant="ghost" size="sm" onClick={() => onOpenFull(audit.id)}>
                  <ExternalLink className="h-4 w-4 mr-1" /> Full report
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
                <Button onClick={print}>
                  <Printer className="h-4 w-4 mr-1" /> Print
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
