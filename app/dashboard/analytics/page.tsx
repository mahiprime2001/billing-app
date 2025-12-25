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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  ShoppingCart,
  Download,
  RefreshCw,
  AlertTriangle,
  Users,
  Activity,
  Calendar,
  BarChart3,
} from 'lucide-react'
import { format, subDays, eachDayOfInterval } from 'date-fns'

// ==================== TYPES ====================

interface BillItem {
  productId: string
  productName: string
  quantity: number
  price: number
  total: number
}

interface Bill {
  id: string
  storeId: string
  storeName?: string
  customerId?: string
  items: BillItem[]
  subtotal: number
  taxAmount: number
  discountAmount: number
  total: number
  timestamp: string
  createdAt: string
  paymentMethod?: string
}

interface Store {
  id: string
  name: string
  address: string
  status: string
  [key: string]: any
}

interface Product {
  id: string
  name: string
  price: number
  stock: number
  [key: string]: any
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
}

interface ReturnItem {
  returnId: string
  productId: string
  returnAmount: number
  status: string
  createdAt: string
}

interface BusinessAlert {
  type: 'error' | 'warning' | 'info'
  category: string
  title: string
  message: string
  priority: 'critical' | 'high' | 'medium' | 'low'
}

interface DailyStats {
  date: string
  revenue: number
  bills: number
  items: number
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

// =======================
// NORMALIZE BACKEND BILLS
// =======================
const normalizeBills = (rawBills: any[]): Bill[] => {
  return rawBills.map((b) => ({
    id: b.id,
    storeId: b.storeId || b.store_id || b.storeid,
    storeName: b.storeName || b.store_name,
    customerId: b.customerId || b.customer_id || b.customerid,
    subtotal: Number(b.subtotal || b.sub_total || 0),
    taxAmount: Number(b.taxAmount || b.tax_amount || b.tax || 0),
    discountAmount: Number(
      b.discountAmount || b.discount_amount || b.discountamount || 0,
    ),
    total: Number(b.total || 0),
    createdAt: b.createdAt || b.created_at || b.timestamp || b.date,
    timestamp: b.timestamp || b.created_at || b.date,
    paymentMethod: b.paymentMethod || b.payment_method || b.paymentmethod,
    items: (b.items || []).map((i: any) => ({
      productId: i.productId || i.product_id || i.productid,
      productName:
        i.productName || i.product_name || i.productname || 'Unknown Product',
      quantity: Number(i.quantity || 0),
      price: Number(i.price || 0),
      total: Number(i.total || 0),
    })),
  }))
}

// ==================== UI COMPONENTS ====================

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
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {change !== undefined && (
        <p
          className={`text-xs ${
            change >= 0 ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {trend === 'up' ? (
            <TrendingUp className="inline h-4 w-4" />
          ) : (
            <TrendingDown className="inline h-4 w-4" />
          )}
          {change >= 0 ? '+' : ''}
          {change}%
        </p>
      )}
    </CardContent>
  </Card>
)

// ==================== MAIN PAGE ====================

export default function AdvancedAnalyticsPage() {
  const router = useRouter()

  const [bills, setBills] = useState<Bill[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [returns, setReturns] = useState<ReturnItem[]>([])
  const [storeAnalytics, setStoreAnalytics] = useState<StoreAnalytics[]>([])
  const [productAnalytics, setProductAnalytics] = useState<ProductAnalytics[]>([])
  const [businessAlerts, setBusinessAlerts] = useState<BusinessAlert[]>([])
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [selectedStore, setSelectedStore] = useState('all')
  const [selectedDays, setSelectedDays] = useState(30)
  const [activeTab, setActiveTab] = useState('overview')
  const [chartView, setChartView] = useState<'chart' | 'table'>('chart')
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8080'

  // Helper to get store name
  const getStoreName = useCallback(
    (storeId: string) => {
      const store = stores.find((s) => s.id === storeId)
      return store?.name || 'Unknown Store'
    },
    [stores],
  )

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

  // Fetch data
  const fetchAllData = useCallback(async () => {
    setLoading(true)
    try {
      console.log('🔄 Fetching data from backend...')

      const [billsRes, storesRes, productsRes, returnsRes] = await Promise.all([
        fetch(`${backendUrl}/api/bills`).then((r) => r.json()),
        fetch(`${backendUrl}/api/stores`).then((r) => r.json()),
        fetch(`${backendUrl}/api/products`).then((r) => r.json()),
        fetch(`${backendUrl}/api/returns`).then((r) => r.json()),
      ])

      const validBills = Array.isArray(billsRes) ? billsRes : []
      const validStores = Array.isArray(storesRes) ? storesRes : []
      const validProducts = Array.isArray(productsRes) ? productsRes : []
      const validReturns = Array.isArray(returnsRes) ? returnsRes : []

      const normalizedBills = normalizeBills(validBills)

      console.log('✅ Setting state with:', {
        bills: normalizedBills.length,
        stores: validStores.length,
        products: validProducts.length,
        returns: validReturns.length,
      })

      console.log('✅ Normalized bill sample:', normalizedBills[0])

      setBills(normalizedBills)
      setStores(validStores)
      setProducts(validProducts)
      setReturns(validReturns)

      setLoading(false)
    } catch (error) {
      console.error('❌ Error fetching data:', error)
      setLoading(false)
    }
  }, [backendUrl])

  // Calculate all analytics
  const calculateAllAnalytics = useCallback(() => {
    console.log('🧮 Starting analytics calculation...')
    console.log('Input data:', {
      bills: bills.length,
      stores: stores.length,
      products: products.length,
    })

    if (!bills || bills.length === 0) {
      console.log('⚠️ No bills to analyze')
      setStoreAnalytics([])
      setProductAnalytics([])
      setDailyStats([])
      return
    }

    // Filter by days and store
    const now = new Date()
    const cutoffDate = new Date(
      now.getTime() - selectedDays * 24 * 60 * 60 * 1000,
    )

    const filteredBills = bills.filter((bill) => {
      const billDate = new Date(bill.createdAt || bill.timestamp)
      if (isNaN(billDate.getTime())) return false

      const dateMatch = billDate >= cutoffDate
      const storeMatch =
        selectedStore === 'all' || bill.storeId === selectedStore

      return dateMatch && storeMatch
    })

    console.log(
      `📅 Filtered ${filteredBills.length} bills from last ${selectedDays} days`,
    )

    // ==================== DAILY STATS ====================
    const daysArray = eachDayOfInterval({
      start: subDays(now, selectedDays),
      end: now,
    })

    const dailyMap = new Map<string, DailyStats>()

    daysArray.forEach((day) => {
      const dateStr = format(day, 'yyyy-MM-dd')
      dailyMap.set(dateStr, {
        date: dateStr,
        revenue: 0,
        bills: 0,
        items: 0,
      })
    })

    filteredBills.forEach((bill) => {
      const billDate = new Date(bill.createdAt || bill.timestamp)
      const dateStr = format(billDate, 'yyyy-MM-dd')

      if (dailyMap.has(dateStr)) {
        const stats = dailyMap.get(dateStr)!
        stats.revenue += bill.total || 0
        stats.bills += 1
        if (Array.isArray(bill.items)) {
          bill.items.forEach((item) => {
            stats.items += item.quantity || 0
          })
        }
      }
    })

    const dailyStatsArray = Array.from(dailyMap.values())
    setDailyStats(dailyStatsArray)

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
        })
      }
    })

    filteredBills.forEach((bill) => {
      if (!bill || !bill.storeId) return

      if (storeMap.has(bill.storeId)) {
        const stats = storeMap.get(bill.storeId)!
        stats.totalRevenue += bill.total || 0
        stats.totalBills += 1

        if (Array.isArray(bill.items)) {
          bill.items.forEach((item) => {
            if (!item) return
            stats.totalItems += item.quantity || 0

            const existing = stats.topProducts.find(
              (p) => p.productId === item.productId,
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
            (s) => s.storeId === bill.storeId,
          )

          if (existingStore) {
            existingStore.quantity += item.quantity || 0
            existingStore.revenue += item.total || 0
          } else {
            stats.topStores.push({
              storeId: bill.storeId || '',
              storeName: getStoreName(bill.storeId),
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

    // ==================== BUSINESS ALERTS ====================
    const alerts: BusinessAlert[] = []

    const lowStockProducts = products.filter((p) => p.stock > 0 && p.stock < 10)
    if (lowStockProducts.length > 0) {
      alerts.push({
        type: 'warning',
        category: 'Inventory',
        title: 'Low Stock Alert',
        message: `${lowStockProducts.length} products are running low on stock`,
        priority: 'high',
      })
    }

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
      alerts: alerts.length,
      dailyStats: dailyStatsArray.length,
    })
  }, [bills, stores, products, returns, selectedDays, selectedStore, getStoreName])

  useEffect(() => {
    if (authChecked) {
      fetchAllData()
    }
  }, [authChecked, fetchAllData])

  useEffect(() => {
    calculateAllAnalytics()
  }, [calculateAllAnalytics])

  if (!authChecked || loading) {
    return (
      <DashboardLayout>
        <div className="flex h-screen items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  const totalRevenue = storeAnalytics.reduce(
    (sum, s) => sum + s.totalRevenue,
    0,
  )
  const totalBills = storeAnalytics.reduce((sum, s) => sum + s.totalBills, 0)
  const totalItems = storeAnalytics.reduce((sum, s) => sum + s.totalItems, 0)
  const uniqueCustomers = new Set(
    bills.map((b) => b.customerId).filter(Boolean),
  ).size

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Advanced Analytics Dashboard</h1>
            <p className="text-muted-foreground">
              Comprehensive business intelligence and insights
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchAllData} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button>
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          <Select
            value={selectedDays.toString()}
            onValueChange={(val) => setSelectedDays(Number(val))}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="365">Last Year</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedStore} onValueChange={setSelectedStore}>
            <SelectTrigger className="w-[180px]">
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

          <div className="ml-auto flex gap-2">
            <Button
              variant={chartView === 'chart' ? 'default' : 'outline'}
              onClick={() => setChartView('chart')}
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Chart
            </Button>
            <Button
              variant={chartView === 'table' ? 'default' : 'outline'}
              onClick={() => setChartView('table')}
            >
              <Activity className="mr-2 h-4 w-4" />
              Table
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Revenue"
            value={`₹${totalRevenue.toFixed(2)}`}
            change={12.5}
            icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
            trend="up"
          />
          <StatCard
            title="Total Bills"
            value={totalBills}
            change={8.2}
            icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}
            trend="up"
          />
          <StatCard
            title="Items Sold"
            value={totalItems}
            change={-3.1}
            icon={<Package className="h-4 w-4 text-muted-foreground" />}
            trend="down"
          />
          <StatCard
            title="Unique Customers"
            value={uniqueCustomers}
            change={15.3}
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
            trend="up"
          />
        </div>

        {/* Business Alerts */}
        {businessAlerts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Business Alerts ({businessAlerts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {businessAlerts.slice(0, 5).map((alert, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <AlertTriangle
                        className={`h-5 w-5 ${
                          alert.type === 'error'
                            ? 'text-red-500'
                            : alert.type === 'warning'
                            ? 'text-yellow-500'
                            : 'text-blue-500'
                        }`}
                      />
                      <div>
                        <p className="font-medium">{alert.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {alert.message}
                        </p>
                      </div>
                    </div>
                    <Badge>{alert.priority}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Daily Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Daily Revenue Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyStats}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip
                  formatter={(value) => `₹${Number(value).toFixed(2)}`}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#8884d8"
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="stores">Stores</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="returns">Returns</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue by Store</CardTitle>
                </CardHeader>
                <CardContent>
                  {chartView === 'chart' ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={storeAnalytics}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="storeName" />
                        <YAxis />
                        <Tooltip
                          formatter={(value) =>
                            `₹${Number(value).toFixed(2)}`
                          }
                        />
                        <Legend />
                        <Bar
                          dataKey="totalRevenue"
                          fill="#8884d8"
                          name="Revenue"
                        />
                      </BarChart>
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
                          data={storeAnalytics}
                          dataKey="totalRevenue"
                          nameKey="storeName"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label
                        >
                          {storeAnalytics.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[index % COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) =>
                            `₹${Number(value).toFixed(2)}`
                          }
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
                              {totalRevenue > 0
                                ? (
                                    (s.totalRevenue / totalRevenue) *
                                    100
                                  ).toFixed(1)
                                : '0.0'}
                              %
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Bills vs Items Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Bills vs Items Sold</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="bills"
                      stroke="#8884d8"
                      name="Bills"
                    />
                    <Line
                      type="monotone"
                      dataKey="items"
                      stroke="#82ca9d"
                      name="Items"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stores Tab */}
          <TabsContent value="stores" className="space-y-4">
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
                        <TableCell className="font-medium">
                          {s.storeName}
                        </TableCell>
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

            {/* Store Radar */}
            <Card>
              <CardHeader>
                <CardTitle>Store Performance Radar</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart data={storeAnalytics.slice(0, 5)}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="storeName" />
                    <PolarRadiusAxis />
                    <Radar
                      name="Revenue"
                      dataKey="totalRevenue"
                      stroke="#8884d8"
                      fill="#8884d8"
                      fillOpacity={0.6}
                    />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Products by Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={productAnalytics
                        .slice()
                        .sort((a, b) => b.totalRevenue - a.totalRevenue)
                        .slice(0, 10)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="productName" type="category" width={120} />
                      <Tooltip
                        formatter={(value) =>
                          `₹${Number(value).toFixed(2)}`
                        }
                      />
                      <Bar dataKey="totalRevenue" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Products by Quantity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={productAnalytics
                        .slice()
                        .sort(
                          (a, b) => b.totalQuantitySold - a.totalQuantitySold,
                        )
                        .slice(0, 10)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="productName" type="category" width={120} />
                      <Tooltip />
                      <Bar dataKey="totalQuantitySold" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Product Performance Table</CardTitle>
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
                      .slice()
                      .sort((a, b) => b.totalRevenue - a.totalRevenue)
                      .slice(0, 15)
                      .map((p) => (
                        <TableRow key={p.productId}>
                          <TableCell className="font-medium">
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

          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trend Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={dailyStats}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#8884d8"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#8884d8"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip
                      formatter={(value) =>
                        `₹${Number(value).toFixed(2)}`
                      }
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#8884d8"
                      fill="url(#colorRev)"
                      name="Revenue"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Daily Bills Count</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dailyStats}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="bills"
                        stroke="#8884d8"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Daily Items Sold</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dailyStats}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="items"
                        stroke="#82ca9d"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Returns Tab */}
          <TabsContent value="returns" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                title="Total Returns"
                value={returns.length}
                icon={<Activity className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                title="Refund Amount"
                value={`₹${returns
                  .reduce((sum, r) => sum + (r.returnAmount || 0), 0)
                  .toFixed(2)}`}
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                title="Pending Returns"
                value={returns.filter((r) => r.status === 'pending').length}
                icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
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
                      <TableHead>Product ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returns
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(b.createdAt).getTime() -
                          new Date(a.createdAt).getTime(),
                      )
                      .slice(0, 20)
                      .map((item) => (
                        <TableRow key={item.returnId}>
                          <TableCell>
                            {item.createdAt &&
                            !isNaN(new Date(item.createdAt).getTime())
                              ? format(
                                  new Date(item.createdAt),
                                  'MMM dd, yyyy',
                                )
                              : 'N/A'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {item.productId?.substring(0, 20)}...
                          </TableCell>
                          <TableCell>
                            ₹{(item.returnAmount || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                item.status === 'approved'
                                  ? 'default'
                                  : item.status === 'pending'
                                  ? 'secondary'
                                  : 'destructive'
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
          <TabsContent value="inventory" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard
                title="Total Products"
                value={products.length}
                icon={<Package className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                title="Inventory Value"
                value={`₹${products
                  .reduce((sum, p) => sum + p.price * p.stock, 0)
                  .toFixed(2)}`}
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                title="Low Stock"
                value={products.filter((p) => p.stock > 0 && p.stock < 10).length}
                icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                title="Out of Stock"
                value={products.filter((p) => p.stock === 0).length}
                icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Inventory Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        {
                          name: 'In Stock',
                          value: products.filter((p) => p.stock >= 10).length,
                        },
                        {
                          name: 'Low Stock',
                          value: products.filter(
                            (p) => p.stock > 0 && p.stock < 10,
                          ).length,
                        },
                        {
                          name: 'Out of Stock',
                          value: products.filter((p) => p.stock === 0).length,
                        },
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      <Cell fill="#00C49F" />
                      <Cell fill="#FFBB28" />
                      <Cell fill="#FF8042" />
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Low Stock Products</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
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
                          <TableCell className="font-medium">
                            {p.name}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={p.stock === 0 ? 'destructive' : 'secondary'}
                            >
                              {p.stock}
                            </Badge>
                          </TableCell>
                          <TableCell>₹{p.price.toFixed(2)}</TableCell>
                          <TableCell>
                            ₹{(p.price * p.stock).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
