"use client"

import { API_BASE } from "@/lib/api-base"
import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  Store,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  IndianRupee,
  ScanLine,
  Boxes,
  Package,
  Layers,
  Wallet,
  History,
  ChevronRight,
  Loader2,
  TrendingDown,
  TrendingUp,
  CircleDashed,
  Wrench,
  CheckCheck,
  ArrowRightLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type AuditItem,
  type AuditOutcome,
  type AuditRecord,
  type Resolution,
  type ResolutionAction,
  type ShortageAction,
  type SurplusAction,
  getAudit,
  listAudits,
  saveReconciliation,
  formatCurrency,
  formatDateTime,
  OUTCOME_META,
  SHORTAGE_ACTION_META,
  SURPLUS_ACTION_META,
  isShortage,
  isSurplus,
  lineGap,
  defaultAction,
  computeReconcileSummary,
  type ReconcileSummary,
} from "@/lib/audit"

const API = API_BASE

function getAuditorName(): string {
  if (typeof window === "undefined") return "Unknown"
  try {
    const raw = window.localStorage.getItem("adminUser")
    if (!raw) return "Unknown"
    const u = JSON.parse(raw)
    return u?.name || u?.email || "Unknown"
  } catch {
    return "Unknown"
  }
}

const pickAvailable = (p: any): number =>
  Math.max(
    0,
    Math.trunc(
      Number(p?.availableStock ?? p?.available ?? p?.availableQty ?? p?.stock ?? p?.quantity ?? 0) || 0,
    ),
  )

function toneClass(tone: "ok" | "warn" | "found" | "over" | "neutral") {
  switch (tone) {
    case "ok":
      return "text-emerald-600"
    case "warn":
      return "text-amber-600"
    case "found":
      return "text-green-600"
    case "over":
      return "text-blue-600"
    case "neutral":
      return "text-muted-foreground"
  }
}

