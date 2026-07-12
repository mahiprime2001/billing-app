"use client"

import { API_BASE } from "@/lib/api-base"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ArrowLeft,
  Store,
  MapPin,
  User,
  Package,
  Boxes,
  IndianRupee,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Loader2,
  RotateCcw,
  ClipboardCheck,
  History,
  Play,
  Clock,
  Gauge,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type AuditItem,
  type AuditRecord,
  type UnscannedAs,
  buildAuditResult,
  countUnscanned,
  getDraft,
  saveDraft,
  clearDraft,
  saveAudit,
  listAudits,
  formatCurrency,
  formatDateTime,
} from "@/lib/audit"

const API = API_BASE

interface StoreType {
  id: string
  name: string
  address?: string
  phone?: string
  manager?: string
  storecode?: string
  status?: string
  productCount?: number
  totalStock?: number
  totalStockValue?: number
}

// Live panel item carries `unexpected` (green, not-in-system finds).
interface LiveItem extends AuditItem {
  unexpected: boolean
}

// Products can hold multiple comma-separated barcodes.
const splitBarcodes = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.map((b) => `${b}`.trim()).filter(Boolean)
  if (typeof raw === "string") return raw.split(",").map((b) => b.trim()).filter(Boolean)
  return []
}

const pickPrice = (p: any): number =>
  Number(p?.sellingPrice ?? p?.selling_price ?? p?.price ?? 0) || 0

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

type Mode = "fresh" | "resume"

