"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"

type OnlineUser = { userId: string; lastEvent: string; lastSeen: string; details?: string }
type OnlineResp = { windowMinutes: number; onlineCount: number; online: OnlineUser[] }
type SessionsResp = { from: string; to: string; totalSessions: number; avgSessionSec: number }
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
  PieLabelRenderProps,
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
  AlertTriangle,
  Users,
} from "lucide-react"
import { DatePickerWithRange } from "@/components/ui/date-range-picker"
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns"
import type { DateRange } from "react-day-picker"

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  lastLogged: string;
  lastLogout: string;
}

interface UserSessionAnalytics {
  date: string;
  totalSessions: number;
  averageSessionDuration: number;
}

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

interface ProductAdditionAnalytics {
  date: string;
  productsAdded: number;
  totalValueAdded: number;
}

// Enhanced Analytics Interfaces from Backend
interface DashboardMetrics {
  period: string
  revenue: {
    current: number
    previous: number
    growth: number
  }
  bills: {
    total: number
    averageValue: number
  }
  items: {
    totalSold: number
    perTransaction: number
  }
  inventory: {
    totalProducts: number
    totalValue: number
    lowStockCount: number
  }
  customers: {
    unique: number
    repeatRate: number
  }
  stores: {
    total: number
    active: number
  }
}

interface RevenueTrend {
  period: string
  revenue: number
  bills: number
  averageBill: number
}

interface TopProduct {
  productId: string
  productName: string
  barcode: string
  category: string
  revenue: number
  quantitySold: number
  billsCount: number
  currentStock: number
  averagePrice: number
}

interface InventoryHealth {
  period: string
  summary: {
    totalProducts: number
    totalInventoryValue: number
    averageTurnover: number
    slowMovingCount: number
    outOfStockCount: number
  }
  slowMoving: Array<{
    productId: string
    productName: string
    barcode: string
    currentStock: number
    stockValue: number
    soldQuantity: number
    turnoverRatio: number
    daysOfStock: number
  }>
  outOfStock: Array<any>
}

interface StorePerformance {
  storeId: string
  storeName: string
  revenue: number
  bills: number
  items: number
  assignedProducts: number
  inventoryValue: number
  averageBillValue: number
  itemsPerBill: number
}

interface CategoryBreakdown {
  category: string
  revenue: number
  quantity: number
  billsCount: number
  averagePrice: number
  revenuePercentage: number
}

interface BusinessAlert {
  type: 'error' | 'warning' | 'info'
  category: string
  title: string
  message: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  actionUrl?: string
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D", "#FFC658", "#FF7C7C"]

export default function AnalyticsPage() {
  const router = useRouter()
  const [bills, setBills] = useState<Bill[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [storeAnalytics, setStoreAnalytics] = useState<StoreAnalytics[]>([])
  const [productAnalytics, setProductAnalytics] = useState<ProductAnalytics[]>([])
  const [userSessionAnalytics, setUserSessionAnalytics] = useState<UserSessionAnalytics[]>([])
  const [productAdditionAnalytics, setProductAdditionAnalytics] = useState<ProductAdditionAnalytics[]>([])
  const [online, setOnline] = useState<OnlineResp | null>(null)
  const [sessions, setSessions] = useState<SessionsResp | null>(null)
  
  // Enhanced Analytics State
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null)
  const [revenueTrends, setRevenueTrends] = useState<RevenueTrend[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [inventoryHealth, setInventoryHealth] = useState<InventoryHealth | null>(null)
  const [storePerformance, setStorePerformance] = useState<StorePerformance[]>([])
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdown[]>([])
  const [businessAlerts, setBusinessAlerts] = useState<BusinessAlert[]>([])
  
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [selectedStore, setSelectedStore] = useState<string>("all")
  const [selectedProduct, setSelectedProduct] = useState<string>("all")
  const [selectedDays, setSelectedDays] = useState<string>("30")
  const [trendPeriod, setTrendPeriod] = useState<string>("daily")
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  })

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8080'

