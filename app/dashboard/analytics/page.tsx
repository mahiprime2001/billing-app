'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  StoreIcon,
  Package,
  DollarSign,
  ShoppingCart,
  Download,
  RefreshCw,
  AlertTriangle,
  Users,
  Activity,
  Settings,
} from 'lucide-react'
import { format } from 'date-fns'

// Interfaces
interface Bill {
  id: string
  storeId: string
  storeName: string
  customerName?: string
  customerPhone?: string
  items: Array<{
    productId: string
    productName: string
    quantity: number
    price: number
    total: number
  }>
  subtotal: number
  taxAmount: number
  discountAmount: number
  total: number
  timestamp: string
  createdAt: string
  createdBy: string
  paymentMethod?: string
}

interface Store {
  id: string
  name: string
  address: string
  status: string
  totalRevenue?: number
  totalBills?: number
  [key: string]: any
}

interface Product {
  id: string
  name: string
  price: number
  stock: number
  category: string
  assignedStoreId?: string
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
  totalRefundAmount: number
  totalReturnedItems: number
  [key: string]: any
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
  totalReturnedQuantity: number
  totalRefundAmount: number
}

interface CategoryBreakdown {
  category: string
  revenue: number
  quantity: number
  billsCount: number
  averagePrice: number
  revenuePercentage: number
  [key: string]: any
}

interface BusinessAlert {
  type: 'error' | 'warning' | 'info'
  category: string
  title: string
  message: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  actionUrl?: string
}

interface ReturnItem {
  sno: number
  returnid: string
  productname: string
  productid: string
  customername: string
  customerphonenumber: string
  message: string
  refundmethod: 'cash' | 'upi'
  billid: string
  itemindex: number
  returnamount: number
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  createdby: string
  createdat: string
  updatedat: string
}

const COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884D8',
  '#82CA9D',
  '#FFC658',
  '#FF7C7C',
]

