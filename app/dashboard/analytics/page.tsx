"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  StoreIcon,
  Package,
  DollarSign,
  ShoppingCart,
  BarChart3,
  Download,
  Filter,
  RefreshCw,
} from "lucide-react"
import { DatePickerWithRange } from "@/components/ui/date-range-picker"
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns"
import type { DateRange } from "react-day-picker"

interface Bill {
  id: string
  storeId: string
  storeName: string
  customerName: string
  items: Array<{
    productId: string
    productName: string
    quantity: number
    price: number
    total: number
  }>
  subtotal: number
  tax: number
  discount: number
  total: number
  date: string
  createdBy: string
}

interface Store {
  id: string
  name: string
  address: string
  status: string
}

interface Product {
  id: string
  name: string
  price: number
  stock: number
}

interface StoreAnalytics {
  storeId: string
  storeName: string
  totalRevenue: number
  totalBills: number
  totalItems: number
  averageBillValue: number
  topProducts: Array<{
    productId: string
    productName: string
    quantity: number
    revenue: number
  }>
  monthlyTrend: Array<{
    month: string
    revenue: number
    bills: number
  }>
  revenueGrowth: number
  billsGrowth: number
}

interface ProductAnalytics {
  productId: string
  productName: string
  totalQuantitySold: number
  totalRevenue: number
  averagePrice: number
  totalBills: number
  topStores: Array<{
    storeId: string
    storeName: string
    quantity: number
    revenue: number
  }>
  monthlyTrend: Array<{
    month: string
    quantity: number
    revenue: number
  }>
  quantityGrowth: number
  revenueGrowth: number
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D", "#FFC658", "#FF7C7C"]

export default function AnalyticsPage() {
  const router = useRouter()
  const [bills, setBills] = useState<Bill[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [storeAnalytics, setStoreAnalytics] = useState<StoreAnalytics[]>([])
  const [productAnalytics, setProductAnalytics] = useState<ProductAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState<string>("all")
  const [selectedProduct, setSelectedProduct] = useState<string>("all")
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  })

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    const userData = localStorage.getItem("adminUser")

    if (isLoggedIn !== "true" || !userData) {
      router.push("/")
      return
    }

    const user = JSON.parse(userData)
    if (user.role !== "super_admin") {
      router.push("/dashboard")
      return
    }

