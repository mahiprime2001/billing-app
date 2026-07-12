"use client"

import { API_BASE } from "@/lib/api-base"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Store, Package, Boxes, IndianRupee, Search, Loader2, ChevronRight, Clock, Gauge } from "lucide-react"
import { hasDraft, listAudits, formatDateTime, type AuditRecord } from "@/lib/audit"

const API = API_BASE

interface StoreType {
  id: string
  name: string
  address: string
  phone: string
  manager: string
  storecode?: string
  status: "active" | "inactive"
  productCount?: number
  totalStock?: number
  totalStockValue?: number
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value || 0)

export default function AuditPage() {
  const router = useRouter()
  const [stores, setStores] = useState<StoreType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  // Per-store audit meta: last completed audit + an in-progress draft flag.
  const [auditMeta, setAuditMeta] = useState<Record<string, { last: AuditRecord | null; inProgress: boolean }>>({})

  useEffect(() => {
    fetch(`${API}/api/stores`)
      .then(async (res) => {
        if (!res.ok) return
        const data: any[] = await res.json()
        const list = data as StoreType[]
        setStores(list)

        // Load last-audit + draft state for each store (client-side for now).
        const meta: Record<string, { last: AuditRecord | null; inProgress: boolean }> = {}
        await Promise.all(
          list.map(async (s) => {
            const audits = await listAudits(s.id)
            meta[s.id] = { last: audits[0] || null, inProgress: hasDraft(s.id) }
          }),
        )
        setAuditMeta(meta)
      })
      .catch((err) => console.error("Error loading stores:", err))
      .finally(() => setIsLoading(false))
  }, [])

  const filteredStores = stores.filter((store) => {
    const q = searchTerm.toLowerCase()
    return (
      store.name?.toLowerCase().includes(q) ||
      store.storecode?.toLowerCase().includes(q) ||
      store.address?.toLowerCase().includes(q) ||
      store.manager?.toLowerCase().includes(q)
    )
  })

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Audit</h1>
          <p className="mt-1 text-muted-foreground">
            Select a store to verify the products physically present against the system inventory.
          </p>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search stores..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading stores...
          </div>
        ) : filteredStores.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">No stores found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStores.map((store) => (
              <button
                key={store.id}
                type="button"
                onClick={() => router.push(`/dashboard/audit/view?storeId=${encodeURIComponent(store.id)}`)}
                disabled={store.status !== "active"}
                className="text-left disabled:opacity-60 disabled:cursor-not-allowed group"
              >
                <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Store className="h-4 w-4 text-muted-foreground" />
                        {store.name}
                      </CardTitle>
                      <div className="flex items-center gap-1.5">
                        {auditMeta[store.id]?.inProgress && (
                          <Badge className="bg-amber-500 hover:bg-amber-500 gap-1">
                            <Clock className="h-3 w-3" /> In progress
                          </Badge>
                        )}
                        <Badge variant={store.status === "active" ? "default" : "secondary"}>
                          {store.status}
                        </Badge>
                      </div>
                    </div>
                    {store.storecode && (
                      <span className="font-mono text-xs text-muted-foreground">{store.storecode}</span>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-muted/40 py-2">
                        <Package className="h-4 w-4 mx-auto text-muted-foreground" />
                        <div className="mt-1 text-lg font-semibold tabular-nums">{store.productCount ?? 0}</div>
                        <div className="text-[11px] text-muted-foreground">Products</div>
                      </div>
                      <div className="rounded-md bg-muted/40 py-2">
                        <Boxes className="h-4 w-4 mx-auto text-muted-foreground" />
                        <div className="mt-1 text-lg font-semibold tabular-nums">{store.totalStock ?? 0}</div>
                        <div className="text-[11px] text-muted-foreground">Units</div>
                      </div>
                      <div className="rounded-md bg-muted/40 py-2">
                        <IndianRupee className="h-4 w-4 mx-auto text-muted-foreground" />
                        <div className="mt-1 text-lg font-semibold tabular-nums">
                          {formatCurrency(store.totalStockValue ?? 0)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">Stock value</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        {auditMeta[store.id]?.last ? (
                          <>
                            <Gauge className="h-3.5 w-3.5" />
                            {auditMeta[store.id]!.last!.totals.accuracyPct}% ·{" "}
                            {formatDateTime(auditMeta[store.id]!.last!.completedAt)}
                          </>
                        ) : (
                          "Never audited"
                        )}
                      </span>
                      <span className="flex items-center font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Open <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