function StoreAuditView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const storeId = String(searchParams.get("storeId") || "")

  const [store, setStore] = useState<StoreType | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Base inventory (fresh starting point) + global catalog for unexpected scans.
  const [baseItems, setBaseItems] = useState<LiveItem[]>([])
  const catalogByBarcode = useRef<Map<string, any>>(new Map())

  const [history, setHistory] = useState<AuditRecord[]>([])
  const [tab, setTab] = useState<string>("overview")
  // When non-null, the scan panel is active and seeded from this mode.
  const [mode, setMode] = useState<Mode | null>(null)
  const [hasSavedDraft, setHasSavedDraft] = useState(false)

  useEffect(() => {
    if (!storeId) {
      setIsLoading(false)
      return
    }
    let cancelled = false

    const load = async () => {
      try {
        const [storeRes, invRes, prodRes] = await Promise.all([
          fetch(`${API}/api/stores/${storeId}`),
          fetch(`${API}/api/stores/${storeId}/assigned-products`),
          fetch(`${API}/api/products`),
        ])

        if (!cancelled && storeRes.ok) setStore(await storeRes.json())

        if (prodRes.ok) {
          const prodData = await prodRes.json()
          const list: any[] = Array.isArray(prodData) ? prodData : prodData?.data || []
          const map = new Map<string, any>()
          for (const p of list) {
            for (const b of splitBarcodes(p.barcodes ?? p.barcode)) map.set(b, p)
          }
          catalogByBarcode.current = map
        }

        if (!cancelled && invRes.ok) {
          const invData = await invRes.json()
          const rows: any[] = Array.isArray(invData) ? invData : []
          const items: LiveItem[] = rows
            .map((row) => {
              const product = row.products || {}
              const productId = String(row.productId ?? row.productid ?? product.id ?? "")
              const barcodes = splitBarcodes(product.barcode ?? row.barcode ?? row.barcodes)
              const systemQty = Math.max(0, Math.trunc(Number(row.quantity) || 0))
              return {
                productId,
                name: product.name ?? row.name ?? "Unknown",
                barcode: barcodes[0] ?? "",
                barcodes,
                price: pickPrice(product) || pickPrice(row),
                systemQty,
                countedQty: 0,
                outcome: "missing" as const,
                unexpected: false,
              }
            })
            .filter((it) => it.systemQty > 0)
          if (!cancelled) setBaseItems(items)
        }
      } catch (err) {
        console.error("Error loading audit data:", err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    listAudits(storeId).then((h) => !cancelled && setHistory(h))
    setHasSavedDraft(!!getDraft(storeId))

    return () => {
      cancelled = true
    }
  }, [storeId])

  const lastAudit = history[0] || null

  const startFresh = () => {
    clearDraft(storeId)
    setHasSavedDraft(false)
    setMode("fresh")
    setTab("new")
  }

  const resumeDraft = () => {
    setMode("resume")
    setTab("new")
  }

  const handleAuditSaved = async (record: AuditRecord) => {
    clearDraft(storeId)
    setHasSavedDraft(false)
    router.push(`/dashboard/audit/summary?auditId=${encodeURIComponent(record.id)}`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading store audit...
      </div>
    )
  }

  if (!storeId) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/audit")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="py-16 text-center text-muted-foreground">No store selected.</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/audit")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>

      {/* Store header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Store className="h-5 w-5 text-muted-foreground" />
                {store?.name || "Store"}
              </CardTitle>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {store?.storecode && <span className="font-mono">{store.storecode}</span>}
                {store?.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {store.address}
                  </span>
                )}
                {store?.manager && (
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" /> {store.manager}
                  </span>
                )}
              </div>
            </div>
            {store?.status && (
              <Badge variant={store.status === "active" ? "default" : "secondary"}>
                {store.status}
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <Gauge className="h-4 w-4 mr-1.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-1.5" /> History
            {history.length > 0 && (
              <Badge variant="secondary" className="ml-1.5">
                {history.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="new">
            <ScanLine className="h-4 w-4 mr-1.5" /> New audit
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <OverviewTab
            store={store}
            lastAudit={lastAudit}
            hasSavedDraft={hasSavedDraft}
            draftSavedAt={getDraft(storeId)?.savedAt}
            onStart={startFresh}
            onResume={resumeDraft}
          />
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history" className="mt-4">
          <HistoryTab
            history={history}
            onOpen={(id) =>
              router.push(`/dashboard/audit/summary?auditId=${encodeURIComponent(id)}`)
            }
          />
        </TabsContent>

        {/* NEW AUDIT (scan) */}
        <TabsContent value="new" className="mt-4">
          {mode ? (
            <ScanPanel
              key={mode}
              storeId={storeId}
              store={store}
              mode={mode}
              baseItems={baseItems}
              catalogByBarcode={catalogByBarcode}
              onSaved={handleAuditSaved}
            />
          ) : (
            <Card>
              <CardContent className="py-16 text-center space-y-4">
                <p className="text-muted-foreground">Ready to count this store.</p>
                <div className="flex items-center justify-center gap-3">
                  {hasSavedDraft && (
                    <Button variant="outline" onClick={resumeDraft}>
                      <Play className="h-4 w-4 mr-1" /> Resume saved audit
                    </Button>
                  )}
                  <Button onClick={startFresh}>
                    <ScanLine className="h-4 w-4 mr-1" /> Start new audit
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================
// OVERVIEW TAB
// ============================================================

function OverviewTab({
  store,
  lastAudit,
  hasSavedDraft,
  draftSavedAt,
  onStart,
  onResume,
}: {
  store: StoreType | null
  lastAudit: AuditRecord | null
  hasSavedDraft: boolean
  draftSavedAt?: string
  onStart: () => void
  onResume: () => void
}) {
  return (
    <div className="space-y-4">
      {hasSavedDraft && (
        <Card className="border-amber-400/50 bg-amber-50/50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <Clock className="h-4 w-4" />
              You have an unfinished audit for this store
              {draftSavedAt && <span className="text-amber-700">· saved {formatDateTime(draftSavedAt)}</span>}
            </div>
            <Button size="sm" onClick={onResume}>
              <Play className="h-4 w-4 mr-1" /> Resume
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Current inventory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat icon={Package} label="Products" value={store?.productCount ?? 0} />
              <Stat icon={Boxes} label="Units" value={store?.totalStock ?? 0} />
              <Stat
                icon={IndianRupee}
                label="Stock value"
                value={formatCurrency(store?.totalStockValue ?? 0)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Start audit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={onStart}>
              <ScanLine className="h-4 w-4 mr-1" /> Start new audit
            </Button>
            {hasSavedDraft && (
              <Button variant="outline" className="w-full" onClick={onResume}>
                <Play className="h-4 w-4 mr-1" /> Resume saved
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Last audit</CardTitle>
        </CardHeader>
        <CardContent>
          {lastAudit ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
              <Stat icon={Gauge} label="Accuracy" value={`${lastAudit.totals.accuracyPct}%`} tone="ok" />
              <Stat
                icon={AlertTriangle}
                label="Missing lines"
                value={lastAudit.totals.missingLines + lastAudit.totals.shortLines}
                tone="warn"
              />
              <Stat icon={Sparkles} label="Newly found" value={lastAudit.totals.foundLines} tone="found" />
              <Stat
                icon={IndianRupee}
                label="₹ impact"
                value={formatCurrency(lastAudit.totals.discrepancyValue)}
              />
              <div className="col-span-2 md:col-span-4 text-xs text-muted-foreground">
                {formatDateTime(lastAudit.completedAt)} · by {lastAudit.auditedBy}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No audits yet for this store.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// HISTORY TAB
// ============================================================

function HistoryTab({
  history,
  onOpen,
}: {
  history: AuditRecord[]
  onOpen: (id: string) => void
}) {
  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          No audits recorded for this store yet.
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {history.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onOpen(a.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{formatDateTime(a.completedAt)}</div>
                <div className="text-xs text-muted-foreground">by {a.auditedBy}</div>
              </div>
              <div className="flex items-center gap-4 text-xs tabular-nums">
                <span className="text-emerald-600">{a.totals.accuracyPct}% ok</span>
                <span className="text-amber-600">
                  {a.totals.missingLines + a.totals.shortLines} short
                </span>
                <span className="text-green-600">{a.totals.foundLines} new</span>
                <span className={cn(a.totals.discrepancyValue < 0 ? "text-red-600" : "text-emerald-600")}>
                  ₹{formatCurrency(a.totals.discrepancyValue)}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// SCAN PANEL (the live audit)
// ============================================================

function ScanPanel({
  storeId,
  store,
  mode,
  baseItems,
  catalogByBarcode,
  onSaved,
}: {
  storeId: string
  store: StoreType | null
  mode: Mode
  baseItems: LiveItem[]
  catalogByBarcode: React.MutableRefObject<Map<string, any>>
  onSaved: (record: AuditRecord) => void
}) {
  // Seed from draft (resume) or from base inventory (fresh).
  const seed = useMemo(() => {
    if (mode === "resume") {
      const d = getDraft(storeId)
      if (d) {
        return {
          left: d.leftItems.map((it) => ({ ...it, unexpected: it.outcome === "found" })) as LiveItem[],
          right: d.rightItems.map((it) => ({ ...it, unexpected: false })) as LiveItem[],
          startedAt: d.startedAt,
        }
      }
    }
    return {
      left: baseItems.map((it) => ({ ...it, countedQty: 0, outcome: "missing" as const })),
      right: [] as LiveItem[],
      startedAt: new Date().toISOString(),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, storeId])

  const [leftItems, setLeftItems] = useState<LiveItem[]>(seed.left)
  const [rightItems, setRightItems] = useState<LiveItem[]>(seed.right)
  const startedAtRef = useRef<string>(seed.startedAt)

  const [scanValue, setScanValue] = useState("")
  const [lastScan, setLastScan] = useState<{ text: string; tone: "ok" | "found" | "warn" } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // When > 0, the "mark as missing or unscanned?" dialog is shown before saving.
  const [pendingUnscanned, setPendingUnscanned] = useState(0)
  const scanInputRef = useRef<HTMLInputElement>(null)

  // Auto-save draft on every change to the panels.
  useEffect(() => {
    saveDraft({
      storeId,
      leftItems,
      rightItems,
      lastScan,
      startedAt: startedAtRef.current,
      savedAt: new Date().toISOString(),
    })
  }, [storeId, leftItems, rightItems, lastScan])

  const focusScan = () => scanInputRef.current?.focus()

  const handleScan = () => {
    const code = scanValue.trim()
    setScanValue("")
    if (!code) return

    const rightIdx = rightItems.findIndex(
      (it) => (it.barcodes || []).includes(code) || it.barcode === code,
    )
    if (rightIdx !== -1) {
      setRightItems((prev) =>
        prev.map((it, i) => (i === rightIdx ? { ...it, countedQty: it.countedQty + 1 } : it)),
      )
      setLastScan({ text: `Over-count: ${rightItems[rightIdx].name}`, tone: "warn" })
      focusScan()
      return
    }

    const leftIdx = leftItems.findIndex(
      (it) => (it.barcodes || []).includes(code) || it.barcode === code,
    )
    if (leftIdx !== -1) {
      const item = leftItems[leftIdx]
      const nextCount = item.countedQty + 1

      if (!item.unexpected && nextCount >= item.systemQty) {
        setLeftItems((prev) => prev.filter((_, i) => i !== leftIdx))
        setRightItems((prev) => [{ ...item, countedQty: nextCount }, ...prev])
        setLastScan({ text: `Verified: ${item.name}`, tone: "ok" })
      } else {
        setLeftItems((prev) =>
          prev.map((it, i) => (i === leftIdx ? { ...it, countedQty: nextCount } : it)),
        )
        setLastScan({ text: `${item.name} — ${nextCount}/${item.systemQty || "?"}`, tone: "ok" })
      }
      focusScan()
      return
    }

    const product = catalogByBarcode.current.get(code)
    const newItem: LiveItem = product
      ? {
          productId: String(product.id ?? code),
          name: product.name ?? "Unknown product",
          barcode: code,
          barcodes: splitBarcodes(product.barcodes ?? product.barcode),
          price: pickPrice(product),
          systemQty: 0,
          countedQty: 1,
          outcome: "found",
          unexpected: true,
        }
      : {
          productId: code,
          name: "Unknown barcode",
          barcode: code,
          barcodes: [code],
          price: 0,
          systemQty: 0,
          countedQty: 1,
          outcome: "found",
          unexpected: true,
        }
    setLeftItems((prev) => [newItem, ...prev])
    setLastScan({ text: `Not in store: ${newItem.name}`, tone: "found" })
    focusScan()
  }

  const handleReset = () => {
    setRightItems([])
    setLeftItems((prev) =>
      prev.filter((it) => !it.unexpected).map((it) => ({ ...it, countedQty: 0 })),
    )
    setLastScan(null)
    focusScan()
  }

  // Clicking Done: if some system lines were never scanned, ask how to record
  // them first; otherwise finish straight away.
  const handleDone = () => {
    const unscanned = countUnscanned(leftItems)
    if (unscanned > 0) {
      setPendingUnscanned(unscanned)
      return
    }
    finalize("unscanned")
  }

  const finalize = async (unscannedAs: UnscannedAs) => {
    setPendingUnscanned(0)
    setIsSaving(true)
    try {
      const { items, totals } = buildAuditResult(leftItems, rightItems, unscannedAs)
      const record = await saveAudit({
        storeId,
        storeName: store?.name || "Store",
        storeCode: store?.storecode || "",
        auditedBy: getAuditorName(),
        startedAt: startedAtRef.current,
        totals,
        items,
      })
      onSaved(record)
    } catch (err) {
      console.error("Error saving audit:", err)
      setIsSaving(false)
    }
  }

  const stats = useMemo(() => {
    const missing = leftItems.filter((it) => !it.unexpected)
    const found = leftItems.filter((it) => it.unexpected)
    const scannedUnits =
      rightItems.reduce((s, it) => s + it.countedQty, 0) +
      leftItems.reduce((s, it) => s + it.countedQty, 0)
    return {
      verifiedLines: rightItems.length,
      missingLines: missing.length,
      foundLines: found.length,
      scannedUnits,
    }
  }, [leftItems, rightItems])

  return (
    <div className="space-y-5">
      {/* Live stats */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
            <Stat icon={ScanLine} label="Scanned units" value={stats.scannedUnits} />
            <Stat icon={CheckCircle2} label="Verified" value={stats.verifiedLines} tone="ok" />
            <Stat icon={AlertTriangle} label="Remaining" value={stats.missingLines} tone="warn" />
            <Stat icon={Sparkles} label="Newly found" value={stats.foundLines} tone="found" />
          </div>
        </CardContent>
      </Card>

      {/* Scan bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px] space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Scan / enter barcode</label>
              <div className="relative">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={scanInputRef}
                  autoFocus
                  placeholder="Scan a product (Enter)"
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleScan()
                    }
                  }}
                  className="pl-9"
                />
              </div>
            </div>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
            <Button onClick={handleDone} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <ClipboardCheck className="h-4 w-4 mr-1" />
              )}
              Done the audit
            </Button>
          </div>
          {lastScan && (
            <p
              className={cn(
                "mt-2 text-xs font-medium",
                lastScan.tone === "ok" && "text-emerald-600",
                lastScan.tone === "found" && "text-green-600",
                lastScan.tone === "warn" && "text-amber-600",
              )}
            >
              {lastScan.text}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="In store (system)"
          subtitle="Expected — missing items stay here. Green = newly found, not in system."
          count={leftItems.length}
          empty="All expected products verified."
        >
          {leftItems.map((it, i) => (
            <ItemRow key={`${it.productId}-${i}`} item={it} side="left" />
          ))}
        </Panel>

        <Panel
          title="Verified (rescanned)"
          subtitle="Products confirmed physically present."
          count={rightItems.length}
          tone="ok"
          empty="Scan products to verify them."
        >
          {rightItems.map((it, i) => (
            <ItemRow key={`${it.productId}-${i}`} item={it} side="right" />
          ))}
        </Panel>
      </div>

      {/* Done confirmation when some products were never scanned */}
      <AlertDialog open={pendingUnscanned > 0} onOpenChange={(o) => !o && setPendingUnscanned(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Some products are not scanned yet</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingUnscanned} product{pendingUnscanned === 1 ? "" : "s"} in this store{" "}
              {pendingUnscanned === 1 ? "was" : "were"} never scanned. How should they be recorded in
              this audit?
              <br />
              <br />
              <span className="text-foreground font-medium">Unscanned</span> — keep them neutral (not
              counted as a loss). Use this if you just didn&apos;t finish.
              <br />
              <span className="text-foreground font-medium">Missing</span> — confirm they are not
              physically present (counted as shortage / ₹ loss).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setPendingUnscanned(0)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => finalize("unscanned")}>
              Mark as unscanned
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => finalize("missing")}
            >
              Mark as missing
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function StoreAuditPage() {
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
        <StoreAuditView />
      </Suspense>
    </DashboardLayout>
  )
}

function Stat({
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
    <div className="rounded-md bg-muted/40 py-2 px-1">
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
    </div>
  )
}

function Panel({
  title,
  subtitle,
  count,
  tone,
  empty,
  children,
}: {
  title: string
  subtitle: string
  count: number
  tone?: "ok"
  empty: string
  children: React.ReactNode
}) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant={tone === "ok" ? "default" : "secondary"}>{count}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[55vh] overflow-y-auto">
        {isEmpty ? (
          <div className="py-10 text-center text-sm text-muted-foreground">{empty}</div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

function ItemRow({ item, side }: { item: LiveItem; side: "left" | "right" }) {
  const isShort = side === "left" && !item.unexpected && item.countedQty < item.systemQty
  const isOver = side === "right" && item.countedQty > item.systemQty
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
        item.unexpected && "border-green-500/40 bg-green-50",
        side === "right" && "border-emerald-500/30 bg-emerald-50/40",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={item.name}>
          {item.name}
          {item.unexpected && (
            <span className="ml-2 rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              NEW
            </span>
          )}
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground" title={item.barcode}>
          {item.barcode || "—"}
        </div>
      </div>
      <div className="text-right text-sm tabular-nums">
        <div className={cn(isOver && "text-amber-600", isShort && "text-amber-600", "font-semibold")}>
          {item.countedQty}
          {!item.unexpected && <span className="text-muted-foreground"> / {item.systemQty}</span>}
        </div>
        <div className="text-[11px] text-muted-foreground">₹{formatCurrency(item.price)}</div>
      </div>
    </div>
  )
}
