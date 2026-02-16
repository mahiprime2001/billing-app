'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { eachDayOfInterval, format, subDays } from 'date-fns'
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  DollarSign,
  Download,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import DashboardLayout from '@/components/dashboard-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
  total: number
  createdAt: string
  timestamp: string
}

interface StoreRecord {
  id: string
  name: string
  status: string
}

interface ProductRecord {
  id: string
  name: string
  category: string
  costPrice: number
  sellingPrice: number
  stock: number
  createdAt?: string
}

interface ReturnItem {
  returnId: string
  productId: string
  returnAmount: number
  status: string
  createdAt: string
}

interface DailyStats {
  date: string
  revenue: number
  bills: number
  items: number
  avgBill: number
}

interface StoreAnalytics {
  storeId: string
  storeName: string
  revenue: number
  bills: number
  items: number
  avgBill: number
}

interface ProductSalesStats {
  productId: string
  productName: string
  category: string
  quantity: number
  revenue: number
  bills: number
  avgSellingPrice: number
  lastSoldAt?: string
}

interface TrendingProduct {
  productId: string
  productName: string
  currentQty: number
  previousQty: number
  momentum: number
  growthPct: number | null
}

interface InventoryAnalytics {
  productId: string
  productName: string
  category: string
  stock: number
  costPrice: number
  sellingPrice: number
  marginPerUnit: number
  marginPct: number | null
  costValue: number
  potentialSalesValue: number
  potentialProfit: number
}

interface CategoryAnalytics {
  category: string
  revenue: number
  quantity: number
  bills: number
  productCount: number
}

interface StoreNonSellingStats {
  storeId: string
  storeName: string
  nonSellingCount: number
  topNonSelling: Array<{
    productId: string
    productName: string
    stock: number
    blockedValue: number
  }>
}

interface AlertItem {
  type: 'error' | 'warning' | 'info'
  title: string
  message: string
}

interface MetricSummary {
  revenue: number
  bills: number
  items: number
  customers: number
  avgBill: number
}

const CHART_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#f97316', '#dc2626', '#7c3aed']
const LOW_STOCK_THRESHOLD = 10
const PANEL_CARD_CLASS = 'border-slate-200/80 shadow-sm bg-white/90 backdrop-blur'
const KPI_CARD_CLASS =
  'relative overflow-hidden border-slate-200/80 shadow-sm bg-gradient-to-br from-white to-slate-50'

type TabValue =
  | 'overview'
  | 'revenue'
  | 'stores'
  | 'products'
  | 'categories'
  | 'inventory'
  | 'nonselling'
  | 'returns'

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value || 0)

const parseDate = (value?: string): Date | null => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const percentageChange = (current: number, previous: number): number | null => {
  if (previous === 0) {
    if (current === 0) return 0
    return null
  }

  return Number((((current - previous) / previous) * 100).toFixed(1))
}

const normalizeBills = (rawBills: any[]): Bill[] => {
  return rawBills.map((bill) => ({
    id: String(bill.id || bill.billId || bill.bill_id || ''),
    storeId: String(bill.storeId || bill.store_id || bill.storeid || ''),
    storeName: bill.storeName || bill.store_name,
    customerId: bill.customerId || bill.customer_id || bill.customerid,
    total: Number(bill.total || 0),
    createdAt: bill.createdAt || bill.created_at || bill.timestamp || '',
    timestamp: bill.timestamp || bill.createdAt || bill.created_at || '',
    items: Array.isArray(bill.items)
      ? bill.items.map((item: any) => ({
          productId: String(item.productId || item.product_id || item.productid || ''),
          productName:
            item.productName || item.product_name || item.productname || 'Unknown Product',
          quantity: Number(item.quantity || 0),
          price: Number(item.price || 0),
          total: Number(item.total || Number(item.price || 0) * Number(item.quantity || 0)),
        }))
      : [],
  }))
}

const normalizeStores = (rawStores: any[]): StoreRecord[] => {
  return rawStores.map((store) => ({
    id: String(store.id || ''),
    name: store.name || 'Unknown Store',
    status: String(store.status || 'active').toLowerCase(),
  }))
}

const normalizeProducts = (rawProducts: any[]): ProductRecord[] => {
  return rawProducts.map((product) => {
    const costPrice = Number(product.price || 0)
    const sellingPrice = Number(product.sellingPrice ?? product.selling_price ?? product.price ?? 0)

    return {
      id: String(product.id || ''),
      name: product.name || 'Unknown Product',
      category: String(product.category || 'Uncategorized').trim() || 'Uncategorized',
      costPrice,
      sellingPrice,
      stock: Number(product.stock || 0),
      createdAt: product.createdAt || product.created_at || product.createdat,
    }
  })
}

const normalizeReturns = (rawReturns: any[]): ReturnItem[] => {
  return rawReturns.map((item, index) => ({
    returnId: String(item.returnId || item.return_id || item.id || `return-${index}`),
    productId: String(item.productId || item.product_id || item.productid || ''),
    returnAmount: Number(item.returnAmount || item.return_amount || item.amount || 0),
    status: String(item.status || 'pending').toLowerCase(),
    createdAt: item.createdAt || item.created_at || item.timestamp || '',
  }))
}

