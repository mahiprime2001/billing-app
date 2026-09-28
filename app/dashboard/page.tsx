"use client"

import { fetchWithBackgroundRefresh, withResolvers } from "@/lib/api-cache"
import { useBackgroundPoll } from "@/hooks/useBackgroundPoll"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDisplayDate } from "@/app/utils/formatDate"
import {
  BarChart3,
  TrendingUp,
  Users,
  Package,
  Receipt,
  Store,
  AlertTriangle,
  Calendar,
  DollarSign,
} from "lucide-react"

// Each card below fetches only what it displays, independently, instead of
// the old approach of downloading the ENTIRE bills/products/stores/users
// lists on every load (and every 60s poll) just to compute a handful of
// numbers client-side. That was the single heaviest thing hitting the
// backend -- with ~11,850 bills (each carrying full item details), it could
// alone fill every one of the backend's 8 worker slots for 30-60+ seconds,
// starving every other request (including other users' POS traffic) at the
// same time. See /api/bills/summary, /api/products/summary and
// /api/products/top-sold on the backend for the lightweight equivalents.

interface ProductSale {
  productId: string
  name: string
  quantity: number
  revenue: number
}

interface Bill {
  id: string
  date?: string
  timestamp?: string
  createdAt?: string
  customerName?: string
  total: number
  items?: unknown[]
}

interface BillsSummary {
  totalCount: number
  totalRevenue: number
  todayCount: number
  todayRevenue: number
}

interface ProductsSummary {
  totalCount: number
  lowStockCount: number
}

interface StoreType {
  id: string
  name: string
  status: string
}

