"use client"

import { API_BASE } from "@/lib/api-base"
import { cn } from "@/lib/utils"
import type React from "react"
import { useEffect, useMemo, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { formatDisplayDateTime } from "@/app/utils/formatDate"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  PackageCheck,
  RefreshCw,
  ChevronRight,
  Search,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowUpCircle,
  IndianRupee,
} from "lucide-react"

const API = API_BASE

// Synthetic destination: add held items back to the warehouse (global stock)
// instead of sending them to a store. No store verification step.
const WAREHOUSE_ID = "__warehouse__"

// Sentinel for the top store filter's "All stores" option (Radix Select can't use "").
const ALL_STORES_ID = "__all_stores__"

const REASONS = [
  { value: "damaged", label: "Damaged" },
  { value: "low_sales", label: "Low Sales" },
  { value: "modification", label: "Needs Modification" },
  { value: "other", label: "Other" },
]

const VERIFY_STATUS_META: Record<
  "pending" | "verified" | "unsent" | "oversend",
  { label: string; badgeClass: string; rowClass: string; icon: typeof CheckCircle2 }
> = {
  pending: {
    label: "Pending",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    rowClass: "",
    icon: Clock,
  },
  verified: {
    label: "Verified",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rowClass: "bg-emerald-50/70 dark:bg-emerald-950/20",
    icon: CheckCircle2,
  },
  unsent: {
    label: "Missing",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    rowClass: "bg-rose-50/70 dark:bg-rose-950/20",
    icon: AlertTriangle,
  },
  oversend: {
    label: "Over-sent",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    rowClass: "bg-blue-50/70 dark:bg-blue-950/20",
    icon: ArrowUpCircle,
  },
}

const reasonLabel = (v?: string) => REASONS.find((r) => r.value === v)?.label || (v ? v : "-")
const money = (v?: number) => `₹${Number(v || 0).toLocaleString("en-IN")}`
const titleCase = (v?: string) =>
  v ? String(v).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-"
const normalizeBarcode = (v: string) => v.trim().replace(/^0+/, "")

interface ProductInfo {
  id?: string
  name?: string
  barcode?: string
  selling_price?: number
}
interface ReturnLine {
  id: string
  return_id?: string
  product_id?: string
  quantity?: number
  reason?: string
  reason_type?: string
  verify_status?: string
  verified_qty?: number
  holding_status?: string
  sent_to_store_id?: string
  from_store?: { id?: string; name?: string } | null
  to_store?: { id?: string; name?: string } | null
  products?: ProductInfo | null
}
interface ReturnOrder {
  return_id: string
  store_id?: string
  admin_status?: string
  return_quantity?: number
  created_at?: string
  created_by?: string
  message?: string
  stores?: { id?: string; name?: string } | null
  return_products?: ReturnLine[]
}

// Per-line decision while verifying.
interface Decision {
  verifyStatus: "pending" | "verified" | "unsent" | "oversend"
  verifiedQty: number
  reasonType: string
}