  const refresh = async () => {
    await fetch('/api/sync/pull', { method: 'POST' })
    const o = await fetch('/api/analytics/users/online?windowMinutes=5').then(r => r.json())
    const today = new Date().toISOString().slice(0,10)
    const s = await fetch(`/api/analytics/users/sessions?from=${today}&to=${today}`).then(r => r.json())
    setOnline(o)
    setSessions(s)

    setLoading(true)
    try {
      console.log('Fetching data from API endpoints...')
      const [billsResponse, storesResponse, productsResponse, usersResponse] = await Promise.all([
        fetch('/api/bills'),
        fetch('/api/stores'),
        fetch('/api/products'),
        fetch('/api/users')
      ])

      if (!billsResponse.ok) throw new Error('Failed to fetch bills')
      if (!storesResponse.ok) throw new Error('Failed to fetch stores')
      if (!productsResponse.ok) throw new Error('Failed to fetch products')
      if (!usersResponse.ok) throw new Error('Failed to fetch users')

      const [billsData, storesData, productsData, usersData] = await Promise.all([
        billsResponse.json(),
        storesResponse.json(),
        productsResponse.json(),
        usersResponse.json()
      ])

      console.log('Fetched data:', {
        bills: billsData.length,
        stores: storesData.length,
        products: productsData.length,
        users: usersData.length
      })

      setBills(billsData)
      setStores(storesData)
      setProducts(productsData)
      setUsers(usersData)

      // Load enhanced analytics
      await loadEnhancedAnalytics(selectedDays, trendPeriod)
    } catch (error) {
      console.error('Error loading data:', error)
      alert('Failed to load analytics data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const loadEnhancedAnalytics = async (days: string, period: string) => {
    try {
      const [
        dashboardRes,
        trendsRes,
        topProductsRes,
        inventoryRes,
        storePerformanceRes,
        categoryRes,
        alertsRes
      ] = await Promise.all([
        fetch(`${backendUrl}/api/analytics/dashboard?days=${days}`),
        fetch(`${backendUrl}/api/analytics/revenue/trends?period=${period}&days=${days}`),
        fetch(`${backendUrl}/api/analytics/products/top?limit=10&days=${days}&sortBy=revenue`),
        fetch(`${backendUrl}/api/analytics/inventory/health?days=${days}`),
        fetch(`${backendUrl}/api/analytics/stores/performance?days=${days}`),
        fetch(`${backendUrl}/api/analytics/category/breakdown?days=${days}`),
        fetch(`${backendUrl}/api/analytics/alerts`)
      ])

      const [
        dashboardData,
        trendsData,
        topProductsData,
        inventoryData,
        storePerformanceData,
        categoryData,
        alertsData
      ] = await Promise.all([
        dashboardRes.json(),
        trendsRes.json(),
        topProductsRes.json(),
        inventoryRes.json(),
        storePerformanceRes.json(),
        categoryRes.json(),
        alertsRes.json()
      ])

      setDashboardMetrics(dashboardData)
      setRevenueTrends(trendsData.data || [])
      setTopProducts(topProductsData.data || [])
      setInventoryHealth(inventoryData)
      setStorePerformance(storePerformanceData.data || [])
      setCategoryBreakdown(categoryData.data || [])
      setBusinessAlerts(alertsData.alerts || [])
    } catch (error) {
      console.error('Error loading enhanced analytics:', error)
    }
  }

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

    refresh()
    const t = setInterval(refresh, 60_000)
    return () => clearInterval(t)
  }, [router])

  useEffect(() => {
    if (bills.length > 0) {
      calculateAnalytics()
      calculateProductAdditionAnalytics()
    }
    if (users.length > 0) {
      calculateUserSessionAnalytics()
    }
  }, [bills, users, dateRange])

  useEffect(() => {
    if (!loading) {
      loadEnhancedAnalytics(selectedDays, trendPeriod)
    }
  }, [selectedDays, trendPeriod])

  const filterBillsByDateRange = (bills: Bill[]) => {
    if (!dateRange?.from || !dateRange?.to) return bills

    return bills.filter((bill) => {
      const billDate = new Date(bill.timestamp || bill.createdAt)
      return billDate >= dateRange.from! && billDate <= dateRange.to!
    })
  }

  const normalizeStoreId = (id: string): string => {
    if (id === 'store_1') return 'STR-1722255700000'
    if (id.startsWith('STR-')) return id
    if (id.startsWith('store_')) {
      return `STR-${id.replace('store_', '')}000000`
    }
    return id
  }

