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
import { PackageCheck, RefreshCw, ChevronRight } from "lucide-react"

const API = process.env.NEXT_PUBLIC_BACKEND_API_URL

const REASONS = [
  { value: "damaged", label: "Damaged" },
  { value: "low_sales", label: "Low Sales" },
  { value: "modification", label: "Needs Modification" },
  { value: "other", label: "Other" },
]

const reasonLabel = (v?: string) => REASONS.find((r) => r.value === v)?.label || (v ? v : "-")
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

  const sendSelected = async () => {
    if (!sendStoreId || selectedIds.length === 0) return
    setSending(true)
    try {
      const res = await fetch(`${API}/api/return-holdings/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: sendStoreId, items: selectedIds.map((id) => ({ line_id: id })) }),
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
          <TabsContent value="with_admin" className="mt-4 space-y-3">
            {withAdmin.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nothing is held with admin right now.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-3">
                  <div className="w-64">
                    <Label htmlFor="send-store">Send {selectedIds.length} selected to store</Label>
                    <Select value={sendStoreId} onValueChange={setSendStoreId}>
                      <SelectTrigger id="send-store">
                        <SelectValue placeholder="Choose destination store" />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name || s.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={sendSelected}
                    disabled={!sendStoreId || selectedIds.length === 0 || sending}
                  >
                    {sending ? "Sending..." : "Send to store"}
                  </Button>
                  <span className="ml-auto self-center text-xs text-muted-foreground">
                    Sent items create a transfer order; the store verifies them.
                  </span>
                </div>
                <Card>
                  <CardContent className="pt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Barcode</TableHead>
                          <TableHead className="w-32">Reason</TableHead>
                          <TableHead className="w-20 text-right">Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {withAdmin.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell>
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={!!selected[line.id]}
                                onChange={() =>
                                  setSelected((p) => ({ ...p, [line.id]: !p[line.id] }))
                                }
                              />
                            </TableCell>
                            <TableCell className="font-medium">{line.products?.name || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {line.products?.barcode || "-"}
                            </TableCell>
                            <TableCell>{reasonLabel(line.reason_type)}</TableCell>
                            <TableCell className="text-right">
                              {line.verified_qty || line.quantity}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── SENT OUT ── */}
          <TabsContent value="sent_out" className="mt-4">
            <HoldingTable rows={sentOut} emptyText="Nothing has been sent out yet." />
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
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead className="w-32">Reason</TableHead>
                      <TableHead className="w-16 text-right">Qty</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(activeOrder?.return_products || []).map((line) => {
                      const sendable = line.holding_status === "with_admin"
                      return (
                        <TableRow key={line.id}>
                          <TableCell>
                            {sendable ? (
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={!!selected[line.id]}
                                onChange={() => setSelected((p) => ({ ...p, [line.id]: !p[line.id] }))}
                              />
                            ) : null}
                          </TableCell>
                          <TableCell className="font-medium">{line.products?.name || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{line.products?.barcode || "-"}</TableCell>
                          <TableCell>{reasonLabel(line.reason_type)}</TableCell>
                          <TableCell className="text-right">{line.verified_qty || line.quantity}</TableCell>
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
                  <Label htmlFor="dlg-send-store">Send {selectedIds.length} selected to store</Label>
                  <Select value={sendStoreId} onValueChange={setSendStoreId}>
                    <SelectTrigger id="dlg-send-store">
                      <SelectValue placeholder="Choose destination store" />
                    </SelectTrigger>
                    <SelectContent>
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
                    {sending ? "Sending..." : "Send to store"}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Only items still held "with admin" can be selected and sent. Sent items create a transfer order the store verifies.
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

function HoldingTable({ rows, emptyText }: { rows: ReturnLine[]; emptyText: string }) {
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
              <TableHead className="w-20 text-right">Qty</TableHead>
              <TableHead className="w-32">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium">{line.products?.name || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{line.products?.barcode || "-"}</TableCell>
                <TableCell>{reasonLabel(line.reason_type)}</TableCell>
                <TableCell className="text-right">{line.verified_qty || line.quantity}</TableCell>
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
