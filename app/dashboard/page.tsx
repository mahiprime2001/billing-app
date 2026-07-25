"use client"

import { API_BASE } from "@/lib/api-base"
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

interface ProductSale {
  name: string
  quantity: number
  revenue: number
}

interface StoreType {
  id: string
  name: string
  status: string
}

interface User {
  id: string
  name: string
  isActive?: boolean
  is_active?: boolean
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalBills: 0,
    totalProducts: 0,
    totalStores: 0,
    totalUsers: 0,
    lowStockProducts: 0,
    recentBills: [] as any[],
    topProducts: [] as ProductSale[],
  })

  useEffect(() => {
    // dummy user for now
    setUser({ name: "Admin", role: "super_admin" })

    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)
        await loadDashboardData()
      } catch (err) {
        console.error("Error loading dashboard data:", err)
        setError("Failed to load dashboard data. Please try again later.")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [router])

  const loadDashboardData = async () => {
    try {
      const baseUrl = API_BASE

      // One lightweight, server-cached call replaces the old pattern of
      // downloading every bill (with full item/product joins) and the whole
      // product catalog just to compute ~10 numbers and two 5-row lists.
      const [summaryResponse, storesResponse, usersResponse] =
        await Promise.all([
          fetch(`${baseUrl}/api/dashboard/summary`),
          fetch(`${baseUrl}/api/stores`),
          fetch(`${baseUrl}/api/users`),
        ])

      if (!summaryResponse.ok) {
        const errorText = await summaryResponse.text()
        console.error(
          `Failed to fetch dashboard summary: ${summaryResponse.status} ${summaryResponse.statusText} - ${errorText}`,
        )
        throw new Error("Failed to fetch dashboard summary")
      }
      if (!storesResponse.ok) {
        const errorText = await storesResponse.text()
        console.error(
          `Failed to fetch stores: ${storesResponse.status} ${storesResponse.statusText} - ${errorText}`,
        )
        throw new Error("Failed to fetch stores data")
      }
      if (!usersResponse.ok) {
        const errorText = await usersResponse.text()
        console.error(
          `Failed to fetch users: ${usersResponse.status} ${usersResponse.statusText} - ${errorText}`,
        )
        throw new Error("Failed to fetch users data")
      }

      const summary = await summaryResponse.json()
      const rawStores = await storesResponse.json()
      const rawUsers = await usersResponse.json()

      const stores: StoreType[] = Array.isArray(rawStores)
        ? rawStores
        : Array.isArray(rawStores?.data)
        ? rawStores.data
        : []
      const users: User[] = Array.isArray(rawUsers)
        ? rawUsers
        : Array.isArray(rawUsers?.data)
        ? rawUsers.data
        : []

      const totalStores = stores.filter(
        (store) => store.status === "active",
      ).length

      // active users: if isActive/is_active missing, treat as active
      const activeUsers = users.filter(
        (u) =>
          u.isActive === true ||
          u.is_active === true ||
          (u.isActive === undefined && u.is_active === undefined),
      )
      const totalUsers = activeUsers.length

      setStats((prev) => ({
        ...prev,
        totalRevenue: summary.totalRevenue || 0,
        totalBills: summary.totalBills || 0,
        totalProducts: summary.totalProducts || 0,
        totalStores,
        totalUsers,
        lowStockProducts: summary.lowStockProducts || 0,
        recentBills: Array.isArray(summary.recentBills) ? summary.recentBills : [],
        topProducts: Array.isArray(summary.topProducts) ? summary.topProducts : [],
      }))
    } catch (error) {
      console.error("Error loading dashboard data:", error)
      throw error
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </DashboardLayout>
    )
  }

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
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₹{stats.totalRevenue.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                From {stats.totalBills} bills
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bills</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalBills}</div>
              <p className="text-xs text-muted-foreground">Bills generated</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Products</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProducts}</div>
              <p className="text-xs text-muted-foreground">
                {stats.lowStockProducts > 0 && (
                  <span className="text-yellow-600">
                    {stats.lowStockProducts} low stock
                  </span>
                )}
                {stats.lowStockProducts === 0 && "All in stock"}
              </p>
            </CardContent>
          </Card>
          {user.role === "super_admin" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Stores</CardTitle>
                <Store className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalStores}</div>
                <p className="text-xs text-muted-foreground">Store locations</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Alerts */}
        {stats.lowStockProducts > 0 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="text-yellow-800 flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2" />
                Stock Alert
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-yellow-700">
                You have {stats.lowStockProducts} products with low stock levels.
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
              {stats.recentBills.length > 0 ? (
                <div className="space-y-4">
                  {stats.recentBills.map((bill: any) => (
                    <div
                      key={bill.id}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">#{bill.id}</p>
                        <p className="text-sm text-gray-500">
                          {bill.customerName}
                        </p>
                        <p className="text-xs text-gray-400 flex items-center">
                          <Calendar className="h-3 w-3 mr-1" />
                          {formatDisplayDate(bill)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">
                          ₹{(bill.total || 0).toFixed(2)}
                        </p>
                        <Badge variant="secondary">
                          {bill.items ? bill.items.length : 0} items
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  No bills created yet
                </p>
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
              {stats.topProducts.length > 0 ? (
                <div className="space-y-4">
                  {stats.topProducts.map((product: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-gray-500">
                          {product.quantity} units sold
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">
                          ₹{product.revenue.toFixed(2)}
                        </p>
                        <Badge variant="outline">#{index + 1}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  No sales data available
                </p>
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
                <div className="text-2xl font-bold">{stats.totalUsers}</div>
                <p className="text-sm text-gray-500">
                  Active users in system
                </p>
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
                <div className="text-2xl font-bold">
                  ₹
                  {stats.totalStores > 0
                    ? (stats.totalRevenue / stats.totalStores).toFixed(2)
                    : "0.00"}
                </div>
                <p className="text-sm text-gray-500">
                  Average revenue per store
                </p>
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
                <div className="text-2xl font-bold">
                  ₹
                  {stats.totalBills > 0
                    ? (stats.totalRevenue / stats.totalBills).toFixed(2)
                    : "0.00"}
                </div>
                <p className="text-sm text-gray-500">Average bill value</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