  const calculateUserSessionAnalytics = () => {
    const filteredUsers = users.filter(user => {
      if (!dateRange?.from || !dateRange?.to) return true;
      const lastLoggedDate = new Date(user.lastLogged);
      return lastLoggedDate >= dateRange.from && lastLoggedDate <= dateRange.to;
    });

    const dailySessions: { [key: string]: { totalSessions: number; totalDuration: number; count: number } } = {};

    filteredUsers.forEach(user => {
      const lastLoggedDate = new Date(user.lastLogged);
      const lastLogoutDate = new Date(user.lastLogout);

      if (isNaN(lastLoggedDate.getTime()) || isNaN(lastLogoutDate.getTime()) || lastLogoutDate < lastLoggedDate) {
        return;
      }

      const sessionDurationMs = lastLogoutDate.getTime() - lastLoggedDate.getTime();
      const sessionDurationMinutes = sessionDurationMs / (1000 * 60);

      const dateKey = format(lastLoggedDate, "yyyy-MM-dd");

      if (!dailySessions[dateKey]) {
        dailySessions[dateKey] = { totalSessions: 0, totalDuration: 0, count: 0 };
      }
      dailySessions[dateKey].totalSessions += 1;
      dailySessions[dateKey].totalDuration += sessionDurationMinutes;
      dailySessions[dateKey].count += 1;
    });

    const sessionAnalytics = Object.entries(dailySessions)
      .map(([date, stats]) => ({
        date,
        totalSessions: stats.totalSessions,
        averageSessionDuration: stats.count > 0 ? Number((stats.totalDuration / stats.count).toFixed(2)) : 0,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    setUserSessionAnalytics(sessionAnalytics);
  };

  const calculateProductAdditionAnalytics = () => {
    const productFirstSaleDate: Map<string, Date> = new Map();

    bills.forEach(bill => {
      const billDate = new Date(bill.timestamp || bill.createdAt);
      bill.items.forEach(item => {
        if (!productFirstSaleDate.has(item.productId) || billDate < (productFirstSaleDate.get(item.productId) as Date)) {
          productFirstSaleDate.set(item.productId, billDate);
        }
      });
    });

    const dailyProductAdditions: { [key: string]: { productsAdded: Set<string>; totalValueAdded: number } } = {};

    productFirstSaleDate.forEach((firstSaleDate, productId) => {
      if (dateRange?.from && dateRange?.to && firstSaleDate >= dateRange.from && firstSaleDate <= dateRange.to) {
        const dateKey = format(firstSaleDate, "yyyy-MM-dd");

        if (!dailyProductAdditions[dateKey]) {
          dailyProductAdditions[dateKey] = { productsAdded: new Set(), totalValueAdded: 0 };
        }
        dailyProductAdditions[dateKey].productsAdded.add(productId);

        const relevantBills = bills.filter(bill => 
          format(new Date(bill.timestamp || bill.createdAt), "yyyy-MM-dd") === dateKey && 
          bill.items.some(item => item.productId === productId)
        );

        relevantBills.forEach(bill => {
          bill.items.filter(item => item.productId === productId).forEach(item => {
            dailyProductAdditions[dateKey].totalValueAdded += item.total;
          });
        });
      }
    });

    const productAdditionData = Object.entries(dailyProductAdditions)
      .map(([date, stats]) => ({
        date,
        productsAdded: stats.productsAdded.size,
        totalValueAdded: Number(stats.totalValueAdded.toFixed(2)),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    setProductAdditionAnalytics(productAdditionData);
  };

  const calculateAnalytics = () => {
    const filteredBills = filterBillsByDateRange(bills)

    const storeStats: { [key: string]: StoreAnalytics } = {}

    stores.forEach((store) => {
      const storeId = normalizeStoreId(store.id)
      const storeBills = filteredBills.filter((bill) => {
        const billStoreId = normalizeStoreId(bill.storeId)
        return billStoreId === storeId
      })
      const totalRevenue = storeBills.reduce((sum, bill) => sum + bill.total, 0)
      const totalBills = storeBills.length
      const totalItems = storeBills.reduce(
        (sum, bill) => sum + bill.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0
      )
      const averageBillValue = totalBills > 0 ? totalRevenue / totalBills : 0

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

      const topProducts = [...Object.entries(productStats)
        .map(([productId, stats]) => ({
          productId,
          productName: stats.name,
          quantity: stats.quantity,
          revenue: stats.revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue)]
        .slice(0, 5)

      const monthlyStats: { [key: string]: { revenue: number; bills: number } } = {}
      storeBills.forEach((bill) => {
        const month = format(new Date(bill.timestamp || bill.createdAt), "MMM yyyy")
        if (!monthlyStats[month]) {
          monthlyStats[month] = { revenue: 0, bills: 0 }
        }
        monthlyStats[month].revenue += bill.total
        monthlyStats[month].bills += 1
      })

      const monthlyTrend = Object.entries(monthlyStats)
        .map(([month, stats]) => ({ month, ...stats }))
        .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())

      const currentPeriodRevenue = totalRevenue
      const previousPeriodStart = new Date(dateRange?.from || new Date())
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1)
      const previousPeriodEnd = new Date(dateRange?.to || new Date())
      previousPeriodEnd.setMonth(previousPeriodEnd.getMonth() - 1)

      const previousPeriodBills = bills.filter((bill) => {
        const billDate = new Date(bill.timestamp || bill.createdAt)
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
            storeStats[bill.storeId] = { quantity: 0, revenue: 0, name: bill.storeName || "Unknown Store" }
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

      const monthlyStats: { [key: string]: { quantity: number; revenue: number } } = {}
      productBills.forEach((bill) => {
        const month = format(new Date(bill.timestamp || bill.createdAt), "MMM yyyy")
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

      const currentQuantity = totalQuantitySold
      const currentRevenue = totalRevenue

      const previousPeriodStart = new Date(dateRange?.from || new Date())
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1)
      const previousPeriodEnd = new Date(dateRange?.to || new Date())
      previousPeriodEnd.setMonth(previousPeriodEnd.getMonth() - 1)

      const previousPeriodBills = bills.filter((bill) => {
        const billDate = new Date(bill.timestamp || bill.createdAt)
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

  const exportAnalytics = async (options: { sheets?: string[] } = {}) => {
    setExporting(true)
    try {
      const XLSXMod = await import("xlsx")
      const XLSX = (XLSXMod as any).default ?? XLSXMod

      if (!storeAnalytics.length && !productAnalytics.length) {
        throw new Error("No analytics data available to export")
      }

      const totalRevenue = Number(storeAnalytics.reduce((sum, store) => sum + store.totalRevenue, 0).toFixed(2))
      const totalBills = storeAnalytics.reduce((sum, store) => sum + store.totalBills, 0)
      const totalItems = storeAnalytics.reduce((sum, store) => sum + store.totalItems, 0)
      const averageBillValue = totalBills > 0 ? Number((totalRevenue / totalBills).toFixed(2)) : 0

      const availableSheets = {
        summary: true,
        storeAnalytics: true,
        productAnalytics: true,
        topProducts: true,
        monthlyTrends: true,
        billDetails: true,
      }

      const sheetsToExport = options.sheets
        ? Object.fromEntries(
            Object.entries(availableSheets).filter(([key]) => options.sheets!.includes(key))
          )
        : availableSheets

      const styleHeaders = (ws: any, range: any) => {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: C })
          if (ws[cellAddress]) {
            ws[cellAddress].s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "4B0082" } },
              alignment: { horizontal: "center", vertical: "center" },
              border: {
                top: { style: "thin", color: { rgb: "000000" } },
                bottom: { style: "thin", color: { rgb: "000000" } },
                left: { style: "thin", color: { rgb: "000000" } },
                right: { style: "thin", color: { rgb: "000000" } },
              },
            }
          }
        }
      }

      const autoSizeColumns = (ws: any, data: any[]) => {
        const colWidths = data.reduce((acc, row) => {
          Object.keys(row).forEach((key, i) => {
            const value = row[key] ? row[key].toString() : ""
            acc[i] = Math.max(acc[i] || 10, value.length + 2)
          })
          return acc
        }, [])
        ws["!cols"] = colWidths.map((w: number) => ({ wch: Math.min(w, 40) }))
      }

      const applyFormats = (ws: any, range: any, currencyCols: number[], percentCols: number[]) => {
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
          for (const col of currencyCols) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: col - 1 })
            if (ws[cellAddress]) {
              ws[cellAddress].z = '"₹"#,##0.00'
            }
          }
          for (const col of percentCols) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: col - 1 })
            if (ws[cellAddress]) {
              ws[cellAddress].z = '0.00%'
            }
          }
        }
      }

      const wb = XLSX.utils.book_new()

      if (sheetsToExport.summary) {
        const summaryData = [
          { Key: "Analytics Report", Value: "Store and Product Performance" },
          { Key: "", Value: "" },
          { Key: "Report Generated", Value: format(new Date(), "yyyy-MM-dd HH:mm:ss") },
          { Key: "Date Range", Value: dateRange?.from && dateRange?.to 
            ? `${format(dateRange.from, "yyyy-MM-dd")} to ${format(dateRange.to, "yyyy-MM-dd")}` 
            : "Current Month" },
          { Key: "Selected Store", Value: selectedStore === "all" ? "All Stores" : stores.find(s => s.id === selectedStore)?.name || "All Stores" },
          { Key: "Selected Product", Value: selectedProduct === "all" ? "All Products" : products.find(p => p.id === selectedProduct)?.name || "All Products" },
          { Key: "Total Stores", Value: storeAnalytics.length },
          { Key: "Total Products", Value: productAnalytics.length },
          { Key: "Total Revenue", Value: totalRevenue },
          { Key: "Total Bills", Value: totalBills },
          { Key: "Total Items Sold", Value: totalItems },
          { Key: "Average Bill Value", Value: averageBillValue },
          { Key: "", Value: "" },
          { Key: "Data Source", Value: "Generated from store billing system" },
        ]

        const summaryWs = XLSX.utils.json_to_sheet(summaryData)
        summaryWs["!rows"] = [{ hpt: 30 }, ...Array(summaryData.length - 1).fill({ hpt: 20 })]
        autoSizeColumns(summaryWs, summaryData)
        styleHeaders(summaryWs, XLSX.utils.decode_range(summaryWs["!ref"] || "A1:B1"))
        applyFormats(summaryWs, XLSX.utils.decode_range(summaryWs["!ref"] || "A1:B1"), [5, 8], [])
        summaryWs["!freeze"] = { xSplit: 0, ySplit: 1 }
        XLSX.utils.book_append_sheet(wb, summaryWs, "Summary")
      }

      if (sheetsToExport.storeAnalytics) {
        const storeData = storeAnalytics.map((store) => ({
          "Store Name": store.storeName,
          "Total Revenue": Number(store.totalRevenue.toFixed(2)),
          "Total Bills": store.totalBills,
          "Total Items Sold": store.totalItems,
          "Average Bill Value": Number(store.averageBillValue.toFixed(2)),
          "Revenue Growth %": store.revenueGrowth / 100,
          "Bills Growth %": store.billsGrowth / 100,
          "Status": store.totalBills === 0 ? "No Activity" : "Active",
        }))

        const storeWs = XLSX.utils.json_to_sheet(storeData)
        autoSizeColumns(storeWs, storeData)
        styleHeaders(storeWs, XLSX.utils.decode_range(storeWs["!ref"] || "A1:H1"))
        applyFormats(storeWs, XLSX.utils.decode_range(storeWs["!ref"] || "A1:H1"), [2, 5], [6, 7])
        storeWs["!freeze"] = { xSplit: 0, ySplit: 1 }
        XLSX.utils.book_append_sheet(wb, storeWs, "Store Analytics")
      }

      if (sheetsToExport.productAnalytics) {
        const productData = productAnalytics.map((product) => ({
          "Product Name": product.productName,
          "Total Quantity Sold": product.totalQuantitySold,
          "Total Revenue": Number(product.totalRevenue.toFixed(2)),
          "Average Price": Number(product.averagePrice.toFixed(2)),
          "Total Bills": product.totalBills,
          "Quantity Growth %": product.quantityGrowth / 100,
          "Revenue Growth %": product.revenueGrowth / 100,
          "Top Store": product.topStores[0]?.storeName || "N/A",
        }))

        const productWs = XLSX.utils.json_to_sheet(productData)
        autoSizeColumns(productWs, productData)
        styleHeaders(productWs, XLSX.utils.decode_range(productWs["!ref"] || "A1:H1"))
        applyFormats(productWs, XLSX.utils.decode_range(productWs["!ref"] || "A1:H1"), [3, 4], [6, 7])
        productWs["!freeze"] = { xSplit: 0, ySplit: 1 }
        XLSX.utils.book_append_sheet(wb, productWs, "Product Analytics")
      }

      if (sheetsToExport.topProducts) {
        const topProductsData: any[] = []
        storeAnalytics.forEach((store) => {
          store.topProducts.forEach((product, index) => {
            topProductsData.push({
              "Store Name": store.storeName,
              Rank: index + 1,
              "Product Name": product.productName,
              "Quantity Sold": product.quantity,
              Revenue: Number(product.revenue.toFixed(2)),
            })
          })
        })

        const topProductsWs = XLSX.utils.json_to_sheet(topProductsData)
        autoSizeColumns(topProductsWs, topProductsData)
        styleHeaders(topProductsWs, XLSX.utils.decode_range(topProductsWs["!ref"] || "A1:E1"))
        applyFormats(topProductsWs, XLSX.utils.decode_range(topProductsWs["!ref"] || "A1:E1"), [5], [])
        topProductsWs["!freeze"] = { xSplit: 0, ySplit: 1 }
        XLSX.utils.book_append_sheet(wb, topProductsWs, "Top Products by Store")
      }

      if (sheetsToExport.monthlyTrends) {
        const monthlyTrendData: any[] = []
        storeAnalytics.forEach((store) => {
          store.monthlyTrend.forEach((trend) => {
            monthlyTrendData.push({
              "Store Name": store.storeName,
              Month: trend.month,
              Revenue: Number(trend.revenue.toFixed(2)),
              Bills: trend.bills,
            })
          })
        })

        const monthlyTrendWs = XLSX.utils.json_to_sheet(monthlyTrendData)
        autoSizeColumns(monthlyTrendWs, monthlyTrendData)
        styleHeaders(monthlyTrendWs, XLSX.utils.decode_range(monthlyTrendWs["!ref"] || "A1:D1"))
        applyFormats(monthlyTrendWs, XLSX.utils.decode_range(monthlyTrendWs["!ref"] || "A1:D1"), [3], [])
        monthlyTrendWs["!freeze"] = { xSplit: 0, ySplit: 1 }
        XLSX.utils.book_append_sheet(wb, monthlyTrendWs, "Monthly Trends")
      }

      if (sheetsToExport.billDetails) {
        const billDetailsData = filterBillsByDateRange(bills).map((bill) => ({
          "Bill ID": bill.id,
          "Store Name": bill.storeName,
          "Customer Name": bill.customerName || "N/A",
          "Date": format(new Date(bill.timestamp || bill.createdAt), "yyyy-MM-dd HH:mm:ss"),
          "Items": bill.items.map(item => `${item.productName} (Qty: ${item.quantity})`).join(", "),
          "Subtotal": Number((bill.subtotal || 0).toFixed(2)),
          "Tax": Number((bill.taxAmount || 0).toFixed(2)),
          "Discount": Number((bill.discountAmount || 0).toFixed(2)),
          "Total": Number((bill.total || 0).toFixed(2)),
          "Created By": bill.createdBy,
        }))

        const billDetailsWs = XLSX.utils.json_to_sheet(billDetailsData)
        autoSizeColumns(billDetailsWs, billDetailsData)
        styleHeaders(billDetailsWs, XLSX.utils.decode_range(billDetailsWs["!ref"] || "A1:J1"))
        applyFormats(billDetailsWs, XLSX.utils.decode_range(billDetailsWs["!ref"] || "A1:J1"), [6, 7, 8, 9], [])
        billDetailsWs["!freeze"] = { xSplit: 0, ySplit: 1 }
        XLSX.utils.book_append_sheet(wb, billDetailsWs, "Bill Details")
      }

      const dateStr =
        dateRange?.from && dateRange?.to
          ? `${format(dateRange.from, "yyyy-MM-dd")}_to_${format(dateRange.to, "yyyy-MM-dd")}`
          : format(new Date(), "yyyy-MM-dd")
      const storeStr = selectedStore === "all" ? "" : `-${stores.find(s => s.id === selectedStore)?.name.replace(/\s+/g, '-') || 'store'}`
      const filename = `Analytics-Report${storeStr}-${dateStr}.xlsx`

      const wbArrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })
      const blob = new Blob([wbArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })

      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      alert("Analytics report exported successfully!")
    } catch (error: any) {
      console.error("Error exporting analytics:", error)
      let errorMessage = "Failed to export analytics. Please try again."
      if (error.message.includes("No analytics data")) {
        errorMessage = "No data available to export. Please ensure data is loaded."
      } else if (error.message.includes("SheetJS")) {
        errorMessage = "Failed to load export library. Please check your connection."
      }
      alert(errorMessage)
    } finally {
      setExporting(false)
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
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-gray-600 mt-2">Comprehensive insights into store and product performance</p>
          </div>
          <div className="flex space-x-3">
            <Button 
              onClick={() => exportAnalytics()} 
              variant="outline" 
              className="bg-green-50 hover:bg-green-100"
              disabled={exporting}
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting ? "Exporting..." : "Export Report"}
            </Button>
            <Button onClick={refresh} variant="outline" disabled={exporting}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Data
            </Button>
          </div>
        </div>