function AuditSummaryView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const auditId = String(searchParams.get("auditId") || "")

  const [audit, setAudit] = useState<AuditRecord | null>(null)
  const [history, setHistory] = useState<AuditRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  // Owner-side available units per product (for top-up / allocate actions).
  const [ownerAvailable, setOwnerAvailable] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!auditId) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    getAudit(auditId)
      .then(async (a) => {
        if (cancelled) return
        setAudit(a)
        if (a) {
          const h = await listAudits(a.storeId)
          if (!cancelled) setHistory(h.filter((r) => r.id !== a.id))
          // Owner-available stock for reconciliation (best-effort).
          try {
            const res = await fetch(`${API}/api/stores/${a.storeId}/available-products`)
            if (res.ok) {
              const list: any[] = await res.json()
              const map: Record<string, number> = {}
              for (const p of Array.isArray(list) ? list : []) {
                const id = String(p.id ?? p.productId ?? p.productid ?? "")
                if (id) map[id] = pickAvailable(p)
              }
              if (!cancelled) setOwnerAvailable(map)
            }
          } catch {
            /* non-fatal — owner-based actions just won't show availability */
          }
        }
      })
      .finally(() => !cancelled && setIsLoading(false))
    return () => {
      cancelled = true
    }
  }, [auditId])

  const handleReconciled = (updated: AuditRecord) => setAudit(updated)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading report...
      </div>
    )
  }

  if (!audit) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/audit")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="py-16 text-center text-muted-foreground">Audit report not found.</div>
      </div>
    )
  }

  const t = audit.totals

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            router.push(`/dashboard/audit/view?storeId=${encodeURIComponent(audit.storeId)}`)
          }
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to store
        </Button>
        <Badge variant="secondary" className="capitalize">
          {audit.status ?? "completed"}
        </Badge>
      </div>

      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Store className="h-5 w-5 text-muted-foreground" />
                {audit.storeName}
                {audit.storeCode && (
                  <span className="font-mono text-sm text-muted-foreground">{audit.storeCode}</span>
                )}
              </CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">
                Completed {formatDateTime(audit.completedAt)} · by {audit.auditedBy}
              </div>
            </div>
            <AccuracyDial pct={t.accuracyPct} />
          </div>
        </CardHeader>
      </Card>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-center">
        <KpiCard icon={ScanLine} label="Scanned units" value={t.scannedUnits} />
        <KpiCard icon={Boxes} label="System units" value={t.systemUnits} />
        <KpiCard icon={CheckCircle2} label="Verified" value={t.verifiedLines} tone="ok" />
        <KpiCard
          icon={AlertTriangle}
          label="Missing / short"
          value={t.missingLines + t.shortLines}
          tone="warn"
        />
        <KpiCard
          icon={CircleDashed}
          label="Unscanned"
          value={t.unscannedLines}
        />
        <KpiCard icon={Sparkles} label="Newly found" value={t.foundLines} tone="found" />
        <KpiCard
          icon={IndianRupee}
          label="₹ impact"
          value={formatCurrency(t.discrepancyValue)}
          tone={t.discrepancyValue < 0 ? "warn" : "ok"}
        />
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">
            <Layers className="h-4 w-4 mr-1.5" /> Summary
          </TabsTrigger>
          <TabsTrigger value="stock">
            <Package className="h-4 w-4 mr-1.5" /> Stock
          </TabsTrigger>
          <TabsTrigger value="financial">
            <Wallet className="h-4 w-4 mr-1.5" /> Financial
          </TabsTrigger>
          <TabsTrigger value="reconcile">
            <Wrench className="h-4 w-4 mr-1.5" /> Reconcile
            {audit.status === "reconciled" && (
              <CheckCheck className="h-3.5 w-3.5 ml-1.5 text-emerald-600" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <SummaryLens audit={audit} />
        </TabsContent>
        <TabsContent value="stock" className="mt-4">
          <StockLens items={audit.items} />
        </TabsContent>
        <TabsContent value="financial" className="mt-4">
          <FinancialLens audit={audit} />
        </TabsContent>
        <TabsContent value="reconcile" className="mt-4">
          <ReconcileLens
            audit={audit}
            ownerAvailable={ownerAvailable}
            onReconciled={handleReconciled}
          />
        </TabsContent>
      </Tabs>

      {/* Per-store history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-muted-foreground" /> Past audits for this store
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No earlier audits for this store.
            </div>
          ) : (
            <div className="divide-y">
              {history.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() =>
                    router.push(`/dashboard/audit/summary?auditId=${encodeURIComponent(a.id)}`)
                  }
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <div className="text-sm">{formatDateTime(a.completedAt)}</div>
                  <div className="flex items-center gap-4 text-xs tabular-nums text-muted-foreground">
                    <span>{a.totals.accuracyPct}% ok</span>
                    <span>₹{formatCurrency(a.totals.discrepancyValue)}</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// SUMMARY LENS
// ============================================================

function SummaryLens({ audit }: { audit: AuditRecord }) {
  const t = audit.totals
  const remaining = audit.items.filter(
    (it) => it.outcome === "missing" || it.outcome === "short" || it.outcome === "unscanned",
  )
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OutcomeBreakdown items={audit.items} />
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Remaining / not scanned</CardTitle>
            <p className="text-xs text-muted-foreground">
              Expected in the system but not (fully) found during this audit.
            </p>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[50vh] overflow-y-auto">
            {remaining.length === 0 ? (
              <div className="py-10 text-center text-sm text-emerald-600">
                Nothing missing — everything was accounted for. 🎉
              </div>
            ) : (
              remaining.map((it, i) => <ItemLine key={`${it.productId}-${i}`} item={it} />)
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function OutcomeBreakdown({ items }: { items: AuditItem[] }) {
  const counts = useMemo(() => {
    const c: Record<AuditOutcome, number> = {
      verified: 0,
      short: 0,
      unscanned: 0,
      missing: 0,
      found: 0,
      over: 0,
    }
    for (const it of items) c[it.outcome]++
    return c
  }, [items])
  const total = items.length || 1
  const order: AuditOutcome[] = ["verified", "short", "unscanned", "missing", "found", "over"]
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Lines by outcome</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {order.map((o) => {
          const meta = OUTCOME_META[o]
          const n = counts[o]
          return (
            <div key={o}>
              <div className="flex items-center justify-between text-sm">
                <span className={cn("font-medium", toneClass(meta.tone))}>{meta.label}</span>
                <span className="tabular-nums text-muted-foreground">{n}</span>
              </div>
              <Progress value={(n / total) * 100} className="h-1.5 mt-1" />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ============================================================
// STOCK LENS (product manager)
// ============================================================

function StockLens({ items }: { items: AuditItem[] }) {
  const groups: { key: AuditOutcome; items: AuditItem[] }[] = useMemo(() => {
    const order: AuditOutcome[] = ["missing", "short", "unscanned", "over", "found", "verified"]
    return order
      .map((key) => ({ key, items: items.filter((it) => it.outcome === key) }))
      .filter((g) => g.items.length > 0)
  }, [items])

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No items in this audit.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const meta = OUTCOME_META[g.key]
        return (
          <Card key={g.key}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className={toneClass(meta.tone)}>{meta.label}</span>
                <Badge variant="secondary">{g.items.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[40vh] overflow-y-auto">
              {g.items.map((it, i) => (
                <ItemLine key={`${it.productId}-${i}`} item={it} />
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ============================================================
// FINANCIAL LENS (finance)
// ============================================================

function FinancialLens({ audit }: { audit: AuditRecord }) {
  const t = audit.totals
  const stockValue = audit.items.reduce(
    (s, it) => (it.outcome === "found" ? s : s + it.systemQty * it.price),
    0,
  )
  const shrinkagePct = stockValue > 0 ? (t.shortageValue / stockValue) * 100 : 0
  const net = t.discrepancyValue

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-red-200">
          <CardContent className="py-5">
            <div className="flex items-center gap-2 text-sm text-red-600">
              <TrendingDown className="h-4 w-4" /> Shortage value
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-red-600">
              ₹{formatCurrency(t.shortageValue)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Missing + short lines, at selling price
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200">
          <CardContent className="py-5">
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <TrendingUp className="h-4 w-4" /> Surplus value
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">
              ₹{formatCurrency(t.surplusValue)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Newly found + over-count, at selling price
            </div>
          </CardContent>
        </Card>
        <Card className={net < 0 ? "border-red-200" : "border-emerald-200"}>
          <CardContent className="py-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="h-4 w-4" /> Net impact
            </div>
            <div
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                net < 0 ? "text-red-600" : "text-emerald-600",
              )}
            >
              ₹{formatCurrency(net)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Shrinkage {shrinkagePct.toFixed(1)}% of counted stock value
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Value impact by line</CardTitle>
          <p className="text-xs text-muted-foreground">
            Highest-value discrepancies first.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[45vh] overflow-y-auto">
          {[...audit.items]
            .filter((it) => it.outcome !== "verified" && it.outcome !== "unscanned")
            .map((it) => ({ it, impact: lineImpact(it) }))
            .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
            .map(({ it, impact }, i) => (
              <div
                key={`${it.productId}-${i}`}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={it.name}>
                    {it.name}
                  </div>
                  <div className="text-xs text-muted-foreground">{OUTCOME_META[it.outcome].label}</div>
                </div>
                <div
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    impact < 0 ? "text-red-600" : "text-emerald-600",
                  )}
                >
                  {impact < 0 ? "−" : "+"}₹{formatCurrency(Math.abs(impact))}
                </div>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  )
}

function lineImpact(it: AuditItem): number {
  switch (it.outcome) {
    case "missing":
      return -it.systemQty * it.price
    case "short":
      return -Math.max(0, it.systemQty - it.countedQty) * it.price
    case "found":
      return it.countedQty * it.price
    case "over":
      return Math.max(0, it.countedQty - it.systemQty) * it.price
    default:
      return 0
  }
}

// ============================================================
// RECONCILE LENS
// ============================================================

function ReconcileLens({
  audit,
  ownerAvailable,
  onReconciled,
}: {
  audit: AuditRecord
  ownerAvailable: Record<string, number>
  onReconciled: (updated: AuditRecord) => void
}) {
  // Only lines with a real gap need reconciling.
  const discrepancies = useMemo(
    () => audit.items.filter((it) => (isShortage(it.outcome) || isSurplus(it.outcome)) && lineGap(it) > 0),
    [audit.items],
  )

  const alreadyDone = audit.status === "reconciled"

  // Seed resolutions: from saved data if reconciled, else sensible defaults.
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>(() => {
    const init: Record<string, Resolution> = {}
    for (const it of discrepancies) {
      init[it.productId] =
        it.resolution ?? { action: defaultAction(it.outcome), quantity: lineGap(it) }
    }
    return init
  })
  const [isSaving, setIsSaving] = useState(false)

  const setResolution = (productId: string, patch: Partial<Resolution>) =>
    setResolutions((prev) => ({ ...prev, [productId]: { ...prev[productId], ...patch } }))

  const summary = useMemo(
    () => computeReconcileSummary(discrepancies, resolutions),
    [discrepancies, resolutions],
  )

  const apply = async () => {
    setIsSaving(true)
    try {
      const updated = await saveReconciliation(audit.id, resolutions, getAuditorName())
      if (updated) onReconciled(updated)
    } catch (err) {
      console.error("Error saving reconciliation:", err)
    } finally {
      setIsSaving(false)
    }
  }

  if (discrepancies.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-emerald-600">
          Nothing to reconcile — no discrepancies in this audit. 🎉
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {alreadyDone && (
        <Card className="border-emerald-300 bg-emerald-50/50">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-emerald-800">
            <CheckCheck className="h-4 w-4" />
            Reconciled {formatDateTime(audit.reconciledAt || "")} · by {audit.reconciledBy}. Showing
            the decisions that were applied.
          </CardContent>
        </Card>
      )}

      {/* Net effect preview */}
      <NetEffect summary={summary} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resolve each discrepancy</CardTitle>
          <p className="text-xs text-muted-foreground">
            Pick what happens to every line. Owner-available units are shown for top-up / allocate.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[55vh] overflow-y-auto">
          {discrepancies.map((it) => (
            <ReconcileRow
              key={it.productId}
              item={it}
              ownerAvail={ownerAvailable[it.productId] ?? 0}
              resolution={resolutions[it.productId]}
              disabled={alreadyDone}
              onChange={(patch) => setResolution(it.productId, patch)}
            />
          ))}
        </CardContent>
      </Card>

      {!alreadyDone && (
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-muted-foreground">
            {summary.resolvedLines} of {discrepancies.length} line(s) will change stock
          </span>
          <Button onClick={apply} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4 mr-1" />
            )}
            Apply reconciliation
          </Button>
        </div>
      )}
    </div>
  )
}

