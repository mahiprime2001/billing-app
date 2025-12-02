"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import usePolling from "@/hooks/usePolling"
import api from "@/app/utils/api"

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
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react" // Renamed to avoid conflict with UI Calendar
import { Calendar } from "@/components/ui/calendar" // Import the shadcn/ui Calendar component

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
  paymentMethod?: string // Added paymentMethod
}

interface ReturnItem {
  s_no: number;
  return_id: string;
  product_name: string;
  product_id: string;
  customer_name: string;
  customer_phone_number: string;
  message: string;
  refund_method: "cash" | "upi";
  bill_id: string;
  item_index: number;
  return_amount: number;
  status: "pending" | "approved" | "rejected" | "completed";
  created_by: string;
  created_at: string;
  updated_at: string;
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
  totalRefundAmount: number;
  totalReturnedItems: number;
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
  totalReturnedQuantity: number;
  totalRefundAmount: number;
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
  const [storeAnalytics, setStoreAnalytics] = useState<StoreAnalytics[]>([])
  const [productAnalytics, setProductAnalytics] = useState<ProductAnalytics[]>([])
  const [userSessionAnalytics, setUserSessionAnalytics] = useState<UserSessionAnalytics[]>([])
  const [productAdditionAnalytics, setProductAdditionAnalytics] = useState<ProductAdditionAnalytics[]>([])
  