const summarizeBills = (rows: Bill[]): MetricSummary => {
  const revenue = rows.reduce((sum, bill) => sum + bill.total, 0)
  const bills = rows.length
  const items = rows.reduce(
    (sum, bill) => sum + bill.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  )
  const customers = new Set(rows.map((bill) => bill.customerId).filter(Boolean)).size

  return {
    revenue,
    bills,
    items,
    customers,
    avgBill: bills > 0 ? revenue / bills : 0,
  }
}

const escapeCsv = (value: string | number): string => {
  const text = String(value ?? '')
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

const downloadCsv = (
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>,
) => {
  const csvLines = [headers.map(escapeCsv).join(','), ...rows.map((row) => row.map(escapeCsv).join(','))]
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

interface MetricCardProps {
  title: string
  value: string
  icon: React.ReactNode
  change?: number | null
}

const MetricCard = ({ title, value, icon, change }: MetricCardProps) => (
  <Card className={KPI_CARD_CLASS}>
    <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-blue-500 via-emerald-500 to-amber-500" />
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <div className="rounded-md bg-slate-100 p-1.5 text-slate-700">{icon}</div>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      {change !== undefined && (
        <p className="mt-1 text-xs text-muted-foreground">
          {change === null && 'No previous period data'}
          {change !== null && change === 0 && 'No change vs previous period'}
          {change !== null && change > 0 && (
            <span className="text-green-600">
              <TrendingUp className="mr-1 inline h-3 w-3" />+{change}% vs previous period
            </span>
          )}
          {change !== null && change < 0 && (
            <span className="text-red-600">
              <TrendingDown className="mr-1 inline h-3 w-3" />{change}% vs previous period
            </span>
          )}
        </p>
      )}
    </CardContent>
  </Card>
)

export default function AnalyticsPage() {
  const router = useRouter()
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8080'

  const [bills, setBills] = useState<Bill[]>([])
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [returns, setReturns] = useState<ReturnItem[]>([])
  const [selectedStore, setSelectedStore] = useState('all')
  const [selectedDays, setSelectedDays] = useState(30)
  const [activeTab, setActiveTab] = useState<TabValue>('overview')
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [productSearch, setProductSearch] = useState('')

  useEffect(() => {
    const isLoggedIn = localStorage.getItem('adminLoggedIn')
    const userData = localStorage.getItem('adminUser')

    if (isLoggedIn !== 'true' || !userData) {
      router.push('/login')
      return
    }

    setAuthChecked(true)
  }, [router])

  const fetchAllData = useCallback(async () => {
    setLoading(true)

    try {
      const [billsRes, storesRes, productsRes, returnsRes] = await Promise.all([
        fetch(`${backendUrl}/api/bills`).then((res) => res.json()),
        fetch(`${backendUrl}/api/stores`).then((res) => res.json()),
        fetch(`${backendUrl}/api/products`).then((res) => res.json()),
        fetch(`${backendUrl}/api/returns`).then((res) => res.json()),
      ])

      setBills(normalizeBills(Array.isArray(billsRes) ? billsRes : []))
      setStores(normalizeStores(Array.isArray(storesRes) ? storesRes : []))
      setProducts(normalizeProducts(Array.isArray(productsRes) ? productsRes : []))
      setReturns(normalizeReturns(Array.isArray(returnsRes) ? returnsRes : []))
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Failed to load analytics data', error)
    } finally {
      setLoading(false)
    }
  }, [backendUrl])

  useEffect(() => {
    if (authChecked) {
      fetchAllData()
    }
  }, [authChecked, fetchAllData])

  const dateWindows = useMemo(() => {
    const now = new Date()
    const currentStart = subDays(now, Math.max(selectedDays - 1, 0))
    const previousStart = subDays(currentStart, selectedDays)
    const staleNinetyStart = subDays(now, 90)

    return { now, currentStart, previousStart, staleNinetyStart }
  }, [selectedDays])

  const billsByStore = useMemo(() => {
    return bills.filter((bill) => selectedStore === 'all' || bill.storeId === selectedStore)
  }, [bills, selectedStore])

  const filteredBills = useMemo(() => {
    return billsByStore.filter((bill) => {
      const date = parseDate(bill.createdAt || bill.timestamp)
      return !!date && date >= dateWindows.currentStart && date <= dateWindows.now
    })
  }, [billsByStore, dateWindows])

  const previousPeriodBills = useMemo(() => {
    return billsByStore.filter((bill) => {
      const date = parseDate(bill.createdAt || bill.timestamp)
      return !!date && date >= dateWindows.previousStart && date < dateWindows.currentStart
    })
  }, [billsByStore, dateWindows])

  const billsLast90Days = useMemo(() => {
    return billsByStore.filter((bill) => {
      const date = parseDate(bill.createdAt || bill.timestamp)
      return !!date && date >= dateWindows.staleNinetyStart && date <= dateWindows.now
    })
  }, [billsByStore, dateWindows])

  const productCategoryMap = useMemo(() => {
    const map = new Map<string, string>()
    products.forEach((product) => {
      map.set(product.id, product.category || 'Uncategorized')
    })
    return map
  }, [products])

  const dailyStats = useMemo((): DailyStats[] => {
    const statsByDate = new Map<string, DailyStats>()

    eachDayOfInterval({ start: dateWindows.currentStart, end: dateWindows.now }).forEach((day) => {
      const key = format(day, 'yyyy-MM-dd')
      statsByDate.set(key, { date: key, revenue: 0, bills: 0, items: 0, avgBill: 0 })
    })

    filteredBills.forEach((bill) => {
      const date = parseDate(bill.createdAt || bill.timestamp)
      if (!date) return

      const key = format(date, 'yyyy-MM-dd')
      const bucket = statsByDate.get(key)
      if (!bucket) return

      bucket.revenue += bill.total
      bucket.bills += 1
      bucket.items += bill.items.reduce((sum, item) => sum + item.quantity, 0)
    })

    statsByDate.forEach((bucket) => {
      bucket.avgBill = bucket.bills > 0 ? bucket.revenue / bucket.bills : 0
    })

    return Array.from(statsByDate.values())
  }, [filteredBills, dateWindows])

  const storeAnalytics = useMemo((): StoreAnalytics[] => {
    const storeMap = new Map<string, StoreAnalytics>()

    stores.forEach((store) => {
      storeMap.set(store.id, {
        storeId: store.id,
        storeName: store.name,
        revenue: 0,
        bills: 0,
        items: 0,
        avgBill: 0,
      })
    })

    filteredBills.forEach((bill) => {
      if (!bill.storeId) return

      if (!storeMap.has(bill.storeId)) {
        storeMap.set(bill.storeId, {
          storeId: bill.storeId,
          storeName: bill.storeName || 'Unknown Store',
          revenue: 0,
          bills: 0,
          items: 0,
          avgBill: 0,
        })
      }

      const stats = storeMap.get(bill.storeId)
      if (!stats) return

      stats.revenue += bill.total
      stats.bills += 1
      stats.items += bill.items.reduce((sum, item) => sum + item.quantity, 0)
      stats.avgBill = stats.bills > 0 ? stats.revenue / stats.bills : 0
    })

    return Array.from(storeMap.values()).sort((a, b) => b.revenue - a.revenue)
  }, [stores, filteredBills])

  const currentSalesMap = useMemo(() => {
    const map = new Map<string, ProductSalesStats>()

    filteredBills.forEach((bill) => {
      const billDate = parseDate(bill.createdAt || bill.timestamp)
      const billDateIso = billDate ? billDate.toISOString() : undefined

      bill.items.forEach((item) => {
        if (!item.productId) return

        if (!map.has(item.productId)) {
          map.set(item.productId, {
            productId: item.productId,
            productName: item.productName || 'Unknown Product',
            category: productCategoryMap.get(item.productId) || 'Uncategorized',
            quantity: 0,
            revenue: 0,
            bills: 0,
            avgSellingPrice: 0,
            lastSoldAt: billDateIso,
          })
        }

        const stats = map.get(item.productId)
        if (!stats) return

        stats.quantity += item.quantity
        stats.revenue += item.total
        stats.bills += 1

        if (billDateIso && (!stats.lastSoldAt || billDateIso > stats.lastSoldAt)) {
          stats.lastSoldAt = billDateIso
        }
      })
    })

    map.forEach((stats) => {
      stats.avgSellingPrice = stats.quantity > 0 ? stats.revenue / stats.quantity : 0
    })

    return map
  }, [filteredBills, productCategoryMap])

  const previousSalesMap = useMemo(() => {
    const map = new Map<string, number>()

    previousPeriodBills.forEach((bill) => {
      bill.items.forEach((item) => {
        if (!item.productId) return
        map.set(item.productId, (map.get(item.productId) || 0) + item.quantity)
      })
    })

    return map
  }, [previousPeriodBills])

  const ninetyDaySalesMap = useMemo(() => {
    const map = new Map<string, number>()

    billsLast90Days.forEach((bill) => {
      bill.items.forEach((item) => {
        if (!item.productId) return
        map.set(item.productId, (map.get(item.productId) || 0) + item.quantity)
      })
    })

    return map
  }, [billsLast90Days])

  const productAnalytics = useMemo((): ProductSalesStats[] => {
    return Array.from(currentSalesMap.values()).sort((a, b) => b.revenue - a.revenue)
  }, [currentSalesMap])

  const trendingProducts = useMemo((): TrendingProduct[] => {
    const rows: TrendingProduct[] = []

    currentSalesMap.forEach((stats, productId) => {
      const previousQty = previousSalesMap.get(productId) || 0
      const momentum = stats.quantity - previousQty
      const growthPct = percentageChange(stats.quantity, previousQty)

      rows.push({
        productId,
        productName: stats.productName,
        currentQty: stats.quantity,
        previousQty,
        momentum,
        growthPct,
      })
    })

    return rows.sort((a, b) => b.momentum - a.momentum)
  }, [currentSalesMap, previousSalesMap])

  const categoryAnalytics = useMemo((): CategoryAnalytics[] => {
    const map = new Map<
      string,
      { revenue: number; quantity: number; billIds: Set<string>; soldProductIds: Set<string> }
    >()

    filteredBills.forEach((bill) => {
      bill.items.forEach((item) => {
        const category = productCategoryMap.get(item.productId) || 'Uncategorized'

        if (!map.has(category)) {
          map.set(category, {
            revenue: 0,
            quantity: 0,
            billIds: new Set<string>(),
            soldProductIds: new Set<string>(),
          })
        }

        const stats = map.get(category)
        if (!stats) return

        stats.revenue += item.total
        stats.quantity += item.quantity
        stats.billIds.add(bill.id)
        if (item.productId) stats.soldProductIds.add(item.productId)
      })
    })

    const productCountByCategory = new Map<string, number>()
    products.forEach((product) => {
      const category = product.category || 'Uncategorized'
      productCountByCategory.set(category, (productCountByCategory.get(category) || 0) + 1)
    })

    return Array.from(map.entries())
      .map(([category, stats]) => ({
        category,
        revenue: stats.revenue,
        quantity: stats.quantity,
        bills: stats.billIds.size,
        productCount: productCountByCategory.get(category) || 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [filteredBills, productCategoryMap, products])

  const nonSellingProducts90Days = useMemo(() => {
    return products
      .filter((product) => (ninetyDaySalesMap.get(product.id) || 0) === 0)
      .map((product) => {
        const createdDate = parseDate(product.createdAt)
        return {
          productId: product.id,
          productName: product.name,
          category: product.category,
          stock: product.stock,
          costPrice: product.costPrice,
          sellingPrice: product.sellingPrice,
          blockedValue: product.stock * product.sellingPrice,
          createdAt: createdDate ? format(createdDate, 'dd MMM yyyy') : 'N/A',
        }
      })
      .sort((a, b) => b.blockedValue - a.blockedValue)
  }, [products, ninetyDaySalesMap])

  const storeWiseNonSelling90Days = useMemo((): StoreNonSellingStats[] => {
    const scopedStores = selectedStore === 'all' ? stores : stores.filter((store) => store.id === selectedStore)

    const soldByStore = new Map<string, Set<string>>()
    scopedStores.forEach((store) => soldByStore.set(store.id, new Set()))

    bills.forEach((bill) => {
      const billDate = parseDate(bill.createdAt || bill.timestamp)
      if (!billDate || billDate < dateWindows.staleNinetyStart || billDate > dateWindows.now) return
      if (selectedStore !== 'all' && bill.storeId !== selectedStore) return

      if (!soldByStore.has(bill.storeId)) soldByStore.set(bill.storeId, new Set())
      const set = soldByStore.get(bill.storeId)
      if (!set) return

      bill.items.forEach((item) => {
        if (item.productId) set.add(item.productId)
      })
    })

    return scopedStores
      .map((store) => {
        const soldSet = soldByStore.get(store.id) || new Set<string>()

        const nonSelling = products
          .filter((product) => product.stock > 0 && !soldSet.has(product.id))
          .map((product) => ({
            productId: product.id,
            productName: product.name,
            stock: product.stock,
            blockedValue: product.stock * product.sellingPrice,
          }))
          .sort((a, b) => b.blockedValue - a.blockedValue)

        return {
          storeId: store.id,
          storeName: store.name,
          nonSellingCount: nonSelling.length,
          topNonSelling: nonSelling.slice(0, 8),
        }
      })
      .sort((a, b) => b.nonSellingCount - a.nonSellingCount)
  }, [stores, selectedStore, bills, dateWindows, products])

  const inventoryAnalytics = useMemo((): InventoryAnalytics[] => {
    return products
      .map((product) => {
        const marginPerUnit = product.sellingPrice - product.costPrice
        const marginPct = product.costPrice > 0 ? (marginPerUnit / product.costPrice) * 100 : null
        const costValue = product.costPrice * product.stock
        const potentialSalesValue = product.sellingPrice * product.stock
        const potentialProfit = marginPerUnit * product.stock

        return {
          productId: product.id,
          productName: product.name,
          category: product.category,
          stock: product.stock,
          costPrice: product.costPrice,
          sellingPrice: product.sellingPrice,
          marginPerUnit,
          marginPct,
          costValue,
          potentialSalesValue,
          potentialProfit,
        }
      })
      .sort((a, b) => b.potentialProfit - a.potentialProfit)
  }, [products])

  const inventorySummary = useMemo(() => {
    const totalCostValue = inventoryAnalytics.reduce((sum, row) => sum + row.costValue, 0)
    const totalPotentialSalesValue = inventoryAnalytics.reduce(
      (sum, row) => sum + row.potentialSalesValue,
      0,
    )
    const totalPotentialProfit = inventoryAnalytics.reduce((sum, row) => sum + row.potentialProfit, 0)

    return {
      totalCostValue,
      totalPotentialSalesValue,
      totalPotentialProfit,
      lowStockCount: products.filter((product) => product.stock > 0 && product.stock < LOW_STOCK_THRESHOLD)
        .length,
      outOfStockCount: products.filter((product) => product.stock === 0).length,
    }
  }, [inventoryAnalytics, products])

  const returnsInPeriod = useMemo(() => {
    return returns.filter((item) => {
      const date = parseDate(item.createdAt)
      return !!date && date >= dateWindows.currentStart && date <= dateWindows.now
    })
  }, [returns, dateWindows])

  const returnStatusData = useMemo(() => {
    const statusMap = new Map<string, number>()

    returnsInPeriod.forEach((item) => {
      const key = item.status || 'unknown'
      statusMap.set(key, (statusMap.get(key) || 0) + 1)
    })

    return Array.from(statusMap.entries()).map(([name, value]) => ({ name, value }))
  }, [returnsInPeriod])

  const alerts = useMemo((): AlertItem[] => {
    const rows: AlertItem[] = []

    if (inventorySummary.outOfStockCount > 0) {
      rows.push({
        type: 'error',
        title: 'Out of stock products',
        message: `${inventorySummary.outOfStockCount} products are at zero stock.`,
      })
    }

    if (inventorySummary.lowStockCount > 0) {
      rows.push({
        type: 'warning',
        title: 'Low stock products',
        message: `${inventorySummary.lowStockCount} products are below ${LOW_STOCK_THRESHOLD} units.`,
      })
    }

    const pendingReturns = returns.filter((item) => item.status === 'pending').length
    if (pendingReturns > 0) {
      rows.push({
        type: 'info',
        title: 'Pending returns',
        message: `${pendingReturns} returns are pending approval.`,
      })
    }

    const nonSellingCount = nonSellingProducts90Days.length
    if (nonSellingCount > 0) {
      rows.push({
        type: 'info',
        title: 'Products not sold in 90 days',
        message: `${nonSellingCount} products had zero sales in the last 90 days.`,
      })
    }

    const inactiveStores = stores.filter((store) => store.status === 'inactive').length
    if (inactiveStores > 0) {
      rows.push({
        type: 'warning',
        title: 'Inactive stores',
        message: `${inactiveStores} stores are inactive.`,
      })
    }

    return rows
  }, [inventorySummary, returns, nonSellingProducts90Days, stores])

  const currentSummary = useMemo(() => summarizeBills(filteredBills), [filteredBills])
  const previousSummary = useMemo(() => summarizeBills(previousPeriodBills), [previousPeriodBills])

  const revenueChange = useMemo(
    () => percentageChange(currentSummary.revenue, previousSummary.revenue),
    [currentSummary.revenue, previousSummary.revenue],
  )
  const billsChange = useMemo(
    () => percentageChange(currentSummary.bills, previousSummary.bills),
    [currentSummary.bills, previousSummary.bills],
  )
  const itemsChange = useMemo(
    () => percentageChange(currentSummary.items, previousSummary.items),
    [currentSummary.items, previousSummary.items],
  )
  const customerChange = useMemo(
    () => percentageChange(currentSummary.customers, previousSummary.customers),
    [currentSummary.customers, previousSummary.customers],
  )

  const selectedStoreName =
    selectedStore === 'all'
      ? 'All Stores'
      : stores.find((store) => store.id === selectedStore)?.name || 'Unknown Store'

  const filteredProductAnalytics = useMemo(() => {
    const term = productSearch.trim().toLowerCase()
    if (!term) return productAnalytics

    return productAnalytics.filter(
      (product) =>
        product.productName.toLowerCase().includes(term) ||
        product.category.toLowerCase().includes(term) ||
        product.productId.toLowerCase().includes(term),
    )
  }, [productAnalytics, productSearch])

  const topStores = storeAnalytics.slice(0, 10)
  const topProducts = filteredProductAnalytics.slice(0, 15)
  const topTrending = trendingProducts.slice(0, 15)
  const topMarginProducts = inventoryAnalytics.slice(0, 15)
  const topCategories = categoryAnalytics.slice(0, 10)

  const marginComparisonData = topMarginProducts.map((row) => ({
    productName: row.productName,
    costPrice: Number(row.costPrice.toFixed(2)),
    sellingPrice: Number(row.sellingPrice.toFixed(2)),
  }))

  const nonSellingByStoreChart = storeWiseNonSelling90Days.map((row) => ({
    storeName: row.storeName,
    nonSellingCount: row.nonSellingCount,
  }))

  const exportActiveTab = useCallback(() => {
    const timestamp = format(new Date(), 'yyyyMMdd_HHmmss')

    if (activeTab === 'overview' || activeTab === 'revenue') {
      downloadCsv(
        `analytics_${activeTab}_${timestamp}.csv`,
        ['date', 'revenue', 'bills', 'items', 'avg_bill'],
        dailyStats.map((row) => [row.date, row.revenue, row.bills, row.items, row.avgBill]),
      )
      return
    }

    if (activeTab === 'stores') {
      downloadCsv(
        `analytics_stores_${timestamp}.csv`,
        ['store_id', 'store_name', 'revenue', 'bills', 'items', 'avg_bill'],
        storeAnalytics.map((row) => [
          row.storeId,
          row.storeName,
          row.revenue,
          row.bills,
          row.items,
          row.avgBill,
        ]),
      )
      return
    }

    if (activeTab === 'products') {
      downloadCsv(
        `analytics_products_${timestamp}.csv`,
        [
          'product_id',
          'product_name',
          'category',
          'quantity',
          'revenue',
          'bills',
          'avg_selling_price',
          'last_sold',
        ],
        filteredProductAnalytics.map((row) => [
          row.productId,
          row.productName,
          row.category,
          row.quantity,
          row.revenue,
          row.bills,
          row.avgSellingPrice,
          row.lastSoldAt || '',
        ]),
      )
      return
    }

    if (activeTab === 'categories') {
      downloadCsv(
        `analytics_categories_${timestamp}.csv`,
        ['category', 'revenue', 'quantity', 'bills', 'product_count'],
        categoryAnalytics.map((row) => [
          row.category,
          row.revenue,
          row.quantity,
          row.bills,
          row.productCount,
        ]),
      )
      return
    }

    if (activeTab === 'inventory') {
      downloadCsv(
        `analytics_inventory_${timestamp}.csv`,
        [
          'product_id',
          'product_name',
          'category',
          'stock',
          'cost_price',
          'selling_price',
          'margin_per_unit',
          'margin_pct',
          'cost_value',
          'potential_sales_value',
          'potential_profit',
        ],
        inventoryAnalytics.map((row) => [
          row.productId,
          row.productName,
          row.category,
          row.stock,
          row.costPrice,
          row.sellingPrice,
          row.marginPerUnit,
          row.marginPct === null ? '' : row.marginPct,
          row.costValue,
          row.potentialSalesValue,
          row.potentialProfit,
        ]),
      )
      return
    }

    if (activeTab === 'nonselling') {
      const rows: Array<Array<string | number>> = []
      storeWiseNonSelling90Days.forEach((storeRow) => {
        if (storeRow.topNonSelling.length === 0) {
          rows.push([storeRow.storeId, storeRow.storeName, '', '', '', ''])
          return
        }

        storeRow.topNonSelling.forEach((item) => {
          rows.push([
            storeRow.storeId,
            storeRow.storeName,
            item.productId,
            item.productName,
            item.stock,
            item.blockedValue,
          ])
        })
      })

      downloadCsv(
        `analytics_nonselling_${timestamp}.csv`,
        ['store_id', 'store_name', 'product_id', 'product_name', 'stock', 'blocked_value'],
        rows,
      )
      return
    }

    if (activeTab === 'returns') {
      downloadCsv(
        `analytics_returns_${timestamp}.csv`,
        ['return_id', 'product_id', 'status', 'return_amount', 'created_at'],
        returnsInPeriod.map((item) => [
          item.returnId,
          item.productId,
          item.status,
          item.returnAmount,
          item.createdAt,
        ]),
      )
    }
  }, [
    activeTab,
    dailyStats,
    storeAnalytics,
    filteredProductAnalytics,
    categoryAnalytics,
    inventoryAnalytics,
    storeWiseNonSelling90Days,
    returnsInPeriod,
  ])

  if (!authChecked || loading) {
    return (
      <DashboardLayout>
        <div className="flex h-screen items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 max-w-full overflow-x-auto bg-gradient-to-b from-slate-50/70 to-white">
        <Card className="border-slate-200/80 bg-gradient-to-r from-sky-50 to-emerald-50 shadow-md">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Advanced Analytics</h1>
                <p className="text-sm text-slate-600">
                  Deep reporting with tab-level exports, category analysis, and non-selling detection.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {`Showing ${selectedDays} day window (${format(dateWindows.currentStart, 'dd MMM yyyy')} - ${format(
                    dateWindows.now,
                    'dd MMM yyyy',
                  )}) | Store: ${selectedStoreName}`}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Select
                  value={selectedDays.toString()}
                  onValueChange={(value) => setSelectedDays(Number(value))}
                >
                  <SelectTrigger className="w-[150px] border-slate-300 bg-white text-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 Days</SelectItem>
                    <SelectItem value="30">Last 30 Days</SelectItem>
                    <SelectItem value="90">Last 90 Days</SelectItem>
                    <SelectItem value="180">Last 180 Days</SelectItem>
                    <SelectItem value="365">Last 365 Days</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedStore} onValueChange={setSelectedStore}>
                  <SelectTrigger className="w-[190px] border-slate-300 bg-white text-slate-800">
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

                <Button
                  variant="outline"
                  onClick={fetchAllData}
                  className="border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>

                <Button onClick={exportActiveTab} className="bg-emerald-500 text-slate-900 hover:bg-emerald-400">
                  <Download className="mr-2 h-4 w-4" />
                  Export {activeTab} CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            title="Revenue"
            value={formatCurrency(currentSummary.revenue)}
            icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
            change={revenueChange}
          />
          <MetricCard
            title="Bills"
            value={currentSummary.bills.toString()}
            icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}
            change={billsChange}
          />
          <MetricCard
            title="Items Sold"
            value={currentSummary.items.toString()}
            icon={<Package className="h-4 w-4 text-muted-foreground" />}
            change={itemsChange}
          />
          <MetricCard
            title="Customers"
            value={currentSummary.customers.toString()}
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
            change={customerChange}
          />
          <MetricCard
            title="Average Bill"
            value={formatCurrency(currentSummary.avgBill)}
            icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className={PANEL_CARD_CLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Data Coverage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>{`Bills in selected period: ${filteredBills.length}`}</p>
              <p>{`Bills in previous period: ${previousPeriodBills.length}`}</p>
              <p>{`Products available: ${products.length}`}</p>
              <p>{`Stores available: ${stores.length}`}</p>
            </CardContent>
          </Card>

          <Card className={PANEL_CARD_CLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Inventory Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>{`Total cost value: ${formatCurrency(inventorySummary.totalCostValue)}`}</p>
              <p>{`Total potential sales: ${formatCurrency(inventorySummary.totalPotentialSalesValue)}`}</p>
              <p>{`Potential profit: ${formatCurrency(inventorySummary.totalPotentialProfit)}`}</p>
              <p>{`Non-selling (90 days): ${nonSellingProducts90Days.length}`}</p>
            </CardContent>
          </Card>

          <Card className={PANEL_CARD_CLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">System Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>{`Selected store: ${selectedStoreName}`}</p>
              <p>{`Inactive stores: ${stores.filter((store) => store.status === 'inactive').length}`}</p>
              <p>{`Pending returns: ${returns.filter((item) => item.status === 'pending').length}`}</p>
              <p>{`Last updated: ${lastUpdated ? format(lastUpdated, 'dd MMM yyyy, hh:mm a') : 'N/A'}`}</p>
            </CardContent>
          </Card>
        </div>

        {alerts.length > 0 && (
          <Card className={PANEL_CARD_CLASS}>
            <CardHeader>
              <CardTitle>Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alerts.map((alert, index) => (
                <div
                  key={`${alert.title}-${index}`}
                  className="flex items-start justify-between rounded-md border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className={`mt-0.5 h-4 w-4 ${
                        alert.type === 'error'
                          ? 'text-red-500'
                          : alert.type === 'warning'
                          ? 'text-amber-500'
                          : 'text-blue-500'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium">{alert.title}</p>
                      <p className="text-xs text-muted-foreground">{alert.message}</p>
                    </div>
                  </div>
                  <Badge variant="outline">{alert.type}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
          <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <TabsTrigger value="overview" className="rounded-lg">
              Overview
            </TabsTrigger>
            <TabsTrigger value="revenue" className="rounded-lg">
              Revenue
            </TabsTrigger>
            <TabsTrigger value="stores" className="rounded-lg">
              Stores
            </TabsTrigger>
            <TabsTrigger value="products" className="rounded-lg">
              Products
            </TabsTrigger>
            <TabsTrigger value="categories" className="rounded-lg">
              Categories
            </TabsTrigger>
            <TabsTrigger value="inventory" className="rounded-lg">
              Inventory
            </TabsTrigger>
            <TabsTrigger value="nonselling" className="rounded-lg">
              Non-Selling
            </TabsTrigger>
            <TabsTrigger value="returns" className="rounded-lg">
              Returns
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className={PANEL_CARD_CLASS}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Daily Revenue Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={dailyStats}>
                      <defs>
                        <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.7} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), 'dd MMM')} />
                      <YAxis />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#revenueFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className={PANEL_CARD_CLASS}>
                <CardHeader>
                  <CardTitle>Top Trending Products</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={topTrending.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="productName" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="currentQty" fill="#16a34a" name="Current Qty" />
                      <Bar dataKey="previousQty" fill="#94a3b8" name="Previous Qty" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="revenue" className="space-y-4">
            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Revenue, Bills and Items by Day</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart data={dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), 'dd MMM')} />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#2563eb" name="Revenue" />
                    <Line yAxisId="right" type="monotone" dataKey="bills" stroke="#16a34a" name="Bills" />
                    <Line yAxisId="right" type="monotone" dataKey="items" stroke="#f59e0b" name="Items" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Daily Revenue Table</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Bills</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Avg Bill</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyStats.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell>{format(new Date(row.date), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                        <TableCell className="text-right">{row.bills}</TableCell>
                        <TableCell className="text-right">{row.items}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.avgBill)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stores" className="space-y-4">
            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Store Revenue Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={topStores}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="storeName" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#2563eb" name="Revenue" />
                    <Bar dataKey="bills" fill="#16a34a" name="Bills" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Store Performance Table</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Store</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Bills</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Avg Bill</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storeAnalytics.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No store data for this filter.
                        </TableCell>
                      </TableRow>
                    )}
                    {storeAnalytics.map((storeRow) => (
                      <TableRow key={storeRow.storeId}>
                        <TableCell className="font-medium">{storeRow.storeName}</TableCell>
                        <TableCell className="text-right">{formatCurrency(storeRow.revenue)}</TableCell>
                        <TableCell className="text-right">{storeRow.bills}</TableCell>
                        <TableCell className="text-right">{storeRow.items}</TableCell>
                        <TableCell className="text-right">{formatCurrency(storeRow.avgBill)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="space-y-4">
            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Search Products In Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Search by product name, id, or category"
                    className="pl-9"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className={PANEL_CARD_CLASS}>
                <CardHeader>
                  <CardTitle>Top Products by Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={topProducts.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="productName" type="category" width={130} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Bar dataKey="revenue" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className={PANEL_CARD_CLASS}>
                <CardHeader>
                  <CardTitle>Trending Products (Current vs Previous)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={topTrending.slice(0, 10)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="productName" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="currentQty" fill="#16a34a" name="Current Qty" />
                      <Bar dataKey="previousQty" fill="#9ca3af" name="Previous Qty" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Product Sales Table</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Qty Sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Bills</TableHead>
                      <TableHead className="text-right">Avg Selling Price</TableHead>
                      <TableHead>Last Sold</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProductAnalytics.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No product sales in this period.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredProductAnalytics.slice(0, 30).map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell className="font-medium">{row.productName}</TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell className="text-right">{row.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                        <TableCell className="text-right">{row.bills}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.avgSellingPrice)}</TableCell>
                        <TableCell>
                          {row.lastSoldAt ? format(new Date(row.lastSoldAt), 'dd MMM yyyy') : 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className={PANEL_CARD_CLASS}>
                <CardHeader>
                  <CardTitle>Revenue by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={topCategories}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" />
                      <YAxis />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Bar dataKey="revenue" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className={PANEL_CARD_CLASS}>
                <CardHeader>
                  <CardTitle>Quantity by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie data={topCategories} dataKey="quantity" nameKey="category" outerRadius={100} label>
                        {topCategories.map((entry, index) => (
                          <Cell key={`${entry.category}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Category Performance Table</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Qty Sold</TableHead>
                      <TableHead className="text-right">Bills</TableHead>
                      <TableHead className="text-right">Total Products</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryAnalytics.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No category sales data in this period.
                        </TableCell>
                      </TableRow>
                    )}
                    {categoryAnalytics.map((row) => (
                      <TableRow key={row.category}>
                        <TableCell className="font-medium">{row.category}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                        <TableCell className="text-right">{row.quantity}</TableCell>
                        <TableCell className="text-right">{row.bills}</TableCell>
                        <TableCell className="text-right">{row.productCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inventory" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Total Cost Value"
                value={formatCurrency(inventorySummary.totalCostValue)}
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
              />
              <MetricCard
                title="Potential Sales Value"
                value={formatCurrency(inventorySummary.totalPotentialSalesValue)}
                icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              />
              <MetricCard
                title="Potential Profit"
                value={formatCurrency(inventorySummary.totalPotentialProfit)}
                icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              />
              <MetricCard
                title="Low + Out of Stock"
                value={`${inventorySummary.lowStockCount + inventorySummary.outOfStockCount}`}
                icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
              />
            </div>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Cost vs Selling Price by Product</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={marginComparisonData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="productName" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="costPrice" fill="#64748b" name="Cost Price" />
                    <Bar dataKey="sellingPrice" fill="#2563eb" name="Selling Price" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Inventory Margin Table</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Selling</TableHead>
                      <TableHead className="text-right">Unit Margin</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                      <TableHead className="text-right">Potential Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryAnalytics.slice(0, 50).map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell className="font-medium">{row.productName}</TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell className="text-right">{row.stock}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.costPrice)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.sellingPrice)}</TableCell>
                        <TableCell className="text-right">
                          <span className={row.marginPerUnit >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(row.marginPerUnit)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {row.marginPct === null ? 'N/A' : `${row.marginPct.toFixed(1)}%`}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.potentialProfit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="nonselling" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className={PANEL_CARD_CLASS}>
                <CardHeader>
                  <CardTitle>Non-Selling Products by Store (90 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={nonSellingByStoreChart}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="storeName" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="nonSellingCount" fill="#dc2626" name="Non-Selling Count" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className={PANEL_CARD_CLASS}>
                <CardHeader>
                  <CardTitle>Overall Non-Selling (90 Days) by Blocked Value</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={nonSellingProducts90Days.slice(0, 12)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="productName" type="category" width={130} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Bar dataKey="blockedValue" fill="#f59e0b" name="Blocked Value" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Store-wise Top Non-Selling Products (90 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Store</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Blocked Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storeWiseNonSelling90Days.every((storeRow) => storeRow.topNonSelling.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No non-selling products found for selected scope.
                        </TableCell>
                      </TableRow>
                    )}
                    {storeWiseNonSelling90Days.flatMap((storeRow) =>
                      storeRow.topNonSelling.map((product) => (
                        <TableRow key={`${storeRow.storeId}-${product.productId}`}>
                          <TableCell className="font-medium">{storeRow.storeName}</TableCell>
                          <TableCell>{product.productName}</TableCell>
                          <TableCell className="text-right">{product.stock}</TableCell>
                          <TableCell className="text-right">{formatCurrency(product.blockedValue)}</TableCell>
                        </TableRow>
                      )),
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="returns" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className={PANEL_CARD_CLASS}>
                <CardHeader>
                  <CardTitle>Returns by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie data={returnStatusData} dataKey="value" nameKey="name" outerRadius={100} label>
                        {returnStatusData.map((entry, index) => (
                          <Cell key={`${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className={PANEL_CARD_CLASS}>
                <CardHeader>
                  <CardTitle>Returns Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>{`Returns in selected period: ${returnsInPeriod.length}`}</p>
                  <p>{`Pending: ${returnsInPeriod.filter((item) => item.status === 'pending').length}`}</p>
                  <p>{`Approved: ${returnsInPeriod.filter((item) => item.status === 'approved').length}`}</p>
                  <p>{`Rejected: ${returnsInPeriod.filter((item) => item.status === 'rejected').length}`}</p>
                  <p>{`Completed: ${returnsInPeriod.filter((item) => item.status === 'completed').length}`}</p>
                  <p>
                    {`Total return amount: ${formatCurrency(
                      returnsInPeriod.reduce((sum, item) => sum + item.returnAmount, 0),
                    )}`}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Recent Returns</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Return ID</TableHead>
                      <TableHead>Product ID</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnsInPeriod.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No returns in this period.
                        </TableCell>
                      </TableRow>
                    )}
                    {returnsInPeriod
                      .slice()
                      .sort(
                        (a, b) =>
                          (parseDate(b.createdAt)?.getTime() || 0) -
                          (parseDate(a.createdAt)?.getTime() || 0),
                      )
                      .slice(0, 30)
                      .map((item) => (
                        <TableRow key={item.returnId}>
                          <TableCell>
                            {parseDate(item.createdAt)
                              ? format(parseDate(item.createdAt) as Date, 'dd MMM yyyy')
                              : 'N/A'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{item.returnId}</TableCell>
                          <TableCell className="font-mono text-xs">{item.productId || '-'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.returnAmount)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                item.status === 'approved' || item.status === 'completed'
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
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