interface UserType {
  id: string
  name: string
  isActive?: boolean
  is_active?: boolean
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)

  const [billsSummary, setBillsSummary] = useState<BillsSummary | null>(null)
  const [productsSummary, setProductsSummary] = useState<ProductsSummary | null>(null)
  const [totalStores, setTotalStores] = useState<number | null>(null)
  const [totalUsers, setTotalUsers] = useState<number | null>(null)
  const [recentBills, setRecentBills] = useState<Bill[] | null>(null)
  const [topProducts, setTopProducts] = useState<ProductSale[] | null>(null)
  const [isStale, setIsStale] = useState(false)

  useEffect(() => {
    // dummy user for now (unchanged from before this rewrite -- not part of
    // the loading-performance fix, so left exactly as it was)
    setUser({ name: "Admin", role: "super_admin" })
  }, [])

  const loadDashboardData = async () => {
    const staleBy = withResolvers(setIsStale)

    const calls: Promise<void>[] = [
      fetchWithBackgroundRefresh<BillsSummary>(
        "/api/bills/summary",
        (r) => { setBillsSummary(r.data); staleBy.set("bills", r.source === "cache") },
        () => staleBy.set("bills", true),
      ),
      fetchWithBackgroundRefresh<ProductsSummary>(
        "/api/products/summary",
        (r) => { setProductsSummary(r.data); staleBy.set("products", r.source === "cache") },
        () => staleBy.set("products", true),
      ),
      fetchWithBackgroundRefresh<StoreType[]>(
        "/api/stores",
        (r) => {
          const list = Array.isArray(r.data) ? r.data : []
          setTotalStores(list.filter((s) => s.status === "active").length)
          staleBy.set("stores", r.source === "cache")
        },
        () => staleBy.set("stores", true),
      ),
      fetchWithBackgroundRefresh<Bill[] | { data: Bill[] }>(
        "/api/bills?paginate=1&page=1&pageSize=5&details=1",
        (r) => {
          const raw: any = r.data
          const list: Bill[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : []
          setRecentBills(list)
          staleBy.set("recentBills", r.source === "cache")
        },
        () => staleBy.set("recentBills", true),
      ),
      fetchWithBackgroundRefresh<ProductSale[]>(
        "/api/products/top-sold?limit=5",
        (r) => { setTopProducts(Array.isArray(r.data) ? r.data : []); staleBy.set("topProducts", r.source === "cache") },
        () => staleBy.set("topProducts", true),
      ),
    ]

    // Users card is super_admin-only -- don't fetch it for a store-scoped
    // billing user who can't see it anyway.
    if (user?.role === "super_admin") {
      calls.push(
        fetchWithBackgroundRefresh<UserType[]>(
          "/api/users",
          (r) => {
            const list = Array.isArray(r.data) ? r.data : []
            const active = list.filter(
              (u) => u.isActive === true || u.is_active === true || (u.isActive === undefined && u.is_active === undefined),
            )
            setTotalUsers(active.length)
            staleBy.set("users", r.source === "cache")
          },
          () => staleBy.set("users", true),
        ),
      )
    }

    await Promise.allSettled(calls)
  }

  useEffect(() => {
    if (!user) return
    loadDashboardData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useBackgroundPoll(() => { if (user) loadDashboardData() })

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </DashboardLayout>
    )
  }

  const cardSkeleton = <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            Welcome back{user?.name ? `, ${user.name}` : ""}!
          </h1>
          <p className="text-gray-600 mt-2">
            Here&apos;s what&apos;s happening with your jewelry business today.
            {isStale && <span className="ml-2 text-xs text-amber-600">(showing last synced data)</span>}
          </p>
        </div>

        {/* Stats Cards -- each one renders as soon as ITS OWN data lands,
            not waiting on the slowest of the bunch. */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {billsSummary ? (
                <>
                  <div className="text-2xl font-bold">₹{billsSummary.totalRevenue.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">From {billsSummary.totalCount} bills</p>
                </>
              ) : cardSkeleton}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bills</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {billsSummary ? (
                <>
                  <div className="text-2xl font-bold">{billsSummary.totalCount}</div>
                  <p className="text-xs text-muted-foreground">
                    {billsSummary.todayCount} today (₹{billsSummary.todayRevenue.toFixed(2)})
                  </p>
                </>
              ) : cardSkeleton}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Products</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {productsSummary ? (
                <>
                  <div className="text-2xl font-bold">{productsSummary.totalCount}</div>
                  <p className="text-xs text-muted-foreground">
                    {productsSummary.lowStockCount > 0 ? (
                      <span className="text-yellow-600">{productsSummary.lowStockCount} low stock</span>
                    ) : (
                      "All in stock"
                    )}
                  </p>
                </>
              ) : cardSkeleton}
            </CardContent>
          </Card>
          {user.role === "super_admin" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Stores</CardTitle>
                <Store className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {totalStores !== null ? (
                  <>
                    <div className="text-2xl font-bold">{totalStores}</div>
                    <p className="text-xs text-muted-foreground">Store locations</p>
                  </>
                ) : cardSkeleton}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Alerts */}
        {productsSummary && productsSummary.lowStockCount > 0 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="text-yellow-800 flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2" />
                Stock Alert
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-yellow-700">
                You have {productsSummary.lowStockCount} products with low stock levels.
                Consider restocking these items soon.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Recent Bills */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Receipt className="h-5 w-5 mr-2" />
                Recent Bills
              </CardTitle>
              <CardDescription>Latest billing activity</CardDescription>
            </CardHeader>
            <CardContent>
              {recentBills === null ? (
                <div className="space-y-4">
                  {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />)}
                </div>
              ) : recentBills.length > 0 ? (
                <div className="space-y-4">
                  {recentBills.map((bill: any) => (
                    <div key={bill.id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">#{bill.id}</p>
                        <p className="text-sm text-gray-500">{bill.customerName}</p>
                        <p className="text-xs text-gray-400 flex items-center">
                          <Calendar className="h-3 w-3 mr-1" />
                          {formatDisplayDate(bill)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">₹{(bill.total || 0).toFixed(2)}</p>
                        <Badge variant="secondary">{bill.items ? bill.items.length : 0} items</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No bills created yet</p>
              )}
            </CardContent>
          </Card>

          {/* Top Products */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="h-5 w-5 mr-2" />
                Top Selling Products
              </CardTitle>
              <CardDescription>Best performing jewelry items</CardDescription>
            </CardHeader>
            <CardContent>
              {topProducts === null ? (
                <div className="space-y-4">
                  {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />)}
                </div>
              ) : topProducts.length > 0 ? (
                <div className="space-y-4">
                  {topProducts.map((product, index: number) => (
                    <div key={product.productId || index} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-gray-500">{product.quantity} units sold</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">₹{product.revenue.toFixed(2)}</p>
                        <Badge variant="outline">#{index + 1}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No sales data available</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Super Admin Only Sections */}
        {user.role === "super_admin" && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  System Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                {totalUsers !== null ? (
                  <>
                    <div className="text-2xl font-bold">{totalUsers}</div>
                    <p className="text-sm text-gray-500">Active users in system</p>
                  </>
                ) : cardSkeleton}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Store className="h-5 w-5 mr-2" />
                  Store Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {billsSummary && totalStores !== null ? (
                  <>
                    <div className="text-2xl font-bold">
                      ₹{totalStores > 0 ? (billsSummary.totalRevenue / totalStores).toFixed(2) : "0.00"}
                    </div>
                    <p className="text-sm text-gray-500">Average revenue per store</p>
                  </>
                ) : cardSkeleton}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2" />
                  Analytics
                </CardTitle>
              </CardHeader>
              <CardContent>
                {billsSummary ? (
                  <>
                    <div className="text-2xl font-bold">
                      ₹{billsSummary.totalCount > 0 ? (billsSummary.totalRevenue / billsSummary.totalCount).toFixed(2) : "0.00"}
                    </div>
                    <p className="text-sm text-gray-500">Average bill value</p>
                  </>
                ) : cardSkeleton}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
