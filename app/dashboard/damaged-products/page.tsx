"use client"

import { API_BASE } from "@/lib/api-base"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { formatDisplayDate } from "@/app/utils/formatDate"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Package, Wrench, RefreshCw, AlertTriangle, Trash2, RotateCcw, Send } from "lucide-react"

const API = API_BASE

interface StoreDamageReturnRow {
  id: string
  productId?: string
  quantity?: number
  reason?: string
  reasonType?: string
  status?: string
  resolutionStatus?: string
  damageOrigin?: string
  createdAt?: string
  products?: { name?: string; barcode?: string }
  stores?: { name?: string }
}

type Category = "pending" | "fixed" | "discarded" | "sent_out" | "other"

const categoryOf = (r: StoreDamageReturnRow): Category => {
  switch (r.status) {
    case "fixed":
      return "fixed"
    case "discarded":
      return "discarded"
    case "sent_to_store":
      return "sent_out"
    case "repaired":
    case "modified":
    case "returned_to_store":
    case "migrated":
      return "other"
    default:
      return "pending"
  }
}

const titleCase = (v?: string) =>
  v ? String(v).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-"

export default function DamagedProductsPage() {
  const [rows, setRows] = useState<StoreDamageReturnRow[]>([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reasonFilter, setReasonFilter] = useState<string>("all")

  // send fixed -> store
  const [stores, setStores] = useState<{ id: string; name?: string }[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [sendStoreId, setSendStoreId] = useState<string>("")
  const [sending, setSending] = useState(false)

  const loadRows = async () => {
    setLoading(true)
    setError(null)
    try {
      const [res, storesRes] = await Promise.all([
        fetch(`${API}/api/store-damage-returns`),
        fetch(`${API}/api/stores`),
      ])
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
      setStores(storesRes.ok ? await storesRes.json() : [])
      setSelected({})
    } catch (err) {
      console.error("Failed to load damaged stock rows:", err)
      setError("Failed to load damaged stock records.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
  }, [])

  const handleResolve = async (row: StoreDamageReturnRow, action: "fix" | "discard") => {
    try {
      setWorkingId(row.id)
      const res = await fetch(`${API}/api/store-damage-returns/${row.id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const r = await res.json().catch(() => ({}))
        throw new Error(r?.error || `HTTP ${res.status}`)
      }
      await loadRows()
    } catch (err) {
      alert(`Action failed: ${(err as Error).message}`)
    } finally {
      setWorkingId(null)
    }
  }

  const byReason = (list: StoreDamageReturnRow[]) =>
    reasonFilter === "all" ? list : list.filter((r) => r.reasonType === reasonFilter)

  const grouped = useMemo(() => {
    const g: Record<Category, StoreDamageReturnRow[]> = {
      pending: [],
      fixed: [],
      discarded: [],
      sent_out: [],
      other: [],
    }
    for (const r of rows) g[categoryOf(r)].push(r)
    return g
  }, [rows])

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected])

  const sendFixed = async () => {
    if (!sendStoreId || selectedIds.length === 0) return
    setSending(true)
    try {
      const res = await fetch(`${API}/api/store-damage-returns/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: sendStoreId, ids: selectedIds }),
      })
      if (!res.ok) {
        const r = await res.json().catch(() => ({}))
        throw new Error(r?.error || `HTTP ${res.status}`)
      }
      setSendStoreId("")
      await loadRows()
    } catch (err) {
      alert(`Send failed: ${(err as Error).message}`)
    } finally {
      setSending(false)
    }
  }

  const reasonFilterSelect = (
    <select
      className="border rounded-md px-2 py-1 text-sm"
      value={reasonFilter}
      onChange={(e) => setReasonFilter(e.target.value)}
    >
      <option value="all">All Reasons</option>
      <option value="damaged">Damaged</option>
      <option value="modification">Needs Modification</option>
      <option value="low_sales">Low Sales</option>
      <option value="other">Other</option>
    </select>
  )

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              <Package className="h-7 w-7 text-rose-600" />
              Damaged Stock
            </h1>
            <p className="text-muted-foreground">
              Fix or discard damaged products. Discarded items can be re-fixed; fixed items can be sent to a store.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {reasonFilterSelect}
            <Button variant="outline" onClick={loadRows}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Tabs defaultValue="pending" className="w-full">
          <TabsList>
            <TabsTrigger value="pending">Damaged ({grouped.pending.length})</TabsTrigger>
            <TabsTrigger value="fixed">Fixed ({grouped.fixed.length})</TabsTrigger>
            <TabsTrigger value="discarded">Discarded ({grouped.discarded.length})</TabsTrigger>
            <TabsTrigger value="sent_out">Sent Out ({grouped.sent_out.length})</TabsTrigger>
          </TabsList>

          {/* ── DAMAGED (pending): Fix / Discard ── */}
          <TabsContent value="pending" className="mt-4">
            <DamageTable
              rows={byReason(grouped.pending)}
              loading={loading}
              emptyText="No damaged items pending."
              renderAction={(row) => (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    disabled={workingId === row.id}
                    onClick={() => handleResolve(row, "fix")}
                  >
                    <Wrench className="h-4 w-4 mr-1" />
                    Fix
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={workingId === row.id}
                    onClick={() => handleResolve(row, "discard")}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Discard
                  </Button>
                </div>
              )}
            />
          </TabsContent>

          {/* ── FIXED: select + send to store ── */}
          <TabsContent value="fixed" className="mt-4 space-y-3">
            <DamageTable
              rows={byReason(grouped.fixed)}
              loading={loading}
              emptyText="No fixed items."
              selectable
              selected={selected}
              onToggle={(id) => setSelected((p) => ({ ...p, [id]: !p[id] }))}
            />
            {grouped.fixed.length > 0 && (
              <div className="flex flex-wrap items-end gap-2">
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
                <Button onClick={sendFixed} disabled={!sendStoreId || selectedIds.length === 0 || sending}>
                  <Send className="h-4 w-4 mr-2" />
                  {sending ? "Sending..." : "Send to store"}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ── DISCARDED: move back to Fixed ── */}
          <TabsContent value="discarded" className="mt-4">
            <DamageTable
              rows={byReason(grouped.discarded)}
              loading={loading}
              emptyText="No discarded items."
              renderAction={(row) => (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={workingId === row.id}
                  onClick={() => handleResolve(row, "fix")}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Move to Fixed
                </Button>
              )}
            />
          </TabsContent>

          {/* ── SENT OUT ── */}
          <TabsContent value="sent_out" className="mt-4">
            <DamageTable rows={byReason(grouped.sent_out)} loading={loading} emptyText="Nothing sent out yet." />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}

function DamageTable({
  rows,
  loading,
  emptyText,
  renderAction,
  selectable,
  selected,
  onToggle,
}: {
  rows: StoreDamageReturnRow[]
  loading: boolean
  emptyText: string
  renderAction?: (row: StoreDamageReturnRow) => ReactNode
  selectable?: boolean
  selected?: Record<string, boolean>
  onToggle?: (id: string) => void
}) {
  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>
  }
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p>{emptyText}</p>
      </div>
    )
  }
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {selectable && <TableHead className="w-10"></TableHead>}
                <TableHead>Store</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                {renderAction && <TableHead>Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {selectable && (
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!!selected?.[row.id]}
                        onChange={() => onToggle?.(row.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell>{row.stores?.name || "-"}</TableCell>
                  <TableCell className="font-medium">{row.products?.name || row.productId || "N/A"}</TableCell>
                  <TableCell>{row.quantity || 0}</TableCell>
                  <TableCell>{titleCase(row.reasonType)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{titleCase(row.status)}</Badge>
                  </TableCell>
                  <TableCell>{formatDisplayDate(row.createdAt, "-")}</TableCell>
                  {renderAction && <TableCell>{renderAction(row)}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
