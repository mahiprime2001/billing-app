"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Package, Wrench, RefreshCw, AlertTriangle } from "lucide-react"

interface StoreDamageReturnRow {
  id: string
  productId?: string
  quantity?: number
  reason?: string
  status?: "sent_to_admin" | "received_admin" | "repaired" | "discarded"
  damageOrigin?: string
  createdAt?: string
  repairedAt?: string
  products?: { name?: string; barcode?: string }
  stores?: { name?: string }
}

export default function DamagedProductsPage() {
  const [rows, setRows] = useState<StoreDamageReturnRow[]>([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadRows = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/store-damage-returns`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      setRows(Array.isArray(data) ? data : [])
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

  const handleRepair = async (row: StoreDamageReturnRow) => {
    if (!confirm("Mark this damaged product as repaired and add quantity back to inventory?")) {
      return
    }
    try {
      setWorkingId(row.id)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/store-damage-returns/${row.id}/repair`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restockQty: row.quantity || 0,
          repairNotes: "Repaired by admin from damaged stock page",
        }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result?.error || `HTTP ${response.status}`)
      }
      await loadRows()
    } catch (err) {
      console.error("Failed to mark repaired:", err)
      alert(`Failed to mark repaired: ${(err as Error).message}`)
    } finally {
      setWorkingId(null)
    }
  }

  const pendingRows = rows.filter((r) => r.status !== "repaired" && r.status !== "discarded")

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Damaged Stock Management</h1>
            <p className="text-muted-foreground">
              Products returned from stores due to transport/store damage. Repair and re-add to inventory.
            </p>
          </div>
          <Button variant="outline" onClick={loadRows}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total Records</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{rows.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pending Repair</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{pendingRows.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Repaired</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{rows.filter((r) => r.status === "repaired").length}</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-rose-600" />
              Damaged Products From Stores
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-gray-500">Loading damaged stock...</div>
            ) : error ? (
              <div className="text-center py-12 text-red-600">{error}</div>
            ) : rows.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Origin</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.id}</TableCell>
                        <TableCell>{row.stores?.name || "-"}</TableCell>
                        <TableCell>{row.products?.name || row.productId || "N/A"}</TableCell>
                        <TableCell>{row.quantity || 0}</TableCell>
                        <TableCell>{row.damageOrigin || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={row.status === "repaired" ? "default" : "secondary"}>
                            {row.status || "sent_to_admin"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-60 truncate">{row.reason || "-"}</TableCell>
                        <TableCell>{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "-"}</TableCell>
                        <TableCell>
                          {row.status !== "repaired" ? (
                            <Button
                              size="sm"
                              onClick={() => handleRepair(row)}
                              disabled={workingId === row.id}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Wrench className="h-4 w-4 mr-1" />
                              {workingId === row.id ? "Saving..." : "Mark Repaired"}
                            </Button>
                          ) : (
                            <span className="text-sm text-green-700">Done</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No damaged store-return records found.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