export default function AdminReturnsPage() {
  const [orders, setOrders] = useState<ReturnOrder[]>([])
  const [allOrders, setAllOrders] = useState<ReturnOrder[]>([])
  const [withAdmin, setWithAdmin] = useState<ReturnLine[]>([])
  const [sentOut, setSentOut] = useState<ReturnLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Top-of-page store filter + order-id search — apply to the order-card tabs (Incoming/All).
  const [storeFilter, setStoreFilter] = useState<string>("")
  const [orderIdSearch, setOrderIdSearch] = useState<string>("")

  // verify dialog
  const [activeOrder, setActiveOrder] = useState<ReturnOrder | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [scanInput, setScanInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  // Row checkboxes for bulk-applying one reason to several lines at once.
  const [verifySelected, setVerifySelected] = useState<Record<string, boolean>>({})
  const [bulkReasonType, setBulkReasonType] = useState("")

  // send-to-store (With Admin tab)
  const [stores, setStores] = useState<{ id: string; name?: string }[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [sendStoreId, setSendStoreId] = useState<string>("")
  const [sending, setSending] = useState(false)
  const [withAdminSearch, setWithAdminSearch] = useState("")
  const [sendQty, setSendQty] = useState<Record<string, number>>({})

  const loadAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const [ordersRes, allRes, holdRes, sentRes, storesRes] = await Promise.all([
        fetch(`${API}/api/return-orders?status=sent_to_admin`),
        fetch(`${API}/api/return-orders`),
        fetch(`${API}/api/return-holdings?holding_status=with_admin`),
        fetch(`${API}/api/return-holdings?holding_status=sent_out`),
        fetch(`${API}/api/stores`),
      ])
      setOrders(ordersRes.ok ? await ordersRes.json() : [])
      setAllOrders(allRes.ok ? await allRes.json() : [])
      setWithAdmin(holdRes.ok ? await holdRes.json() : [])
      setSentOut(sentRes.ok ? await sentRes.json() : [])
      setStores(storesRes.ok ? await storesRes.json() : [])
      setSelected({})
    } catch (err) {
      console.error("Failed to load returns:", err)
      setError("Failed to load returns.")
    } finally {
      setLoading(false)
    }
  }

  const matchesOrderFilters = (o: ReturnOrder) => {
    if (storeFilter && o.store_id !== storeFilter) return false
    const q = orderIdSearch.trim().toLowerCase()
    if (q && !o.return_id?.toLowerCase().includes(q)) return false
    return true
  }
  const filteredOrders = useMemo(
    () => orders.filter(matchesOrderFilters),
    [orders, storeFilter, orderIdSearch],
  )
  const filteredAllOrders = useMemo(
    () => allOrders.filter(matchesOrderFilters),
    [allOrders, storeFilter, orderIdSearch],
  )

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected])

  const filteredWithAdmin = useMemo(() => {
    const raw = withAdminSearch.trim()
    if (!raw) return withAdmin
    const code = normalizeBarcode(raw)
    const text = raw.toLowerCase()
    return withAdmin.filter((l) => {
      const name = String(l.products?.name || "").toLowerCase()
      const barcodes = String(l.products?.barcode || "")
        .split(",")
        .map((b) => normalizeBarcode(b))
      return name.includes(text) || barcodes.some((b) => b.includes(code))
    })
  }, [withAdmin, withAdminSearch])

  const sendSelected = async () => {
    if (!sendStoreId || selectedIds.length === 0) return
    setSending(true)
    try {
      const toWarehouse = sendStoreId === WAREHOUSE_ID
      const url = toWarehouse
        ? `${API}/api/return-holdings/add-to-warehouse`
        : `${API}/api/return-holdings/send`
      const body = toWarehouse
        ? { items: selectedIds.map((id) => ({ line_id: id, qty: sendQty[id] })) }
        : { storeId: sendStoreId, items: selectedIds.map((id) => ({ line_id: id, qty: sendQty[id] })) }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const r = await res.json().catch(() => ({}))
        throw new Error(r?.error || `HTTP ${res.status}`)
      }
      setSendStoreId("")
      setActiveOrder(null)
      await loadAll()
    } catch (err) {
      console.error("Send failed:", err)
      alert(`Send failed: ${(err as Error).message}`)
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Open an order in the dialog. Unverified orders open in verify mode (scan to
  // verify); already-verified orders open in details/send mode.
  const openOrder = (order: ReturnOrder) => {
    if (order.admin_status === "sent_to_admin") {
      const init: Record<string, Decision> = {}
      for (const line of order.return_products || []) {
        init[line.id] = {
          verifyStatus: "pending",
          verifiedQty: 0,
          // Blank on purpose — a reason must be explicitly chosen (or bulk-applied)
          // before verification is accepted, it doesn't just inherit a default.
          reasonType: line.reason_type || "",
        }
      }
      setDecisions(init)
    }
    setSelected({})
    setVerifySelected({})
    setBulkReasonType("")
    setSendStoreId("")
    setScanInput("")
    setActiveOrder(order)
  }

  const isUnverified = activeOrder?.admin_status === "sent_to_admin"

  // Sendable items = those still held "with admin". Used for the header
  // "select all" checkbox in both the With Admin tab and the order dialog.
  const dialogSendable = (activeOrder?.return_products || []).filter((l) => l.holding_status === "with_admin")
  const allDialogSelected = dialogSendable.length > 0 && dialogSendable.every((l) => selected[l.id])
  const allWithAdminSelected = filteredWithAdmin.length > 0 && filteredWithAdmin.every((l) => selected[l.id])
  const cartLines = withAdmin.filter((l) => selected[l.id])
  const cartTotal = cartLines.reduce((sum, l) => {
    const held = Number(l.verified_qty || l.quantity || 0)
    const qty = sendQty[l.id] ?? held
    return sum + Number(l.products?.selling_price || 0) * qty
  }, 0)
  const addBarcodeToCart = () => {
    const code = normalizeBarcode(withAdminSearch)
    if (!code) return
    const match = withAdmin.find((l) =>
      String(l.products?.barcode || "")
        .split(",")
        .map((b) => normalizeBarcode(b))
        .includes(code),
    )
    if (match) {
      setSelected((p) => ({ ...p, [match.id]: !p[match.id] }))
      setWithAdminSearch("")
    }
  }
  const toggleSelectedLine = (lineId: string) => {
    setSelected((p) => ({ ...p, [lineId]: !p[lineId] }))
  }
  const toggleSelectAll = (lines: ReturnLine[], currentlyAll: boolean) => {
    const target = !currentlyAll
    setSelected((prev) => {
      const next = { ...prev }
      for (const l of lines) next[l.id] = target
      return next
    })
  }

  const setDecision = (lineId: string, patch: Partial<Decision>) => {
    setDecisions((prev) => ({ ...prev, [lineId]: { ...prev[lineId], ...patch } }))
  }

  const handleScan = () => {
    if (!activeOrder) return
    const code = normalizeBarcode(scanInput)
    if (!code) {
      alert("Please scan a valid barcode.")
      return
    }

    const line = (activeOrder.return_products || []).find((l) => {
      const barcodes = String(l.products?.barcode || "")
        .split(",")
        .map((b) => normalizeBarcode(b))
      return barcodes.includes(code)
    })
    if (!line) {
      alert(`No product in this order matches barcode: ${scanInput}`)
      return
    }

    const maxQty = Number(line.quantity || 0)
    if (maxQty <= 0) {
      alert(`This product has zero quantity in the order: ${line.products?.name || scanInput}`)
      return
    }

    // Increment is computed from the live state inside the updater — not from
    // a value read earlier — so back-to-back scans always stack correctly
    // instead of two scans racing off the same stale "current" number.
    let alreadyComplete = false
    setDecisions((prev) => {
      const prevQty = Number(prev[line.id]?.verifiedQty || 0)
      if (prevQty >= maxQty) {
        alreadyComplete = true
        return prev
      }
      const nextQty = Math.min(maxQty, prevQty + 1)
      const isComplete = nextQty >= maxQty
      return {
        ...prev,
        [line.id]: {
          verifyStatus: isComplete ? "verified" : "pending",
          verifiedQty: nextQty,
          reasonType: prev[line.id]?.reasonType || line.reason_type || "",
        },
      }
    })
    if (alreadyComplete) {
      alert(`${line.products?.name || "This item"} is already fully scanned (${maxQty}/${maxQty}).`)
    }
    setScanInput("")
  }

  const verifyAll = () => {
    if (!activeOrder) return
    const next: Record<string, Decision> = {}
    for (const line of activeOrder.return_products || []) {
      next[line.id] = {
        verifyStatus: "verified",
        verifiedQty: Number(line.quantity || 0),
        reasonType: decisions[line.id]?.reasonType || line.reason_type || "",
      }
    }
    setDecisions(next)
  }

  const verifyLines = activeOrder?.return_products || []
  // Left = every line that isn't a deliberate manual exception (unsent/oversend
  // stay off the left entirely). Right = has any progress at all (shows from the
  // very first click/scan) — so a partially-scanned line appears on BOTH sides at
  // once, and a fully-scanned one stays on the left too, just rendered disabled,
  // instead of vanishing the instant it completes.
  const pendingLines = verifyLines
    .filter((l) => {
      const status = decisions[l.id]?.verifyStatus || "pending"
      return status === "pending" || status === "verified"
    })
    // Still-unscanned products on top, fully-scanned (disabled) ones below.
    .sort((a, b) => {
      const aDone = Number(decisions[a.id]?.verifiedQty || 0) >= Number(a.quantity || 0) ? 1 : 0
      const bDone = Number(decisions[b.id]?.verifiedQty || 0) >= Number(b.quantity || 0) ? 1 : 0
      return aDone - bDone
    })
  const decidedLines = verifyLines.filter((l) => {
    const d = decisions[l.id]
    if (!d) return false
    return d.verifyStatus !== "pending" || Number(d.verifiedQty || 0) > 0
  })

  const verifySelectedIds = useMemo(
    () => Object.keys(verifySelected).filter((id) => verifySelected[id]),
    [verifySelected],
  )
  const allVerifyRowsSelected = decidedLines.length > 0 && decidedLines.every((l) => verifySelected[l.id])
  const toggleVerifySelectAll = () => {
    const target = !allVerifyRowsSelected
    setVerifySelected(() => {
      const next: Record<string, boolean> = {}
      for (const l of decidedLines) next[l.id] = target
      return next
    })
  }
  const applyBulkReason = () => {
    if (!bulkReasonType || verifySelectedIds.length === 0) return
    setDecisions((prev) => {
      const next = { ...prev }
      for (const id of verifySelectedIds) {
        next[id] = { ...next[id], reasonType: bulkReasonType }
      }
      return next
    })
  }

  // Send a line back to "Unscanned" — full reset, not just a status change.
  const clearDecision = (lineId: string) => {
    setDecisions((prev) => ({
      ...prev,
      [lineId]: { verifyStatus: "pending", verifiedQty: 0, reasonType: "" },
    }))
    setVerifySelected((prev) => {
      const next = { ...prev }
      delete next[lineId]
      return next
    })
  }
  const clearAllDecisions = () => {
    setDecisions((prev) => {
      const next = { ...prev }
      for (const line of decidedLines) {
        next[line.id] = { verifyStatus: "pending", verifiedQty: 0, reasonType: "" }
      }
      return next
    })
    setVerifySelected({})
  }

  // Every decided (non-pending) line needs an explicit reason before the
  // verification can be confirmed — a blank/default reason blocks submission.
  const allDecided = useMemo(() => {
    if (!activeOrder) return false
    const lines = activeOrder.return_products || []
    return (
      lines.length > 0 &&
      lines.every((l) => {
        const d = decisions[l.id]
        return d && d.verifyStatus !== "pending" && Boolean(d.reasonType)
      })
    )
  }, [activeOrder, decisions])

  // Live counts/quantities/value while verifying — how many lines are in each
  // status, and what they add up to, so progress is visible at a glance.
  const verifySummary = useMemo(() => {
    const lines = activeOrder?.return_products || []
    const counts: Record<Decision["verifyStatus"], number> = { pending: 0, verified: 0, unsent: 0, oversend: 0 }
    let sentQty = 0
    let verifiedQty = 0
    let verifiedValue = 0
    for (const line of lines) {
      sentQty += Number(line.quantity || 0)
      const d = decisions[line.id]
      if (!d) continue
      counts[d.verifyStatus] += 1
      if (d.verifyStatus === "verified" || d.verifyStatus === "oversend") {
        verifiedQty += Number(d.verifiedQty || 0)
        verifiedValue += Number(d.verifiedQty || 0) * Number(line.products?.selling_price || 0)
      }
    }
    return { totalLines: lines.length, counts, sentQty, verifiedQty, verifiedValue }
  }, [activeOrder, decisions])

  const submitVerify = async () => {
    if (!activeOrder || !allDecided) return
    setSubmitting(true)
    try {
      const payload = {
        items: (activeOrder.return_products || []).map((line) => ({
          line_id: line.id,
          verify_status: decisions[line.id].verifyStatus,
          verified_qty: decisions[line.id].verifiedQty,
          reason_type: decisions[line.id].reasonType,
        })),
      }
      const res = await fetch(`${API}/api/return-orders/${activeOrder.return_id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const r = await res.json().catch(() => ({}))
        throw new Error(r?.error || `HTTP ${res.status}`)
      }
      setActiveOrder(null)
      await loadAll()
    } catch (err) {
      console.error("Verify failed:", err)
      alert(`Verify failed: ${(err as Error).message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <PackageCheck className="h-6 w-6" />
            Returns
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search order ID…"
                value={orderIdSearch}
                onChange={(e) => setOrderIdSearch(e.target.value)}
                className="pl-8 w-48"
              />
            </div>
            <Select
              value={storeFilter || ALL_STORES_ID}
              onValueChange={(v) => setStoreFilter(v === ALL_STORES_ID ? "" : v)}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="All stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STORES_ID}>All stores</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name || s.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Tabs defaultValue="incoming" className="w-full">
          <TabsList>
            <TabsTrigger value="incoming">Incoming Orders ({filteredOrders.length})</TabsTrigger>
            <TabsTrigger value="all">All Orders ({filteredAllOrders.length})</TabsTrigger>
            <TabsTrigger value="with_admin">With Admin ({withAdmin.length})</TabsTrigger>
            <TabsTrigger value="sent_out">Sent Out ({sentOut.length})</TabsTrigger>
          </TabsList>

          {/* ── INCOMING ORDERS ── */}
          <TabsContent value="incoming" className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
            ) : filteredOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {storeFilter || orderIdSearch ? "No incoming return orders match your filters." : "No incoming return orders."}
              </p>
            ) : (
              filteredOrders.map((order) => (
                <OrderRow key={order.return_id} order={order} onClick={() => openOrder(order)} />
              ))
            )}
          </TabsContent>

          {/* ── ALL ORDERS (history) ── */}
          <TabsContent value="all" className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
            ) : filteredAllOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {storeFilter || orderIdSearch ? "No return orders match your filters." : "No return orders yet."}
              </p>
            ) : (
              filteredAllOrders.map((order) => (
                <OrderRow key={order.return_id} order={order} onClick={() => openOrder(order)} />
              ))
            )}
          </TabsContent>

          {/* ── WITH ADMIN (holding) ── */}
          <TabsContent value="with_admin" className="mt-4">
            {withAdmin.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nothing is held with admin right now.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {/* LEFT: cart */}
                <div className="lg:col-span-1">
                  <Card className="lg:sticky lg:top-4">
                    <CardContent className="space-y-3 pt-4">
                      {/* Send controls fixed at the top */}
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Cart ({cartLines.length})</span>
                        {cartLines.length > 0 && (
                          <button
                            className="text-xs text-muted-foreground hover:underline"
                            onClick={() => setSelected({})}
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="cart-send-store">Destination store</Label>
                        <Select value={sendStoreId} onValueChange={setSendStoreId}>
                          <SelectTrigger id="cart-send-store">
                            <SelectValue placeholder="Choose destination store" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={WAREHOUSE_ID}>Add to warehouse</SelectItem>
                            {stores.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name || s.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-semibold">{money(cartTotal)}</span>
                      </div>

                      <Button
                        className="w-full"
                        onClick={sendSelected}
                        disabled={!sendStoreId || cartLines.length === 0 || sending}
                      >
                        {sending
                          ? sendStoreId === WAREHOUSE_ID
                            ? "Adding..."
                            : "Sending..."
                          : sendStoreId === WAREHOUSE_ID
                            ? `Add ${cartLines.length} to warehouse`
                            : `Send ${cartLines.length} to store`}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {sendStoreId === WAREHOUSE_ID
                          ? "Items return to warehouse stock and become available to assign again (no verification)."
                          : "Sent items create a transfer order; the store verifies them."}
                      </p>

                      {/* Cart items below */}
                      <div className="border-t pt-3">
                        {cartLines.length === 0 ? (
                          <p className="py-6 text-center text-sm text-muted-foreground">
                            Scan or click items from the list to add them here.
                          </p>
                        ) : (
                          <div className="max-h-[45vh] space-y-2 overflow-y-auto">
                            {cartLines.map((line) => {
                              const held = Number(line.verified_qty || line.quantity || 0)
                              const qty = sendQty[line.id] ?? held
                              const price = Number(line.products?.selling_price || 0)
                              return (
                                <div key={line.id} className="flex items-center gap-2 rounded border p-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{line.products?.name || "—"}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {money(price)} · {money(price * qty)}
                                    </div>
                                  </div>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={held}
                                    className="h-8 w-14 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    value={qty}
                                    onChange={(e) =>
                                      setSendQty((p) => ({
                                        ...p,
                                        [line.id]: Math.max(1, Math.min(held, Number(e.target.value) || 1)),
                                      }))
                                    }
                                  />
                                  <button
                                    className="text-muted-foreground hover:text-destructive"
                                    title="Remove"
                                    onClick={() => setSelected((p) => ({ ...p, [line.id]: false }))}
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* RIGHT: list */}
                <div className="space-y-3 lg:col-span-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Scan barcode or search product…"
                      value={withAdminSearch}
                      onChange={(e) => setWithAdminSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          addBarcodeToCart()
                        }
                      }}
                    />
                  </div>
                  <Card>
                    <CardContent className="pt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={allWithAdminSelected}
                                disabled={filteredWithAdmin.length === 0}
                                onChange={() => toggleSelectAll(filteredWithAdmin, allWithAdminSelected)}
                                title="Select all"
                              />
                            </TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead>Barcode</TableHead>
                            <TableHead className="w-28">Reason</TableHead>
                            <TableHead className="w-14 text-right">Qty</TableHead>
                            <TableHead className="w-24 text-right">Price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredWithAdmin.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                                No matching items.
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredWithAdmin.map((line) => {
                              const held = Number(line.verified_qty || line.quantity || 0)
                              const price = Number(line.products?.selling_price || 0)
                              const inCart = !!selected[line.id]
                              const qty = sendQty[line.id] ?? held
                              return (
                                <TableRow
                                  key={line.id}
                                  className={`cursor-pointer ${inCart ? "bg-muted/40" : ""}`}
                                  onClick={() => toggleSelectedLine(line.id)}
                                >
                                  <TableCell>
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4"
                                      checked={inCart}
                                      onChange={() => toggleSelectedLine(line.id)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </TableCell>
                                  <TableCell className="font-medium">{line.products?.name || "—"}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {line.products?.barcode || "-"}
                                  </TableCell>
                                  <TableCell>{reasonLabel(line.reason_type)}</TableCell>
                                  <TableCell className="text-right">
                                    <Input
                                      type="number"
                                      min={1}
                                      max={held}
                                      className="ml-auto h-8 w-16 text-right"
                                      value={qty}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        const value = Math.min(held, Math.max(1, Number(e.target.value) || 1))
                                        setSendQty((p) => ({ ...p, [line.id]: value }))
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell className="text-right">{money(price)}</TableCell>
                                </TableRow>
                              )
                            })
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── SENT OUT ── */}
          <TabsContent value="sent_out" className="mt-4">
            <HoldingTable rows={sentOut} emptyText="Nothing has been sent out yet." showRoute />
          </TabsContent>
        </Tabs>
      </div>

      {/* Order dialog: verify (pending) or details + send (verified) */}
      <Dialog open={!!activeOrder} onOpenChange={(open) => !open && setActiveOrder(null)}>
        <DialogContent className={isUnverified ? "max-w-[1600px] w-[95vw] max-h-[90vh] h-[88vh] flex flex-col overflow-hidden" : "max-w-3xl"}>
          <DialogHeader className="shrink-0">
            <DialogTitle>{isUnverified ? "Verify Return Order" : "Return Order"}</DialogTitle>
            <DialogDescription>
              {activeOrder ? `${activeOrder.stores?.name || activeOrder.store_id} • Order ${activeOrder.return_id}` : ""}
            </DialogDescription>
          </DialogHeader>

          {isUnverified ? (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              <div className="flex gap-2 items-end shrink-0">
                <div className="flex-1">
                  <Label htmlFor="verify-scan">Scan product to verify</Label>
                  <Input
                    id="verify-scan"
                    autoFocus
                    placeholder="Scan or enter barcode"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleScan()
                      }
                    }}
                  />
                </div>
                <Button variant="outline" onClick={verifyAll}>
                  Verify all
                </Button>
              </div>

              {/* Live progress — counts, quantities and value at a glance while verifying */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 shrink-0">
                <VerifyStat icon={PackageCheck} label="Total items" value={verifySummary.totalLines} />
                <VerifyStat
                  icon={CheckCircle2}
                  label="Verified"
                  value={verifySummary.counts.verified}
                  tone="ok"
                />
                <VerifyStat icon={Clock} label="Pending" value={verifySummary.counts.pending} tone="warn" />
                <VerifyStat icon={AlertTriangle} label="Missing" value={verifySummary.counts.unsent} tone="bad" />
                <VerifyStat icon={ArrowUpCircle} label="Over-sent" value={verifySummary.counts.oversend} tone="warn" />
                <VerifyStat icon={IndianRupee} label="Value verified" value={money(verifySummary.verifiedValue)} />
              </div>

              {/* Two halves: not-yet-decided items on the left, decided ones on the right */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(320px,1fr)_1.8fr] gap-4 min-h-0">
                {/* LEFT: Unscanned */}
                <div className="flex flex-col min-h-0 border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/40 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Unscanned</span>
                      <Badge variant="secondary">{pendingLines.length}</Badge>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                    {pendingLines.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        Everything has been scanned or decided.
                      </div>
                    ) : (
                      pendingLines.map((line) => {
                        const maxQty = Number(line.quantity || 0)
                        const currentQty = Number(decisions[line.id]?.verifiedQty || 0)
                        const remaining = Math.max(0, maxQty - currentQty)
                        const isDone = remaining <= 0
                        const price = Number(line.products?.selling_price || 0)
                        return (
                          <button
                            key={line.id}
                            type="button"
                            disabled={isDone}
                            className={cn(
                              "grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed",
                              isDone ? "opacity-50 bg-muted/30" : "hover:bg-muted/40",
                            )}
                            onClick={() => {
                              if (maxQty <= 0) {
                                alert(`This product has zero quantity in the order: ${line.products?.name || "unknown item"}`)
                                return
                              }
                              // Computed inside the updater from the live state, not the
                              // `currentQty` closed over at render time — see handleScan.
                              setDecisions((prev) => {
                                const prevQty = Number(prev[line.id]?.verifiedQty || 0)
                                if (prevQty >= maxQty) return prev
                                const nextQty = Math.min(maxQty, prevQty + 1)
                                const isComplete = nextQty >= maxQty
                                return {
                                  ...prev,
                                  [line.id]: {
                                    verifyStatus: isComplete ? "verified" : "pending",
                                    verifiedQty: nextQty,
                                    reasonType: prev[line.id]?.reasonType || line.reason_type || "",
                                  },
                                }
                              })
                            }}
                          >
                            <div className="min-w-0 justify-self-start">
                              <div className="truncate text-sm font-medium">{line.products?.name || "—"}</div>
                              <div className="truncate text-xs text-muted-foreground font-mono">
                                {line.products?.barcode || "-"}
                              </div>
                            </div>

                            <div className="justify-self-center text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                              {money(price)}
                            </div>

                            <div className="text-right justify-self-end">
                              {isDone ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-600 ml-auto" />
                              ) : (
                                <div className="text-base font-bold tabular-nums leading-tight">{remaining}</div>
                              )}
                              <div className="text-[11px] text-muted-foreground">of {maxQty} left</div>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* RIGHT: Scanned / decided */}
                <div className="flex flex-col min-h-0 border rounded-lg overflow-hidden">
                  <div className="border-b bg-muted/40 shrink-0">
                    <div className="px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Scanned</span>
                        <Badge variant="secondary">{decidedLines.length}</Badge>
                      </div>
                      {decidedLines.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={clearAllDecisions}
                        >
                          Clear all
                        </Button>
                      )}
                    </div>
                    {/* Bulk reason — check several rows, pick one reason, apply to all of them */}
                    <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={allVerifyRowsSelected}
                          disabled={decidedLines.length === 0}
                          onChange={toggleVerifySelectAll}
                        />
                        {verifySelectedIds.length > 0 ? `${verifySelectedIds.length} selected` : "Select all"}
                      </label>
                      <Select value={bulkReasonType} onValueChange={setBulkReasonType}>
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue placeholder="Choose reason" />
                        </SelectTrigger>
                        <SelectContent>
                          {REASONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!bulkReasonType || verifySelectedIds.length === 0}
                        onClick={applyBulkReason}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                  {/* Cards, not a table — reflows to whatever width this panel has instead of scrolling sideways */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {decidedLines.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        Scan or click an item on the left to start.
                      </div>
                    ) : (
                      decidedLines.map((line) => {
                        const d = decisions[line.id]
                        const meta = VERIFY_STATUS_META[d.verifyStatus]
                        const StatusIcon = meta.icon
                        const price = Number(line.products?.selling_price || 0)
                        const value = Number(d.verifiedQty || 0) * price
                        const qtyMismatch = Number(d.verifiedQty || 0) !== Number(line.quantity || 0)
                        const missingReason = !d.reasonType
                        return (
                          <div
                            key={line.id}
                            className={cn("flex flex-wrap items-center gap-2 rounded-md border p-2.5", meta.rowClass)}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0"
                              checked={!!verifySelected[line.id]}
                              onChange={() => setVerifySelected((p) => ({ ...p, [line.id]: !p[line.id] }))}
                            />

                            <div className="min-w-[140px] max-w-[220px] flex-1">
                              <div className="truncate text-sm font-medium">{line.products?.name || "—"}</div>
                              <div className="truncate text-xs text-muted-foreground font-mono">
                                {line.products?.barcode || ""}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                className="flex h-7 w-7 items-center justify-center rounded border text-lg leading-none disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={Number(d.verifiedQty || 0) <= 0}
                                onClick={() =>
                                  setDecision(line.id, {
                                    ...d,
                                    verifiedQty: Math.max(0, Number(d.verifiedQty || 0) - 1),
                                  })
                                }
                              >
                                −
                              </button>
                              <Input
                                type="number"
                                min={0}
                                className={cn(
                                  "h-8 w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                  qtyMismatch && "border-amber-400 text-amber-700",
                                )}
                                value={d.verifiedQty}
                                onChange={(e) =>
                                  setDecision(line.id, { verifiedQty: Math.max(0, Number(e.target.value)) })
                                }
                              />
                              <button
                                type="button"
                                className="flex h-7 w-7 items-center justify-center rounded border text-lg leading-none disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={Number(d.verifiedQty || 0) >= Number(line.quantity || 0)}
                                onClick={() =>
                                  setDecision(line.id, {
                                    ...d,
                                    verifiedQty: Math.min(Number(line.quantity || 0), Number(d.verifiedQty || 0) + 1),
                                  })
                                }
                              >
                                +
                              </button>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">of {line.quantity} sent</span>
                            </div>

                            <span className="w-20 shrink-0 text-right text-xs font-semibold tabular-nums">
                              {money(value)}
                            </span>

                            <Select value={d.reasonType} onValueChange={(v) => setDecision(line.id, { reasonType: v })}>
                              <SelectTrigger
                                className={cn(
                                  "h-8 w-52 shrink-0",
                                  missingReason && "border-rose-400 text-rose-700",
                                )}
                              >
                                <SelectValue placeholder="Choose reason" />
                              </SelectTrigger>
                              <SelectContent>
                                {REASONS.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Select
                              value={d.verifyStatus}
                              onValueChange={(v) => setDecision(line.id, { verifyStatus: v as Decision["verifyStatus"] })}
                            >
                              <SelectTrigger className={cn("h-8 w-56 shrink-0 gap-1.5 border", meta.badgeClass)}>
                                <StatusIcon className="h-3.5 w-3.5 shrink-0" />
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="verified">Verified</SelectItem>
                                <SelectItem value="unsent">Not sent (missing)</SelectItem>
                                <SelectItem value="oversend">Over-sent (extra)</SelectItem>
                              </SelectContent>
                            </Select>

                            <button
                              type="button"
                              onClick={() => clearDecision(line.id)}
                              className="text-muted-foreground hover:text-destructive shrink-0"
                              title="Clear — send back to Unscanned"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between shrink-0">
                <span className="text-xs text-muted-foreground">
                  {allDecided
                    ? "All items decided."
                    : "Scan or click every item on the left, then set a reason for each — a decision without a reason won't be accepted."}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setActiveOrder(null)} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button onClick={submitVerify} disabled={!allDecided || submitting}>
                    {submitting ? "Saving..." : "Confirm Verification"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="max-h-[55vh] overflow-y-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={allDialogSelected}
                          disabled={dialogSendable.length === 0}
                          onChange={() => toggleSelectAll(dialogSendable, allDialogSelected)}
                          title="Select all 'with admin' items"
                        />
                      </TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead className="w-28">Reason</TableHead>
                      <TableHead className="w-12 text-right">Qty</TableHead>
                      <TableHead className="w-24 text-right">Price</TableHead>
                      <TableHead className="w-24 text-right">Value</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(activeOrder?.return_products || []).map((line) => {
                      const sendable = line.holding_status === "with_admin"
                      const held = Number(line.verified_qty || line.quantity || 0)
                      const qty = sendable ? sendQty[line.id] ?? held : held
                      const price = Number(line.products?.selling_price || 0)
                      return (
                        <TableRow key={line.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              className="h-4 w-4 disabled:cursor-not-allowed disabled:opacity-40"
                              checked={!!selected[line.id]}
                              disabled={!sendable}
                              onChange={() =>
                                sendable && setSelected((p) => ({ ...p, [line.id]: !p[line.id] }))
                              }
                              title={sendable ? "Select to send" : "Already sent out — can't be sent again"}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{line.products?.name || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{line.products?.barcode || "-"}</TableCell>
                          <TableCell>{reasonLabel(line.reason_type)}</TableCell>
                          <TableCell className="text-right">
                            {sendable && held > 1 ? (
                              <Input
                                type="number"
                                min={1}
                                max={held}
                                className="h-8 w-16 ml-auto text-right"
                                value={qty}
                                onChange={(e) =>
                                  setSendQty((p) => ({
                                    ...p,
                                    [line.id]: Math.max(1, Math.min(held, Number(e.target.value) || 1)),
                                  }))
                                }
                              />
                            ) : (
                              qty
                            )}
                          </TableCell>
                          <TableCell className="text-right">{money(price)}</TableCell>
                          <TableCell className="text-right">{money(price * qty)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{titleCase(line.holding_status || line.verify_status)}</Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {dialogSendable.length > 0 ? (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="w-64">
                      <Label htmlFor="dlg-send-store">Send {selectedIds.length} selected to destination</Label>
                      <Select value={sendStoreId} onValueChange={setSendStoreId}>
                        <SelectTrigger id="dlg-send-store">
                          <SelectValue placeholder="Choose destination" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={WAREHOUSE_ID}>Add to warehouse</SelectItem>
                          {stores.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name || s.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setActiveOrder(null)}>
                        Close
                      </Button>
                      <Button onClick={sendSelected} disabled={!sendStoreId || selectedIds.length === 0 || sending}>
                        {sending
                          ? sendStoreId === WAREHOUSE_ID
                            ? "Adding..."
                            : "Sending..."
                          : sendStoreId === WAREHOUSE_ID
                            ? "Add to warehouse"
                            : "Send to store"}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only items still held "with admin" can be selected. Sent items create a transfer order the store verifies; warehouse items return to stock and become available to assign again (no verification).
                  </p>
                </>
              ) : (
                // Nothing left "with admin" for this order — just the read-only
                // details above, no send controls to clutter the view.
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    This order has been fully processed — nothing left to send.
                  </p>
                  <Button variant="outline" onClick={() => setActiveOrder(null)}>
                    Close
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}

function VerifyStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle2
  label: string
  value: React.ReactNode
  tone?: "ok" | "warn" | "bad"
}) {
  return (
    <div className="rounded-md border bg-muted/40 py-2 px-2 text-center">
      <Icon
        className={cn(
          "h-4 w-4 mx-auto text-muted-foreground",
          tone === "ok" && "text-emerald-600",
          tone === "warn" && "text-amber-600",
          tone === "bad" && "text-rose-600",
        )}
      />
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

function OrderRow({ order, onClick }: { order: ReturnOrder; onClick: () => void }) {
  const lines = order.return_products || []
  const totalQty =
    Number(order.return_quantity || 0) || lines.reduce((s, l) => s + Number(l.quantity || 0), 0)
  const totalAmount = lines.reduce(
    (sum, l) => sum + Number(l.quantity || 0) * Number(l.products?.selling_price || 0),
    0,
  )
  // Fully verified = the order was processed AND every line matched cleanly
  // (no missing/over-sent lines) — a partial/issue outcome keeps the plain badge.
  const isFullyVerified =
    order.admin_status === "verified" && lines.length > 0 && lines.every((l) => l.verify_status === "verified")
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      className="cursor-pointer transition-colors hover:bg-muted/40"
    >
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div className="space-y-0.5">
          <div className="font-medium">{order.stores?.name || order.store_id}</div>
          <div className="text-xs text-muted-foreground">
            Order {order.return_id} • {formatDisplayDateTime(order.created_at)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isFullyVerified ? (
            <Badge className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
              <CheckCircle2 className="h-3 w-3" /> Verified
            </Badge>
          ) : (
            <Badge variant="outline">{titleCase(order.admin_status)}</Badge>
          )}
          <Badge variant="secondary">{lines.length} item(s)</Badge>
          <Badge variant="secondary">Qty {totalQty}</Badge>
          <Badge className="font-semibold">{money(totalAmount)}</Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  )
}

function HoldingTable({
  rows,
  emptyText,
  showRoute,
}: {
  rows: ReturnLine[]
  emptyText: string
  showRoute?: boolean
}) {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{emptyText}</p>
  }
  return (
    <Card>
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead className="w-32">Reason</TableHead>
              <TableHead className="w-16 text-right">Qty</TableHead>
              {showRoute && <TableHead>Sent From</TableHead>}
              {showRoute && <TableHead>Sent To</TableHead>}
              <TableHead className="w-28">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium">{line.products?.name || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{line.products?.barcode || "-"}</TableCell>
                <TableCell>{reasonLabel(line.reason_type)}</TableCell>
                <TableCell className="text-right">{line.verified_qty || line.quantity}</TableCell>
                {showRoute && <TableCell>{line.from_store?.name || "—"}</TableCell>}
                {showRoute && <TableCell>{line.to_store?.name || "—"}</TableCell>}
                <TableCell>
                  <Badge variant="outline">{titleCase(line.holding_status)}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