    loadData()
  }, [router])

  useEffect(() => {
    if (bills.length > 0) {
      calculateAnalytics()
    }
  }, [bills, dateRange])

  const loadData = () => {
    setLoading(true)

    // Load bills
    const savedBills = localStorage.getItem("bills")
    if (savedBills) {
      setBills(JSON.parse(savedBills))
    }

    // Load stores
    const savedStores = localStorage.getItem("stores")
    if (savedStores) {
      setStores(JSON.parse(savedStores))
    }

    // Load products
    const savedProducts = localStorage.getItem("products")
    if (savedProducts) {
      setProducts(JSON.parse(savedProducts))
    }

    setLoading(false)
  }

  const filterBillsByDateRange = (bills: Bill[]) => {
    if (!dateRange?.from || !dateRange?.to) return bills

    return bills.filter((bill) => {
      const billDate = new Date(bill.date)
      return billDate >= dateRange.from! && billDate <= dateRange.to!
    })
  }

  const calculateAnalytics = () => {
    const filteredBills = filterBillsByDateRange(bills)

    // Calculate store analytics
    const storeStats: { [key: string]: StoreAnalytics } = {}

    stores.forEach((store) => {
      const storeBills = filteredBills.filter((bill) => bill.storeId === store.id)
      const totalRevenue = storeBills.reduce((sum, bill) => sum + bill.total, 0)
      const totalBills = storeBills.length
      const totalItems = storeBills.reduce(
        (sum, bill) => sum + bill.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0,
      )
      const averageBillValue = totalBills > 0 ? totalRevenue / totalBills : 0

      // Calculate product performance for this store
      const productStats: { [key: string]: { quantity: number; revenue: number; name: string } } = {}
      storeBills.forEach((bill) => {
        bill.items.forEach((item) => {
          if (!productStats[item.productId]) {
            productStats[item.productId] = { quantity: 0, revenue: 0, name: item.productName }
          }
          productStats[item.productId].quantity += item.quantity
          productStats[item.productId].revenue += item.total
        })
      })

      const topProducts = Object.entries(productStats)
        .map(([productId, stats]) => ({
          productId,
          productName: stats.name,
          quantity: stats.quantity,
          revenue: stats.revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)

      // Calculate monthly trend
      const monthlyStats: { [key: string]: { revenue: number; bills: number } } = {}
      storeBills.forEach((bill) => {
        const month = format(new Date(bill.date), "MMM yyyy")
        if (!monthlyStats[month]) {
          monthlyStats[month] = { revenue: 0, bills: 0 }
        }
        monthlyStats[month].revenue += bill.total
        monthlyStats[month].bills += 1
      })

      const monthlyTrend = Object.entries(monthlyStats)
        .map(([month, stats]) => ({ month, ...stats }))
        .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())

      // Calculate growth (comparing with previous period)
      const currentPeriodRevenue = totalRevenue
      const previousPeriodStart = new Date(dateRange?.from || new Date())
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1)
      const previousPeriodEnd = new Date(dateRange?.to || new Date())
      previousPeriodEnd.setMonth(previousPeriodEnd.getMonth() - 1)

      const previousPeriodBills = bills.filter((bill) => {
        const billDate = new Date(bill.date)
        return bill.storeId === store.id && billDate >= previousPeriodStart && billDate <= previousPeriodEnd
      })

      const previousPeriodRevenue = previousPeriodBills.reduce((sum, bill) => sum + bill.total, 0)
      const revenueGrowth =
        previousPeriodRevenue > 0 ? ((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100 : 0
      const billsGrowth =
        previousPeriodBills.length > 0
          ? ((totalBills - previousPeriodBills.length) / previousPeriodBills.length) * 100
          : 0

      storeStats[store.id] = {
        storeId: store.id,
        storeName: store.name,
        totalRevenue,
        totalBills,
        totalItems,
        averageBillValue,
        topProducts,
        monthlyTrend,
        revenueGrowth,
        billsGrowth,
      }
    })

    setStoreAnalytics(Object.values(storeStats))

    // Calculate product analytics
    const productStats: { [key: string]: ProductAnalytics } = {}

    products.forEach((product) => {
      const productBills = filteredBills.filter((bill) => bill.items.some((item) => item.productId === product.id))

      let totalQuantitySold = 0
      let totalRevenue = 0
      const totalBills = productBills.length
      let priceSum = 0
      let priceCount = 0

      const storeStats: { [key: string]: { quantity: number; revenue: number; name: string } } = {}

      productBills.forEach((bill) => {
        const productItems = bill.items.filter((item) => item.productId === product.id)
        productItems.forEach((item) => {
          totalQuantitySold += item.quantity
          totalRevenue += item.total
          priceSum += item.price
          priceCount += 1

          if (!storeStats[bill.storeId]) {
            storeStats[bill.storeId] = { quantity: 0, revenue: 0, name: bill.storeName }
          }
          storeStats[bill.storeId].quantity += item.quantity
          storeStats[bill.storeId].revenue += item.total
        })
      })

      const averagePrice = priceCount > 0 ? priceSum / priceCount : product.price

      const topStores = Object.entries(storeStats)
        .map(([storeId, stats]) => ({
          storeId,
          storeName: stats.name,
          quantity: stats.quantity,
          revenue: stats.revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)

      // Calculate monthly trend
      const monthlyStats: { [key: string]: { quantity: number; revenue: number } } = {}
      productBills.forEach((bill) => {
        const month = format(new Date(bill.date), "MMM yyyy")
        const productItems = bill.items.filter((item) => item.productId === product.id)

        if (!monthlyStats[month]) {
          monthlyStats[month] = { quantity: 0, revenue: 0 }
        }

        productItems.forEach((item) => {
          monthlyStats[month].quantity += item.quantity
          monthlyStats[month].revenue += item.total
        })
      })

      const monthlyTrend = Object.entries(monthlyStats)
        .map(([month, stats]) => ({ month, ...stats }))
        .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())

      // Calculate growth
      const currentQuantity = totalQuantitySold
      const currentRevenue = totalRevenue

      const previousPeriodStart = new Date(dateRange?.from || new Date())
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1)
      const previousPeriodEnd = new Date(dateRange?.to || new Date())
      previousPeriodEnd.setMonth(previousPeriodEnd.getMonth() - 1)

      const previousPeriodBills = bills.filter((bill) => {
        const billDate = new Date(bill.date)
        return (
          billDate >= previousPeriodStart &&
          billDate <= previousPeriodEnd &&
          bill.items.some((item) => item.productId === product.id)
        )
      })

      let previousQuantity = 0
      let previousRevenue = 0

      previousPeriodBills.forEach((bill) => {
        const productItems = bill.items.filter((item) => item.productId === product.id)
        productItems.forEach((item) => {
          previousQuantity += item.quantity
          previousRevenue += item.total
        })
      })

      const quantityGrowth = previousQuantity > 0 ? ((currentQuantity - previousQuantity) / previousQuantity) * 100 : 0
      const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0

      productStats[product.id] = {
        productId: product.id,
        productName: product.name,
        totalQuantitySold,
        totalRevenue,
        averagePrice,
        totalBills,
        topStores,
        monthlyTrend,
        quantityGrowth,
        revenueGrowth,
      }
    })

    setProductAnalytics(Object.values(productStats).filter((p) => p.totalQuantitySold > 0))
  }

  const exportAnalytics = async () => {
    try {
      // Dynamically import SheetJS and handle both ESM/CJS default exports
      const XLSXMod = await import("xlsx")
      const XLSX = (XLSXMod as any).default ?? XLSXMod

      /* ---------- Build Workbook Data ---------- */
      const storeData = storeAnalytics.map((store) => ({
        "Store Name": store.storeName,
        "Total Revenue": store.totalRevenue.toFixed(2),
        "Total Bills": store.totalBills,
        "Total Items Sold": store.totalItems,
        "Average Bill Value": store.averageBillValue.toFixed(2),
        "Revenue Growth %": store.revenueGrowth.toFixed(2),
        "Bills Growth %": store.billsGrowth.toFixed(2),
      }))

      const productData = productAnalytics.map((product) => ({
        "Product Name": product.productName,
        "Total Quantity Sold": product.totalQuantitySold,
        "Total Revenue": product.totalRevenue.toFixed(2),
        "Average Price": product.averagePrice.toFixed(2),
        "Total Bills": product.totalBills,
        "Quantity Growth %": product.quantityGrowth.toFixed(2),
        "Revenue Growth %": product.revenueGrowth.toFixed(2),
      }))

      const topProductsData: any[] = []
      storeAnalytics.forEach((store) => {
        store.topProducts.forEach((product, index) => {
          topProductsData.push({
            "Store Name": store.storeName,
            Rank: index + 1,
            "Product Name": product.productName,
            "Quantity Sold": product.quantity,
            Revenue: product.revenue.toFixed(2),
          })
        })
      })

      /* ---------- Create Workbook ---------- */
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(storeData), "Store Analytics")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productData), "Product Analytics")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(topProductsData), "Top Products by Store")

      /* ---------- Generate File In-Memory ---------- */
      const wbArrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })
      const blob = new Blob([wbArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })

      /* ---------- Trigger Browser Download ---------- */
      const dateStr =
        dateRange?.from && dateRange?.to
          ? `${format(dateRange.from, "yyyy-MM-dd")}_to_${format(dateRange.to, "yyyy-MM-dd")}`
          : format(new Date(), "yyyy-MM-dd")
      const filename = `Analytics-Report-${dateStr}.xlsx`

      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error exporting analytics:", error)
      alert("Error exporting analytics. Please try again.")
    }
  }

  const setQuickDateRange = (range: string) => {
    const today = new Date()
    let from: Date
    let to: Date = today

    switch (range) {
      case "today":
        from = today
        break
      case "yesterday":
        from = subDays(today, 1)
        to = subDays(today, 1)
        break
      case "last7days":
        from = subDays(today, 7)
        break
      case "last30days":
        from = subDays(today, 30)
        break
      case "thisMonth":
        from = startOfMonth(today)
        to = endOfMonth(today)
        break
      case "lastMonth":
        from = startOfMonth(subDays(today, 30))
        to = endOfMonth(subDays(today, 30))
        break
      case "thisYear":
        from = startOfYear(today)
        to = endOfYear(today)
        break
      default:
        return
    }

    setDateRange({ from, to })
  }

  const filteredStoreAnalytics =
    selectedStore === "all" ? storeAnalytics : storeAnalytics.filter((store) => store.storeId === selectedStore)

  const filteredProductAnalytics =
    selectedProduct === "all"
      ? productAnalytics
      : productAnalytics.filter((product) => product.productId === selectedProduct)

  // Calculate totals
  const totalRevenue = storeAnalytics.reduce((sum, store) => sum + store.totalRevenue, 0)
  const totalBills = storeAnalytics.reduce((sum, store) => sum + store.totalBills, 0)
  const totalItems = storeAnalytics.reduce((sum, store) => sum + store.totalItems, 0)
  const averageBillValue = totalBills > 0 ? totalRevenue / totalBills : 0

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-gray-600 mt-2">Comprehensive insights into store and product performance</p>
          </div>
          <div className="flex space-x-3">
            <Button onClick={exportAnalytics} variant="outline" className="bg-green-50 hover:bg-green-100">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button onClick={loadData} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Data
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Filter className="h-5 w-5 mr-2" />
              Filters & Date Range
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Date Range</Label>
                <DatePickerWithRange date={dateRange} setDate={setDateRange} />
              </div>
              <div className="space-y-2">
                <Label>Quick Ranges</Label>
                <Select onValueChange={setQuickDateRange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last7days">Last 7 Days</SelectItem>
                    <SelectItem value="last30days">Last 30 Days</SelectItem>
                    <SelectItem value="thisMonth">This Month</SelectItem>
                    <SelectItem value="lastMonth">Last Month</SelectItem>
                    <SelectItem value="thisYear">This Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Filter by Store</Label>
                <Select value={selectedStore} onValueChange={setSelectedStore}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stores</SelectItem>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Filter by Product</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{totalRevenue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Across {storeAnalytics.length} stores</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bills</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalBills}</div>
              <p className="text-xs text-muted-foreground">Bills generated</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems}</div>
              <p className="text-xs text-muted-foreground">Total items sold</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Bill Value</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{averageBillValue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Per transaction</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Analytics Tabs */}
        <Tabs defaultValue="stores" className="space-y-4">
          <TabsList>
            <TabsTrigger value="stores">Store Analytics</TabsTrigger>
            <TabsTrigger value="products">Product Analytics</TabsTrigger>
            <TabsTrigger value="trends">Trends & Insights</TabsTrigger>
          </TabsList>

          {/* Store Analytics Tab */}
          <TabsContent value="stores" className="space-y-6">
            {/* Store Performance Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredStoreAnalytics.map((store) => (
                <Card key={store.storeId}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center">
                        <StoreIcon className="h-5 w-5 mr-2" />
                        {store.storeName}
                      </span>
                      <div className="flex space-x-2">
                        {store.revenueGrowth > 0 ? (
                          <Badge className="bg-green-100 text-green-800">
                            <TrendingUp className="h-3 w-3 mr-1" />+{store.revenueGrowth.toFixed(1)}%
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <TrendingDown className="h-3 w-3 mr-1" />
                            {store.revenueGrowth.toFixed(1)}%
                          </Badge>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Revenue</p>
                          <p className="text-xl font-bold">₹{store.totalRevenue.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Bills</p>
                          <p className="text-xl font-bold">{store.totalBills}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Items Sold</p>
                          <p className="text-xl font-bold">{store.totalItems}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Avg Bill</p>
                          <p className="text-xl font-bold">₹{store.averageBillValue.toFixed(2)}</p>
                        </div>
                      </div>

                      {/* Top Products */}
                      <div>
                        <p className="text-sm font-medium mb-2">Top Products</p>
                        <div className="space-y-1">
                          {store.topProducts.slice(0, 3).map((product, index) => (
                            <div key={product.productId} className="flex justify-between text-sm">
                              <span className="truncate">
                                {index + 1}. {product.productName}
                              </span>
                              <span className="font-medium">₹{product.revenue.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Monthly Trend Chart */}
                      {store.monthlyTrend.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2">Revenue Trend</p>
                          <ResponsiveContainer width="100%" height={100}>
                            <AreaChart data={store.monthlyTrend}>
                              <Area
                                type="monotone"
                                dataKey="revenue"
                                stroke="#8884d8"
                                fill="#8884d8"
                                fillOpacity={0.3}
                              />
                              <XAxis dataKey="month" hide />
                              <YAxis hide />
                              <Tooltip formatter={(value) => [`₹${Number(value).toFixed(2)}`, "Revenue"]} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Store Comparison Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Store Revenue Comparison</CardTitle>
                <CardDescription>Revenue performance across all stores</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={filteredStoreAnalytics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="storeName" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`₹${Number(value).toFixed(2)}`, "Revenue"]} />
                    <Bar dataKey="totalRevenue" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Product Analytics Tab */}
          <TabsContent value="products" className="space-y-6">
            {/* Product Performance Table */}
            <Card>
              <CardHeader>
                <CardTitle>Product Performance</CardTitle>
                <CardDescription>Detailed analytics for each product</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead>Product Name</TableHead>
                        <TableHead>Qty Sold</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>Avg Price</TableHead>
                        <TableHead>Bills</TableHead>
                        <TableHead>Growth</TableHead>
                        <TableHead>Top Store</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProductAnalytics
                        .sort((a, b) => b.totalRevenue - a.totalRevenue)
                        .map((product) => (
                          <TableRow key={product.productId}>
                            <TableCell className="font-medium">{product.productName}</TableCell>
                            <TableCell>{product.totalQuantitySold}</TableCell>
                            <TableCell className="font-medium">₹{product.totalRevenue.toFixed(2)}</TableCell>
                            <TableCell>₹{product.averagePrice.toFixed(2)}</TableCell>
                            <TableCell>{product.totalBills}</TableCell>
                            <TableCell>
                              {product.revenueGrowth > 0 ? (
                                <Badge className="bg-green-100 text-green-800">
                                  <TrendingUp className="h-3 w-3 mr-1" />+{product.revenueGrowth.toFixed(1)}%
                                </Badge>
                              ) : (
                                <Badge variant="secondary">
                                  <TrendingDown className="h-3 w-3 mr-1" />
                                  {product.revenueGrowth.toFixed(1)}%
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{product.topStores[0]?.storeName || "N/A"}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Top Products Chart */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Products by Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={filteredProductAnalytics.slice(0, 8)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="totalRevenue"
                      >
                        {filteredProductAnalytics.slice(0, 8).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`₹${Number(value).toFixed(2)}`, "Revenue"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Products by Quantity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={filteredProductAnalytics.slice(0, 10)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="productName" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="totalQuantitySold" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Trends & Insights Tab */}
          <TabsContent value="trends" className="space-y-6">
            {/* Revenue Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trend Over Time</CardTitle>
                <CardDescription>Monthly revenue comparison across all stores</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={storeAnalytics[0]?.monthlyTrend || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`₹${Number(value).toFixed(2)}`, "Revenue"]} />
                    {storeAnalytics.map((store, index) => (
                      <Line
                        key={store.storeId}
                        type="monotone"
                        dataKey="revenue"
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth={2}
                        data={store.monthlyTrend}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Key Insights */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Performing Store</CardTitle>
                </CardHeader>
                <CardContent>
                  {storeAnalytics.length > 0 && (
                    <div className="space-y-4">
                      {storeAnalytics
                        .sort((a, b) => b.totalRevenue - a.totalRevenue)
                        .slice(0, 1)
                        .map((store) => (
                          <div key={store.storeId} className="space-y-2">
                            <h3 className="font-semibold text-lg">{store.storeName}</h3>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-gray-500">Revenue</p>
                                <p className="text-xl font-bold text-green-600">₹{store.totalRevenue.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Growth</p>
                                <p className="text-xl font-bold text-blue-600">+{store.revenueGrowth.toFixed(1)}%</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Best Selling Product</p>
                              <p className="font-medium">{store.topProducts[0]?.productName || "N/A"}</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Best Selling Product</CardTitle>
                </CardHeader>
                <CardContent>
                  {productAnalytics.length > 0 && (
                    <div className="space-y-4">
                      {productAnalytics
                        .sort((a, b) => b.totalQuantitySold - a.totalQuantitySold)
                        .slice(0, 1)
                        .map((product) => (
                          <div key={product.productId} className="space-y-2">
                            <h3 className="font-semibold text-lg">{product.productName}</h3>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-gray-500">Quantity Sold</p>
                                <p className="text-xl font-bold text-green-600">{product.totalQuantitySold}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Revenue</p>
                                <p className="text-xl font-bold text-blue-600">₹{product.totalRevenue.toFixed(2)}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Top Store</p>
                              <p className="font-medium">{product.topStores[0]?.storeName || "N/A"}</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
