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

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalBills: 0,
    totalProducts: 0,
    totalStores: 0,
    totalUsers: 0,
    lowStockProducts: 0,
    recentBills: [] as any[],
    topProducts: [] as any[],
  })

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    const userData = localStorage.getItem("adminUser")

    if (isLoggedIn !== "true" || !userData) {
      router.push("/")
      return
    }

    const currentUser = JSON.parse(userData)
    setUser(currentUser)
    loadDashboardData()
  }, [router])

  const loadDashboardData = () => {
    // Load bills
    const savedBills = localStorage.getItem("bills")
    const bills = savedBills ? JSON.parse(savedBills) : []

    // Load products
    const savedProducts = localStorage.getItem("products")
    const products = savedProducts ? JSON.parse(savedProducts) : []

    // Load stores
    const savedStores = localStorage.getItem("stores")
    const stores = savedStores ? JSON.parse(savedStores) : []

    // Load users
    const savedUsers = localStorage.getItem("systemUsers")
    const users = savedUsers ? JSON.parse(savedUsers) : []

    // Calculate stats
    const totalRevenue = bills.reduce((sum: number, bill: any) => sum + bill.total, 0)
    const totalBills = bills.length
    const totalProducts = products.length
    const totalStores = stores.filter((store: any) => store.status === "active").length
    const totalUsers = users.filter((user: any) => user.isActive).length
    const lowStockProducts = products.filter((product: any) => product.stock <= product.minStock).length

    // Recent bills (last 5)
    const recentBills = bills
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)

    // Top products by quantity sold
    const productSales: { [key: string]: { name: string; quantity: number; revenue: number } } = {}
    bills.forEach((bill: any) => {
      bill.items.forEach((item: any) => {
        if (productSales[item.productId]) {
          productSales[item.productId].quantity += item.quantity
          productSales[item.productId].revenue += item.total
        } else {
          productSales[item.productId] = {
            name: item.productName,
            quantity: item.quantity,
            revenue: item.total,
          }
        }
      })
    })

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)

    setStats({
      totalRevenue,
      totalBills,
      totalProducts,
      totalStores,
      totalUsers,
      lowStockProducts,
      recentBills,
      topProducts,
    })
  }

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Welcome back, {user.name}!</h1>
          <p className="text-gray-600 mt-2">Here's what's happening with your jewelry business today.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{stats.totalRevenue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">From {stats.totalBills} bills</p>
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
                  <span className="text-yellow-600">{stats.lowStockProducts} low stock</span>
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
                You have {stats.lowStockProducts} products with low stock levels. Consider restocking these items soon.
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
                    <div key={bill.id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">#{bill.id}</p>
                        <p className="text-sm text-gray-500">{bill.customerName}</p>
                        <p className="text-xs text-gray-400 flex items-center">
                          <Calendar className="h-3 w-3 mr-1" />
                          {new Date(bill.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">₹{bill.total.toFixed(2)}</p>
                        <Badge variant="secondary">{bill.items.length} items</Badge>
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
              {stats.topProducts.length > 0 ? (
                <div className="space-y-4">
                  {stats.topProducts.map((product: any, index: number) => (
                    <div key={index} className="flex items-center justify-between">
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
                <div className="text-2xl font-bold">{stats.totalUsers}</div>
                <p className="text-sm text-gray-500">Active users in system</p>
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
                  ₹{stats.totalStores > 0 ? (stats.totalRevenue / stats.totalStores).toFixed(2) : "0.00"}
                </div>
                <p className="text-sm text-gray-500">Average revenue per store</p>
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
                  ₹{stats.totalBills > 0 ? (stats.totalRevenue / stats.totalBills).toFixed(2) : "0.00"}
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
