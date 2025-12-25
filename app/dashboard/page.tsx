"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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

interface BillItem {
  productId: string
  productName: string
  quantity: number
  total: number
}

interface Bill {
  id: string
  date: string
  total: number
  items?: BillItem[]
}

interface Product {
  id: string
  name: string
  stock: number
  minStock: number
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
    recentBills: [] as Bill[],
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
      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL

      const [billsResponse, productsResponse, storesResponse, usersResponse] =
        await Promise.all([
          fetch(`${baseUrl}/api/bills`),
          fetch(`${baseUrl}/api/products`),
          fetch(`${baseUrl}/api/stores`),
          fetch(`${baseUrl}/api/users`),
        ])

      if (!billsResponse.ok) {
        const errorText = await billsResponse.text()
        console.error(
          `Failed to fetch bills: ${billsResponse.status} ${billsResponse.statusText} - ${errorText}`,
        )
        throw new Error("Failed to fetch bills data")
      }
      if (!productsResponse.ok) {
        const errorText = await productsResponse.text()
        console.error(
          `Failed to fetch products: ${productsResponse.status} ${productsResponse.statusText} - ${errorText}`,
        )
        throw new Error("Failed to fetch products data")
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

      const rawBills = await billsResponse.json()
      const rawProducts = await productsResponse.json()
      const rawStores = await storesResponse.json()
      const rawUsers = await usersResponse.json()

      const bills: Bill[] = Array.isArray(rawBills)
        ? rawBills
        : Array.isArray(rawBills?.data)
        ? rawBills.data
        : []
      const products: Product[] = Array.isArray(rawProducts)
        ? rawProducts
        : Array.isArray(rawProducts?.data)
        ? rawProducts.data
        : []
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

      console.log("📊 Dashboard data:", {
        bills: bills.length,
        products: products.length,
        stores: stores.length,
        users: users.length,
      })

      // -------- OVERALL STATS --------
      const totalRevenue = bills.reduce(
        (sum, bill) => sum + (bill.total || 0),
        0,
      )
      const totalBills = bills.length
      const totalProducts = products.length
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

      const lowStockProducts = products.filter(
        (product) => product.stock <= product.minStock,
      ).length

      // -------- RECENT BILLS --------
      const recentBills = [...bills]
        .sort(
          (a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime(),
        )
        .slice(0, 5)

// -------- TOP PRODUCTS (by quantity sold) --------
const productSales: Record<string, ProductSale> = {}

bills.forEach((bill: any) => {
  // bill.items may be nested or named differently; normalize a bit
  const rawItems =
    bill.items ||
    bill.bill_items ||
    bill.BillItems ||
    bill.items_json ||
    []

  if (!Array.isArray(rawItems)) return

  rawItems.forEach((raw: any) => {
    const productId =
      raw.productId || raw.product_id || raw.productid || raw.id
    if (!productId) return

    const quantity = Number(raw.quantity ?? raw.qty ?? 0)
    const lineTotal = Number(
      raw.total ??
        raw.line_total ??
        raw.amount ??
        (raw.price ?? 0) * quantity,
    )
    const name =
      raw.productName ||
      raw.product_name ||
      raw.productname ||
      raw.name ||
      "Unknown product"

    if (productSales[productId]) {
      productSales[productId].quantity += quantity
      productSales[productId].revenue += lineTotal
    } else {
      productSales[productId] = {
        name,
        quantity,
        revenue: lineTotal,
      }
    }
  })
})

const topProducts = Object.values(productSales)
  .sort((a, b) => b.quantity - a.quantity)
  .slice(0, 5)

console.log("✅ Aggregated:", {
  topProducts,
})

setStats((prev) => ({
  ...prev,
  totalRevenue,
  totalBills,
  totalProducts,
  totalStores,
  totalUsers,
  lowStockProducts,
  recentBills,
  topProducts,
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
                          {bill.date
                            ? new Date(bill.date).toLocaleDateString()
                            : "Invalid Date"}
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
