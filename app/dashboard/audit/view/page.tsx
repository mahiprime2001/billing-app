"use client"

import { API_BASE } from "@/lib/api-base"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import AuditReportDialog from "@/components/audit-report-dialog"
import BillingPauseSwitch from "@/components/billing-pause-switch"
import { Checkbox } from "@/components/ui/checkbox"
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
  X,
  Minus,
  Plus,
  Trash2,
  Users,
  WifiOff,
  LogOut,
  Printer,
} from "lucide-react"
import { printAuditReport } from "@/lib/audit-report"
import { cn } from "@/lib/utils"
import {
  AuditSync,
  type PanelState,
  type SessionEnd,
  type SessionSummary,
  type SyncStatus,
  applyRemoteEvents,
  cancelSession,
  clearOutbox,
  getDeviceId,
  getOpenSession,
} from "@/lib/audit-session"
import {
  AuditSessionEndedError,
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

// fresh = blank start, resume = continue this device's saved draft,
// join = blank start that fills in from an audit already being counted elsewhere.
type Mode = "fresh" | "resume" | "join"

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
  // "Pause billing at this store while I count" -- ticked by default. Only a NEW audit takes it;
  // joining or resuming one never changes its pause (use the switch in the header for that).
  const [pauseBilling, setPauseBilling] = useState(true)
  // The report popup (Print / Close): opened from History, or right after finishing an audit.
  const [reportAudit, setReportAudit] = useState<AuditRecord | null>(null)
  const [reportJustFinished, setReportJustFinished] = useState(false)
  // An audit someone (maybe on another computer) is counting right now.
  const [openSession, setOpenSession] = useState<SessionSummary | null>(null)

  // Watch for a shared audit while on the overview (the scan panel has its own sync).
  useEffect(() => {
    if (!storeId || mode) return
    let cancelled = false
    const check = async () => {
      const s = await getOpenSession(storeId)
      if (cancelled || s === undefined) return // server unreachable -- keep what we know
      setOpenSession(s)
      // A saved draft whose session was finished/cancelled elsewhere can't be resumed.
      const d = getDraft(storeId)
      if (d?.sessionId && d.sessionId !== s?.id) {
        clearDraft(storeId)
        clearOutbox(storeId)
        setHasSavedDraft(false)
      }
    }
    check()
    const timer = setInterval(check, 8000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [storeId, mode])

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

  const startFresh = async () => {
    if (openSession) {
      const ok = window.confirm(
        `An audit is already being counted for this store (started by ${openSession.startedBy || "someone"}, ` +
          `${openSession.scannedUnits} units so far).\n\nStarting a new one discards it for everyone. Continue?`,
      )
      if (!ok) return
      await cancelSession(openSession.id)
      setOpenSession(null)
    }
    clearDraft(storeId)
    clearOutbox(storeId)
    setHasSavedDraft(false)
    setMode("fresh")
    setTab("new")
  }

  const resumeDraft = () => {
    setMode("resume")
    setTab("new")
  }

  const joinSession = () => {
    setMode("join")
    setTab("new")
  }

  const finishedElsewhere = (auditId: string) => {
    clearDraft(storeId)
    clearOutbox(storeId)
    setHasSavedDraft(false)
    router.push(`/dashboard/audit/summary?auditId=${encodeURIComponent(auditId)}`)
  }

  const openSummary = (auditId: string) =>
    router.push(`/dashboard/audit/summary?auditId=${encodeURIComponent(auditId)}`)

  // Audit just finished: offer Print / Close first, then carry on to the summary page.
  const handleAuditSaved = async (record: AuditRecord) => {
    clearDraft(storeId)
    clearOutbox(storeId)
    setHasSavedDraft(false)
    setHistory((prev) => [record, ...prev.filter((a) => a.id !== record.id)])
    setReportJustFinished(true)
    setReportAudit(record)
  }

  const closeReport = () => {
    const finished = reportJustFinished && reportAudit
    setReportAudit(null)
    setReportJustFinished(false)
    if (finished) openSummary(finished.id)
  }

  // Leave the counting screen but keep the audit going (unlike Cancel, nothing is discarded).
  const closeScanner = () => {
    setHasSavedDraft(!!getDraft(storeId))
    setMode(null)
    setTab("overview")
  }

  // The scan panel has already confirmed with the user and told the server.
  const cancelAudit = () => {
    clearDraft(storeId)
    clearOutbox(storeId)
    setHasSavedDraft(false)
    setMode(null)
    setTab("overview")
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
            <div className="flex flex-col items-end gap-2">
              {store?.status && (
                <Badge variant={store.status === "active" ? "default" : "secondary"}>
                  {store.status}
                </Badge>
              )}
              <BillingPauseSwitch storeId={storeId} storeName={store?.name || ""} />
            </div>
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
            openSession={openSession}
            onStart={startFresh}
            pauseBilling={pauseBilling}
            onPauseBillingChange={setPauseBilling}
            onResume={resumeDraft}
            onJoin={joinSession}
          />
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history" className="mt-4">
          <HistoryTab
            history={history}
            onOpen={(id) => {
              const picked = history.find((a) => a.id === id)
              if (picked) {
                setReportJustFinished(false)
                setReportAudit(picked)
              } else {
                openSummary(id)
              }
            }}
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
              pauseBilling={pauseBilling}
              baseItems={baseItems}
              catalogByBarcode={catalogByBarcode}
              onSaved={handleAuditSaved}
              onCancel={cancelAudit}
              onClose={closeScanner}
              onOpenAudit={finishedElsewhere}
            />
          ) : (
            <Card>
              <CardContent className="py-16 text-center space-y-4">
                <p className="text-muted-foreground">
                  {openSession
                    ? `An audit is already being counted for this store (${openSession.scannedUnits} units so far).`
                    : "Ready to count this store."}
                </p>
                <div className="flex items-center justify-center gap-3">
                  {hasSavedDraft && (
                    <Button variant="outline" onClick={resumeDraft}>
                      <Play className="h-4 w-4 mr-1" /> Resume saved audit
                    </Button>
                  )}
                  {openSession && !hasSavedDraft && (
                    <Button onClick={joinSession}>
                      <Users className="h-4 w-4 mr-1" /> Join audit in progress
                    </Button>
                  )}
                  <Button onClick={startFresh}>
                    <ScanLine className="h-4 w-4 mr-1" /> Start new audit
                  </Button>
                </div>
                <PauseBillingTick checked={pauseBilling} onChange={setPauseBilling} className="justify-center" />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <AuditReportDialog audit={reportAudit} onClose={closeReport} onOpenFull={openSummary} />
    </div>
  )
}

// The tick box next to "Start new audit".
function PauseBillingTick({
  checked,
  onChange,
  className,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  className?: string
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 text-sm", className)}>
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <span className="text-left">
        Pause billing at this store while I count
        <span className="block text-xs text-muted-foreground">
          Its billing app is blocked until the audit is finished or cancelled.
        </span>
      </span>
    </label>
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
  openSession,
  onStart,
  pauseBilling,
  onPauseBillingChange,
  onResume,
  onJoin,
}: {
  store: StoreType | null
  lastAudit: AuditRecord | null
  pauseBilling: boolean
  onPauseBillingChange: (v: boolean) => void
  hasSavedDraft: boolean
  draftSavedAt?: string
  openSession: SessionSummary | null
  onStart: () => void
  onResume: () => void
  onJoin: () => void
}) {
  return (
    <div className="space-y-4">
      {openSession && (
        <Card className="border-sky-400/50 bg-sky-50/50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-2 text-sm text-sky-900">
              <Users className="h-4 w-4" />
              <span>
                Audit in progress{openSession.startedBy ? ` — started by ${openSession.startedBy}` : ""} ·{" "}
                {openSession.devices.length} device{openSession.devices.length === 1 ? "" : "s"} ·{" "}
                {openSession.scannedUnits} units counted
              </span>
            </div>
            {hasSavedDraft ? (
              <Button size="sm" onClick={onResume}>
                <Play className="h-4 w-4 mr-1" /> Continue counting
              </Button>
            ) : (
              <Button size="sm" onClick={onJoin}>
                <Users className="h-4 w-4 mr-1" /> Join
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      {hasSavedDraft && !openSession && (
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
            <PauseBillingTick checked={pauseBilling} onChange={onPauseBillingChange} />
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
  pauseBilling,
  baseItems,
  catalogByBarcode,
  onSaved,
  onCancel,
  onClose,
  onOpenAudit,
}: {
  storeId: string
  store: StoreType | null
  mode: Mode
  pauseBilling: boolean
  baseItems: LiveItem[]
  catalogByBarcode: React.MutableRefObject<Map<string, any>>
  onSaved: (record: AuditRecord) => void
  onCancel: () => void
  onClose: () => void
  onOpenAudit: (auditId: string) => void
}) {
  // Seed from draft (resume) or from base inventory (fresh / join).
  const seed = useMemo(() => {
    if (mode === "resume") {
      const d = getDraft(storeId)
      if (d) {
        return {
          left: d.leftItems.map((it) => ({ ...it, unexpected: it.outcome === "found" })) as LiveItem[],
          right: d.rightItems.map((it) => ({ ...it, unexpected: false })) as LiveItem[],
          startedAt: d.startedAt,
          sessionId: d.sessionId ?? null,
          lastSeq: d.lastSeq ?? 0,
        }
      }
    }
    return {
      left: baseItems.map((it) => ({ ...it, countedQty: 0, outcome: "missing" as const })),
      right: [] as LiveItem[],
      startedAt: new Date().toISOString(),
      sessionId: null as string | null,
      lastSeq: 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, storeId])

  const [leftItems, setLeftItems] = useState<LiveItem[]>(seed.left)
  const [rightItems, setRightItems] = useState<LiveItem[]>(seed.right)
  const startedAtRef = useRef<string>(seed.startedAt)

  // ---- shared session (several devices counting this store) ----
  // stateRef always holds the newest panels so syncing and "Done" never read stale closures.
  const stateRef = useRef<PanelState>({ left: seed.left, right: seed.right })
  useEffect(() => {
    stateRef.current = { left: leftItems, right: rightItems }
  }, [leftItems, rightItems])
  const syncRef = useRef<AuditSync | null>(null)
  const endedRef = useRef<SessionEnd | null>(null)
  const [ended, setEnded] = useState<SessionEnd | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    online: true,
    pending: 0,
    devices: [],
    sessionId: null,
  })

  useEffect(() => {
    const auditor = getAuditorName()
    const sync = new AuditSync({
      storeId,
      deviceId: getDeviceId(),
      label: auditor,
      startedBy: auditor,
      // Only meaningful when this device STARTS the session (fresh); the server ignores it on join/resume.
      pauseBilling: mode === "fresh" && pauseBilling,
      draftSessionId: seed.sessionId,
      draftLastSeq: seed.lastSeq,
      // Fresh/join start blank, so the server's whole history (including ours) is replayed.
      replayAll: mode !== "resume",
      onRemote: (events, lastSeq) => {
        const next = applyRemoteEvents(stateRef.current, events)
        stateRef.current = next
        // Save the panels together with the high-water mark so they can never disagree.
        saveDraft({
          storeId,
          leftItems: next.left,
          rightItems: next.right,
          lastScan: null,
          startedAt: startedAtRef.current,
          savedAt: new Date().toISOString(),
          sessionId: sync.sessionId,
          lastSeq,
        })
        setLeftItems(next.left)
        setRightItems(next.right)
      },
      onRebase: () => {
        const blank = baseItems.map((it) => ({ ...it, countedQty: 0, outcome: "missing" as const }))
        stateRef.current = { left: blank, right: [] }
        setLeftItems(blank)
        setRightItems([])
      },
      onEnded: (end) => {
        endedRef.current = end
        setEnded(end)
      },
      onStatus: setSyncStatus,
    })
    syncRef.current = sync
    // An unfinished audit saved before shared sessions existed has counts the server has
    // never seen. Send them once as events so other devices can join and see them.
    if (mode === "resume" && !seed.sessionId) {
      for (const it of [...seed.left, ...seed.right]) {
        if (it.countedQty > 0) {
          sync.emit({
            type: "delta",
            key: it.productId,
            delta: it.countedQty,
            meta: it.unexpected
              ? { name: it.name, barcode: it.barcode, barcodes: it.barcodes, price: it.price }
              : null,
          })
        }
      }
    }
    sync.start()
    return () => {
      sync.stop()
      syncRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  // Tell the other devices about a change made here (saved locally first, sent in the background).
  const metaOf = (it: LiveItem) => ({ name: it.name, barcode: it.barcode, barcodes: it.barcodes, price: it.price })
  const emit = (it: LiveItem, delta: number) => {
    if (delta === 0) return
    syncRef.current?.emit({ type: "delta", key: it.productId, delta, meta: it.unexpected ? metaOf(it) : null })
  }

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
      sessionId: syncRef.current?.sessionId ?? seed.sessionId,
      lastSeq: syncRef.current?.lastSeq ?? seed.lastSeq,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, leftItems, rightItems, lastScan])

  const focusScan = () => scanInputRef.current?.focus()

  const handleScan = () => {
    const code = scanValue.trim()
    setScanValue("")
    if (!code || endedRef.current) return

    const rightIdx = rightItems.findIndex(
      (it) => (it.barcodes || []).includes(code) || it.barcode === code,
    )
    if (rightIdx !== -1) {
      setRightItems((prev) =>
        prev.map((it, i) => (i === rightIdx ? { ...it, countedQty: it.countedQty + 1 } : it)),
      )
      setLastScan({ text: `Over-count: ${rightItems[rightIdx].name}`, tone: "warn" })
      emit(rightItems[rightIdx], 1)
      focusScan()
      return
    }

    const leftIdx = leftItems.findIndex(
      (it) => (it.barcodes || []).includes(code) || it.barcode === code,
    )
    if (leftIdx !== -1) {
      const item = leftItems[leftIdx]
      const nextCount = item.countedQty + 1
      emit(item, 1)

      if (!item.unexpected && nextCount >= item.systemQty) {
        setLeftItems((prev) => prev.filter((_, i) => i !== leftIdx))
        setRightItems((prev) => [{ ...item, countedQty: nextCount }, ...prev])
        setLastScan({ text: `Verified: ${item.name}`, tone: "ok" })
      } else {
        setLeftItems((prev) => [
          { ...item, countedQty: nextCount },
          ...prev.filter((_, i) => i !== leftIdx),
        ])
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
    emit(newItem, 1)
    focusScan()
  }

  const handleReset = () => {
    setRightItems([])
    setLeftItems((prev) =>
      prev.filter((it) => !it.unexpected).map((it) => ({ ...it, countedQty: 0 })),
    )
    setLastScan(null)
    syncRef.current?.emit({ type: "reset" })
    focusScan()
  }

  // Clicking Done: first catch up with the other devices, then, if some system lines
  // were never scanned, ask how to record them; otherwise finish straight away.
  const handleDone = async () => {
    if (endedRef.current) return
    setIsSaving(true)
    const sync = syncRef.current
    const synced = sync ? await sync.syncNow() : true
    if (endedRef.current) {
      setIsSaving(false)
      return
    }
    if (sync?.sessionId && !synced) {
      const goOn = window.confirm(
        "Couldn't reach the server, so scans from other devices may be missing from this count. Finish anyway?",
      )
      if (!goOn) {
        setIsSaving(false)
        return
      }
    }
    const unscanned = countUnscanned(stateRef.current.left)
    if (unscanned > 0) {
      setPendingUnscanned(unscanned)
      setIsSaving(false)
      return
    }
    finalize("unscanned")
  }

  const finalize = async (unscannedAs: UnscannedAs) => {
    setPendingUnscanned(0)
    setIsSaving(true)
    try {
      // Pick up anything another device scanned while the dialog was open.
      await syncRef.current?.syncNow()
      if (endedRef.current) {
        setIsSaving(false)
        return
      }
      const { left, right } = stateRef.current
      const { items, totals } = buildAuditResult(left, right, unscannedAs)
      const record = await saveAudit({
        storeId,
        storeName: store?.name || "Store",
        storeCode: store?.storecode || "",
        auditedBy: getAuditorName(),
        startedAt: startedAtRef.current,
        totals,
        items,
        sessionId: syncRef.current?.sessionId ?? null,
      })
      syncRef.current?.stop()
      clearOutbox(storeId)
      onSaved(record)
    } catch (err) {
      if (err instanceof AuditSessionEndedError) {
        // Another device pressed Done first -- its audit is the one that counts.
        syncRef.current?.stop()
        const end = { status: err.status, auditId: err.auditId }
        endedRef.current = end
        setEnded(end)
      } else {
        console.error("Error saving audit:", err)
        // Saying nothing looked like "the button does nothing". The counts are still on this
        // device and the shared session is released, so Done can simply be pressed again.
        window.alert(
          `The audit could not be saved.\n\n${err instanceof Error ? err.message : "Unknown error"}\n\n` +
            "Your counts are safe on this device. Try Done again, or tell the admin the message above.",
        )
      }
      setIsSaving(false)
    }
  }

  // Close leaves the counting screen WITHOUT discarding anything: the draft stays on this
  // device and the shared audit stays open, so it can be resumed or joined again. First push
  // out any scans still waiting, so other devices see them while this one is away.
  const handleClose = async () => {
    setIsSaving(true)
    try {
      await syncRef.current?.syncNow()
    } catch {
      // Offline is fine: the scans are in the saved draft and the outbox, and go out on resume.
    }
    syncRef.current?.stop()
    onClose()
  }

  // Print the count so far, without finishing the audit. Products not scanned yet are
  // listed as "Not scanned" (neutral), and "Completed" shows the time it was printed.
  const handlePrint = () => {
    const { left, right } = stateRef.current
    const { items, totals } = buildAuditResult(left, right, "unscanned")
    try {
      printAuditReport({
        id: "in-progress",
        storeId,
        storeName: store?.name || "Store",
        storeCode: store?.storecode || "",
        auditedBy: getAuditorName(),
        startedAt: startedAtRef.current,
        completedAt: new Date().toISOString(),
        totals,
        items,
      })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not print the report")
    }
    focusScan()
  }

  // Cancel discards the shared audit for every device counting this store.
  const handleCancel = async () => {
    const sync = syncRef.current
    if (!endedRef.current) {
      if (!window.confirm("Cancel this audit? Progress is discarded for everyone counting this store.")) return
      if (sync?.sessionId && !(await cancelSession(sync.sessionId))) {
        window.alert("Couldn't reach the server, so other devices may still be counting. Cancelled on this device only.")
      }
    }
    sync?.stop()
    onCancel()
  }

  const stats = useMemo(() => {
    const missing = leftItems.filter((it) => !it.unexpected)
    const found = leftItems.filter((it) => it.unexpected)
    const scannedUnits =
      rightItems.reduce((s, it) => s + it.countedQty, 0) +
      leftItems.reduce((s, it) => s + it.countedQty, 0)
    const countedValue =
      rightItems.reduce((s, it) => s + it.price * it.countedQty, 0) +
      leftItems.reduce((s, it) => s + it.price * it.countedQty, 0)
    // Stock (units) behind each item count, and what is still to be found.
    const stillToFind = (it: LiveItem) => Math.max(0, it.systemQty - it.countedQty)
    return {
      verifiedLines: rightItems.length,
      verifiedStock: rightItems.reduce((s, it) => s + it.countedQty, 0),
      missingLines: missing.length,
      remainingStock: missing.reduce((s, it) => s + stillToFind(it), 0),
      remainingValue: missing.reduce((s, it) => s + stillToFind(it) * it.price, 0),
      foundLines: found.length,
      foundStock: found.reduce((s, it) => s + it.countedQty, 0),
      scannedUnits,
      countedValue,
    }
  }, [leftItems, rightItems])

  // Clicking a left card = manually verify one unit of that product (same effect as scanning it).
  const selectLeftItem = (idx: number) => {
    const item = leftItems[idx]
    if (!item) return
    const nextCount = item.countedQty + 1
    emit(item, 1)
    if (!item.unexpected && nextCount >= item.systemQty) {
      setLeftItems((prev) => prev.filter((_, i) => i !== idx))
      setRightItems((prev) => [{ ...item, countedQty: nextCount }, ...prev])
      setLastScan({ text: `Verified: ${item.name}`, tone: "ok" })
    } else {
      setLeftItems((prev) => [
        { ...item, countedQty: nextCount },
        ...prev.filter((_, i) => i !== idx),
      ])
      setLastScan({ text: `${item.name} — ${nextCount}/${item.systemQty || "?"}`, tone: "ok" })
    }
  }

  // Close on a verified card = un-verify it entirely, sending it back to the left panel to recount.
  const removeRightItem = (idx: number) => {
    const item = rightItems[idx]
    if (!item) return
    emit(item, -item.countedQty)
    setRightItems((prev) => prev.filter((_, i) => i !== idx))
    setLeftItems((prev) => [{ ...item, countedQty: 0 }, ...prev])
    setLastScan({ text: `Unverified: ${item.name}`, tone: "warn" })
  }

  // Clears every card from the verified (right) panel — sent back left to recount, none deleted.
  const clearAllRight = () => {
    if (rightItems.length === 0) return
    const ok = window.confirm(
      `Un-verify all ${rightItems.length} item${rightItems.length === 1 ? "" : "s"}? They will be sent back to the system list to recount.`,
    )
    if (!ok) return
    rightItems.forEach((it) => emit(it, -it.countedQty))
    setLeftItems((prev) => [...rightItems.map((it) => ({ ...it, countedQty: 0 })), ...prev])
    setRightItems([])
    setLastScan({ text: "Cleared all verified items", tone: "warn" })
  }

  // +/- on a verified card manually adjusts its counted qty; dropping below the expected qty sends it back left.
  const adjustRightQty = (idx: number, delta: number) => {
    const item = rightItems[idx]
    if (!item) return
    const nextCount = Math.max(0, item.countedQty + delta)
    emit(item, nextCount - item.countedQty)
    if (nextCount < item.systemQty) {
      setRightItems((prev) => prev.filter((_, i) => i !== idx))
      setLeftItems((prev) => [{ ...item, countedQty: nextCount }, ...prev])
      setLastScan({ text: `${item.name} — ${nextCount}/${item.systemQty}`, tone: "warn" })
    } else {
      setRightItems((prev) => prev.map((it, i) => (i === idx ? { ...it, countedQty: nextCount } : it)))
      setLastScan(
        nextCount > item.systemQty
          ? { text: `Over-count: ${item.name}`, tone: "warn" }
          : { text: `Verified: ${item.name}`, tone: "ok" },
      )
    }
  }

  // Devices that pinged the server recently (this one included).
  const activeDevices = syncStatus.devices.filter((d) => {
    const t = Date.parse(d.lastSeen)
    return Number.isFinite(t) && Date.now() - t < 30_000
  })

  return (
    <div className="space-y-5">
      {ended ? (
        <Card className="border-amber-400/60 bg-amber-50/60">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              {ended.status === "completed"
                ? "This audit was finished on another device."
                : "This audit was cancelled."}
            </div>
            <div className="flex gap-2">
              {ended.status === "completed" && ended.auditId && (
                <Button size="sm" onClick={() => onOpenAudit(ended.auditId as string)}>
                  View report
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleCancel}>
                Close
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {syncStatus.sessionId
              ? `Shared audit · ${activeDevices.length || 1} device${activeDevices.length > 1 ? "s" : ""} counting${
                  activeDevices.length > 1
                    ? ` (${activeDevices.map((d) => d.label || "device").join(", ")})`
                    : ""
                }`
              : "Counting on this device — connecting to the shared audit…"}
          </span>
          {!syncStatus.online && (
            <span className="flex items-center gap-1 text-amber-600">
              <WifiOff className="h-3.5 w-3.5" /> Offline — scans are saved on this device
            </span>
          )}
          {syncStatus.pending > 0 && <span>{syncStatus.pending} waiting to sync</span>}
        </div>
      )}

      {/* Live stats */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-center">
            <Stat icon={ScanLine} label="Scanned stock" value={stats.scannedUnits} />
            <Stat
              icon={CheckCircle2}
              label="Verified"
              value={stats.verifiedLines}
              sub={`${stats.verifiedStock} stock`}
              tone="ok"
            />
            <Stat
              icon={AlertTriangle}
              label="Remaining"
              value={stats.missingLines}
              sub={`${stats.remainingStock} stock`}
              tone="warn"
            />
            <Stat
              icon={Sparkles}
              label="Newly found"
              value={stats.foundLines}
              sub={`${stats.foundStock} stock`}
              tone="found"
            />
            <Stat icon={IndianRupee} label="Counted value" value={`₹${formatCurrency(stats.countedValue)}`} />
            <Stat
              icon={IndianRupee}
              label="Remaining stock value"
              value={`₹${formatCurrency(stats.remainingValue)}`}
              tone="warn"
            />
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
                  disabled={!!ended}
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
            <Button variant="outline" onClick={handleReset} disabled={!!ended}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isSaving || !!ended}
              title="Leave this screen and keep the audit — you can resume it later"
            >
              <LogOut className="h-4 w-4 mr-1" /> Close
            </Button>
            <Button variant="outline" onClick={handlePrint} title="Print the audit as counted so far">
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button onClick={handleDone} disabled={isSaving || !!ended}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <ClipboardCheck className="h-4 w-4 mr-1" />
              )}
              Done the audit
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isSaving || !!ended}>
              <X className="h-4 w-4 mr-1" /> Cancel
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
      <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-4", ended && "pointer-events-none opacity-60")}>
        <Panel
          title="In store (system)"
          subtitle="Expected — tap a card to count one unit. Green = newly found, not in system."
          count={leftItems.length}
          empty="All expected products verified."
        >
          {leftItems.map((it, i) => (
            <ItemRow
              key={`${it.productId}-${i}`}
              item={it}
              side="left"
              onSelect={() => selectLeftItem(i)}
            />
          ))}
        </Panel>

        <Panel
          title="Verified (rescanned)"
          subtitle="Products confirmed physically present. Adjust qty or close to un-verify."
          count={rightItems.length}
          tone="ok"
          empty="Scan products to verify them."
          action={
            rightItems.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAllRight}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear all
              </Button>
            )
          }
        >
          {rightItems.map((it, i) => (
            <ItemRow
              key={`${it.productId}-${i}`}
              item={it}
              side="right"
              onRemove={() => removeRightItem(i)}
              onIncrement={() => adjustRightQty(i, 1)}
              onDecrement={() => adjustRightQty(i, -1)}
            />
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
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  // Smaller line under the value, e.g. the stock behind an item count.
  sub?: React.ReactNode
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
      {sub != null && <div className="text-xs font-medium tabular-nums text-muted-foreground">{sub}</div>}
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
  action,
  children,
}: {
  title: string
  subtitle: string
  count: number
  tone?: "ok"
  empty: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-2">
            {action}
            <Badge variant={tone === "ok" ? "default" : "secondary"}>{count}</Badge>
          </div>
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

function ItemRow({
  item,
  side,
  onSelect,
  onRemove,
  onIncrement,
  onDecrement,
}: {
  item: LiveItem
  side: "left" | "right"
  onSelect?: () => void
  onRemove?: () => void
  onIncrement?: () => void
  onDecrement?: () => void
}) {
  const isShort = side === "left" && !item.unexpected && item.countedQty < item.systemQty
  const isOver = side === "right" && item.countedQty > item.systemQty

  const body = (
    <>
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
      {side === "left" ? (
        <div className="text-right text-sm tabular-nums">
          <div className={cn(isShort && "text-amber-600", "font-semibold")}>
            {item.countedQty}
            {!item.unexpected && <span className="text-muted-foreground"> / {item.systemQty}</span>}
          </div>
          <div className="text-[11px] text-muted-foreground">₹{formatCurrency(item.price)}</div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDecrement?.()
              }}
              className="flex h-6 w-6 items-center justify-center rounded border text-muted-foreground hover:bg-muted"
              aria-label="Decrease quantity"
            >
              <Minus className="h-3 w-3" />
            </button>
            <div className={cn("w-10 text-center text-sm font-semibold tabular-nums", isOver && "text-amber-600")}>
              {item.countedQty}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onIncrement?.()
              }}
              className="flex h-6 w-6 items-center justify-center rounded border text-muted-foreground hover:bg-muted"
              aria-label="Increase quantity"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground w-14 text-right">₹{formatCurrency(item.price)}</div>
        </div>
      )}
    </>
  )

  if (side === "left") {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 active:bg-muted/60",
          item.unexpected && "border-green-500/40 bg-green-50",
        )}
      >
        {body}
      </button>
    )
  }

  return (
    <div
      className={cn(
        "relative flex items-center justify-between gap-3 rounded-md border px-3 py-2 pr-8",
        "border-emerald-500/30 bg-emerald-50/40",
      )}
    >
      {body}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Remove from verified"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
