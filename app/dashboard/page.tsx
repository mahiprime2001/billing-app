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
  name: string;
  quantity: number;
  revenue: number;
}

interface Bill {
  id: string;
  date: string;
  total: number;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    total: number;
  }>;
}

interface Product {
  id: string;
  name: string;
  stock: number;
  minStock: number;
}

interface Store {
  id: string;
  name: string;
  status: string;
}

interface User {
  id: string;
  name: string;
  isActive: boolean;
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
    // For now, removing local storage checks as per user's request
    // The actual user data and role will be fetched via a new authentication flow.
    // For demonstration, setting a dummy user. This will be replaced by actual login.
    setUser({ name: "Admin", role: "super_admin" }); // Dummy user for now

    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)
        await loadDashboardData()
      } catch (err) {
        console.error('Error loading dashboard data:', err)
        setError('Failed to load dashboard data. Please try again later.')
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [router])

  const loadDashboardData = async () => {
    try {
      // Fetch data directly from Flask backend
      const [billsResponse, productsResponse, storesResponse, usersResponse] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/bills`),
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/products`),
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/stores`),
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/users`)
      ]);

      if (!billsResponse.ok) {
        const errorText = await billsResponse.text();
        console.error(`Failed to fetch bills: ${billsResponse.status} ${billsResponse.statusText} - ${errorText}`);
        throw new Error('Failed to fetch bills data');
      }
      if (!productsResponse.ok) {
        const errorText = await productsResponse.text();
        console.error(`Failed to fetch products: ${productsResponse.status} ${productsResponse.statusText} - ${errorText}`);
        throw new Error('Failed to fetch products data');
      }
      if (!storesResponse.ok) {
        const errorText = await storesResponse.text();
        console.error(`Failed to fetch stores: ${storesResponse.status} ${storesResponse.statusText} - ${errorText}`);
        throw new Error('Failed to fetch stores data');
      }
      if (!usersResponse.ok) {
        const errorText = await usersResponse.text();
        console.error(`Failed to fetch users: ${usersResponse.status} ${usersResponse.statusText} - ${errorText}`);
        throw new Error('Failed to fetch users data');
      }
      const [bills, products, stores, users] = await Promise.all([
        billsResponse.json() as Promise<Bill[]>,
        productsResponse.json() as Promise<Product[]>,
        storesResponse.json() as Promise<Store[]>,
        usersResponse.json() as Promise<User[]>
      ]);

      // Calculate stats
      const totalRevenue = bills.reduce((sum, bill) => sum + bill.total, 0);
      const totalBills = bills.length;
      const totalProducts = products.length;
      const totalStores = stores.filter(store => store.status === "active").length;
      const totalUsers = users.filter(user => user.isActive).length;
      const lowStockProducts = products.filter(product => product.stock <= product.minStock).length;

      // Recent bills (last 5)
      const recentBills = [...bills]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);

      // Top products by quantity sold
      const productSales: Record<string, ProductSale> = {};
      
      bills.forEach(bill => {
        bill.items.forEach(item => {
          if (productSales[item.productId]) {
            productSales[item.productId].quantity += item.quantity;
            productSales[item.productId].revenue += item.total;
          } else {
            productSales[item.productId] = {
              name: item.productName,
              quantity: item.quantity,
              revenue: item.total,
            };
          }
        });
      });

      const topProducts = Object.values(productSales)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      setStats({
        totalRevenue,
        totalBills,
        totalProducts,
        totalStores,
        totalUsers,
        lowStockProducts,
        recentBills,
        topProducts,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      throw error; // Re-throw to be caught by the caller
    }
  }

  // For now, we will always render the dashboard, assuming authentication will be handled elsewhere
  // or a dummy user is set.
  // if (!user) {
  //   return <div>Loading...</div>
  // }

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
