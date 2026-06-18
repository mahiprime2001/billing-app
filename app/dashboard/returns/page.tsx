"use client"

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
import { PackageCheck, RefreshCw, ChevronRight, Search, X } from "lucide-react"

const API = process.env.NEXT_PUBLIC_BACKEND_API_URL

// Synthetic destination: add held items back to the warehouse (global stock)
// instead of sending them to a store. No store verification step.
const WAREHOUSE_ID = "__warehouse__"

const REASONS = [
  { value: "damaged", label: "Damaged" },
  { value: "low_sales", label: "Low Sales" },
  { value: "modification", label: "Needs Modification" },
  { value: "other", label: "Other" },
]

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

  // verify dialog
  const [activeOrder, setActiveOrder] = useState<ReturnOrder | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [scanInput, setScanInput] = useState("")
  const [submitting, setSubmitting] = useState(false)

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
          verifiedQty: Number(line.quantity || 0),
          reasonType: line.reason_type || "other",
        }
      }
      setDecisions(init)
    }
    setSelected({})
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
      setSelected((p) => ({ ...p, [match.id]: true }))
      setWithAdminSearch("")
    }
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
    if (!code) return
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
    setDecision(line.id, { verifyStatus: "verified", verifiedQty: Number(line.quantity || 0) })
    setScanInput("")
  }

  const verifyAll = () => {
    if (!activeOrder) return
    const next: Record<string, Decision> = {}
    for (const line of activeOrder.return_products || []) {
      next[line.id] = {
        verifyStatus: "verified",
        verifiedQty: Number(line.quantity || 0),
        reasonType: decisions[line.id]?.reasonType || line.reason_type || "other",
      }
    }
    setDecisions(next)
  }

  const allDecided = useMemo(() => {
    if (!activeOrder) return false
    const lines = activeOrder.return_products || []
    return lines.length > 0 && lines.every((l) => decisions[l.id] && decisions[l.id].verifyStatus !== "pending")
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
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <PackageCheck className="h-6 w-6" />
            Returns
          </h1>
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Tabs defaultValue="incoming" className="w-full">
          <TabsList>
            <TabsTrigger value="incoming">Incoming Orders ({orders.length})</TabsTrigger>
            <TabsTrigger value="all">All Orders ({allOrders.length})</TabsTrigger>
            <TabsTrigger value="with_admin">With Admin ({withAdmin.length})</TabsTrigger>
            <TabsTrigger value="sent_out">Sent Out ({sentOut.length})</TabsTrigger>
          </TabsList>

          {/* ── INCOMING ORDERS ── */}
          <TabsContent value="incoming" className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
            ) : orders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No incoming return orders.</p>
            ) : (
              orders.map((order) => (
                <OrderRow key={order.return_id} order={order} onClick={() => openOrder(order)} />
              ))
            )}
          </TabsContent>

          {/* ── ALL ORDERS (history) ── */}
          <TabsContent value="all" className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
            ) : allOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No return orders yet.</p>
            ) : (
              allOrders.map((order) => (
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
                                    className="h-8 w-14 text-right"
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
                              return (
                                <TableRow
                                  key={line.id}
                                  className={`cursor-pointer ${inCart ? "bg-muted/40" : ""}`}
                                  onClick={() => setSelected((p) => ({ ...p, [line.id]: !p[line.id] }))}
                                >
                                  <TableCell>
                                    <input type="checkbox" className="h-4 w-4" checked={inCart} readOnly />
                                  </TableCell>
                                  <TableCell className="font-medium">{line.products?.name || "—"}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {line.products?.barcode || "-"}
                                  </TableCell>
                                  <TableCell>{reasonLabel(line.reason_type)}</TableCell>
                                  <TableCell className="text-right">{held}</TableCell>
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isUnverified ? "Verify Return Order" : "Return Order"}</DialogTitle>
            <DialogDescription>
              {activeOrder ? `${activeOrder.stores?.name || activeOrder.store_id} • Order ${activeOrder.return_id}` : ""}
            </DialogDescription>
          </DialogHeader>

          {isUnverified ? (
            <>
              <div className="flex gap-2 items-end">
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

              <div className="max-h-[55vh] overflow-y-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-16 text-right">Sent</TableHead>
                      <TableHead className="w-20">Got</TableHead>
                      <TableHead className="w-36">Reason</TableHead>
                      <TableHead className="w-40">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(activeOrder?.return_products || []).map((line) => {
                      const d = decisions[line.id]
                      if (!d) return null
                      return (
                        <TableRow
                          key={line.id}
                          className={d.verifyStatus === "verified" ? "bg-green-50 dark:bg-green-950/20" : ""}
                        >
                          <TableCell className="font-medium">
                            {line.products?.name || "—"}
                            <div className="text-xs text-muted-foreground">{line.products?.barcode || ""}</div>
                          </TableCell>
                          <TableCell className="text-right">{line.quantity}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              className="h-8"
                              value={d.verifiedQty}
                              onChange={(e) => setDecision(line.id, { verifiedQty: Math.max(0, Number(e.target.value)) })}
                            />
                          </TableCell>
                          <TableCell>
                            <Select value={d.reasonType} onValueChange={(v) => setDecision(line.id, { reasonType: v })}>
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {REASONS.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={d.verifyStatus}
                              onValueChange={(v) => setDecision(line.id, { verifyStatus: v as Decision["verifyStatus"] })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="verified">Verified</SelectItem>
                                <SelectItem value="unsent">Not sent (missing)</SelectItem>
                                <SelectItem value="oversend">Over-sent (extra)</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {allDecided ? "All items decided." : "Scan or set a status for every item to finish."}
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
            </>
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
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}

function OrderRow({ order, onClick }: { order: ReturnOrder; onClick: () => void }) {
  const lines = order.return_products || []
  const totalQty =
    Number(order.return_quantity || 0) || lines.reduce((s, l) => s + Number(l.quantity || 0), 0)
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
          <Badge variant="outline">{titleCase(order.admin_status)}</Badge>
          <Badge variant="secondary">{lines.length} item(s)</Badge>
          <Badge variant="secondary">Qty {totalQty}</Badge>
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