        {/* Business Alerts */}
        {businessAlerts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Business Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {businessAlerts.map((alert, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      alert.type === 'error' ? 'bg-red-50 border-red-200' :
                      alert.type === 'warning' ? 'bg-orange-50 border-orange-200' :
                      'bg-blue-50 border-blue-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-gray-900">{alert.title}</h3>
                        <p className="text-sm text-gray-600">{alert.message}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        alert.priority === 'critical' ? 'bg-red-100 text-red-800' :
                        alert.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {alert.priority}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Filter className="h-5 w-5 mr-2" />
              Filters & Date Range
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                <Label>Analysis Period</Label>
                <Select value={selectedDays} onValueChange={setSelectedDays}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 Days</SelectItem>
                    <SelectItem value="30">Last 30 Days</SelectItem>
                    <SelectItem value="60">Last 60 Days</SelectItem>
                    <SelectItem value="90">Last 90 Days</SelectItem>
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

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{dashboardMetrics?.revenue.current.toFixed(2) || totalRevenue.toFixed(2)}</div>
              <div className="flex items-center mt-2">
                {(dashboardMetrics?.revenue.growth || 0) >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
                )}
                <span className={`text-sm font-medium ${
                  (dashboardMetrics?.revenue.growth || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {Math.abs(dashboardMetrics?.revenue.growth || 0).toFixed(1)}%
                </span>
                <span className="text-xs text-gray-500 ml-1">vs previous</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bills</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardMetrics?.bills.total || totalBills}</div>
              <p className="text-xs text-muted-foreground">
                Avg: ₹{(dashboardMetrics?.bills.averageValue || averageBillValue).toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardMetrics?.items.totalSold || totalItems}</div>
              <p className="text-xs text-muted-foreground">
                {(dashboardMetrics?.items.perTransaction || (totalItems / totalBills)).toFixed(1)} per transaction
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardMetrics?.customers.unique || 0}</div>
              <p className="text-xs text-muted-foreground">Active users: {online?.onlineCount ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Analytics - Revenue Trends */}
        {revenueTrends.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Revenue Trends</CardTitle>
                <Select value={trendPeriod} onValueChange={setTrendPeriod}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value) => [`₹${Number(value).toFixed(2)}`, "Revenue"]} />
                  <Line type="monotone" dataKey="revenue" stroke="#8884d8" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Top Products from Enhanced Analytics */}
        {topProducts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top Selling Products (Last {selectedDays} Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Qty Sold</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((product) => (
                    <TableRow key={product.productId}>
                      <TableCell className="font-medium">{product.productName}</TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell className="text-right font-semibold">₹{product.revenue.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{product.quantitySold}</TableCell>
                      <TableCell className="text-right">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          product.currentStock < 10 ? 'bg-red-100 text-red-800' :
                          product.currentStock < 50 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {product.currentStock}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Inventory Health */}
        {inventoryHealth && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₹{inventoryHealth.summary.totalInventoryValue.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">{inventoryHealth.summary.totalProducts} products</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Slow Moving Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{inventoryHealth.summary.slowMovingCount}</div>
                <p className="text-xs text-muted-foreground">Low turnover ratio</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{inventoryHealth.summary.outOfStockCount}</div>
                <p className="text-xs text-muted-foreground">Needs restocking</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Category Breakdown */}
        {categoryBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Sales by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryBreakdown as any[]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ payload }: PieLabelRenderProps) => `${(payload as CategoryBreakdown).category} ${(payload as CategoryBreakdown).revenuePercentage.toFixed(1)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="revenue"
                  >
                    {categoryBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`₹${Number(value).toFixed(2)}`, "Revenue"]} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="stores" className="space-y-4">
          <TabsList>
            <TabsTrigger value="stores">Store Analytics</TabsTrigger>
            <TabsTrigger value="products">Product Analytics</TabsTrigger>
            <TabsTrigger value="trends">Trends & Insights</TabsTrigger>
            <TabsTrigger value="userSessions">User Sessions</TabsTrigger>
          </TabsList>

          <TabsContent value="stores" className="space-y-6">
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

                      <div>
                        <p className="text-sm font-medium mb-2">Top Products</p>
                        <div className="space-y-1">
                          {store.topProducts.slice(0, 3).map((product, index) => (
                            <div key={`${store.storeId}-${product.productId}`} className="flex justify-between text-sm">
                              <span className="truncate">
                                {index + 1}. {product.productName}
                              </span>
                              <span className="font-medium">₹{product.revenue.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

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

          <TabsContent value="products" className="space-y-6">
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

            <Card>
              <CardHeader>
                <CardTitle>Products Added & Value Over Time</CardTitle>
                <CardDescription>Number of unique products first sold and their total revenue per day</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart
                    data={productAdditionAnalytics}
                    margin={{
                      top: 5,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" label={{ value: 'Products Added', angle: -90, position: 'insideLeft' }} />
                    <YAxis yAxisId="right" orientation="right" label={{ value: 'Total Value (₹)', angle: 90, position: 'insideRight' }} />
                    <Tooltip formatter={(value, name) => {
                      if (name === "productsAdded") return [`${value} products`, "Products Added"];
                      if (name === "totalValueAdded") return [`₹${Number(value).toFixed(2)}`, "Total Value Added"];
                      return value;
                    }} />
                    <Line yAxisId="left" type="monotone" dataKey="productsAdded" stroke="#8884d8" activeDot={{ r: 8 }} name="productsAdded" />
                    <Line yAxisId="right" type="monotone" dataKey="totalValueAdded" stroke="#82ca9d" activeDot={{ r: 8 }} name="totalValueAdded" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Products by Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={filteredProductAnalytics.slice(0, 8).map(item => ({
                          name: item.productName,
                          value: item.totalRevenue,
                          ...item
                        }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }: { name?: string; percent?: number }) => 
                          `${name || ''} ${percent ? (percent * 100).toFixed(0) : 0}%`
                        }
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {filteredProductAnalytics.slice(0, 8).map((item, index) => (
                          <Cell key={item.productName} fill={COLORS[index % COLORS.length]} />
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

          <TabsContent value="trends" className="space-y-6">
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

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Performing Store</CardTitle>
                </CardHeader>
                <CardContent>
                  {storeAnalytics.length > 0 && (
                    <div className="space-y-4">
                      {[...storeAnalytics]
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

          <TabsContent value="userSessions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>User Session Duration Trend</CardTitle>
                <CardDescription>Average session duration over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart
                    data={userSessionAnalytics}
                    margin={{
                      top: 5,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis label={{ value: 'Avg Duration (minutes)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} minutes`, "Average Session Duration"]} />
                    <Line type="monotone" dataKey="averageSessionDuration" stroke="#8884d8" activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Total User Sessions Over Time</CardTitle>
                <CardDescription>Number of user sessions per day</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={userSessionAnalytics}
                    margin={{
                      top: 5,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis label={{ value: 'Total Sessions', angle: -90, position: 'insideLeft' }} />
                    <Tooltip formatter={(value) => [`${value} sessions`, "Total Sessions"]} />
                    <Bar dataKey="totalSessions" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Active Users (5 min)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{online?.onlineCount ?? 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Sessions Today</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{sessions?.totalSessions ?? 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Avg Session Today</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {sessions ? Math.round((sessions.avgSessionSec || 0) / 60) : 0} min
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Online Users Now</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {online?.online && online.online.length > 0 ? (
                    online.online.map(u => (
                      <div key={u.userId} className="flex justify-between items-center py-2 border-b last:border-0">
                        <span className="font-medium">{u.userId}</span>
                        <span className="text-sm text-gray-500">
                          Last seen: {new Date(u.lastSeen).toLocaleTimeString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">No users currently online</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