function NetEffect({ summary }: { summary: ReconcileSummary }) {
  const tiles: { label: string; value: React.ReactNode; tone?: string; icon: any }[] = [
    {
      label: "Store stock change",
      value: `${summary.storeStockDelta >= 0 ? "+" : ""}${summary.storeStockDelta} units`,
      tone: summary.storeStockDelta < 0 ? "text-red-600" : "text-emerald-600",
      icon: Boxes,
    },
    { label: "Transfers to create", value: summary.transfersToCreate, icon: ArrowRightLeft },
    {
      label: "Loss recorded",
      value: `₹${formatCurrency(summary.lossValue)}`,
      tone: "text-red-600",
      icon: TrendingDown,
    },
    {
      label: "Offline sales",
      value: `₹${formatCurrency(summary.offlineSalesValue)}`,
      icon: IndianRupee,
    },
    { label: "Damaged units", value: summary.damagedUnits, tone: "text-amber-600", icon: AlertTriangle },
    { label: "Owner units used", value: summary.ownerUnitsUsed, icon: Package },
  ]
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Net effect when applied</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-center">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-md bg-muted/40 py-2 px-1">
              <t.icon className="h-4 w-4 mx-auto text-muted-foreground" />
              <div className={cn("mt-1 text-base font-semibold tabular-nums", t.tone)}>{t.value}</div>
              <div className="text-[11px] text-muted-foreground">{t.label}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ReconcileRow({
  item,
  ownerAvail,
  resolution,
  disabled,
  onChange,
}: {
  item: AuditItem
  ownerAvail: number
  resolution: Resolution
  disabled: boolean
  onChange: (patch: Partial<Resolution>) => void
}) {
  const gap = lineGap(item)
  const shortage = isShortage(item.outcome)
  const meta = OUTCOME_META[item.outcome]
  const actionOptions = shortage
    ? (Object.keys(SHORTAGE_ACTION_META) as ShortageAction[]).map((k) => ({
        value: k,
        ...SHORTAGE_ACTION_META[k],
      }))
    : (Object.keys(SURPLUS_ACTION_META) as SurplusAction[]).map((k) => ({
        value: k,
        ...SURPLUS_ACTION_META[k],
      }))

  const usesOwner =
    resolution.action === "topup_from_owner" ||
    resolution.action === "allocate_from_owner" ||
    resolution.action === "create_order"
  const ownerShort = usesOwner && resolution.quantity > ownerAvail

  return (
    <div className="rounded-md border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={toneClass(meta.tone)}>{meta.label}</span>
            <span>·</span>
            <span>
              gap <span className="font-semibold tabular-nums">{gap}</span>
            </span>
            {(!shortage || usesOwner) && (
              <>
                <span>·</span>
                <span>
                  owner has <span className="font-semibold tabular-nums">{ownerAvail}</span>
                </span>
              </>
            )}
          </div>
        </div>

        <Select
          value={resolution.action}
          onValueChange={(v) => onChange({ action: v as ResolutionAction })}
          disabled={disabled}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {actionOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          min={0}
          max={gap}
          value={resolution.quantity}
          disabled={disabled}
          onChange={(e) => onChange({ quantity: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
          className="w-20"
        />

        {resolution.action === "sold_offline" && (
          <Input
            type="number"
            min={0}
            placeholder="₹ amount"
            value={resolution.amount ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ amount: Math.max(0, Number(e.target.value) || 0) })}
            className="w-28"
          />
        )}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {(shortage
            ? SHORTAGE_ACTION_META[resolution.action as ShortageAction]
            : SURPLUS_ACTION_META[resolution.action as SurplusAction]
          )?.hint}
        </span>
        {ownerShort && (
          <span className="text-[11px] font-medium text-amber-600">
            Owner only has {ownerAvail} available
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================================
// SHARED BITS
// ============================================================

export default function AuditSummaryPage() {
  return (
    <DashboardLayout>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading...
          </div>
        }
      >
        <AuditSummaryView />
      </Suspense>
    </DashboardLayout>
  )
}

function AccuracyDial({ pct }: { pct: number }) {
  const tone = pct >= 90 ? "text-emerald-600" : pct >= 70 ? "text-amber-600" : "text-red-600"
  return (
    <div className="text-right">
      <div className={cn("flex items-center gap-1.5 text-3xl font-bold tabular-nums", tone)}>
        <Gauge className="h-6 w-6" />
        {pct}%
      </div>
      <div className="text-xs text-muted-foreground">accuracy</div>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  tone?: "ok" | "warn" | "found"
}) {
  return (
    <Card>
      <CardContent className="py-3 text-center">
        <Icon
          className={cn(
            "h-4 w-4 mx-auto text-muted-foreground",
            tone === "ok" && "text-emerald-600",
            tone === "warn" && "text-amber-600",
            tone === "found" && "text-green-600",
          )}
        />
        <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  )
}

function ItemLine({ item }: { item: AuditItem }) {
  const meta = OUTCOME_META[item.outcome]
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={item.name}>
          {item.name}
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground" title={item.barcode}>
          {item.barcode || "—"}
        </div>
      </div>
      <div className="text-right text-sm tabular-nums">
        <div className="font-semibold">
          {item.countedQty}
          {item.outcome !== "found" && <span className="text-muted-foreground"> / {item.systemQty}</span>}
        </div>
        <div className={cn("text-[11px]", toneClass(meta.tone))}>{meta.label}</div>
      </div>
    </div>
  )
}