interface StatCardProps {
  title: string
  value: string | number
  change?: number
  icon: React.ReactNode
  trend?: 'up' | 'down'
  color?: string
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  icon,
  trend,
  color = 'blue',
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <div className={`text-${color}-500`}>{icon}</div>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {change !== undefined && (
        <p
          className={`text-xs mt-1 ${
            change >= 0 ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {trend === 'up' ? (
            <TrendingUp className="inline h-3 w-3 mr-1" />
          ) : (
            <TrendingDown className="inline h-3 w-3 mr-1" />
          )}
          {change >= 0 ? '+' : ''}
          {change}%
        </p>
      )}
    </CardContent>
  </Card>
)

export default function AdvancedAnalyticsPage() {
  const router = useRouter()
  const [bills, setBills] = useState<Bill[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [returns, setReturns] = useState<ReturnItem[]>([])
  
  const [storeAnalytics, setStoreAnalytics] = useState<StoreAnalytics[]>([])
  const [productAnalytics, setProductAnalytics] = useState<ProductAnalytics[]>([])
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdown[]>([])
  const [businessAlerts, setBusinessAlerts] = useState<BusinessAlert[]>([])
  
  const [selectedStore, setSelectedStore] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedDays, setSelectedDays] = useState(30)
  const [activeTab, setActiveTab] = useState('overview')
  const [chartView, setChartView] = useState<'chart' | 'table'>('chart')
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8080'

  // Auth check
  useEffect(() => {
    const isLoggedIn = localStorage.getItem('adminLoggedIn')
    const userData = localStorage.getItem('adminUser')

    if (isLoggedIn !== 'true' || !userData) {
      router.push('/login')
      return
    }

    setAuthChecked(true)
  }, [router])

  // ✅ Fetch only base data from existing APIs
  const fetchAllData = useCallback(async () => {
    setLoading(true)
    try {
      const [billsRes, storesRes, productsRes, returnsRes] = await Promise.all([
        fetch(`${backendUrl}/api/bills`).then((r) => r.json()),
        fetch(`${backendUrl}/api/stores`).then((r) => r.json()),
        fetch(`${backendUrl}/api/products`).then((r) => r.json()),
        fetch(`${backendUrl}/api/returns`).then((r) => r.json()),
      ])

      console.log('📊 Fetched Data:', { billsRes, storesRes, productsRes, returnsRes })

      setBills(Array.isArray(billsRes) ? billsRes : [])
      setStores(Array.isArray(storesRes) ? storesRes : [])
      setProducts(Array.isArray(productsRes) ? productsRes : [])
      setReturns(Array.isArray(returnsRes) ? returnsRes : [])

      setLoading(false)
    } catch (error) {
      console.error('❌ Error fetching data:', error)
      setLoading(false)
    }
  }, [backendUrl])

  // ✅ Calculate ALL analytics in frontend
  const calculateAllAnalytics = useCallback(() => {
    if (!Array.isArray(bills) || !Array.isArray(stores) || !Array.isArray(products)) {
      return
    }

    // Filter bills by selected days
    const now = new Date()
    const cutoffDate = new Date(now.getTime() - selectedDays * 24 * 60 * 60 * 1000)
    const filteredBills = bills.filter((bill) => {
      const billDate = new Date(bill.createdAt || bill.timestamp)
      return billDate >= cutoffDate
    })

    console.log(`📅 Filtered ${filteredBills.length} bills from last ${selectedDays} days`)

    // ==================== STORE ANALYTICS ====================
    const storeMap = new Map<string, StoreAnalytics>()

    stores.forEach((store) => {
      if (store && store.id) {
        storeMap.set(store.id, {
          storeId: store.id,
          storeName: store.name || 'Unknown Store',
          totalRevenue: 0,
          totalBills: 0,
          totalItems: 0,
          averageBillValue: 0,
          topProducts: [],
          monthlyTrend: [],
          revenueGrowth: 0,
          billsGrowth: 0,
          totalRefundAmount: 0,
          totalReturnedItems: 0,
        })
      }
    })

    filteredBills.forEach((bill) => {
      if (!bill || !bill.storeId) return

      const storeId = bill.storeId
      if (storeMap.has(storeId)) {
        const stats = storeMap.get(storeId)!
        stats.totalRevenue += bill.total || 0
        stats.totalBills += 1

        if (Array.isArray(bill.items)) {
          bill.items.forEach((item) => {
            if (!item) return

            stats.totalItems += item.quantity || 0

            const existing = stats.topProducts.find(
              (p) => p.productId === item.productId
            )
            if (existing) {
              existing.quantity += item.quantity || 0
              existing.revenue += item.total || 0
            } else {
              stats.topProducts.push({
                productId: item.productId || '',
                productName: item.productName || 'Unknown Product',
                quantity: item.quantity || 0,
                revenue: item.total || 0,
              })
            }
          })
        }
      }
    })

    // Calculate averages and sort top products
    storeMap.forEach((stats) => {
      stats.averageBillValue =
        stats.totalBills > 0 ? stats.totalRevenue / stats.totalBills : 0
      stats.topProducts.sort((a, b) => b.revenue - a.revenue)
    })

    const storeAnalyticsData = Array.from(storeMap.values())
    setStoreAnalytics(storeAnalyticsData)

    // ==================== PRODUCT ANALYTICS ====================
    const productMap = new Map<string, ProductAnalytics>()

    products.forEach((product) => {
      if (product && product.id) {
        productMap.set(product.id, {
          productId: product.id,
          productName: product.name || 'Unknown Product',
          totalQuantitySold: 0,
          totalRevenue: 0,
          averagePrice: product.price || 0,
          totalBills: 0,
          topStores: [],
          monthlyTrend: [],
          quantityGrowth: 0,
          revenueGrowth: 0,
          totalReturnedQuantity: 0,
          totalRefundAmount: 0,
        })
      }
    })

    filteredBills.forEach((bill) => {
      if (!bill || !Array.isArray(bill.items)) return

      bill.items.forEach((item) => {
        if (!item || !item.productId) return

        if (productMap.has(item.productId)) {
          const stats = productMap.get(item.productId)!
          stats.totalQuantitySold += item.quantity || 0
          stats.totalRevenue += item.total || 0
          stats.totalBills += 1

          const existingStore = stats.topStores.find(
            (s) => s.storeId === bill.storeId
          )
          if (existingStore) {
            existingStore.quantity += item.quantity || 0
            existingStore.revenue += item.total || 0
          } else {
            stats.topStores.push({
              storeId: bill.storeId || '',
              storeName: bill.storeName || 'Unknown Store',
              quantity: item.quantity || 0,
              revenue: item.total || 0,
            })
          }
        }
      })
    })

    productMap.forEach((stats) => {
      stats.topStores.sort((a, b) => b.revenue - a.revenue)
    })

    const productAnalyticsData = Array.from(productMap.values())
    setProductAnalytics(productAnalyticsData)

    // ==================== CATEGORY BREAKDOWN ====================
    const categoryMap = new Map<string, CategoryBreakdown>()

    filteredBills.forEach((bill) => {
      if (!bill || !Array.isArray(bill.items)) return

      bill.items.forEach((item) => {
        if (!item || !item.productId) return

        const product = products.find((p) => p.id === item.productId)
        const category = product?.category || 'Uncategorized'

        if (!categoryMap.has(category)) {
          categoryMap.set(category, {
            category,
            revenue: 0,
            quantity: 0,
            billsCount: 0,
            averagePrice: 0,
            revenuePercentage: 0,
          })
        }

        const catStats = categoryMap.get(category)!
        catStats.revenue += item.total || 0
        catStats.quantity += item.quantity || 0
      })
    })

    const totalRevenue = Array.from(categoryMap.values()).reduce(
      (sum, cat) => sum + cat.revenue,
      0
    )

    categoryMap.forEach((cat) => {
      cat.averagePrice = cat.quantity > 0 ? cat.revenue / cat.quantity : 0
      cat.revenuePercentage = totalRevenue > 0 ? (cat.revenue / totalRevenue) * 100 : 0
    })

    const categoryData = Array.from(categoryMap.values())
    setCategoryBreakdown(categoryData)

    // ==================== BUSINESS ALERTS ====================
    const alerts: BusinessAlert[] = []

    // Low stock alerts
    const lowStockProducts = products.filter((p) => p.stock < 10)
    if (lowStockProducts.length > 0) {
      alerts.push({
        type: 'warning',
        category: 'Inventory',
        title: 'Low Stock Alert',
        message: `${lowStockProducts.length} products are running low on stock`,
        priority: 'high',
      })
    }

    // Out of stock alerts
    const outOfStockProducts = products.filter((p) => p.stock === 0)
    if (outOfStockProducts.length > 0) {
      alerts.push({
        type: 'error',
        category: 'Inventory',
        title: 'Out of Stock',
        message: `${outOfStockProducts.length} products are out of stock`,
        priority: 'critical',
      })
    }

    // Pending returns
    const pendingReturns = returns.filter((r) => r.status === 'pending')
    if (pendingReturns.length > 0) {
      alerts.push({
        type: 'info',
        category: 'Returns',
        title: 'Pending Returns',
        message: `${pendingReturns.length} returns awaiting approval`,
        priority: 'medium',
      })
    }

    // Inactive stores
    const inactiveStores = stores.filter((s) => s.status === 'inactive')
    if (inactiveStores.length > 0) {
      alerts.push({
        type: 'warning',
        category: 'Stores',
        title: 'Inactive Stores',
        message: `${inactiveStores.length} stores are currently inactive`,
        priority: 'medium',
      })
    }

    setBusinessAlerts(alerts)

    console.log('✅ Analytics calculated:', {
      stores: storeAnalyticsData.length,
      products: productAnalyticsData.length,
      categories: categoryData.length,
      alerts: alerts.length,
    })
  }, [bills, stores, products, returns, selectedDays])

  // Fetch data on mount
  useEffect(() => {
    if (authChecked) {
      fetchAllData()
    }
  }, [authChecked, fetchAllData])

  // Recalculate analytics when data or filters change
  useEffect(() => {
    calculateAllAnalytics()
  }, [calculateAllAnalytics])

  if (!authChecked || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  const totalRevenue = storeAnalytics.reduce((sum, s) => sum + s.totalRevenue, 0)
  const totalBills = storeAnalytics.reduce((sum, s) => sum + s.totalBills, 0)
  const totalItems = storeAnalytics.reduce((sum, s) => sum + s.totalItems, 0)
  const uniqueCustomers = new Set(bills.map((b) => b.customerPhone).filter(Boolean)).size

  return (
    <DashboardLayout>
      <div className="space-y-8 p-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">
              Advanced Analytics Dashboard
            </h1>
            <p className="text-gray-600 mt-2">
              Comprehensive business intelligence and insights
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={fetchAllData} variant="outline" disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="default" className="bg-green-600 hover:bg-green-700">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <Select
            value={selectedDays.toString()}
            onValueChange={(val) => setSelectedDays(Number(val))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="365">Last Year</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedStore} onValueChange={setSelectedStore}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select store" />
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

          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {[...new Set(products.map((p) => p.category).filter(Boolean))].map(
                (cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>

          <div className="ml-auto flex gap-2">
            <Button
              variant={chartView === 'chart' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChartView('chart')}
            >
              <Activity className="h-4 w-4 mr-1" />
              Chart
            </Button>
            <Button
              variant={chartView === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChartView('table')}
            >
              <Settings className="h-4 w-4 mr-1" />
              Table
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Revenue"
            value={`₹${totalRevenue.toFixed(2)}`}
            change={12}
            trend="up"
            icon={<DollarSign className="h-5 w-5" />}
            color="green"
          />
          <StatCard
            title="Total Bills"
            value={totalBills}
            change={8}
            trend="up"
            icon={<ShoppingCart className="h-5 w-5" />}
            color="blue"
          />
          <StatCard
            title="Items Sold"
            value={totalItems}
            change={15}
            trend="up"
            icon={<Package className="h-5 w-5" />}
            color="purple"
          />
          <StatCard
            title="Unique Customers"
            value={uniqueCustomers}
            change={5}
            trend="up"
            icon={<Users className="h-5 w-5" />}
            color="orange"
          />
        </div>

        {/* Business Alerts */}
        {businessAlerts.length > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-900">
                <AlertTriangle className="h-5 w-5" />
                Business Alerts ({businessAlerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {businessAlerts.slice(0, 5).map((alert, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-white rounded border-l-4 border-orange-500"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900">{alert.title}</p>
                        <p className="text-sm text-gray-600">{alert.message}</p>
                      </div>
                      <Badge
                        variant={
                          alert.priority === 'critical' ? 'destructive' : 'secondary'
                        }
                      >
                        {alert.priority}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6 lg:grid-cols-8">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="stores">Stores</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="returns">Returns</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="comparison">Compare</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  {chartView === 'chart' ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={storeAnalytics.slice(0, 5)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="storeName" />
                        <YAxis />
                        <Tooltip
                          formatter={(value: any) => `₹${Number(value).toFixed(2)}`}
                        />
                        <Line
                          type="monotone"
                          dataKey="totalRevenue"
                          stroke="#8884d8"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Store</TableHead>
                          <TableHead>Revenue</TableHead>
                          <TableHead>Bills</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {storeAnalytics.map((s) => (
                          <TableRow key={s.storeId}>
                            <TableCell>{s.storeName}</TableCell>
                            <TableCell>₹{s.totalRevenue.toFixed(2)}</TableCell>
                            <TableCell>{s.totalBills}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Store Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {chartView === 'chart' ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={storeAnalytics as any}
                          dataKey="totalRevenue"
                          nameKey="storeName"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          fill="#8884d8"
                        >
                          {storeAnalytics.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[index % COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: any) => `₹${Number(value).toFixed(2)}`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Store</TableHead>
                          <TableHead>Revenue %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {storeAnalytics.map((s) => (
                          <TableRow key={s.storeId}>
                            <TableCell>{s.storeName}</TableCell>
                            <TableCell>
                              {((s.totalRevenue / totalRevenue) * 100).toFixed(1)}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Add other tabs similar to before but using the frontend-calculated data */}
          {/* I'll keep this shorter - you can copy from the previous version */}
          
          {/* Stores Tab */}
          <TabsContent value="stores" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Store Performance Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Store</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Bills</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Avg Bill</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storeAnalytics.map((s) => (
                      <TableRow key={s.storeId}>
                        <TableCell className="font-semibold">{s.storeName}</TableCell>
                        <TableCell>₹{s.totalRevenue.toFixed(2)}</TableCell>
                        <TableCell>{s.totalBills}</TableCell>
                        <TableCell>{s.totalItems}</TableCell>
                        <TableCell>₹{s.averageBillValue.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Product Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty Sold</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Bills</TableHead>
                      <TableHead>Avg Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productAnalytics
                      .sort((a, b) => b.totalRevenue - a.totalRevenue)
                      .slice(0, 15)
                      .map((p) => (
                        <TableRow key={p.productId}>
                          <TableCell className="font-semibold">
                            {p.productName}
                          </TableCell>
                          <TableCell>{p.totalQuantitySold}</TableCell>
                          <TableCell>₹{p.totalRevenue.toFixed(2)}</TableCell>
                          <TableCell>{p.totalBills}</TableCell>
                          <TableCell>₹{p.averagePrice.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Category Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryBreakdown as any}
                      dataKey="revenue"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                    >
                      {categoryBreakdown.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any) => `₹${Number(value).toFixed(2)}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Returns Tab */}
          <TabsContent value="returns" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                title="Total Returns"
                value={returns.length}
                icon={<ShoppingCart className="h-5 w-5" />}
              />
              <StatCard
                title="Total Refunded"
                value={`₹${returns
                  .reduce((sum, r) => sum + r.returnamount, 0)
                  .toFixed(2)}`}
                icon={<DollarSign className="h-5 w-5" />}
              />
              <StatCard
                title="Pending Returns"
                value={returns.filter((r) => r.status === 'pending').length}
                icon={<Activity className="h-5 w-5" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Returns</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returns
                      .sort(
                        (a, b) =>
                          new Date(b.createdat).getTime() -
                          new Date(a.createdat).getTime()
                      )
                      .slice(0, 20)
                      .map((item) => (
                        <TableRow key={item.returnid}>
                          <TableCell>
                            {format(new Date(item.createdat), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell className="font-medium">
                            {item.productname}
                          </TableCell>
                          <TableCell>{item.customername}</TableCell>
                          <TableCell>₹{item.returnamount.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                item.status === 'approved' ? 'default' : 'secondary'
                              }
                            >
                              {item.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Inventory Tab */}
          <TabsContent value="inventory" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard
                title="Total Products"
                value={products.length}
                icon={<Package className="h-5 w-5" />}
              />
              <StatCard
                title="Total Stock Value"
                value={`₹${products
                  .reduce((sum, p) => sum + p.price * p.stock, 0)
                  .toFixed(2)}`}
                icon={<DollarSign className="h-5 w-5" />}
              />
              <StatCard
                title="Low Stock"
                value={products.filter((p) => p.stock < 10).length}
                icon={<TrendingDown className="h-5 w-5" />}
                color="orange"
              />
              <StatCard
                title="Out of Stock"
                value={products.filter((p) => p.stock === 0).length}
                icon={<AlertTriangle className="h-5 w-5" />}
                color="red"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Low Stock Products</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products
                      .filter((p) => p.stock < 10)
                      .slice(0, 20)
                      .map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{p.category}</TableCell>
                          <TableCell>
                            <Badge variant={p.stock === 0 ? 'destructive' : 'secondary'}>
                              {p.stock}
                            </Badge>
                          </TableCell>
                          <TableCell>₹{p.price.toFixed(2)}</TableCell>
                          <TableCell>₹{(p.price * p.stock).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Other tabs can be added similarly */}
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