  const [exporting, setExporting] = useState(false)
  const [selectedStore, setSelectedStore] = useState<string>("all")
  const [selectedProduct, setSelectedProduct] = useState<string>("all")
  const [selectedDays, setSelectedDays] = useState<string>("30")
  const [trendPeriod, setTrendPeriod] = useState<string>("daily")
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined) // For single date selection, initially undefined
  const [calendarOpen, setCalendarOpen] = useState(false) // State for custom calendar popover
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date()) // State for custom calendar month navigation

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8080'

  // Fetchers for usePolling
  const fetchBills = useCallback(async () => {
    const response = await api.get<Bill[]>('/api/bills');
    return response.data;
  }, []);

  const fetchStores = useCallback(async () => {
    const response = await api.get<Store[]>('/api/stores');
    return response.data;
  }, []);

  const fetchProducts = useCallback(async () => {
    const response = await api.get<Product[]>('/api/products');
    return response.data;
  }, []);

  const fetchUsers = useCallback(async () => {
    const response = await api.get<User[]>('/api/users');
    return response.data;
  }, []);

  const fetchOnlineUsers = useCallback(async () => {
    const response = await api.get<OnlineResp>('/api/analytics/users/online?windowMinutes=5');
    return response.data;
  }, []);

  const fetchSessions = useCallback(async () => {
    const todayStr = new Date().toISOString().slice(0,10);
    const response = await api.get<SessionsResp>(`/api/analytics/users/sessions?from=${todayStr}&to=${todayStr}`);
    return response.data;
  }, []);

  const fetchDashboardMetrics = useCallback(async () => {
    const response = await api.get<DashboardMetrics>(`${backendUrl}/api/analytics/dashboard?days=${selectedDays}`);
    return response.data;
  }, [selectedDays, backendUrl]);

  const fetchRevenueTrends = useCallback(async () => {
    const response = await api.get<{ data: RevenueTrend[] }>(`${backendUrl}/api/analytics/revenue/trends?period=${trendPeriod}&days=${selectedDays}`);
    return response.data.data || [];
  }, [trendPeriod, selectedDays, backendUrl]);

  const fetchTopProducts = useCallback(async () => {
    const response = await api.get<{ data: TopProduct[] }>(`${backendUrl}/api/analytics/products/top?limit=10&days=${selectedDays}&sortBy=revenue`);
    return response.data.data || [];
  }, [selectedDays, backendUrl]);

  const fetchInventoryHealth = useCallback(async () => {
    const response = await api.get<InventoryHealth>(`${backendUrl}/api/analytics/inventory/health?days=${selectedDays}`);
    return response.data;
  }, [selectedDays, backendUrl]);

  const fetchStorePerformance = useCallback(async () => {
    const response = await api.get<{ data: StorePerformance[] }>(`${backendUrl}/api/analytics/stores/performance?days=${selectedDays}`);
    return response.data.data || [];
  }, [selectedDays, backendUrl]);

  const fetchCategoryBreakdown = useCallback(async () => {
    const response = await api.get<{ data: CategoryBreakdown[] }>(`${backendUrl}/api/analytics/category/breakdown?days=${selectedDays}`);
    return response.data.data || [];
  }, [selectedDays, backendUrl]);

  const fetchBusinessAlerts = useCallback(async () => {
    const response = await api.get<{ alerts: BusinessAlert[] }>(`${backendUrl}/api/analytics/alerts`);
    return response.data.alerts || [];
  }, [backendUrl]);

  const fetchReturns = useCallback(async () => {
    const response = await api.get<ReturnItem[]>(`${backendUrl}/api/returns`);
    return response.data || [];
  }, [backendUrl]);

  // New type for consolidated analytics data
  interface AllAnalyticsData {
    bills: Bill[];
    stores: Store[];
    products: Product[];
    users: User[];
    onlineUsers: OnlineResp;
    sessions: SessionsResp;
    dashboardMetrics: DashboardMetrics;
    revenueTrends: RevenueTrend[];
    topProducts: TopProduct[];
    inventoryHealth: InventoryHealth;
    storePerformance: StorePerformance[];
    categoryBreakdown: CategoryBreakdown[];
    businessAlerts: BusinessAlert[];
    returns: ReturnItem[];
  }

  // Consolidated fetcher
  const fetchAllAnalytics = useCallback(async () => {
    const [
      bills,
      stores,
      products,
      users,
      onlineUsers,
      sessions,
      dashboardMetrics,
      revenueTrends,
      topProducts,
            inventoryHealth,
      storePerformance,
      categoryBreakdown,
      businessAlerts,
      returns,
    ] = await Promise.all([
      fetchBills(),
      fetchStores(),
      fetchProducts(),
      fetchUsers(),
      fetchOnlineUsers(),
      fetchSessions(),
      fetchDashboardMetrics(),
      fetchRevenueTrends(),
      fetchTopProducts(),
      fetchInventoryHealth(),
      fetchStorePerformance(),
      fetchCategoryBreakdown(),
      fetchBusinessAlerts(),
      fetchReturns(),
    ]);

    return {
      bills,
      stores,
      products,
      users,
      onlineUsers,
      sessions,
      dashboardMetrics,
      revenueTrends,
      topProducts,
      inventoryHealth,
      storePerformance,
      categoryBreakdown,
      businessAlerts,
      returns,
    };
  }, [
    fetchBills,
    fetchStores,
    fetchProducts,
    fetchUsers,
    fetchOnlineUsers,
    fetchSessions,
    fetchDashboardMetrics,
    fetchRevenueTrends,
    fetchTopProducts,
    fetchInventoryHealth,
    fetchStorePerformance,
    fetchCategoryBreakdown,
    fetchBusinessAlerts,
    fetchReturns,
  ]);

  // Use a single polling hook
  const { data: analyticsData, loading, error: analyticsError } = usePolling<AllAnalyticsData>(
    fetchAllAnalytics,
    { interval: 30000 } // Increase to 30 seconds
  );

  // Local state for analytics calculations that depend on fetched data
  const [bills, setBills] = useState<Bill[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [online, setOnline] = useState<OnlineResp | null>(null);
  const [sessions, setSessions] = useState<SessionsResp | null>(null);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [revenueTrends, setRevenueTrends] = useState<RevenueTrend[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [inventoryHealth, setInventoryHealth] = useState<InventoryHealth | null>(null);
  const [storePerformance, setStorePerformance] = useState<StorePerformance[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdown[]>([]);
  const [businessAlerts, setBusinessAlerts] = useState<BusinessAlert[]>([]);
  const [returns, setReturns] = useState<ReturnItem[]>([]);

  // Update local states when polling data changes
  useEffect(() => {
    if (analyticsData) {
      setBills(analyticsData.bills);
      setStores(analyticsData.stores);
      setProducts(analyticsData.products);
      setUsers(analyticsData.users);
      setOnline(analyticsData.onlineUsers);
      setSessions(analyticsData.sessions);
      setDashboardMetrics(analyticsData.dashboardMetrics);
      setRevenueTrends(analyticsData.revenueTrends);
      setTopProducts(analyticsData.topProducts);
      setInventoryHealth(analyticsData.inventoryHealth);
      setStorePerformance(analyticsData.storePerformance);
      setCategoryBreakdown(analyticsData.categoryBreakdown);
      setBusinessAlerts(analyticsData.businessAlerts);
      setReturns(analyticsData.returns);
    }
  }, [analyticsData]);

  // Error logging for the single polling hook
  useEffect(() => {
    if (analyticsError) console.error("Error fetching analytics data:", analyticsError);
  }, [analyticsError]);

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
    // No need for manual refresh or setInterval here, usePolling handles it
  }, [router])

  const filterBillsByDate = useCallback((bills: Bill[]) => {
    console.log("filterBillsByDate: selectedDate", selectedDate);
    console.log("filterBillsByDate: input bills count", bills.length);

    if (!selectedDate) {
      console.log("filterBillsByDate: No selectedDate, returning all bills.");
      return bills;
    }

    const selectedDayStart = startOfDay(selectedDate);
    const selectedDayEnd = endOfDay(selectedDate);

    const filtered = bills.filter((bill) => {
      const billDate = new Date(bill.timestamp || bill.createdAt);
      return billDate >= selectedDayStart && billDate <= selectedDayEnd;
    });

    console.log("filterBillsByDate: filtered bills count", filtered.length);
    return filtered;
  }, [selectedDate]);

  const normalizeStoreId = (id: string | undefined | null): string => {
    if (!id) return '' // Handle undefined or null IDs
    if (id === 'store_1') return 'STR-1722255700000'
    if (id.startsWith('STR-')) return id
    if (id.startsWith('store_')) {
      return `STR-${id.replace('store_', '')}000000`
    }
    return id
  }

  const calculateAnalytics = useCallback(() => {
    const filteredBills = filterBillsByDate(bills);
    const filteredReturns = filterReturnsByDate(returns);

    // Adjust total revenue and items sold for returns
    let adjustedTotalRevenue = filteredBills.reduce((sum, bill) => sum + bill.total, 0);
    let adjustedTotalItems = filteredBills.reduce((sum, bill) => sum + bill.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
    let totalRefundAmount = 0;
    let totalReturnedItems = 0;

    filteredReturns.forEach(returnItem => {
      if (returnItem.status === "approved" || returnItem.status === "completed") {
        totalRefundAmount += returnItem.return_amount;
        // Assuming each return item corresponds to one product quantity for simplicity
        totalReturnedItems += 1; 
      }
    });

    adjustedTotalRevenue -= totalRefundAmount;
    adjustedTotalItems -= totalReturnedItems;

    // Store Analytics
    const storeMap = new Map<string, StoreAnalytics>();
    stores.forEach((store) => {
      storeMap.set(store.id, {
        storeId: store.id,
        storeName: store.name,
        totalRevenue: 0,
        totalBills: 0,
        totalItems: 0,
        averageBillValue: 0,
        topProducts: [],
        monthlyTrend: [],
        revenueGrowth: 0,
        billsGrowth: 0,
        totalRefundAmount: 0, // New field
        totalReturnedItems: 0, // New field
      });
    });

    filteredBills.forEach((bill) => {
      const storeId = normalizeStoreId(bill.storeId);
      if (storeMap.has(storeId)) {
        const storeStats = storeMap.get(storeId)!;
        storeStats.totalRevenue += bill.total;
        storeStats.totalBills += 1;
        bill.items.forEach((item) => {
          storeStats.totalItems += item.quantity;
          const existingProduct = storeStats.topProducts.find((p) => p.productId === item.productId);
          if (existingProduct) {
            existingProduct.quantity += item.quantity;
            existingProduct.revenue += item.total;
          } else {
            storeStats.topProducts.push({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              revenue: item.total,
            });
          }
        });
      }
    });

    // Incorporate return data into store analytics
    filteredReturns.forEach(returnItem => {
      if (returnItem.status === "approved" || returnItem.status === "completed") {
        const storeId = normalizeStoreId(
          bills.find(bill => bill.id === returnItem.bill_id)?.storeId || ""
        );
        if (storeMap.has(storeId)) {
          const storeStats = storeMap.get(storeId)!;
          storeStats.totalRefundAmount += returnItem.return_amount;
          storeStats.totalReturnedItems += 1; // Assuming one return item means one product returned
        }
      }
    });

    const calculatedStoreAnalytics = Array.from(storeMap.values()).map((store) => {
      // Adjust total revenue and items for returns
      store.totalRevenue -= store.totalRefundAmount;
      store.totalItems -= store.totalReturnedItems;

      store.averageBillValue = store.totalBills > 0 ? store.totalRevenue / store.totalBills : 0;
      store.topProducts.sort((a, b) => b.revenue - a.revenue);

      // Placeholder for monthly trend and growth (can be expanded with more data)
      store.monthlyTrend = [
        { month: "Jan", revenue: store.totalRevenue * 0.8, bills: store.totalBills * 0.8 },
        { month: "Feb", revenue: store.totalRevenue, bills: store.totalBills },
      ];
      store.revenueGrowth = 20; // Example growth
      store.billsGrowth = 20; // Example growth
      return store;
    });
    setStoreAnalytics(calculatedStoreAnalytics);

    // Product Analytics
    const productMap = new Map<string, ProductAnalytics>();
    products.forEach((product) => {
      productMap.set(product.id, {
        productId: product.id,
        productName: product.name,
        totalQuantitySold: 0,
        totalRevenue: 0,
        averagePrice: 0,
        totalBills: 0,
        topStores: [],
        monthlyTrend: [],
        quantityGrowth: 0,
        revenueGrowth: 0,
        totalReturnedQuantity: 0, // New field
        totalRefundAmount: 0, // New field
      });
    });

    filteredBills.forEach((bill) => {
      bill.items.forEach((item) => {
        if (productMap.has(item.productId)) {
          const productStats = productMap.get(item.productId)!;
          productStats.totalQuantitySold += item.quantity;
          productStats.totalRevenue += item.total;
          productStats.totalBills += 1;

          const existingStore = productStats.topStores.find((s) => s.storeId === normalizeStoreId(bill.storeId));
          if (existingStore) {
            existingStore.quantity += item.quantity;
            existingStore.revenue += item.total;
          } else {
            productStats.topStores.push({
              storeId: normalizeStoreId(bill.storeId),
              storeName: bill.storeName,
              quantity: item.quantity,
              revenue: item.total,
            });
          }
        }
      });
    });

    // Incorporate return data into product analytics
    filteredReturns.forEach(returnItem => {
      if (returnItem.status === "approved" || returnItem.status === "completed") {
        if (productMap.has(returnItem.product_id)) {
          const productStats = productMap.get(returnItem.product_id)!;
          productStats.totalRefundAmount += returnItem.return_amount;
          productStats.totalReturnedQuantity += 1; // Assuming one return item means one product quantity returned
        }
      }
    });

    const calculatedProductAnalytics = Array.from(productMap.values()).map((product) => {
      // Adjust total revenue and quantity sold for returns
      product.totalRevenue -= product.totalRefundAmount;
      product.totalQuantitySold -= product.totalReturnedQuantity;

      product.averagePrice = product.totalQuantitySold > 0 ? product.totalRevenue / product.totalQuantitySold : 0;
      product.topStores.sort((a, b) => b.revenue - a.revenue);

      // Placeholder for monthly trend and growth
      product.monthlyTrend = [
        { month: "Jan", quantity: product.totalQuantitySold * 0.8, revenue: product.totalRevenue * 0.8 },
        { month: "Feb", quantity: product.totalQuantitySold, revenue: product.totalRevenue },
      ];
      product.quantityGrowth = 20; // Example growth
      product.revenueGrowth = 20; // Example growth
      return product;
    });
    setProductAnalytics(calculatedProductAnalytics);
  }, [bills, stores, products, selectedDate, returns]);

  const filterReturnsByDate = useCallback((returns: ReturnItem[]) => {
    if (!selectedDate) {
      return returns;
    }

    const selectedDayStart = startOfDay(selectedDate);
    const selectedDayEnd = endOfDay(selectedDate);

    return returns.filter((returnItem) => {
      const returnDate = new Date(returnItem.created_at);
      return returnDate >= selectedDayStart && returnDate <= selectedDayEnd;
    });
  }, [selectedDate]);

  const calculateUserSessionAnalytics = useCallback(() => {
    const filteredUsers = users.filter(user => {
      if (!selectedDate) return true;
      const lastLoggedDate = new Date(user.lastLogged);
      const selectedDayStart = startOfDay(selectedDate);
      const selectedDayEnd = endOfDay(selectedDate);
      return lastLoggedDate >= selectedDayStart && lastLoggedDate <= selectedDayEnd;
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
  }, [users, selectedDate]);

  const calculateProductAdditionAnalytics = useCallback(() => {
    const filteredReturns = filterReturnsByDate(returns); // Define filteredReturns here
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
      if (selectedDate) {
        const selectedDayStart = startOfDay(selectedDate);
        const selectedDayEnd = endOfDay(selectedDate);
        const dateKey = format(firstSaleDate, "yyyy-MM-dd");

        if (firstSaleDate >= selectedDayStart && firstSaleDate <= selectedDayEnd) {
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

          // Subtract return amounts for products returned on this date
          const relevantReturns = filteredReturns.filter((returnItem: ReturnItem) => // Explicitly type returnItem
            format(new Date(returnItem.created_at), "yyyy-MM-dd") === dateKey &&
            returnItem.product_id === productId &&
            (returnItem.status === "approved" || returnItem.status === "completed")
          );
          relevantReturns.forEach((returnItem: ReturnItem) => { // Explicitly type returnItem
            dailyProductAdditions[dateKey].totalValueAdded -= returnItem.return_amount;
          });
        }
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
  }, [bills, selectedDate, returns, filterReturnsByDate]);

  // Trigger calculateAnalytics when its dependencies change
  useEffect(() => {
    if (bills.length > 0 && stores.length > 0 && products.length > 0) {
      calculateAnalytics();
    }
  }, [bills, stores, products, selectedDate, returns, calculateAnalytics]);

  // Trigger calculateProductAdditionAnalytics when its dependencies change
  useEffect(() => {
    if (bills.length > 0 && returns.length > 0) {
      calculateProductAdditionAnalytics();
    }
  }, [bills, selectedDate, returns, filterReturnsByDate, calculateProductAdditionAnalytics]);

  // Trigger calculateUserSessionAnalytics when its dependencies change
  useEffect(() => {
    if (users.length > 0) {
      calculateUserSessionAnalytics();
    }
  }, [users, selectedDate, calculateUserSessionAnalytics]);

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)

  const fmtMonthYear = (d: Date) =>
    d.toLocaleString(undefined, { month: "long", year: "numeric" })

  const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  const toKey = (d: Date) => {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  }

  const setQuickDate = (range: string) => {
    const today = new Date()
    let date: Date | undefined

    switch (range) {
      case "today":
        date = today
        break
      case "yesterday":
        date = subDays(today, 1)
        break
      case "all":
        date = undefined; // Set to undefined for "All Dates"
        break;
      default:
        return
    }
    setSelectedDate(date)
  }


const getDateRange = (bill: any) => {
  const date = new Date(bill.timestamp || bill.createdAt);
  return {
    date: date,
    day: format(date, 'yyyy-MM-dd'),
    week: `${format(startOfWeek(date), 'yyyy-MM-dd')} to ${format(endOfWeek(date), 'yyyy-MM-dd')}`,
    month: format(date, 'yyyy-MM'),
    quarter: `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`,
    year: date.getFullYear().toString(),
    dayOfWeek: format(date, 'EEEE'),
    weekNumber: format(date, 'w'),
    monthName: format(date, 'MMMM yyyy')
  };
};

interface AggregatedPeriodData {
  period: string;
  displayName: string;
  revenue: number; // This will be net revenue after returns
  grossRevenue: number;
  returnAmount: number;
  netRevenue: number;
  bills: number;
  items: number;
  returnedItems: number;
  customers: number; // Changed from Set<string> to number
  avgBillValue: number; // Added
  avgItemsPerBill: number; // Added
  products: Array<{ name: string; quantity: number; revenue: number; returns: number; returnRevenue: number; category: string; returnRate: number }>;
  stores: Array<{ name: string; revenue: number; bills: number; items: number; returns: number; returnAmount: number; returnRate: number }>;
  categories: Array<{ name: string; revenue: number; quantity: number; returns: number; returnRevenue: number; returnRate: number }>;
  hourlyData: Array<{ revenue: number; bills: number; returns: number }>;
  paymentMethods: Array<{ method: string; amount: number }>;
}

interface InternalAggregatedPeriodData {
  period: string;
  displayName: string;
  revenue: number; // This will be net revenue after returns
  grossRevenue: number;
  returnAmount: number;
  netRevenue: number;
  bills: number;
  items: number;
  returnedItems: number;
  customers: Set<string>; // Internal representation as Set
  avgBillValue: number; // Added
  avgItemsPerBill: number; // Added
  products: Map<string, { name: string; quantity: number; revenue: number; returns: number; returnRevenue: number; category: string; returnRate?: number }>;
  stores: Map<string, { name: string; revenue: number; bills: number; items: number; returns: number; returnAmount: number; returnRate?: number }>;
  categories: Map<string, { name: string; revenue: number; quantity: number; returns: number; returnRevenue: number; returnRate?: number }>;
  hourlyData: Array<{ revenue: number; bills: number; returns: number }>;
  paymentMethods: Map<string, number>;
}

const aggregateByPeriod = (
  bills: Bill[],
  period: 'day' | 'week' | 'month' | 'quarter' | 'year',
  products: Product[],
  returns: ReturnItem[]
): AggregatedPeriodData[] => {
const grouped = new Map<string, InternalAggregatedPeriodData>();
  const filteredReturns = filterReturnsByDate(returns);

  // Process bills first
  bills.forEach((bill) => {
    const range = getDateRange(bill);
    const key = range[period];

    if (!grouped.has(key)) {
      grouped.set(key, {
        period: key,
        displayName:
          period === 'day'
            ? format(range.date, 'EEEE, MMM dd, yyyy')
            : period === 'month'
            ? range.monthName
            : period === 'week'
            ? `Week ${range.weekNumber}, ${range.year}`
            : key,
        grossRevenue: 0,
        returnAmount: 0,
        netRevenue: 0,
        bills: 0,
        revenue: 0,
        items: 0,
        returnedItems: 0,
        customers: new Set<string>(), // Use Set for unique customers
        avgBillValue: 0,
        avgItemsPerBill: 0,
        products: new Map(),
        stores: new Map(),
        categories: new Map(),
        hourlyData: Array(24).fill(0).map(() => ({ revenue: 0, bills: 0, returns: 0 })),
        paymentMethods: new Map(),
      });
    }

    const data = grouped.get(key)!;
    data.grossRevenue += bill.total;
    data.revenue += bill.total;
    data.bills += 1;
    data.items += bill.items.reduce((sum: number, item: any) => sum + item.quantity, 0);

    // Add customer to set for unique count
    if (bill.customerPhone) {
      data.customers.add(bill.customerPhone);
    }

    // Hour breakdown
    if (period === 'day') {
      const hour = range.date.getHours();
      data.hourlyData[hour].revenue += bill.total;
      data.hourlyData[hour].bills += 1;
    }

    // Product breakdown
    bill.items.forEach((item: any) => {
      const product = products.find((p) => p.id === item.productId);
      const productKey = item.productName;

      if (!data.products.has(productKey)) {
        data.products.set(productKey, {
          name: productKey,
          quantity: 0,
          revenue: 0,
          returns: 0,
          returnRevenue: 0,
          category: product?.category || 'Uncategorized',
        });
      }

      const prodData = data.products.get(productKey)!;
      prodData.quantity += item.quantity;
      prodData.revenue += item.total;

      // Category breakdown
      const category = product?.category || 'Uncategorized';
      if (!data.categories.has(category)) {
        data.categories.set(category, {
          name: category, // Add name property
          revenue: 0,
          quantity: 0,
          returns: 0,
          returnRevenue: 0
        });
      }
      const catData = data.categories.get(category)!;
      catData.revenue += item.total;
      catData.quantity += item.quantity;
    });

    // Store breakdown
    if (!data.stores.has(bill.storeName)) {
      data.stores.set(bill.storeName, {
        name: bill.storeName, // Add name property
        revenue: 0,
        bills: 0,
        items: 0,
        returns: 0,
        returnAmount: 0
      });
    }
    const storeData = data.stores.get(bill.storeName)!;
    storeData.revenue += bill.total;
    storeData.bills += 1;
    storeData.items += bill.items.reduce((sum: number, item: any) => sum + item.quantity, 0);

    // Payment methods
    const paymentMethod = bill.paymentMethod || 'Cash';
    data.paymentMethods.set(paymentMethod, (data.paymentMethods.get(paymentMethod) || 0) + bill.total);
  });

  // Process returns
  filteredReturns.forEach((returnItem) => {
    if (returnItem.status === 'approved' || returnItem.status === 'completed') {
      const returnDate = new Date(returnItem.created_at);
      const range = getDateRange({ timestamp: returnDate.toISOString() } as Bill);
      const key = range[period];

      if (grouped.has(key)) {
        const data = grouped.get(key)!;

        // Update aggregate metrics
        data.returnAmount += returnItem.return_amount;
        data.returnedItems += 1;
        data.revenue -= returnItem.return_amount; // Adjust net revenue

        // Update product breakdown
        const productKey = returnItem.product_name;
        if (data.products.has(productKey)) {
          const prodData = data.products.get(productKey)!;
          prodData.returns += 1;
          prodData.returnRevenue += returnItem.return_amount;
          prodData.revenue -= returnItem.return_amount;
        }

        // Update category breakdown
        const product = products.find((p) => p.id === returnItem.product_id);
        const category = product?.category || 'Uncategorized';
        if (data.categories.has(category)) {
          const catData = data.categories.get(category)!;
          catData.returns += 1;
          catData.returnRevenue += returnItem.return_amount;
          catData.revenue -= returnItem.return_amount;
        }

        // Update store breakdown
        const originalBill = bills.find((bill) => bill.id === returnItem.bill_id);
        if (originalBill && data.stores.has(originalBill.storeName)) {
          const storeData = data.stores.get(originalBill.storeName)!;
          storeData.returns += 1;
          storeData.returnAmount += returnItem.return_amount;
          storeData.revenue -= returnItem.return_amount;
        }

        // Update hourly data for day period
        if (period === 'day') {
          const hour = returnDate.getHours();
          data.hourlyData[hour].returns += returnItem.return_amount;
          data.hourlyData[hour].revenue -= returnItem.return_amount;
        }
      }
    }
  });

  // Calculate net revenue and return rates
  return Array.from(grouped.values()).map((data) => ({
    ...data,
    netRevenue: data.revenue,
    returnRate: data.grossRevenue > 0 ? (data.returnAmount / data.grossRevenue) * 100 : 0,
    customers: data.customers.size, // Convert Set size to number
    avgBillValue: data.bills > 0 ? data.revenue / data.bills : 0,
    avgItemsPerBill: data.bills > 0 ? data.items / data.bills : 0,
    products: Array.from(data.products.values()).map((p) => ({
      ...p,
      returnRate: p.quantity > 0 ? (p.returns / p.quantity) * 100 : 0
    })),
    stores: Array.from(data.stores.values()).map((s) => ({ // Convert Map to Array
      name: s.name,
      revenue: s.revenue,
      bills: s.bills,
      items: s.items,
      returns: s.returns,
      returnAmount: s.returnAmount,
      returnRate: (s.revenue + s.returnAmount) > 0 ? (s.returnAmount / (s.revenue + s.returnAmount)) * 100 : 0
    })),
    categories: Array.from(data.categories.values()).map((c) => ({ // Convert Map to Array
      name: c.name,
      revenue: c.revenue,
      quantity: c.quantity,
      returns: c.returns,
      returnRevenue: c.returnRevenue,
      returnRate: (c.revenue + c.returnRevenue) > 0 ? (c.returnRevenue / (c.revenue + c.returnRevenue)) * 100 : 0
    })),
    paymentMethods: Array.from(data.paymentMethods.entries()).map(([method, amount]) => ({
      method,
      amount,
    })),
  }));
};

const exportAnalytics = async (options?: { sheets?: string[] }) => {
  setExporting(true);
  try {
    const XLSXMod = await import('xlsx');
    const XLSX = (XLSXMod as any).default ?? XLSXMod;

    if (!storeAnalytics.length && !productAnalytics.length) {
      throw new Error('No analytics data available to export');
    }

    const totalRevenue = Number(storeAnalytics.reduce((sum, store) => sum + store.totalRevenue, 0).toFixed(2));
    const totalBills = storeAnalytics.reduce((sum, store) => sum + store.totalBills, 0);
    const totalItems = storeAnalytics.reduce((sum, store) => sum + store.totalItems, 0);
    const averageBillValue = totalBills > 0 ? Number((totalRevenue / totalBills).toFixed(2)) : 0;

    // Define monthlyTrends for the summary sheet
    const monthlyTrends = revenueTrends.map(trend => ({
      month: trend.period, // Assuming 'period' from RevenueTrend can be used as 'month'
      revenue: trend.revenue,
      bills: trend.bills,
    }));

    const availableSheets = {
      summary: true,
      storeAnalytics: true,
      productAnalytics: true,
      topProducts: true,
      monthlyTrends: true,
      billDetails: true,
      productCatalog: true,
      inventoryValuation: true,
      productStoreMatrix: true,
      categoryAnalysis: true,
      slowMovingInventory: true,
      stockAlerts: true,
      productSalesHistory: true,
      customerAnalytics: true,
      returnDetails: true, // New sheet for return details
      // NEW TIME-BASED SHEETS
      dailyAnalysis: true,
      weeklyAnalysis: true,
      monthlyComparison: true,
      quarterlyAnalysis: true,
      yearlyOverview: true,
      dayOfWeekAnalysis: true,
      comparativeTrends: true
    };

    const sheetsToExport = options?.sheets
      ? Object.fromEntries(Object.entries(availableSheets).filter(([key]) => options.sheets!.includes(key)))
      : availableSheets;

    // Helper functions (keep existing ones)
    const styleHeaders = (ws: any, range: any) => {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: C });
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '4B0082' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
              top: { style: 'thin', color: { rgb: '000000' } },
              bottom: { style: 'thin', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: '000000' } },
              right: { style: 'thin', color: { rgb: '000000' } }
            }
          };
        }
      }
    };

    const autoSizeColumns = (ws: any, data: any[]) => {
      const colWidths = data.reduce((acc, row) => {
        Object.keys(row).forEach((key, i) => {
          const value = row[key] ? row[key].toString() : '';
          acc[i] = Math.max(acc[i] || 10, value.length + 2);
        });
        return acc;
      }, [] as number[]);
      ws['!cols'] = colWidths.map((w: number) => ({ wch: Math.min(w, 40) }));
    };

    const applyFormats = (ws: any, range: any, currencyCols: number[], percentCols: number[]) => {
      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        for (const col of currencyCols) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: col - 1 });
          if (ws[cellAddress]) {
            ws[cellAddress].z = '₹#,##0.00';
          }
        }
        for (const col of percentCols) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: col - 1 });
          if (ws[cellAddress]) {
            ws[cellAddress].z = '0.00%';
          }
        }
      }
    };

    const applyProfessionalStyling = (ws: any, range: any, headerRow: number = 0) => {
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) continue;

          if (!ws[cellAddress].s) ws[cellAddress].s = {};

          // Header styling
          if (R === headerRow) {
            ws[cellAddress].s = {
              font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
              fill: { fgColor: { rgb: '4F46E5' } },
              alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
              border: {
                top: { style: 'medium', color: { rgb: '000000' } },
                bottom: { style: 'medium', color: { rgb: '000000' } },
                left: { style: 'thin', color: { rgb: '000000' } },
                right: { style: 'thin', color: { rgb: '000000' } }
              }
            };
          } else {
            // Alternate row colors
            const bgColor = R % 2 === 0 ? 'FFFFFF' : 'F9FAFB';
            ws[cellAddress].s.fill = { fgColor: { rgb: bgColor } };
            ws[cellAddress].s.border = {
              top: { style: 'thin', color: { rgb: 'E5E7EB' } },
              bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
              left: { style: 'thin', color: { rgb: 'E5E7EB' } },
              right: { style: 'thin', color: { rgb: 'E5E7EB' } }
            };
          }
        }
      }
    };

    const wb = XLSX.utils.book_new();

    // ========== EXISTING SHEETS (keep your current implementation) ==========
    

    if (sheetsToExport.summary) {
      const summaryData: any[] = [
        // Main Header
        { 'A': '═══════════════════════════════════════════════════════════════════════', 'B': '', 'C': '', 'D': '' },
        { 'A': 'COMPREHENSIVE ANALYTICS REPORT', 'B': '', 'C': '', 'D': '' },
        { 'A': 'Store and Product Performance Dashboard', 'B': '', 'C': '', 'D': '' },
        { 'A': '═══════════════════════════════════════════════════════════════════════', 'B': '', 'C': '', 'D': '' },
        { 'A': '', 'B': '', 'C': '', 'D': '' },

        // Report Metadata Section
        { 'A': '📊 REPORT INFORMATION', 'B': '', 'C': '', 'D': '' },
        { 'A': '─────────────────────────────────────────────────────────────────────', 'B': '', 'C': '', 'D': '' },
        { 'A': 'Generated On:', 'B': format(new Date(), 'EEEE, MMMM dd, yyyy'), 'C': 'Time:', 'D': format(new Date(), 'hh:mm:ss a') },
        { 'A': 'Report Date:', 'B': selectedDate ? format(selectedDate, 'MMMM dd, yyyy') : 'All Time', 'C': 'Day:', 'D': selectedDate ? format(selectedDate, 'EEEE') : 'N/A' },
        { 'A': 'Selected Store:', 'B': selectedStore === 'all' ? '🏪 All Stores' : `🏪 ${stores.find(s => s.id === selectedStore)?.name || 'All Stores'}`, 'C': 'Store Count:', 'D': storeAnalytics.length },
        { 'A': 'Selected Product:', 'B': selectedProduct === 'all' ? '📦 All Products' : `📦 ${products.find(p => p.id === selectedProduct)?.name || 'All Products'}`, 'C': 'Product Count:', 'D': productAnalytics.length },
        { 'A': '', 'B': '', 'C': '', 'D': '' },

        // Key Performance Indicators
        { 'A': '💰 KEY PERFORMANCE INDICATORS', 'B': '', 'C': '', 'D': '' },
        { 'A': '─────────────────────────────────────────────────────────────────────', 'B': '', 'C': '', 'D': '' },
        { 'A': 'Metric', 'B': 'Value', 'C': 'Metric', 'D': 'Value' },
      ];

      // Calculate additional KPIs
      const avgItemsPerBill = totalBills > 0 ? Number((totalItems / totalBills).toFixed(2)) : 0;
      const avgRevenuePerStore = storeAnalytics.length > 0 ? Number((totalRevenue / storeAnalytics.length).toFixed(2)) : 0;
      const avgRevenuePerProduct = productAnalytics.length > 0 ? Number((totalRevenue / productAnalytics.length).toFixed(2)) : 0;
      
      // Stock metrics
      const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
      const totalStockValue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.price || 0)), 0);
      const outOfStockCount = products.filter(p => (p.stock || 0) === 0).length;
      const lowStockCount = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) < 10).length;

      // Top performers
      const topStore = storeAnalytics.length > 0 ? storeAnalytics.reduce((max, store) => store.totalRevenue > max.totalRevenue ? store : max) : null;
      const topProduct = productAnalytics.length > 0 ? productAnalytics.reduce((max, product) => product.totalRevenue > max.totalRevenue ? product : max) : null;

      summaryData.push(
        { 'A': '💵 Total Revenue', 'B': totalRevenue, 'C': '🧾 Total Bills', 'D': totalBills },
        { 'A': '📊 Average Bill Value', 'B': averageBillValue, 'C': '📦 Total Items Sold', 'D': totalItems },
        { 'A': '🏪 Total Stores', 'B': storeAnalytics.length, 'C': '📋 Products Available', 'D': productAnalytics.length },
        { 'A': '📈 Avg Items/Bill', 'B': avgItemsPerBill, 'C': '💰 Avg Revenue/Store', 'D': avgRevenuePerStore },
        { 'A': '📦 Avg Revenue/Product', 'B': avgRevenuePerProduct, 'C': '', 'D': '' },
        { 'A': '↩️ Total Refund Amount', 'B': totalRefundAmount.toFixed(2), 'C': '📦 Total Returned Items', 'D': totalReturnedItems }, // New row for returns
        { 'A': '', 'B': '', 'C': '', 'D': '' },

        // Inventory Status
        { 'A': '📦 INVENTORY STATUS', 'B': '', 'C': '', 'D': '' },
        { 'A': '─────────────────────────────────────────────────────────────────────', 'B': '', 'C': '', 'D': '' },
        { 'A': 'Metric', 'B': 'Value', 'C': 'Metric', 'D': 'Value' },
        { 'A': '📊 Total Stock Units', 'B': totalStock, 'C': '💰 Total Stock Value', 'D': totalStockValue.toFixed(2) },
        { 'A': '❌ Out of Stock', 'B': outOfStockCount, 'C': '⚠️ Low Stock Alert', 'D': lowStockCount },
        { 'A': '✅ In Stock Products', 'B': products.length - outOfStockCount, 'C': '📦 Active Products', 'D': products.filter(p => (p.stock || 0) > 0).length },
        { 'A': '', 'B': '', 'C': '', 'D': '' }
      );

      // Top Performers Section
      if (topStore || topProduct) {
        summaryData.push(
          { 'A': '🏆 TOP PERFORMERS', 'B': '', 'C': '', 'D': '' },
          { 'A': '─────────────────────────────────────────────────────────────────────', 'B': '', 'C': '', 'D': '' }
        );

        if (topStore) {
          const topStoreName = stores.find(s => s.id === topStore.storeId)?.name || 'Unknown';
          summaryData.push(
            { 'A': '🥇 Best Performing Store', 'B': topStoreName, 'C': 'Revenue', 'D': topStore.totalRevenue.toFixed(2) },
            { 'A': '', 'B': `Bills: ${topStore.totalBills}`, 'C': 'Items Sold', 'D': topStore.totalItems }
          );
        }

        if (topProduct) {
          const topProductName = products.find(p => p.id === topProduct.productId)?.name || 'Unknown';
          summaryData.push(
            { 'A': '🥇 Best Selling Product', 'B': topProductName, 'C': 'Revenue', 'D': topProduct.totalRevenue.toFixed(2) },
            { 'A': '', 'B': `Quantity Sold: ${topProduct.totalQuantitySold}`, 'C': 'Bills', 'D': topProduct.totalBills }
          );
        }

        summaryData.push({ 'A': '', 'B': '', 'C': '', 'D': '' });
      }

      // Category Breakdown
      if (categoryBreakdown.length > 0) {
        summaryData.push(
          { 'A': '📂 CATEGORY BREAKDOWN', 'B': '', 'C': '', 'D': '' },
          { 'A': '─────────────────────────────────────────────────────────────────────', 'B': '', 'C': '', 'D': '' },
          { 'A': 'Category', 'B': 'Revenue', 'C': 'Quantity', 'D': 'Revenue %' }
        );

        categoryBreakdown.slice(0, 5).forEach(cat => {
          summaryData.push({
            'A': `📁 ${cat.category}`,
            'B': cat.revenue.toFixed(2),
            'C': cat.quantity,
            'D': `${cat.revenuePercentage.toFixed(1)}%`
          });
        });

        summaryData.push({ 'A': '', 'B': '', 'C': '', 'D': '' });
      }

      // Sales Trend (if monthly data available)
      if (monthlyTrends.length > 0) {
        const currentMonth = monthlyTrends[monthlyTrends.length - 1];
        const previousMonth = monthlyTrends.length > 1 ? monthlyTrends[monthlyTrends.length - 2] : null;
        
        summaryData.push(
          { 'A': '📈 SALES TRENDS', 'B': '', 'C': '', 'D': '' },
          { 'A': '─────────────────────────────────────────────────────────────────────', 'B': '', 'C': '', 'D': '' }
        );

        if (currentMonth) {
          summaryData.push(
            { 'A': 'Current Period Revenue', 'B': currentMonth.revenue.toFixed(2), 'C': 'Bills', 'D': currentMonth.bills }
          );
        }

        if (previousMonth && currentMonth) {
          const growthRate = previousMonth.revenue > 0 
            ? ((currentMonth.revenue - previousMonth.revenue) / previousMonth.revenue * 100).toFixed(2)
            : '0.00';
          const growthIcon = Number(growthRate) >= 0 ? '📈' : '📉';
          
          summaryData.push(
            { 'A': 'Previous Period Revenue', 'B': previousMonth.revenue.toFixed(2), 'C': 'Bills', 'D': previousMonth.bills },
            { 'A': `${growthIcon} Growth Rate`, 'B': `${growthRate}%`, 'C': 'Status', 'D': Number(growthRate) >= 0 ? '✅ Positive' : '⚠️ Negative' }
          );
        }

        summaryData.push({ 'A': '', 'B': '', 'C': '', 'D': '' });
      }

      // Footer
      summaryData.push(
        { 'A': '─────────────────────────────────────────────────────────────────────', 'B': '', 'C': '', 'D': '' },
        { 'A': '📋 Report Contains:', 'B': `${Object.keys(sheetsToExport).length} Detailed Sheets`, 'C': 'Data Source:', 'D': 'Store Billing System' },
        { 'A': '🔒 Confidential', 'B': 'Internal Use Only', 'C': 'Version:', 'D': '2.0' },
        { 'A': '─────────────────────────────────────────────────────────────────────', 'B': '', 'C': '', 'D': '' }
      );

      // Create worksheet
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData.map(row => [row.A, row.B, row.C, row.D]));

      // Set column widths
      summaryWs['!cols'] = [
        { wch: 30 }, // Column A
        { wch: 25 }, // Column B
        { wch: 20 }, // Column C
        { wch: 20 }  // Column D
      ];

      // Merge cells for headers
      if (!summaryWs['!merges']) summaryWs['!merges'] = [];
      summaryWs['!merges'].push(
        { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }, // Main title
        { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }, // Subtitle
        { s: { r: 5, c: 0 }, e: { r: 5, c: 3 } }, // Report Info header
        { s: { r: 12, c: 0 }, e: { r: 12, c: 3 } }, // KPI header
        { s: { r: 20, c: 0 }, e: { r: 20, c: 3 } }  // Inventory header
      );

      // Apply custom styling
      const range = XLSX.utils.decode_range(summaryWs['!ref'] || 'A1:D50');
      
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!summaryWs[cellAddress]) continue;

          // Initialize cell style
          if (!summaryWs[cellAddress].s) summaryWs[cellAddress].s = {};

          // Main title styling (row 2)
          if (R === 1) {
            summaryWs[cellAddress].s = {
              font: { bold: true, sz: 18, color: { rgb: 'FFFFFF' } },
              fill: { fgColor: { rgb: '1E3A8A' } },
              alignment: { horizontal: 'center', vertical: 'center' }
            };
          }

          // Subtitle styling (row 3)
          if (R === 2) {
            summaryWs[cellAddress].s = {
              font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
              fill: { fgColor: { rgb: '3B82F6' } },
              alignment: { horizontal: 'center', vertical: 'center' }
            };
          }

          // Section headers (with emojis)
          if (summaryWs[cellAddress].v && typeof summaryWs[cellAddress].v === 'string' && 
              (summaryWs[cellAddress].v.includes('📊') || summaryWs[cellAddress].v.includes('💰') || 
               summaryWs[cellAddress].v.includes('📦') || summaryWs[cellAddress].v.includes('🏆') ||
               summaryWs[cellAddress].v.includes('📂') || summaryWs[cellAddress].v.includes('📈'))) {
            summaryWs[cellAddress].s = {
              font: { bold: true, sz: 14, color: { rgb: '1E3A8A' } },
              fill: { fgColor: { rgb: 'DBEAFE' } },
              alignment: { horizontal: 'left', vertical: 'center' }
            };
          }

          // Table headers
          if ((R === 14 || R === 22) && (summaryWs[cellAddress].v === 'Metric' || summaryWs[cellAddress].v === 'Value')) {
            summaryWs[cellAddress].s = {
              font: { bold: true, color: { rgb: 'FFFFFF' } },
              fill: { fgColor: { rgb: '6366F1' } },
              alignment: { horizontal: 'center', vertical: 'center' }
            };
          }

          // Currency formatting for value columns
          if ((C === 1 || C === 3) && R > 14 && typeof summaryWs[cellAddress].v === 'number') {
            summaryWs[cellAddress].z = '₹#,##0.00';
          }

          // Add borders to data cells
          if (R > 5 && R < range.e.r - 3) {
            if (!summaryWs[cellAddress].s) summaryWs[cellAddress].s = {};
            summaryWs[cellAddress].s.border = {
              top: { style: 'thin', color: { rgb: 'E5E7EB' } },
              bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
              left: { style: 'thin', color: { rgb: 'E5E7EB' } },
              right: { style: 'thin', color: { rgb: 'E5E7EB' } }
            };
          }
        }
      }

      // Set row heights
      summaryWs['!rows'] = Array(summaryData.length).fill({ hpt: 20 });
      summaryWs['!rows'][1] = { hpt: 35 }; // Main title
      summaryWs['!rows'][2] = { hpt: 25 }; // Subtitle

      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
    }

    // Store Analytics, Product Analytics, Top Products, Monthly Trends, Bill Details
    // (Keep your existing implementations for these sheets)

    // Store Analytics Sheet
    if (sheetsToExport.storeAnalytics) {
      const storeData = storeAnalytics.map((store) => ({
        "Store Name": store.storeName,
        "Total Revenue": Number(store.totalRevenue.toFixed(2)),
        "Total Bills": store.totalBills,
        "Total Items Sold": store.totalItems,
        "Average Bill Value": Number(store.averageBillValue.toFixed(2)),
        "Revenue Growth %": store.revenueGrowth / 100,
        "Bills Growth %": store.billsGrowth / 100,
        "Total Refund Amount": Number(store.totalRefundAmount.toFixed(2)), // New field
        "Total Returned Items": store.totalReturnedItems, // New field
        "Status": store.totalBills === 0 ? "No Activity" : "Active",
      }))

      const storeWs = XLSX.utils.json_to_sheet(storeData)
      autoSizeColumns(storeWs, storeData)
      applyProfessionalStyling(storeWs, XLSX.utils.decode_range(storeWs["!ref"] || "A1:J1"))
      applyFormats(storeWs, XLSX.utils.decode_range(storeWs["!ref"] || "A1:J1"), [2, 5, 8], [6, 7])
      storeWs["!freeze"] = { xSplit: 0, ySplit: 1 }
      XLSX.utils.book_append_sheet(wb, storeWs, "Store Analytics")
    }

    // Product Analytics Sheet
    if (sheetsToExport.productAnalytics) {
      const productData = productAnalytics.map((product) => ({
        "Product Name": product.productName,
        "Total Quantity Sold": product.totalQuantitySold,
        "Total Revenue": Number(product.totalRevenue.toFixed(2)),
        "Average Price": Number(product.averagePrice.toFixed(2)),
        "Total Bills": product.totalBills,
        "Quantity Growth %": product.quantityGrowth / 100,
        "Revenue Growth %": product.revenueGrowth / 100,
        "Total Returned Quantity": product.totalReturnedQuantity, // New field
        "Total Refund Amount": Number(product.totalRefundAmount.toFixed(2)), // New field
        "Top Store": product.topStores[0]?.storeName || "N/A",
      }))

      const productWs = XLSX.utils.json_to_sheet(productData)
      autoSizeColumns(productWs, productData)
      applyProfessionalStyling(productWs, XLSX.utils.decode_range(productWs["!ref"] || "A1:J1"))
      applyFormats(productWs, XLSX.utils.decode_range(productWs["!ref"] || "A1:J1"), [3, 4, 9], [6, 7])
      productWs["!freeze"] = { xSplit: 0, ySplit: 1 }
      XLSX.utils.book_append_sheet(wb, productWs, "Product Analytics")
    }

    // Top Products Sheet
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
      applyProfessionalStyling(topProductsWs, XLSX.utils.decode_range(topProductsWs["!ref"] || "A1:E1"))
      applyFormats(topProductsWs, XLSX.utils.decode_range(topProductsWs["!ref"] || "A1:E1"), [5], [])
      topProductsWs["!freeze"] = { xSplit: 0, ySplit: 1 }
      XLSX.utils.book_append_sheet(wb, topProductsWs, "Top Products by Store")
    }

    // Monthly Trends Sheet
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
      applyProfessionalStyling(monthlyTrendWs, XLSX.utils.decode_range(monthlyTrendWs["!ref"] || "A1:D1"))
      applyFormats(monthlyTrendWs, XLSX.utils.decode_range(monthlyTrendWs["!ref"] || "A1:D1"), [3], [])
      monthlyTrendWs["!freeze"] = { xSplit: 0, ySplit: 1 }
      XLSX.utils.book_append_sheet(wb, monthlyTrendWs, "Monthly Trends")
    }

    // Bill Details Sheet
    if (sheetsToExport.billDetails) {
      const billDetailsData = filterBillsByDate(bills).map((bill: Bill) => ({
        "Bill ID": bill.id,
        "Store Name": bill.storeName,
        "Customer Name": bill.customerName || "N/A",
        "Date": format(new Date(bill.timestamp || bill.createdAt), "yyyy-MM-dd HH:mm:ss"),
        "Items": bill.items.map((item: { productName: string; quantity: number }) => `${item.productName} (Qty: ${item.quantity})`).join(", "),
        "Subtotal": Number((bill.subtotal || 0).toFixed(2)),
        "Tax": Number((bill.taxAmount || 0).toFixed(2)),
        "Discount": Number((bill.discountAmount || 0).toFixed(2)),
        "Total": Number((bill.total || 0).toFixed(2)),
        "Created By": bill.createdBy,
      }))

      const billDetailsWs = XLSX.utils.json_to_sheet(billDetailsData)
      autoSizeColumns(billDetailsWs, billDetailsData)
      applyProfessionalStyling(billDetailsWs, XLSX.utils.decode_range(billDetailsWs["!ref"] || "A1:J1"))
      applyFormats(billDetailsWs, XLSX.utils.decode_range(billDetailsWs["!ref"] || "A1:J1"), [6, 7, 8, 9], [])
      billDetailsWs["!freeze"] = { xSplit: 0, ySplit: 1 }
      XLSX.utils.book_append_sheet(wb, billDetailsWs, "Bill Details")
    }

    // ========== NEW ENHANCED SHEETS ==========

    // 1. Complete Product Catalog
    if (sheetsToExport.productCatalog) {
      const productCatalogData = products.map(product => {
        const analytics = productAnalytics.find(p => p.productId === product.id);
        return {
          'Product ID': product.id,
          'Product Name': product.name,
          'Category': product.category || 'Uncategorized',
          'Price': Number(product.price || 0).toFixed(2),
          'Current Stock': product.stock || 0,
          'Stock Value': Number((product.price || 0) * (product.stock || 0)).toFixed(2),
          'Assigned Store': stores.find(s => s.id === product.assignedStoreId)?.name || 'Unassigned',
          'Total Sold': analytics?.totalQuantitySold || 0,
          'Total Revenue': Number(analytics?.totalRevenue || 0).toFixed(2),
          'Total Bills': analytics?.totalBills || 0,
          'Avg Price': Number(analytics?.averagePrice || product.price || 0).toFixed(2),
          'Stock Status': (product.stock || 0) === 0 ? 'Out of Stock' : (product.stock || 0) < 10 ? 'Low Stock' : 'In Stock'
        };
      });

      const catalogWs = XLSX.utils.json_to_sheet(productCatalogData);
      autoSizeColumns(catalogWs, productCatalogData);
      applyProfessionalStyling(catalogWs, XLSX.utils.decode_range(catalogWs['!ref'] || 'A1:L1'));
      applyFormats(catalogWs, XLSX.utils.decode_range(catalogWs['!ref'] || 'A1:L1'), [4, 6, 9, 11], []);
      catalogWs['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, catalogWs, 'Product Catalog');
    }

    // 2. Inventory Valuation
    if (sheetsToExport.inventoryValuation && inventoryHealth) {
      const inventoryData = [
        { 'Metric': 'Total Products', 'Value': inventoryHealth.summary.totalProducts },
        { 'Metric': 'Total Inventory Value', 'Value': inventoryHealth.summary.totalInventoryValue.toFixed(2) },
        { 'Metric': 'Average Turnover Ratio', 'Value': inventoryHealth.summary.averageTurnover.toFixed(2) },
        { 'Metric': 'Slow Moving Items', 'Value': inventoryHealth.summary.slowMovingCount },
        { 'Metric': 'Out of Stock Items', 'Value': inventoryHealth.summary.outOfStockCount },
        { 'Metric': '', 'Value': '' },
        ...products.map(product => ({
          'Product Name': product.name,
          'Category': product.category || 'Uncategorized',
          'Current Stock': product.stock || 0,
          'Unit Price': Number(product.price || 0).toFixed(2),
          'Stock Value': Number((product.price || 0) * (product.stock || 0)).toFixed(2),
          'Store': stores.find(s => s.id === product.assignedStoreId)?.name || 'Unassigned'
        }))
      ];

      const inventoryWs = XLSX.utils.json_to_sheet(inventoryData);
      autoSizeColumns(inventoryWs, inventoryData);
      applyProfessionalStyling(inventoryWs, XLSX.utils.decode_range('A1:F1'));
      applyFormats(inventoryWs, XLSX.utils.decode_range(inventoryWs['!ref'] || 'A1:F1'), [4, 5], []);
      inventoryWs['!freeze'] = { xSplit: 0, ySplit: 6 };
      XLSX.utils.book_append_sheet(wb, inventoryWs, 'Inventory Valuation');
    }

    // 3. Product-Store Assignment Matrix
    if (sheetsToExport.productStoreMatrix) {
      const matrixData: any[] = [];
      
      stores.forEach(store => {
        const storeProducts = products.filter(p => p.assignedStoreId === store.id);
        const storeRevenue = storeAnalytics.find(s => s.storeId === store.id);
        
        storeProducts.forEach(product => {
          const productSales = productAnalytics.find(p => p.productId === product.id);
          const storeSpecificSales = productSales?.topStores.find(s => s.storeId === store.id);
          
          matrixData.push({
            'Store Name': store.name,
            'Product Name': product.name,
            'Category': product.category || 'Uncategorized',
            'Current Stock': product.stock || 0,
            'Price': Number(product.price || 0).toFixed(2),
            'Quantity Sold': storeSpecificSales?.quantity || 0,
            'Revenue Generated': Number(storeSpecificSales?.revenue || 0).toFixed(2),
            'Stock Value': Number((product.price || 0) * (product.stock || 0)).toFixed(2)
          });
        });
      });

      const matrixWs = XLSX.utils.json_to_sheet(matrixData);
      autoSizeColumns(matrixWs, matrixData);
      applyProfessionalStyling(matrixWs, XLSX.utils.decode_range(matrixWs['!ref'] || 'A1:H1'));
      applyFormats(matrixWs, XLSX.utils.decode_range(matrixWs['!ref'] || 'A1:H1'), [5, 7, 8], []);
      matrixWs['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, matrixWs, 'Product-Store Matrix');
    }

    // 4. Category Performance Analysis
    if (sheetsToExport.categoryAnalysis && categoryBreakdown.length > 0) {
      const categoryData = categoryBreakdown.map(cat => ({
        'Category': cat.category,
        'Total Revenue': Number(cat.revenue).toFixed(2),
        'Quantity Sold': cat.quantity,
        'Bills Count': cat.billsCount,
        'Average Price': Number(cat.averagePrice).toFixed(2),
        'Revenue %': Number(cat.revenuePercentage).toFixed(2) + '%',
        'Product Count': products.filter(p => p.category === cat.category).length
      }));

      const categoryWs = XLSX.utils.json_to_sheet(categoryData);
      autoSizeColumns(categoryWs, categoryData);
      applyProfessionalStyling(categoryWs, XLSX.utils.decode_range(categoryWs['!ref'] || 'A1:G1'));
      applyFormats(categoryWs, XLSX.utils.decode_range(categoryWs['!ref'] || 'A1:G1'), [2, 5], []);
      categoryWs['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, categoryWs, 'Category Analysis');
    }

    // 5. Slow Moving Inventory
    if (sheetsToExport.slowMovingInventory && inventoryHealth) {
      const slowMovingData = inventoryHealth.slowMoving.map(item => ({
        'Product Name': item.productName,
        'Barcode': item.barcode || 'N/A',
        'Current Stock': item.currentStock,
        'Stock Value': Number(item.stockValue).toFixed(2),
        'Quantity Sold': item.soldQuantity,
        'Turnover Ratio': Number(item.turnoverRatio).toFixed(2),
        'Days of Stock': item.daysOfStock === 999 ? 'Infinite' : item.daysOfStock.toString(),
        'Recommendation': item.turnoverRatio < 0.1 ? 'Consider Discount' : 'Monitor Closely'
      }));

      const slowWs = XLSX.utils.json_to_sheet(slowMovingData);
      autoSizeColumns(slowWs, slowMovingData);
      applyProfessionalStyling(slowWs, XLSX.utils.decode_range(slowWs['!ref'] || 'A1:H1'));
      applyFormats(slowWs, XLSX.utils.decode_range(slowWs['!ref'] || 'A1:H1'), [4], []);
      slowWs['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, slowWs, 'Slow Moving Inventory');
    }

    // 6. Stock Alerts
    if (sheetsToExport.stockAlerts) {
      const stockAlertsData: any[] = [];
      
      // Out of Stock
      products.filter(p => (p.stock || 0) === 0).forEach(product => {
        stockAlertsData.push({
          'Alert Type': 'OUT OF STOCK',
          'Product Name': product.name,
          'Category': product.category || 'Uncategorized',
          'Current Stock': 0,
          'Price': Number(product.price || 0).toFixed(2),
          'Assigned Store': stores.find(s => s.id === product.assignedStoreId)?.name || 'Unassigned',
          'Priority': 'CRITICAL'
        });
      });

      // Low Stock
      products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) < 10).forEach(product => {
        stockAlertsData.push({
          'Alert Type': 'LOW STOCK',
          'Product Name': product.name,
          'Category': product.category || 'Uncategorized',
          'Current Stock': product.stock,
          'Price': Number(product.price || 0).toFixed(2),
          'Assigned Store': stores.find(s => s.id === product.assignedStoreId)?.name || 'Unassigned',
          'Priority': 'HIGH'
        });
      });

      const alertsWs = XLSX.utils.json_to_sheet(stockAlertsData);
      autoSizeColumns(alertsWs, stockAlertsData);
      applyProfessionalStyling(alertsWs, XLSX.utils.decode_range(alertsWs['!ref'] || 'A1:G1'));
      applyFormats(alertsWs, XLSX.utils.decode_range(alertsWs['!ref'] || 'A1:G1'), [5], []);
      alertsWs['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, alertsWs, 'Stock Alerts');
    }

    // 7. Product Sales History (Detailed)
    if (sheetsToExport.productSalesHistory) {
      const salesHistoryData: any[] = [];
      
      filterBillsByDate(bills).forEach(bill => {
        bill.items.forEach(item => {
          const product = products.find(p => p.id === item.productId);
          salesHistoryData.push({
            'Date': format(new Date(bill.timestamp || bill.createdAt), 'yyyy-MM-dd HH:mm:ss'),
            'Bill ID': bill.id,
            'Product Name': item.productName,
            'Category': product?.category || 'Unknown',
            'Quantity': item.quantity,
            'Unit Price': Number(item.price).toFixed(2),
            'Total': Number(item.total).toFixed(2),
            'Store': bill.storeName,
            'Customer': bill.customerName || 'Walk-in',
            'Created By': bill.createdBy
          });
        });
      });

      const historyWs = XLSX.utils.json_to_sheet(salesHistoryData);
      autoSizeColumns(historyWs, salesHistoryData);
      applyProfessionalStyling(historyWs, XLSX.utils.decode_range(historyWs['!ref'] || 'A1:J1'));
      applyFormats(historyWs, XLSX.utils.decode_range(historyWs['!ref'] || 'A1:J1'), [6, 7], []);
      historyWs['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, historyWs, 'Product Sales History');
    }

    // 8. Customer Analytics
    if (sheetsToExport.customerAnalytics) {
      const customerMap = new Map<string, any>();
      
      filterBillsByDate(bills).forEach(bill => {
        const phone = bill.customerPhone || 'Walk-in';
        const name = bill.customerName || 'Walk-in Customer';
        
        if (!customerMap.has(phone)) {
          customerMap.set(phone, {
            name,
            phone,
            totalBills: 0,
            totalSpent: 0,
            totalItems: 0,
            firstPurchase: bill.timestamp || bill.createdAt,
            lastPurchase: bill.timestamp || bill.createdAt
          });
        }
        
        const customer = customerMap.get(phone)!;
        customer.totalBills += 1;
        customer.totalSpent += bill.total;
        customer.totalItems += bill.items.reduce((sum, item) => sum + item.quantity, 0);
        customer.lastPurchase = bill.timestamp || bill.createdAt;
      });

      const customerData = Array.from(customerMap.values()).map(customer => ({
        'Customer Name': customer.name,
        'Phone': customer.phone,
        'Total Bills': customer.totalBills,
        'Total Spent': Number(customer.totalSpent).toFixed(2),
        'Total Items': customer.totalItems,
        'Avg Bill Value': Number(customer.totalSpent / customer.totalBills).toFixed(2),
        'First Purchase': format(new Date(customer.firstPurchase), 'yyyy-MM-dd'),
        'Last Purchase': format(new Date(customer.lastPurchase), 'yyyy-MM-dd'),
        'Customer Type': customer.totalBills > 5 ? 'Loyal' : customer.totalBills > 2 ? 'Regular' : 'New'
      }));

      customerData.sort((a, b) => Number(b['Total Spent']) - Number(a['Total Spent']));

      const customerWs = XLSX.utils.json_to_sheet(customerData);
      autoSizeColumns(customerWs, customerData);
      applyProfessionalStyling(customerWs, XLSX.utils.decode_range(customerWs['!ref'] || 'A1:I1'));
      applyFormats(customerWs, XLSX.utils.decode_range(customerWs['!ref'] || 'A1:I1'), [4, 6], []);
      customerWs['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, customerWs, 'Customer Analytics');
    }

    // 9. Return Details Sheet
    if (sheetsToExport.returnDetails) {
      const returnDetailsData = returns.map(returnItem => ({
        'Return ID': returnItem.return_id,
        'Bill ID': returnItem.bill_id,
        'Product Name': returnItem.product_name,
        'Product ID': returnItem.product_id,
        'Customer Name': returnItem.customer_name,
        'Customer Phone': returnItem.customer_phone_number,
        'Return Amount': Number(returnItem.return_amount).toFixed(2),
        'Refund Method': returnItem.refund_method,
        'Status': returnItem.status,
        'Message': returnItem.message,
        'Created By': returnItem.created_by,
        'Created At': format(new Date(returnItem.created_at), 'yyyy-MM-dd HH:mm:ss'),
      }));

      const returnWs = XLSX.utils.json_to_sheet(returnDetailsData);
      autoSizeColumns(returnWs, returnDetailsData);
      applyProfessionalStyling(returnWs, XLSX.utils.decode_range(returnWs['!ref'] || 'A1:L1'));
      applyFormats(returnWs, XLSX.utils.decode_range(returnWs['!ref'] || 'A1:L1'), [7], []);
      returnWs['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, returnWs, 'Return Details');
    }

    // ========== DAILY ANALYSIS SHEET ==========
    if (sheetsToExport.dailyAnalysis !== false) {
      const dailyData = aggregateByPeriod(filterBillsByDate(bills), 'day', products, returns);
      
      const dailyExportData: any[] = [];
      
      dailyData.sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime()).forEach(day => {
        // Day Summary Header
        dailyExportData.push({
          'A': `📅 ${day.displayName}`,
          'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': ''
        });
        
        // Key Metrics
        dailyExportData.push({
          'A': 'Revenue',
          'B': day.revenue.toFixed(2),
          'C': 'Bills',
          'D': day.bills,
          'E': 'Items Sold',
          'F': day.items,
          'G': ''
        });
        
        dailyExportData.push({
          'A': 'Avg Bill Value',
          'B': day.avgBillValue.toFixed(2),
          'C': 'Avg Items/Bill',
          'D': day.avgItemsPerBill.toFixed(2),
          'E': 'Unique Customers',
          'F': day.customers,
          'G': ''
        });
        
        dailyExportData.push({ 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '' });
        
        // Hourly Breakdown
        dailyExportData.push({
          'A': '⏰ Hourly Breakdown',
          'B': 'Revenue',
          'C': 'Bills',
          'D': 'Avg Bill',
          'E': '', 'F': '', 'G': ''
        });
        
        day.hourlyData.forEach((hourData: any, hour: number) => {
          if (hourData.bills > 0) {
            dailyExportData.push({
              'A': `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1).toString().padStart(2, '0')}:00`,
              'B': hourData.revenue.toFixed(2),
              'C': hourData.bills,
              'D': (hourData.revenue / hourData.bills).toFixed(2),
              'E': '', 'F': '', 'G': ''
            });
          }
        });
        
        dailyExportData.push({ 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '' });
        
        // Top Products of the Day
        dailyExportData.push({
          'A': '🏆 Top Products',
          'B': 'Quantity',
          'C': 'Revenue',
          'D': 'Category',
          'E': '', 'F': '', 'G': ''
        });
        
        Array.from(day.products.values()).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 5).forEach((product: any) => {
          dailyExportData.push({
            'A': product.name,
            'B': product.quantity,
            'C': product.revenue.toFixed(2),
            'D': product.category,
            'E': '', 'F': '', 'G': ''
          });
        });
        
        dailyExportData.push({ 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '' });
        
        // Store Performance
        dailyExportData.push({
          'A': '🏪 Store Performance',
          'B': 'Revenue',
          'C': 'Bills',
          'D': 'Items',
          'E': 'Avg Bill',
          'F': '', 'G': ''
        });
        
        Array.from(day.stores.values()).forEach((store: any) => {
          dailyExportData.push({
            'A': store.name,
            'B': store.revenue.toFixed(2),
            'C': store.bills,
            'D': store.items,
            'E': (store.revenue / store.bills).toFixed(2),
            'F': '', 'G': ''
          });
        });
        
        dailyExportData.push({ 'A': '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '' });
        dailyExportData.push({ 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '' });
      });
      
      const dailyWs = XLSX.utils.aoa_to_sheet(dailyExportData.map(row => [row.A, row.B, row.C, row.D, row.E, row.F, row.G]));
      dailyWs['!cols'] = [
        { wch: 35 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }
      ];
      applyFormats(dailyWs, XLSX.utils.decode_range(dailyWs['!ref'] || 'A1:G1'), [2, 3, 5], []);
      XLSX.utils.book_append_sheet(wb, dailyWs, 'Daily Analysis');
    }

    // ========== WEEKLY ANALYSIS SHEET ==========
    if (sheetsToExport.weeklyAnalysis !== false) {
      const weeklyData = aggregateByPeriod(filterBillsByDate(bills), 'week', products, returns);
      
      const weeklyExportData = weeklyData.map((week, index) => {
        const prevWeek = index > 0 ? weeklyData[index - 1] : null;
        const growth = prevWeek ? ((week.revenue - prevWeek.revenue) / prevWeek.revenue * 100) : 0;
        
        return {
          'Week Period': week.period,
          'Revenue': week.revenue.toFixed(2),
          'Bills': week.bills,
          'Items Sold': week.items,
          'Customers': week.customers,
          'Avg Bill': week.avgBillValue.toFixed(2),
          'Growth %': growth.toFixed(2),
          'Top Product': Array.from(week.products.values()).sort((a: any, b: any) => b.revenue - a.revenue)[0]?.name || 'N/A',
          'Top Category': Array.from(week.categories.values()).sort((a: any, b: any) => b.revenue - a.revenue)[0]?.name || 'N/A'
        };
      });
      
      const weeklyWs = XLSX.utils.json_to_sheet(weeklyExportData);
      autoSizeColumns(weeklyWs, weeklyExportData);
      styleHeaders(weeklyWs, XLSX.utils.decode_range(weeklyWs['!ref'] || 'A1:I1'));
      applyFormats(weeklyWs, XLSX.utils.decode_range(weeklyWs['!ref'] || 'A1:I1'), [2, 6], [7]);
      weeklyWs['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, weeklyWs, 'Weekly Analysis');
    }

    // ========== MONTHLY COMPARISON SHEET ==========
    if (sheetsToExport.monthlyComparison !== false) {
      const monthlyData = aggregateByPeriod(filterBillsByDate(bills), 'month', products, returns);
      
      const monthlyExportData: any[] = [
        { 'A': '📊 MONTHLY PERFORMANCE COMPARISON', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '', 'H': '' },
        { 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '', 'H': '' },
        {
          'A': 'Month',
          'B': 'Revenue',
          'C': 'Bills',
          'D': 'Items',
          'E': 'Customers',
          'F': 'Avg Bill',
          'G': 'MoM Growth',
          'H': 'Status'
        }
      ];
      
      monthlyData.sort((a, b) => a.period.localeCompare(b.period)).forEach((month, index) => {
        const prevMonth = index > 0 ? monthlyData[index - 1] : null;
        const growth = prevMonth ? ((month.revenue - prevMonth.revenue) / prevMonth.revenue * 100) : 0;
        const status = growth >= 0 ? '📈 Up' : '📉 Down';
        
        monthlyExportData.push({
          'A': month.displayName,
          'B': month.revenue.toFixed(2),
          'C': month.bills,
          'D': month.items,
          'E': month.customers,
          'F': month.avgBillValue.toFixed(2),
          'G': `${growth.toFixed(2)}%`,
          'H': status
        });
        
        // Add detailed breakdown
        monthlyExportData.push({ 'A': '  Top 3 Products:', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '', 'H': '' });
        Array.from(month.products.values()).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 3).forEach((product: any, i: number) => {
          monthlyExportData.push({
            'A': `    ${i + 1}. ${product.name}`,
            'B': product.revenue.toFixed(2),
            'C': `Qty: ${product.quantity}`,
            'D': product.category,
            'E': '', 'F': '', 'G': '', 'H': ''
          });
        });
        
        monthlyExportData.push({ 'A': '  Store Performance:', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '', 'H': '' });
        Array.from(month.stores.values()).forEach((store: any) => {
          monthlyExportData.push({
            'A': `    ${store.name}`,
            'B': store.revenue.toFixed(2),
            'C': store.bills,
            'D': store.items,
            'E': '', 'F': '', 'G': '', 'H': ''
          });
        });
        
        monthlyExportData.push({ 'A': '─────────────────────────────────────────────────', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '', 'H': '' });
      });
      
      // Add summary statistics
      monthlyExportData.push({ 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '', 'H': '' });
      monthlyExportData.push({ 'A': '📈 SUMMARY STATISTICS', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '', 'H': '' });
      
      const totalRevenue = monthlyData.reduce((sum, m) => sum + m.revenue, 0);
      const avgMonthlyRevenue = totalRevenue / monthlyData.length;
      const bestMonth = monthlyData.reduce((max, m) => m.revenue > max.revenue ? m : max);
      const worstMonth = monthlyData.reduce((min, m) => m.revenue < min.revenue ? m : min);
      
      monthlyExportData.push(
        { 'A': 'Total Revenue (All Months)', 'B': totalRevenue.toFixed(2), 'C': '', 'D': '', 'E': '', 'F': '', 'G': '', 'H': '' },
        { 'A': 'Average Monthly Revenue', 'B': avgMonthlyRevenue.toFixed(2), 'C': '', 'D': '', 'E': '', 'F': '', 'G': '', 'H': '' },
        { 'A': 'Best Month', 'B': bestMonth.displayName, 'C': bestMonth.revenue.toFixed(2), 'D': '', 'E': '', 'F': '', 'G': '', 'H': '' },
        { 'A': 'Worst Month', 'B': worstMonth.displayName, 'C': worstMonth.revenue.toFixed(2), 'D': '', 'E': '', 'F': '', 'G': '', 'H': '' }
      );
      
      const monthlyWs = XLSX.utils.aoa_to_sheet(monthlyExportData.map(row => [row.A, row.B, row.C, row.D, row.E, row.F, row.G, row.H]));
      monthlyWs['!cols'] = [
        { wch: 35 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
      ];
      
      if (!monthlyWs['!merges']) monthlyWs['!merges'] = [];
      monthlyWs['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } });
      
      applyFormats(monthlyWs, XLSX.utils.decode_range(monthlyWs['!ref'] || 'A1:H1'), [2, 6], []);
      XLSX.utils.book_append_sheet(wb, monthlyWs, 'Monthly Comparison');
    }

    // ========== QUARTERLY ANALYSIS SHEET ==========
    if (sheetsToExport.quarterlyAnalysis !== false) {
      const quarterlyData = aggregateByPeriod(filterBillsByDate(bills), 'quarter', products, returns);
      
      const quarterlyExportData = quarterlyData.map((quarter, index) => {
        const prevQuarter = index > 0 ? quarterlyData[index - 1] : null;
        const growth = prevQuarter ? ((quarter.revenue - prevQuarter.revenue) / prevQuarter.revenue * 100) : 0;
        
        return {
          'Quarter': quarter.period,
          'Revenue': quarter.revenue.toFixed(2),
          'Bills': quarter.bills,
          'Items Sold': quarter.items,
          'Unique Customers': quarter.customers,
          'Avg Bill Value': quarter.avgBillValue.toFixed(2),
          'Avg Items/Bill': quarter.avgItemsPerBill.toFixed(2),
          'QoQ Growth %': growth.toFixed(2),
          'Top Product': Array.from(quarter.products.values()).sort((a: any, b: any) => b.revenue - a.revenue)[0]?.name || 'N/A',
          'Top Store': Array.from(quarter.stores.values()).sort((a: any, b: any) => b.revenue - a.revenue)[0]?.name || 'N/A'
        };
      });
      
      const quarterlyWs = XLSX.utils.json_to_sheet(quarterlyExportData);
      autoSizeColumns(quarterlyWs, quarterlyExportData);
      styleHeaders(quarterlyWs, XLSX.utils.decode_range(quarterlyWs['!ref'] || 'A1:J1'));
      applyFormats(quarterlyWs, XLSX.utils.decode_range(quarterlyWs['!ref'] || 'A1:J1'), [2, 6, 7], [8]);
      quarterlyWs['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, quarterlyWs, 'Quarterly Analysis');
    }

    // ========== YEARLY OVERVIEW SHEET ==========
    if (sheetsToExport.yearlyOverview !== false) {
      const yearlyData = aggregateByPeriod(filterBillsByDate(bills), 'year', products, returns);
      
      const yearlyExportData: any[] = [
        { 'A': '📅 YEARLY PERFORMANCE OVERVIEW', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' },
        { 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' }
      ];
      
      yearlyData.sort((a, b) => a.period.localeCompare(b.period)).forEach((year, index) => {
        const prevYear = index > 0 ? yearlyData[index - 1] : null;
        const growth = prevYear ? ((year.revenue - prevYear.revenue) / prevYear.revenue * 100) : 0;
        
        yearlyExportData.push(
          { 'A': `🗓️ YEAR ${year.period}`, 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' },
          { 'A': '═══════════════════════════════════════════════════════════════════════', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' },
          { 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' },
          
          { 'A': '💰 FINANCIAL METRICS', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' },
          { 'A': 'Total Revenue', 'B': year.revenue.toFixed(2), 'C': 'Avg Monthly', 'D': (year.revenue / 12).toFixed(2), 'E': '', 'F': '' },
          { 'A': 'Total Bills', 'B': year.bills, 'C': 'Avg Daily', 'D': (year.bills / 365).toFixed(0), 'E': '', 'F': '' },
          { 'A': 'Total Items Sold', 'B': year.items, 'C': 'YoY Growth', 'D': `${growth.toFixed(2)}%`, 'E': '', 'F': '' },
          { 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' },
          
          { 'A': '👥 CUSTOMER METRICS', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' },
          { 'A': 'Unique Customers', 'B': year.customers, 'C': 'Avg Bill Value', 'D': year.avgBillValue.toFixed(2), 'E': '', 'F': '' },
          { 'A': 'Avg Items per Bill', 'B': year.avgItemsPerBill.toFixed(2), 'C': 'Bills per Customer', 'D': (year.bills / year.customers).toFixed(2), 'E': '', 'F': '' },
          { 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' }
        );
        
        // Top 5 Products
        yearlyExportData.push(
          { 'A': '🏆 TOP 5 PRODUCTS', 'B': 'Revenue', 'C': 'Quantity', 'D': 'Category', 'E': '', 'F': '' }
        );
        Array.from(year.products.values()).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 5).forEach((product: any, i: number) => {
          yearlyExportData.push({
            'A': `${i + 1}. ${product.name}`,
            'B': product.revenue.toFixed(2),
            'C': product.quantity,
            'D': product.category,
            'E': '', 'F': ''
          });
        });
        
        yearlyExportData.push({ 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });
        
        // Category Breakdown
        yearlyExportData.push(
          { 'A': '📂 CATEGORY BREAKDOWN', 'B': 'Revenue', 'C': 'Quantity', 'D': '% of Total', 'E': '', 'F': '' }
        );
        Array.from(year.categories.values()).sort((a: any, b: any) => b.revenue - a.revenue).forEach((category: any) => {
          const percentage = (category.revenue / year.revenue * 100).toFixed(2);
          yearlyExportData.push({
            'A': category.name,
            'B': category.revenue.toFixed(2),
            'C': category.quantity,
            'D': `${percentage}%`,
            'E': '', 'F': ''
          });
        });
        
        yearlyExportData.push({ 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });
        
        // Store Performance
        yearlyExportData.push(
          { 'A': '🏪 STORE PERFORMANCE', 'B': 'Revenue', 'C': 'Bills', 'D': 'Items', 'E': 'Avg Bill', 'F': '% Share' }
        );
        Array.from(year.stores.values()).sort((a: any, b: any) => b.revenue - a.revenue).forEach((store: any) => {
          const share = (store.revenue / year.revenue * 100).toFixed(2);
          yearlyExportData.push({
            'A': store.name,
            'B': store.revenue.toFixed(2),
            'C': store.bills,
            'D': store.items,
            'E': (store.revenue / store.bills).toFixed(2),
            'F': `${share}%`
          });
        });
        
        yearlyExportData.push(
          { 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' },
          { 'A': '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' },
          { 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' }
        );
      });
      
      const yearlyWs = XLSX.utils.aoa_to_sheet(yearlyExportData.map(row => [row.A, row.B, row.C, row.D, row.E, row.F]));
      yearlyWs['!cols'] = [
        { wch: 35 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 12 }
      ];
      applyFormats(yearlyWs, XLSX.utils.decode_range(yearlyWs['!ref'] || 'A1:F1'), [2, 5], []);
      XLSX.utils.book_append_sheet(wb, yearlyWs, 'Yearly Overview');
    }

    // ========== DAY OF WEEK ANALYSIS ==========
    if (sheetsToExport.dayOfWeekAnalysis !== false) {
      const dayOfWeekMap = new Map<string, any>();
      const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      
      daysOrder.forEach(day => {
        dayOfWeekMap.set(day, {
          day,
          revenue: 0,
          bills: 0,
          items: 0,
          occurrences: 0
        });
      });
      
      filterBillsByDate(bills).forEach(bill => {
        const dayName = format(new Date(bill.timestamp || bill.createdAt), 'EEEE');
        const data = dayOfWeekMap.get(dayName)!;
        data.revenue += bill.total;
        data.bills += 1;
        data.items += bill.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
        data.occurrences += 1;
      });
      
      const dayOfWeekData = daysOrder.map(day => {
        const data = dayOfWeekMap.get(day)!;
        return {
          'Day': day,
          'Total Revenue': data.revenue.toFixed(2),
          'Total Bills': data.bills,
          'Total Items': data.items,
          'Occurrences': data.occurrences,
          'Avg Revenue/Day': data.occurrences > 0 ? (data.revenue / data.occurrences).toFixed(2) : '0.00',
          'Avg Bills/Day': data.occurrences > 0 ? (data.bills / data.occurrences).toFixed(1) : '0.0',
          'Avg Bill Value': data.bills > 0 ? (data.revenue / data.bills).toFixed(2) : '0.00',
          'Performance': data.revenue > (Array.from(dayOfWeekMap.values()).reduce((sum, d) => sum + d.revenue, 0) / 7) ? '🔥 Above Avg' : '📊 Below Avg'
        };
      });
      
      const dayOfWeekWs = XLSX.utils.json_to_sheet(dayOfWeekData);
      autoSizeColumns(dayOfWeekWs, dayOfWeekData);
      styleHeaders(dayOfWeekWs, XLSX.utils.decode_range(dayOfWeekWs['!ref'] || 'A1:I1'));
      applyFormats(dayOfWeekWs, XLSX.utils.decode_range(dayOfWeekWs['!ref'] || 'A1:I1'), [2, 6, 7, 8], []);
      dayOfWeekWs['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, dayOfWeekWs, 'Day of Week Analysis');
    }

    // ========== COMPARATIVE TRENDS SHEET ==========
    if (sheetsToExport.comparativeTrends !== false) {
      const monthlyData = aggregateByPeriod(filterBillsByDate(bills), 'month', products, returns);
      
      const trendsData: any[] = [
        { 'A': '📈 COMPARATIVE TRENDS ANALYSIS', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '' },
        { 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '', 'G': '' },
        { 'A': 'Month', 'B': 'Revenue', 'C': 'MoM Change', 'D': 'Bills', 'E': 'Bills Change', 'F': 'Avg Bill', 'G': 'Trend' }
      ];
      
      monthlyData.sort((a, b) => a.period.localeCompare(b.period)).forEach((month, index) => {
        const prevMonth = index > 0 ? monthlyData[index - 1] : null;
        const revenueChange = prevMonth ? month.revenue - prevMonth.revenue : 0;
        const revenueChangePercent = prevMonth ? ((month.revenue - prevMonth.revenue) / prevMonth.revenue * 100) : 0;
        const billsChange = prevMonth ? month.bills - prevMonth.bills : 0;
        const trend = revenueChangePercent > 5 ? '🚀 Strong Growth' : 
                      revenueChangePercent > 0 ? '📈 Growth' :
                      revenueChangePercent > -5 ? '➡️ Stable' : '📉 Decline';
        
        trendsData.push({
          'A': month.displayName,
          'B': month.revenue.toFixed(2),
          'C': `${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(2)} (${revenueChangePercent.toFixed(1)}%)`,
          'D': month.bills,
          'E': prevMonth ? `${billsChange >= 0 ? '+' : ''}${billsChange}` : 'N/A',
          'F': month.avgBillValue.toFixed(2),
          'G': trend
        });
      });
      
      const trendsWs = XLSX.utils.aoa_to_sheet(trendsData.map(row => [row.A, row.B, row.C, row.D, row.E, row.F, row.G]));
      trendsWs['!cols'] = [
        { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 18 }
      ];
      
      if (!trendsWs['!merges']) trendsWs['!merges'] = [];
      trendsWs['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } });
      
      applyFormats(trendsWs, XLSX.utils.decode_range(trendsWs['!ref'] || 'A1:G1'), [2, 6], []);
      XLSX.utils.book_append_sheet(wb, trendsWs, 'Comparative Trends');
    }

    // Generate and download file
    const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
    const storeStr = selectedStore === 'all' ? '' : `-${stores.find(s => s.id === selectedStore)?.name.replace(/\s/g, '-') || 'store'}`;
    const filename = `Analytics-Report${storeStr}-${dateStr}.xlsx`;

    const wbArrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    alert('Analytics report exported successfully!');
  } catch (error: any) {
    console.error('Error exporting analytics:', error);
    let errorMessage = 'Failed to export analytics. Please try again.';
    
    if (error.message.includes('No analytics data')) {
      errorMessage = 'No data available to export. Please ensure data is loaded.';
    } else if (error.message.includes('SheetJS')) {
      errorMessage = 'Failed to load export library. Please check your connection.';
    }
    
    alert(errorMessage);
  } finally {
    setExporting(false);
  }
};

  const filteredStoreAnalytics =
    selectedStore === "all" ? storeAnalytics : storeAnalytics.filter((store) => store.storeId === selectedStore)

  const filteredProductAnalytics =
    selectedProduct === "all"
      ? productAnalytics
      : productAnalytics.filter((product) => product.productId === selectedProduct)

  const totalRevenue = storeAnalytics.reduce((sum, store) => sum + store.totalRevenue, 0)
  const totalBills = storeAnalytics.reduce((sum, store) => sum + store.totalBills, 0)
  const totalItems = storeAnalytics.reduce((sum, store) => sum + store.totalItems, 0)
  const totalRefundAmount = storeAnalytics.reduce((sum, store) => sum + (store as any).totalRefundAmount, 0); // Access new field
  const totalReturnedItems = storeAnalytics.reduce((sum, store) => sum + (store as any).totalReturnedItems, 0); // Access new field
  const averageBillValue = totalBills > 0 ? totalRevenue / totalBills : 0

  if (loading) { // Use the combined loading state
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
            <Button 
              onClick={() => {
                calculateAnalytics();
                calculateProductAdditionAnalytics();
                calculateUserSessionAnalytics();
              }} 
              variant="outline" 
              className="bg-blue-50 hover:bg-blue-100"
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Analytics
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
              Filters & Date Selection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Selected Date</Label>
                <div className="relative">
                  <Button
                    variant={"outline"}
                    className="w-full justify-start text-left font-normal"
                    onClick={() => setCalendarOpen((v) => !v)}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "LLL dd, y") : <span>Pick a date</span>}
                  </Button>
                  {calendarOpen && (
                    <div className="absolute left-0 z-50 mt-2 bg-white border rounded shadow-lg p-3 w-80">
                      {/* Month header */}
                      <div className="flex items-center justify-between mb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                          }
                        >
                          ◀
                        </Button>
                        <div className="text-sm font-medium">{fmtMonthYear(calendarMonth)}</div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                          }
                        >
                          ▶
                        </Button>
                      </div>

                      {/* Weekday headers */}
                      <div className="grid grid-cols-7 text-[11px] text-gray-500 mb-1">
                        <div className="text-center">Su</div>
                        <div className="text-center">Mo</div>
                        <div className="text-center">Tu</div>
                        <div className="text-center">We</div>
                        <div className="text-center">Th</div>
                        <div className="text-center">Fr</div>
                        <div className="text-center">Sa</div>
                      </div>

                      {/* Days grid */}
                      <div className="grid grid-cols-7 gap-1">
                        {(() => {
                          const first = startOfMonth(calendarMonth);
                          const firstWeekday = first.getDay();
                          const total = daysInMonth(calendarMonth);
                          const cells: React.JSX.Element[] = [];

                          // Leading blanks
                          for (let i = 0; i < firstWeekday; i++) {
                            cells.push(<div key={`b-${i}`} className="h-8" />);
                          }

                          // Actual days
                          for (let day = 1; day <= total; day++) {
                            const d = new Date(
                              calendarMonth.getFullYear(),
                              calendarMonth.getMonth(),
                              day
                            );
                            const today = sameDay(d, new Date());
                            const isSelected = selectedDate && sameDay(d, selectedDate);

                            let cls =
                              "h-8 w-8 mx-auto flex items-center justify-center rounded-full cursor-pointer select-none ";
                            if (today) {
                              cls += "border-2 border-red-500 text-red-600 ";
                            }
                            if (isSelected) {
                              cls += "bg-blue-600 text-white ";
                            } else {
                              cls += "text-gray-700 hover:bg-gray-100 ";
                            }

                            cells.push(
                              <div key={toKey(d)} className="flex items-center justify-center">
                                <div
                                  className={cls}
                                  onClick={() => {
                                    setSelectedDate(d);
                                    setCalendarOpen(false);
                                  }}
                                >
                                  {day}
                                </div>
                              </div>
                            );
                          }
                          return cells;
                        })()}
                      </div>
                      <div className="mt-3 border-t pt-3 text-right">
                        <Button variant="outline" size="sm" onClick={() => setCalendarOpen(false)}>
                          Close
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Quick Dates</Label>
                <Select onValueChange={setQuickDate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Dates</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
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
                    {stores.map((store, index) => (
                      <SelectItem key={`${store.id}-${index}`} value={store.id}>
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
              <div className="text-2xl font-bold">₹{totalRevenue.toFixed(2)}</div>
              <div className="flex items-center mt-2">
                {(dashboardMetrics?.revenue?.growth || 0) >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
                )}
                <span className={`text-sm font-medium ${
                  (dashboardMetrics?.revenue?.growth || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {Math.abs(dashboardMetrics?.revenue?.growth || 0).toFixed(1)}%
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
              <div className="text-2xl font-bold">{totalBills}</div>
              <p className="text-xs text-muted-foreground">
                Avg: ₹{averageBillValue.toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems}</div>
              <p className="text-xs text-muted-foreground">
                {(totalItems / totalBills).toFixed(1)} per transaction
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Refunds</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{totalRefundAmount.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{totalReturnedItems} items returned</p>
            </CardContent>
          </Card>
          {/* Add this new card in the main KPI section (after the existing cards) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Return Rate</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {((totalRefundAmount / (totalRevenue + totalRefundAmount)) * 100).toFixed(2)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Of total revenue returned
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Update the Revenue Trends chart to show gross, returns, and net */}
        {revenueTrends.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Revenue Trends with Returns</CardTitle>
                <Select value={trendPeriod} onValueChange={setTrendPeriod}>
                  <SelectTrigger className="w-[180px]">
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
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={revenueTrends.map((trend, idx) => {
                  // Calculate returns for each period
                  const periodReturns = filterReturnsByDate(returns).filter(r => {
                    const returnDate = new Date(r.created_at);
                    const trendDate = new Date(trend.period);
                    return format(returnDate, trendPeriod === 'daily' ? 'yyyy-MM-dd' : 'yyyy-MM') === 
                           format(trendDate, trendPeriod === 'daily' ? 'yyyy-MM-dd' : 'yyyy-MM');
                  }).reduce((sum, r) => sum + (r.status === 'approved' || r.status === 'completed' ? r.return_amount : 0), 0);
                  
                  return {
                    ...trend,
                    returnAmount: periodReturns,
                    netRevenue: trend.revenue - periodReturns,
                    grossRevenue: trend.revenue
                  };
                })}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = {
                      grossRevenue: 'Gross Revenue',
                      returnAmount: 'Returns',
                      netRevenue: 'Net Revenue'
                    };
                    return [`₹${Number(value).toFixed(2)}`, labels[name] || name];
                  }} />
                  <Line 
                    type="monotone" 
                    dataKey="grossRevenue" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                    name="Gross Revenue"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="returnAmount" 
                    stroke="#ff4444" 
                    strokeWidth={2}
                    name="Returns"
                    strokeDasharray="5 5"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="netRevenue" 
                    stroke="#22c55e" 
                    strokeWidth={2}
                    name="Net Revenue"
                  />
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
            {/* Add a new Returns Analytics tab */}
            <TabsTrigger value="returns">Returns Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="stores" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Update the Store Analytics cards to show return information */}
              {filteredStoreAnalytics.map((store) => {
                const storeReturns = returns.filter(r => 
                  bills.find(b => b.id === r.bill_id)?.storeId === store.storeId &&
                  (r.status === 'approved' || r.status === 'completed')
                );
                const storeReturnAmount = storeReturns.reduce((sum, r) => sum + r.return_amount, 0);
                const returnRate = ((storeReturnAmount / (store.totalRevenue + storeReturnAmount)) * 100).toFixed(2);

                return (
                  <Card key={store.storeId}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-lg">{store.storeName}</h3>
                        <Badge variant={Number(returnRate) > 10 ? "destructive" : "secondary"}>
                          {returnRate}% Returns
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Gross Revenue</p>
                          <p className="text-xl font-bold text-blue-600">
                            ₹{(store.totalRevenue + storeReturnAmount).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Returns</p>
                          <p className="text-xl font-bold text-red-600">
                            ₹{storeReturnAmount.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Net Revenue</p>
                          <p className="text-xl font-bold text-green-600">
                            ₹{store.totalRevenue.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Returned Items</p>
                          <p className="text-xl font-bold text-orange-600">
                            {storeReturns.length}
                          </p>
                        </div>
                      </div>
                      {/* ... rest of the card content ... */}
                    </CardContent>
                  </Card>
                );
              })}
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

          <TabsContent value="returns" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Return Metrics Overview</CardTitle>
                <CardDescription>Analysis of product returns and refunds</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Total Returns</p>
                    <p className="text-2xl font-bold">{totalReturnedItems}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Total Refund Amount</p>
                    <p className="text-2xl font-bold text-red-600">₹{totalRefundAmount.toFixed(2)}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Return Rate</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {((totalReturnedItems / totalItems) * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Avg Return Value</p>
                    <p className="text-2xl font-bold">
                      ₹{totalReturnedItems > 0 ? (totalRefundAmount / totalReturnedItems).toFixed(2) : '0.00'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Returns by Product */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Returned Products</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={
                      Object.entries(
                        returns
                          .filter(r => r.status === 'approved' || r.status === 'completed')
                          .reduce((acc: Record<string, {count: number, amount: number}>, r) => {
                            if (!acc[r.product_name]) {
                              acc[r.product_name] = {count: 0, amount: 0};
                            }
                            acc[r.product_name].count += 1;
                            acc[r.product_name].amount += r.return_amount;
                            return acc;
                          }, {})
                      )
                      .map(([name, data]) => ({
                        product: name,
                        count: data.count,
                        amount: data.amount
                      }))
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 10)
                    }>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="product" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip formatter={(value: number, name: string) => 
                        name === 'amount' ? `₹${value.toFixed(2)}` : value
                      } />
                      <Bar dataKey="count" fill="#ff6b6b" name="Return Count" />
                      <Bar dataKey="amount" fill="#ee5a6f" name="Return Amount" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Returns by Status */}
              <Card>
                <CardHeader>
                  <CardTitle>Returns by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={Object.entries(
                          returns.reduce((acc: Record<string, number>, r) => {
                            acc[r.status] = (acc[r.status] || 0) + 1;
                            return acc;
                          }, {})
                        ).map(([status, count]) => ({
                          name: status.charAt(0).toUpperCase() + status.slice(1),
                          value: count
                        }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry: any) => `${entry.name}: ${entry.value}`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {Object.keys(returns.reduce((acc: Record<string, number>, r) => {
                          acc[r.status] = 1;
                          return acc;
                        }, {})).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Returns Table */}
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
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returns
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .slice(0, 10)
                      .map((returnItem) => (
                        <TableRow key={returnItem.return_id}>
                          <TableCell>{format(new Date(returnItem.created_at), 'MMM dd, yyyy')}</TableCell>
                          <TableCell className="font-medium">{returnItem.product_name}</TableCell>
                          <TableCell>{returnItem.customer_name}</TableCell>
                          <TableCell className="font-semibold text-red-600">
                            ₹{returnItem.return_amount.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              returnItem.status === 'completed' ? 'default' :
                              returnItem.status === 'approved' ? 'secondary' :
                              returnItem.status === 'rejected' ? 'destructive' : 'outline'
                            }>
                              {returnItem.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{returnItem.message}</TableCell>
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
