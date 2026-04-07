'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { differenceInCalendarDays, endOfDay, format, startOfDay, subDays } from 'date-fns'
import * as XLSX from 'xlsx'
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  discountAmount: number
  discountPercentage: number
  createdAt: string
  timestamp: string
  isReplacement?: boolean
  replacementFinalAmount?: number
}

interface StoreRecord {
  id: string
  name: string
  address: string
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
  storeId?: string
  returnAmount: number
  status: string
  createdAt: string
}

interface DailyStats {
  date: string
  revenue: number
  replacementAmount: number
  returnsAmount: number
  netRevenue: number
  discount: number
  bills: number
  items: number
  avgBill: number
}

interface StoreAnalytics {
  storeId: string
  storeName: string
  storeAddress: string
  revenue: number
  discount: number
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
  discount: number
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
  discount: number
  bills: number
  items: number
  customers: number
  avgBill: number
}

const CHART_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#f97316', '#dc2626', '#7c3aed']
const LOW_STOCK_THRESHOLD = 10
const RETURN_IMPACT_STATUSES = new Set(['approved', 'completed'])
const PANEL_CARD_CLASS = 'border-slate-200/80 shadow-sm bg-white/90 backdrop-blur'
const KPI_CARD_CLASS =
  'relative overflow-hidden border-slate-200/80 shadow-sm bg-gradient-to-br from-white to-slate-50'
const RANGE_PRESETS = [30, 45, 90, 150, 365] as const

type TabValue =
  | 'overview'
  | 'revenue'
  | 'stores'
  | 'products'
  | 'inventory'
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
    discountAmount: Number(bill.discountAmount ?? bill.discount_amount ?? bill.discountamount ?? 0),
    discountPercentage: Number(
      bill.discountPercentage ?? bill.discount_percentage ?? bill.discountpercentage ?? 0,
    ),
    createdAt: bill.createdAt || bill.created_at || bill.timestamp || '',
    timestamp: bill.timestamp || bill.createdAt || bill.created_at || '',
    isReplacement: Boolean(bill.isReplacement ?? bill.is_replacement),
    replacementFinalAmount: Number(
      bill.replacementFinalAmount ?? bill.replacement_final_amount ?? 0,
    ),
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

const getEffectiveBillTotal = (bill: Bill): number => {
  if (bill.isReplacement && (bill.replacementFinalAmount || 0) > 0) {
    return bill.replacementFinalAmount || 0
  }
  return bill.total || 0
}

const normalizeStores = (rawStores: any[]): StoreRecord[] => {
  return rawStores.map((store) => ({
    id: String(store.id || ''),
    name: store.name || 'Unknown Store',
    address: store.address || '',
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
    storeId: String(item.storeId || item.store_id || item.storeid || ''),
    returnAmount: Number(item.returnAmount || item.return_amount || item.amount || 0),
    status: String(item.status || 'pending').toLowerCase(),
    createdAt: item.createdAt || item.created_at || item.timestamp || '',
  }))
}

const summarizeBills = (rows: Bill[]): MetricSummary => {
  const revenue = rows.reduce((sum, bill) => sum + getEffectiveBillTotal(bill), 0)
  const discount = rows.reduce((sum, bill) => sum + bill.discountAmount, 0)
  const bills = rows.length
  const items = rows.reduce(
    (sum, bill) => sum + bill.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  )
  const customers = new Set(rows.map((bill) => bill.customerId).filter(Boolean)).size

  return {
    revenue,
    discount,
    bills,
    items,
    customers,
    avgBill: bills > 0 ? revenue / bills : 0,
  }
}

const CURRENCY_KEYS = new Set([
  'revenue', 'gross_sales', 'replacement_amount', 'replacements', 'returns_amount',
  'returns_refunded', 'net_revenue', 'net_sales', 'discount', 'total_discount',
  'avg_bill', 'average_bill_value', 'avg_selling_price', 'return_amount', 'refund_amount',
  'cost_price', 'selling_price', 'margin_per_unit', 'profit_per_unit', 'cost_value',
  'total_cost_value', 'potential_sales_value', 'total_selling_value', 'potential_profit',
  'total_potential_profit', 'blocked_value', 'amount', 'credit', 'debit',
])

const PCT_KEYS = new Set(['margin_pct', 'profit_margin'])

const HEADER_LABELS: Record<string, string> = {
  // Summary / general
  sl_no: 'Sl. No.',
  report_generated_at: 'Report Generated At',
  selected_store: 'Store',
  date_range_days: 'Period (Days)',
  range_start: 'From Date',
  range_end: 'To Date',
  description: 'Description',
  value: 'Value',

  // Revenue
  date: 'Date',
  month: 'Month',
  gross_sales: 'Gross Sales (₹)',
  replacements: 'Replacements (₹)',
  returns_refunded: 'Returns / Refunds (₹)',
  net_sales: 'Net Sales (₹)',
  total_discount: 'Discount Given (₹)',
  total_bills: 'No. of Bills',
  total_items_sold: 'Items Sold',
  average_bill_value: 'Avg. Bill Value (₹)',

  // Stores
  store_name: 'Store Name',
  store_address: 'Store Address',
  revenue: 'Revenue (₹)',
  discount: 'Discount (₹)',
  bills: 'No. of Bills',
  items: 'Items Sold',
  avg_bill: 'Avg. Bill Value (₹)',

  // Products
  product_name: 'Product Name',
  quantity: 'Qty Sold',
  avg_selling_price: 'Avg. Selling Price (₹)',
  last_sold: 'Last Sold On',

  // Inventory
  stock: 'Current Stock (Units)',
  cost_price: 'Cost Price (₹)',
  selling_price: 'Selling Price (₹)',
  profit_per_unit: 'Profit / Unit (₹)',
  profit_margin: 'Profit Margin (%)',
  total_cost_value: 'Total Cost Value (₹)',
  total_selling_value: 'Total Selling Value (₹)',
  total_potential_profit: 'Total Potential Profit (₹)',

  // Returns
  return_date: 'Return Date',
  return_id: 'Return ID',
  product_returned: 'Product Returned',
  return_status: 'Status',
  refund_amount: 'Refund Amount (₹)',

  // Ledger
  transaction_date: 'Transaction Date',
  type: 'Type',
  reference_id: 'Reference ID',
  store: 'Store',
  status: 'Status',
  credit: 'Credit (₹)',
  debit: 'Debit (₹)',
  amount: 'Net Amount (₹)',
  remarks: 'Remarks',

  // Bills
  bill_id: 'Bill / Invoice No.',
  total_items: 'Total Items',
}

interface BuildSheetOpts {
  hasTotalRow?: boolean
  title?: string
  subtitle?: string
  notes?: string[]
}

const buildSheet = (
  rows: Array<Record<string, unknown>>,
  opts?: BuildSheetOpts,
) => {
  const hasTotalRow = opts?.hasTotalRow ?? true
  const title = opts?.title
  const subtitle = opts?.subtitle
  const notes = opts?.notes || []
  const keys = rows.length > 0 ? Object.keys(rows[0]) : []

  const headerRow = keys.map(
    (k) => HEADER_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  )

  const aoa: unknown[][] = []

  // Title block
  if (title) {
    aoa.push([title])
    if (subtitle) aoa.push([subtitle])
    aoa.push([]) // blank spacer
  }

  const headerRowIdx = aoa.length
  aoa.push(headerRow)
  rows.forEach((row) => {
    aoa.push(keys.map((k) => (row as Record<string, unknown>)[k] ?? ''))
  })

  // Notes at the bottom
  if (notes.length > 0) {
    aoa.push([]) // spacer
    notes.forEach((note) => aoa.push([note]))
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa)

  // Merges — title rows and notes
  const merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = []
  if (title && keys.length > 1) {
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: keys.length - 1 } })
    if (subtitle) merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: keys.length - 1 } })
  }
  const notesStartRow = headerRowIdx + rows.length + 1 + (notes.length > 0 ? 1 : 0)
  notes.forEach((_, i) => {
    if (keys.length > 1) {
      merges.push({ s: { r: notesStartRow + i, c: 0 }, e: { r: notesStartRow + i, c: keys.length - 1 } })
    }
  })
  if (merges.length > 0) sheet['!merges'] = merges

  // Column widths
  sheet['!cols'] = keys.map((key, idx) => {
    const label = headerRow[idx]
    const maxValueLen = rows.reduce((max, row) => {
      const text = String((row as Record<string, unknown>)[key] ?? '')
      return Math.max(max, text.length)
    }, label.length)
    return { wch: Math.min(Math.max(maxValueLen + 4, 15), 55) }
  })

  // Row heights for header
  sheet['!rows'] = []
  if (title) {
    sheet['!rows'][0] = { hpt: 28 }
    if (subtitle) sheet['!rows'][1] = { hpt: 20 }
  }
  sheet['!rows'][headerRowIdx] = { hpt: 24 }

  // Auto-filter
  sheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRowIdx, c: 0 },
      e: { r: headerRowIdx + Math.max(rows.length, 1), c: Math.max(keys.length - 1, 0) },
    }),
  }

  // Freeze panes
  sheet['!freeze'] = { xSplit: 0, ySplit: headerRowIdx + 1 }

  // Styling
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null
  if (range) {
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const ref = XLSX.utils.encode_cell({ r, c })
        const cell = (sheet as any)[ref]
        if (!cell) continue

        const isTitleRow = title ? r === 0 : false
        const isSubtitleRow = title && subtitle ? r === 1 : false
        const isHeaderRow = r === headerRowIdx
        const isTotalRow = hasTotalRow && rows.length > 1 && r === headerRowIdx + rows.length
        const isDataRow = r > headerRowIdx && r < headerRowIdx + rows.length + 1 && !isTotalRow
        const isEvenDataRow = isDataRow && (r - headerRowIdx) % 2 === 0
        const isNoteRow = r >= notesStartRow
        const colKey = keys[c] || ''
        const isCurrency = CURRENCY_KEYS.has(colKey)
        const isPct = PCT_KEYS.has(colKey)
        const isNumeric = isCurrency || isPct || typeof cell.v === 'number'

        const thinBorder = {
          top: { style: 'thin', color: { rgb: 'CBD5E1' } },
          right: { style: 'thin', color: { rgb: 'CBD5E1' } },
          bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
          left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        }

        if (isTitleRow) {
          cell.s = {
            font: { bold: true, sz: 15, color: { rgb: '1E293B' } },
            fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } },
            alignment: { horizontal: 'center', vertical: 'center' },
          }
        } else if (isSubtitleRow) {
          cell.s = {
            font: { italic: true, sz: 10, color: { rgb: '64748B' } },
            fill: { patternType: 'solid', fgColor: { rgb: 'EFF6FF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
          }
        } else if (isHeaderRow) {
          cell.s = {
            font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
            fill: { patternType: 'solid', fgColor: { rgb: '1E40AF' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: thinBorder,
          }
        } else if (isTotalRow) {
          cell.s = {
            font: { bold: true, sz: 11, color: { rgb: '1E293B' } },
            fill: { patternType: 'solid', fgColor: { rgb: 'FEF3C7' } },
            border: {
              top: { style: 'double', color: { rgb: '1E40AF' } },
              right: { style: 'thin', color: { rgb: 'CBD5E1' } },
              bottom: { style: 'double', color: { rgb: '1E40AF' } },
              left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            },
            alignment: isNumeric ? { horizontal: 'right' } : {},
            numFmt: isCurrency ? '#,##0.00' : isPct ? '0.0"%"' : undefined,
          }
        } else if (isNoteRow) {
          cell.s = {
            font: { italic: true, sz: 9, color: { rgb: '64748B' } },
            alignment: { wrapText: true },
          }
        } else {
          cell.s = {
            border: thinBorder,
            font: { sz: 10 },
            alignment: isNumeric ? { horizontal: 'right' } : { vertical: 'center' },
            numFmt: isCurrency ? '#,##0.00' : isPct ? '0.0"%"' : undefined,
            ...(isEvenDataRow
              ? { fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } } }
              : {}),
          }
        }

        // Number formats
        if (isCurrency && typeof cell.v === 'number') {
          cell.t = 'n'
          cell.z = '#,##0.00'
        }
        if (isPct && typeof cell.v === 'number') {
          cell.t = 'n'
          cell.z = '0.0"%"'
        }
      }
    }
  }
  return sheet
}

const appendTotalRow = (
  rows: Array<Record<string, unknown>>,
  numericKeys: string[],
  labelKey?: string,
) => {
  if (rows.length === 0) return rows

  const totalRow: Record<string, unknown> = {}
  Object.keys(rows[0]).forEach((key) => {
    totalRow[key] = numericKeys.includes(key)
      ? Number(
          rows
            .reduce((sum, row) => sum + Number((row as Record<string, unknown>)[key] || 0), 0)
            .toFixed(2),
        )
      : ''
  })

  if (labelKey && Object.prototype.hasOwnProperty.call(totalRow, labelKey)) {
    totalRow[labelKey] = 'TOTAL'
  } else {
    const firstKey = Object.keys(totalRow)[0]
    if (firstKey) totalRow[firstKey] = 'TOTAL'
  }

  return [...rows, totalRow]
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
  const [selectedDaysPreset, setSelectedDaysPreset] = useState('30')
  const [rangeFrom, setRangeFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [rangeTo, setRangeTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportStore, setExportStore] = useState('all')
  const [activeTab, setActiveTab] = useState<TabValue>('overview')
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [revenueMonth, setRevenueMonth] = useState(new Date().getMonth())
  const [revenueYear, setRevenueYear] = useState(new Date().getFullYear())

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
    const fromDate = startOfDay(new Date(`${rangeFrom}T00:00:00`))
    const toDate = endOfDay(new Date(`${rangeTo}T00:00:00`))
    const hasValidRange =
      !Number.isNaN(fromDate.getTime()) &&
      !Number.isNaN(toDate.getTime()) &&
      fromDate.getTime() <= toDate.getTime()

    const currentStart = hasValidRange ? fromDate : startOfDay(subDays(now, 29))
    const currentEnd = hasValidRange ? toDate : endOfDay(now)
    const selectedRangeDays = Math.max(differenceInCalendarDays(currentEnd, currentStart) + 1, 1)
    const previousStart = subDays(currentStart, selectedRangeDays)
    const staleNinetyStart = subDays(currentEnd, 90)

    return { currentStart, currentEnd, previousStart, staleNinetyStart, selectedRangeDays }
  }, [rangeFrom, rangeTo])

  const billsByStore = useMemo(() => {
    return bills.filter((bill) => selectedStore === 'all' || bill.storeId === selectedStore)
  }, [bills, selectedStore])

  const filteredBills = useMemo(() => {
    return billsByStore.filter((bill) => {
      const date = parseDate(bill.createdAt || bill.timestamp)
      return !!date && date >= dateWindows.currentStart && date <= dateWindows.currentEnd
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
      return !!date && date >= dateWindows.staleNinetyStart && date <= dateWindows.currentEnd
    })
  }, [billsByStore, dateWindows])

  const returnsInPeriod = useMemo(() => {
    return returns.filter((item) => {
      const date = parseDate(item.createdAt)
      return !!date && date >= dateWindows.currentStart && date <= dateWindows.currentEnd
    })
  }, [returns, dateWindows])

  const approvedReturnsInPeriod = useMemo(() => {
    return returnsInPeriod.filter((item) => RETURN_IMPACT_STATUSES.has(item.status || ''))
  }, [returnsInPeriod])

  const approvedReturnsPreviousPeriod = useMemo(() => {
    return returns.filter((item) => {
      const date = parseDate(item.createdAt)
      return (
        !!date &&
        date >= dateWindows.previousStart &&
        date < dateWindows.currentStart &&
        RETURN_IMPACT_STATUSES.has(item.status || '')
      )
    })
  }, [returns, dateWindows])

  const approvedReturnsByDate = useMemo(() => {
    const map = new Map<string, number>()
    approvedReturnsInPeriod.forEach((item) => {
      const date = parseDate(item.createdAt)
      if (!date) return
      const key = format(date, 'yyyy-MM-dd')
      map.set(key, (map.get(key) || 0) + item.returnAmount)
    })
    return map
  }, [approvedReturnsInPeriod])

  const productCategoryMap = useMemo(() => {
    const map = new Map<string, string>()
    products.forEach((product) => {
      map.set(product.id, product.category || 'Uncategorized')
    })
    return map
  }, [products])

  const dailyStats = useMemo((): DailyStats[] => {
    const statsByDate = new Map<string, DailyStats>()

    filteredBills.forEach((bill) => {
      const date = parseDate(bill.createdAt || bill.timestamp)
      if (!date) return

      const key = format(date, 'yyyy-MM-dd')
      if (!statsByDate.has(key)) {
        statsByDate.set(key, {
          date: key,
          revenue: 0,
          replacementAmount: 0,
          returnsAmount: 0,
          netRevenue: 0,
          discount: 0,
          bills: 0,
          items: 0,
          avgBill: 0,
        })
      }

      const bucket = statsByDate.get(key)!
      const effectiveTotal = getEffectiveBillTotal(bill)
      bucket.revenue += effectiveTotal
      if (bill.isReplacement) {
        bucket.replacementAmount += effectiveTotal
      }
      bucket.discount += bill.discountAmount
      bucket.bills += 1
      bucket.items += bill.items.reduce((sum, item) => sum + item.quantity, 0)
    })

    statsByDate.forEach((bucket) => {
      bucket.returnsAmount = approvedReturnsByDate.get(bucket.date) || 0
      bucket.netRevenue = bucket.revenue - bucket.returnsAmount
      bucket.avgBill = bucket.bills > 0 ? bucket.revenue / bucket.bills : 0
    })

    return Array.from(statsByDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [filteredBills, approvedReturnsByDate])

  const revenueYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const years: number[] = []
    for (let y = 2025; y <= currentYear; y++) years.push(y)
    return years
  }, [])

  const filteredDailyStats = useMemo(() => {
    return dailyStats.filter((row) => {
      const d = new Date(row.date)
      return d.getFullYear() === revenueYear && d.getMonth() === revenueMonth
    })
  }, [dailyStats, revenueMonth, revenueYear])

  const isAtMinMonth = revenueYear === 2025 && revenueMonth === 0
  const now = new Date()
  const isAtMaxMonth = revenueYear === now.getFullYear() && revenueMonth === now.getMonth()

  const handleRevenuePrevMonth = useCallback(() => {
    if (isAtMinMonth) return
    if (revenueMonth === 0) {
      setRevenueYear(revenueYear - 1)
      setRevenueMonth(11)
    } else {
      setRevenueMonth(revenueMonth - 1)
    }
  }, [revenueMonth, revenueYear, isAtMinMonth])

  const handleRevenueNextMonth = useCallback(() => {
    if (isAtMaxMonth) return
    if (revenueMonth === 11) {
      setRevenueYear(revenueYear + 1)
      setRevenueMonth(0)
    } else {
      setRevenueMonth(revenueMonth + 1)
    }
  }, [revenueMonth, revenueYear, isAtMaxMonth])

  const storeAnalytics = useMemo((): StoreAnalytics[] => {
    const storeMap = new Map<string, StoreAnalytics>()

    stores.forEach((store) => {
      storeMap.set(store.id, {
        storeId: store.id,
        storeName: store.name,
        storeAddress: store.address,
        revenue: 0,
        discount: 0,
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
          storeAddress: '',
          revenue: 0,
          discount: 0,
          bills: 0,
          items: 0,
          avgBill: 0,
        })
      }

      const stats = storeMap.get(bill.storeId)
      if (!stats) return

      stats.revenue += getEffectiveBillTotal(bill)
      stats.discount += bill.discountAmount
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
            discount: 0,
            bills: 0,
            avgSellingPrice: 0,
            lastSoldAt: billDateIso,
          })
        }

        const stats = map.get(item.productId)
        if (!stats) return

        stats.quantity += item.quantity
        stats.revenue += item.total
        const itemTotalsSum = bill.items.reduce((sum, row) => sum + row.total, 0)
        const itemDiscount =
          itemTotalsSum > 0 ? (bill.discountAmount * item.total) / itemTotalsSum : 0
        stats.discount += itemDiscount
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
      if (!billDate || billDate < dateWindows.staleNinetyStart || billDate > dateWindows.currentEnd) return
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
  const currentReplacementAmount = useMemo(
    () =>
      filteredBills.reduce((sum, bill) => {
        if (!bill.isReplacement) return sum
        return sum + getEffectiveBillTotal(bill)
      }, 0),
    [filteredBills],
  )
  const previousReplacementAmount = useMemo(
    () =>
      previousPeriodBills.reduce((sum, bill) => {
        if (!bill.isReplacement) return sum
        return sum + getEffectiveBillTotal(bill)
      }, 0),
    [previousPeriodBills],
  )
  const currentReturnsAmount = useMemo(
    () => approvedReturnsInPeriod.reduce((sum, item) => sum + item.returnAmount, 0),
    [approvedReturnsInPeriod],
  )
  const previousReturnsAmount = useMemo(
    () => approvedReturnsPreviousPeriod.reduce((sum, item) => sum + item.returnAmount, 0),
    [approvedReturnsPreviousPeriod],
  )
  const currentNetRevenue = useMemo(
    () => currentSummary.revenue - currentReturnsAmount,
    [currentSummary.revenue, currentReturnsAmount],
  )
  const previousNetRevenue = useMemo(
    () => previousSummary.revenue - previousReturnsAmount,
    [previousSummary.revenue, previousReturnsAmount],
  )

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
  const replacementChange = useMemo(
    () => percentageChange(currentReplacementAmount, previousReplacementAmount),
    [currentReplacementAmount, previousReplacementAmount],
  )
  const returnsAmountChange = useMemo(
    () => percentageChange(currentReturnsAmount, previousReturnsAmount),
    [currentReturnsAmount, previousReturnsAmount],
  )
  const netRevenueChange = useMemo(
    () => percentageChange(currentNetRevenue, previousNetRevenue),
    [currentNetRevenue, previousNetRevenue],
  )

  const selectedStoreName =
    selectedStore === 'all'
      ? 'All Stores'
      : stores.find((store) => store.id === selectedStore)?.name || 'Unknown Store'
  const selectedRangeDays = dateWindows.selectedRangeDays
  const isRangeValid = useMemo(() => {
    const fromDate = new Date(`${rangeFrom}T00:00:00`)
    const toDate = new Date(`${rangeTo}T00:00:00`)
    return (
      !Number.isNaN(fromDate.getTime()) &&
      !Number.isNaN(toDate.getTime()) &&
      fromDate.getTime() <= toDate.getTime()
    )
  }, [rangeFrom, rangeTo])

  const applyPresetRange = useCallback((days: number) => {
    const endDate = new Date()
    setRangeTo(format(endDate, 'yyyy-MM-dd'))
    setRangeFrom(format(subDays(endDate, Math.max(days - 1, 0)), 'yyyy-MM-dd'))
  }, [])

  const handleMainPresetChange = useCallback(
    (value: string) => {
      setSelectedDaysPreset(value)
      if (value !== 'custom') {
        applyPresetRange(Number(value))
      }
    },
    [applyPresetRange],
  )

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

  const marginComparisonData = topMarginProducts.map((row) => ({
    productName: row.productName,
    costPrice: Number(row.costPrice.toFixed(2)),
    sellingPrice: Number(row.sellingPrice.toFixed(2)),
  }))

  const nonSellingByStoreChart = storeWiseNonSelling90Days.map((row) => ({
    storeName: row.storeName,
    nonSellingCount: row.nonSellingCount,
  }))

  const exportAnalyticsWorkbook = useCallback(async () => {
    const timestamp = format(new Date(), 'yyyyMMdd_HHmmss')
    const workbook = XLSX.utils.book_new()
    const rangeLabel = `${format(dateWindows.currentStart, 'dd MMM yyyy')} to ${format(dateWindows.currentEnd, 'dd MMM yyyy')}`
    const generatedAt = format(new Date(), 'dd MMM yyyy, hh:mm a')

    // ── Derive all export data from exportStore (independent of page filter) ──
    const expStoreName =
      exportStore === 'all'
        ? 'All Stores'
        : stores.find((s) => s.id === exportStore)?.name || 'Unknown Store'

    // ── Fetch store-specific inventory for the selected store ──
    let expInventoryAnalytics: InventoryAnalytics[] = inventoryAnalytics
    if (exportStore !== 'all') {
      try {
        const invRes = await fetch(`${backendUrl}/api/stores/${exportStore}/assigned-products`)
        if (invRes.ok) {
          const invData: Array<{ productId?: string; productid?: string; quantity?: number; products?: { name?: string; price?: number } }> = await invRes.json()
          const productMap = new Map(products.map((p) => [p.id, p]))
          expInventoryAnalytics = (Array.isArray(invData) ? invData : [])
            .filter((row) => Number(row.quantity ?? 0) > 0)
            .map((row) => {
              const pid = String(row.productId || row.productid || '')
              const globalProduct = productMap.get(pid)
              const productName = row.products?.name || globalProduct?.name || 'Unknown Product'
              const costPrice = globalProduct?.costPrice ?? Number(row.products?.price ?? 0)
              const sellingPrice = globalProduct?.sellingPrice ?? costPrice
              const stock = Number(row.quantity ?? 0)
              const marginPerUnit = sellingPrice - costPrice
              const marginPct = costPrice > 0 ? (marginPerUnit / costPrice) * 100 : null
              return {
                productId: pid,
                productName,
                category: globalProduct?.category ?? 'Uncategorized',
                stock,
                costPrice,
                sellingPrice,
                marginPerUnit,
                marginPct,
                costValue: costPrice * stock,
                potentialSalesValue: sellingPrice * stock,
                potentialProfit: marginPerUnit * stock,
              }
            })
            .sort((a, b) => b.potentialProfit - a.potentialProfit)
        }
      } catch {
        // fall back to global inventory analytics on error
      }
    }

    const expInventorySummary = {
      totalCostValue: expInventoryAnalytics.reduce((s, r) => s + r.costValue, 0),
      totalPotentialSalesValue: expInventoryAnalytics.reduce((s, r) => s + r.potentialSalesValue, 0),
      totalPotentialProfit: expInventoryAnalytics.reduce((s, r) => s + r.potentialProfit, 0),
      lowStockCount: expInventoryAnalytics.filter((r) => r.stock > 0 && r.stock < LOW_STOCK_THRESHOLD).length,
      outOfStockCount: expInventoryAnalytics.filter((r) => r.stock === 0).length,
    }

    const expBillsByStore = bills.filter(
      (bill) => exportStore === 'all' || bill.storeId === exportStore,
    )
    const expFilteredBills = expBillsByStore.filter((bill) => {
      const date = parseDate(bill.createdAt || bill.timestamp)
      return !!date && date >= dateWindows.currentStart && date <= dateWindows.currentEnd
    })

    const expReturns = returns.filter((item) => {
      const date = parseDate(item.createdAt)
      if (!date || date < dateWindows.currentStart || date > dateWindows.currentEnd) return false
      if (exportStore !== 'all' && item.storeId !== exportStore) return false
      return true
    })

    const expApprovedReturnsByDate = new Map<string, number>()
    expReturns.forEach((item) => {
      if (item.status !== 'approved') return
      const date = parseDate(item.createdAt)
      if (!date) return
      const key = format(date, 'yyyy-MM-dd')
      expApprovedReturnsByDate.set(key, (expApprovedReturnsByDate.get(key) || 0) + item.returnAmount)
    })

    const expSummary = summarizeBills(expFilteredBills)
    const expReplacementAmount = expFilteredBills
      .filter((b) => b.isReplacement)
      .reduce((sum, b) => sum + getEffectiveBillTotal(b), 0)
    const expReturnsAmount = expReturns
      .filter((r) => r.status === 'approved')
      .reduce((sum, r) => sum + r.returnAmount, 0)
    const expNetRevenue = expSummary.revenue - expReturnsAmount

    // Daily stats (only dates with data)
    const expDailyMap = new Map<string, DailyStats>()
    expFilteredBills.forEach((bill) => {
      const date = parseDate(bill.createdAt || bill.timestamp)
      if (!date) return
      const key = format(date, 'yyyy-MM-dd')
      if (!expDailyMap.has(key)) {
        expDailyMap.set(key, {
          date: key, revenue: 0, replacementAmount: 0, returnsAmount: 0,
          netRevenue: 0, discount: 0, bills: 0, items: 0, avgBill: 0,
        })
      }
      const bucket = expDailyMap.get(key)!
      const effectiveTotal = getEffectiveBillTotal(bill)
      bucket.revenue += effectiveTotal
      if (bill.isReplacement) bucket.replacementAmount += effectiveTotal
      bucket.discount += bill.discountAmount
      bucket.bills += 1
      bucket.items += bill.items.reduce((sum, item) => sum + item.quantity, 0)
    })
    expDailyMap.forEach((bucket) => {
      bucket.returnsAmount = expApprovedReturnsByDate.get(bucket.date) || 0
      bucket.netRevenue = bucket.revenue - bucket.returnsAmount
      bucket.avgBill = bucket.bills > 0 ? bucket.revenue / bucket.bills : 0
    })
    const expDailyStats = Array.from(expDailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

    // Store analytics
    const expStoreMap = new Map<string, StoreAnalytics>()
    const scopedStores = exportStore === 'all' ? stores : stores.filter((s) => s.id === exportStore)
    scopedStores.forEach((store) => {
      expStoreMap.set(store.id, {
        storeId: store.id, storeName: store.name, storeAddress: store.address,
        revenue: 0, discount: 0, bills: 0, items: 0, avgBill: 0,
      })
    })
    expFilteredBills.forEach((bill) => {
      if (!bill.storeId) return
      if (!expStoreMap.has(bill.storeId)) {
        expStoreMap.set(bill.storeId, {
          storeId: bill.storeId, storeName: bill.storeName || 'Unknown Store', storeAddress: '',
          revenue: 0, discount: 0, bills: 0, items: 0, avgBill: 0,
        })
      }
      const s = expStoreMap.get(bill.storeId)!
      const effectiveTotal = getEffectiveBillTotal(bill)
      s.revenue += effectiveTotal
      s.discount += bill.discountAmount
      s.bills += 1
      s.items += bill.items.reduce((sum, item) => sum + item.quantity, 0)
    })
    expStoreMap.forEach((s) => { s.avgBill = s.bills > 0 ? s.revenue / s.bills : 0 })
    const expStoreAnalytics = Array.from(expStoreMap.values()).sort((a, b) => b.revenue - a.revenue)

    // Product analytics
    const expProductMap = new Map<string, {
      productId: string; productName: string; quantity: number; revenue: number;
      discount: number; billIds: Set<string>; avgSellingPrice: number; lastSoldAt: string;
    }>()
    expFilteredBills.forEach((bill) => {
      bill.items.forEach((item) => {
        if (!expProductMap.has(item.productId)) {
          expProductMap.set(item.productId, {
            productId: item.productId, productName: item.productName,
            quantity: 0, revenue: 0, discount: 0, billIds: new Set(),
            avgSellingPrice: 0, lastSoldAt: '',
          })
        }
        const p = expProductMap.get(item.productId)!
        p.quantity += item.quantity
        p.revenue += item.total
        p.billIds.add(bill.id)
        const billDate = bill.createdAt || bill.timestamp
        if (billDate > p.lastSoldAt) p.lastSoldAt = billDate
      })
    })
    const expProductAnalytics = Array.from(expProductMap.values())
      .map((p) => ({
        ...p,
        bills: p.billIds.size,
        avgSellingPrice: p.quantity > 0 ? p.revenue / p.quantity : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)

    const shouldUseMonthlyRevenue = selectedRangeDays > 30

    // Helper: resolve store name from id
    const storeNameById = (id: string) => stores.find((s) => s.id === id)?.name || id
    // Helper: resolve product name from id
    const productNameById = (id: string) => products.find((p) => p.id === id)?.name || id

    // ══════════════════════════════════════════
    // 1. OVERVIEW
    // ══════════════════════════════════════════
    const summaryKV: Array<Record<string, unknown>> = [
      { description: 'Report Generated On', value: generatedAt },
      { description: 'Store', value: expStoreName },
      { description: 'Report Period', value: rangeLabel },
      { description: 'Number of Days', value: selectedRangeDays },
      { description: '', value: '' },
      { description: 'Gross Sales', value: Number(expSummary.revenue.toFixed(2)) },
      { description: 'Replacements', value: Number(expReplacementAmount.toFixed(2)) },
      { description: 'Returns / Refunds', value: Number(expReturnsAmount.toFixed(2)) },
      { description: 'Net Sales (Gross − Returns)', value: Number(expNetRevenue.toFixed(2)) },
      { description: 'Total Discount Given', value: Number(expSummary.discount.toFixed(2)) },
      { description: '', value: '' },
      { description: 'Total Bills Raised', value: expSummary.bills },
      { description: 'Total Items Sold', value: expSummary.items },
      { description: 'Unique Customers', value: expSummary.customers },
      { description: 'Average Bill Value', value: Number(expSummary.avgBill.toFixed(2)) },
      { description: '', value: '' },
      { description: 'Inventory — Total Cost Value', value: Number(expInventorySummary.totalCostValue.toFixed(2)) },
      { description: 'Inventory — Potential Sales Value', value: Number(expInventorySummary.totalPotentialSalesValue.toFixed(2)) },
      { description: 'Inventory — Potential Profit', value: Number(expInventorySummary.totalPotentialProfit.toFixed(2)) },
      { description: 'Low Stock Products', value: expInventorySummary.lowStockCount },
      { description: 'Out of Stock Products', value: expInventorySummary.outOfStockCount },
    ]
    XLSX.utils.book_append_sheet(
      workbook,
      buildSheet(summaryKV, {
        hasTotalRow: false,
        title: 'Business Overview',
        subtitle: `${expStoreName} | ${rangeLabel} | Generated: ${generatedAt}`,
        notes: [
          'Note: Gross Sales includes all billed amounts. Net Sales = Gross Sales minus approved Returns/Refunds.',
          'Replacement Amount is included in Gross Sales (items given as free replacements for defective goods).',
          'Inventory values are as of the report generation date, not the end of the reporting period.',
        ],
      }),
      'Overview',
    )

    // ══════════════════════════════════════════
    // 2. SALES BREAKDOWN
    // ══════════════════════════════════════════
    const monthlyRevenueRows = Array.from(
      expDailyStats.reduce((acc, row) => {
        const monthKey = row.date.slice(0, 7)
        const prev = acc.get(monthKey) || {
          month: monthKey, revenue: 0, replacements: 0, returns: 0,
          net: 0, discount: 0, bills: 0, items: 0, avg: 0,
        }
        prev.revenue += row.revenue
        prev.replacements += row.replacementAmount
        prev.returns += row.returnsAmount
        prev.net += row.netRevenue
        prev.discount += row.discount
        prev.bills += row.bills
        prev.items += row.items
        prev.avg = prev.bills > 0 ? prev.revenue / prev.bills : 0
        acc.set(monthKey, prev)
        return acc
      }, new Map<string, {
        month: string; revenue: number; replacements: number;
        returns: number; net: number; discount: number;
        bills: number; items: number; avg: number
      }>()).values(),
    )

    const revenueSheetLabel = shouldUseMonthlyRevenue ? 'Monthly Sales' : 'Daily Sales'
    const salesRows = appendTotalRow(
      shouldUseMonthlyRevenue
        ? monthlyRevenueRows.map((row, i) => ({
            sl_no: i + 1,
            month: row.month,
            gross_sales: Number(row.revenue.toFixed(2)),
            replacements: Number(row.replacements.toFixed(2)),
            returns_refunded: Number(row.returns.toFixed(2)),
            net_sales: Number(row.net.toFixed(2)),
            total_discount: Number(row.discount.toFixed(2)),
            total_bills: row.bills,
            total_items_sold: row.items,
            average_bill_value: Number(row.avg.toFixed(2)),
          }))
        : expDailyStats.map((row, i) => ({
            sl_no: i + 1,
            date: format(new Date(row.date), 'dd MMM yyyy'),
            gross_sales: Number(row.revenue.toFixed(2)),
            replacements: Number(row.replacementAmount.toFixed(2)),
            returns_refunded: Number(row.returnsAmount.toFixed(2)),
            net_sales: Number(row.netRevenue.toFixed(2)),
            total_discount: Number(row.discount.toFixed(2)),
            total_bills: row.bills,
            total_items_sold: row.items,
            average_bill_value: Number(row.avgBill.toFixed(2)),
          })),
      [
        'gross_sales', 'replacements', 'returns_refunded', 'net_sales',
        'total_discount', 'total_bills', 'total_items_sold', 'average_bill_value',
      ],
      'sl_no',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      buildSheet(salesRows, {
        title: `${revenueSheetLabel} Breakdown`,
        subtitle: `${expStoreName} | ${rangeLabel}`,
        notes: [
          'Gross Sales = Total billed amount (including replacements).',
          'Net Sales = Gross Sales minus Returns/Refunds. This is the actual revenue received.',
          'Avg. Bill Value = Gross Sales ÷ Number of Bills.',
        ],
      }),
      revenueSheetLabel,
    )

    // ══════════════════════════════════════════
    // 3. STORE-WISE PERFORMANCE
    // ══════════════════════════════════════════
    const storeRows = appendTotalRow(
      expStoreAnalytics.map((row, i) => ({
        sl_no: i + 1,
        store_name: row.storeName,
        store_address: row.storeAddress || '—',
        revenue: Number(row.revenue.toFixed(2)),
        discount: Number(row.discount.toFixed(2)),
        bills: row.bills,
        items: row.items,
        avg_bill: Number(row.avgBill.toFixed(2)),
      })),
      ['revenue', 'discount', 'bills', 'items', 'avg_bill'],
      'sl_no',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      buildSheet(storeRows, {
        title: 'Store-wise Sales Performance',
        subtitle: `${rangeLabel}`,
        notes: [
          'Revenue = Total billed amount for each store in the selected period.',
          'Discount = Total discount given across all bills for that store.',
        ],
      }),
      'Stores',
    )

    // ══════════════════════════════════════════
    // 4. PRODUCT SALES
    // ══════════════════════════════════════════
    const productRows = appendTotalRow(
      expProductAnalytics.map((row, i) => ({
        sl_no: i + 1,
        product_name: row.productName,
        quantity: row.quantity,
        revenue: Number(row.revenue.toFixed(2)),
        discount: Number(row.discount.toFixed(2)),
        bills: row.bills,
        avg_selling_price: Number(row.avgSellingPrice.toFixed(2)),
        last_sold: row.lastSoldAt ? format(new Date(row.lastSoldAt), 'dd MMM yyyy') : 'Not sold in period',
      })),
      ['quantity', 'revenue', 'discount', 'bills', 'avg_selling_price'],
      'sl_no',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      buildSheet(productRows, {
        title: 'Product-wise Sales Report',
        subtitle: `${expStoreName} | ${rangeLabel}`,
        notes: [
          'Qty Sold = Total units sold across all bills in the period.',
          'Avg. Selling Price = Revenue ÷ Qty Sold. May differ from MRP if discounts were applied.',
          'Last Sold On = Most recent sale date within the reporting period.',
        ],
      }),
      'Product Sales',
    )

    // ══════════════════════════════════════════
    // 5. INVENTORY VALUATION & MARGINS
    // ══════════════════════════════════════════
    const inventoryRows = appendTotalRow(
      expInventoryAnalytics.map((row, i) => ({
        sl_no: i + 1,
        product_name: row.productName,
        stock: row.stock,
        cost_price: Number(row.costPrice.toFixed(2)),
        selling_price: Number(row.sellingPrice.toFixed(2)),
        profit_per_unit: Number(row.marginPerUnit.toFixed(2)),
        profit_margin: row.marginPct !== null ? Number(row.marginPct.toFixed(1)) : 0,
        total_cost_value: Number(row.costValue.toFixed(2)),
        total_selling_value: Number(row.potentialSalesValue.toFixed(2)),
        total_potential_profit: Number(row.potentialProfit.toFixed(2)),
      })),
      ['stock', 'cost_price', 'selling_price', 'profit_per_unit', 'total_cost_value', 'total_selling_value', 'total_potential_profit'],
      'sl_no',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      buildSheet(inventoryRows, {
        title: 'Inventory Valuation & Profit Margins',
        subtitle: `${expStoreName} | As of ${generatedAt}`,
        notes: [
          'Cost Price = Purchase/procurement cost per unit.',
          'Selling Price = Listed retail price per unit.',
          'Profit / Unit = Selling Price minus Cost Price.',
          'Profit Margin (%) = (Profit / Unit ÷ Cost Price) × 100.',
          'Total Cost Value = Cost Price × Current Stock. This is the capital tied up in inventory.',
          'Total Selling Value = Selling Price × Current Stock. This is the expected revenue if all stock is sold at listed price.',
          'Total Potential Profit = Total Selling Value minus Total Cost Value.',
        ],
      }),
      'Inventory',
    )

    // ══════════════════════════════════════════
    // 6. RETURNS & REFUNDS
    // ══════════════════════════════════════════
    const returnsRows = appendTotalRow(
      expReturns.map((item, i) => ({
        sl_no: i + 1,
        return_date: item.createdAt ? format(new Date(item.createdAt), 'dd MMM yyyy') : '',
        return_id: item.returnId,
        product_returned: productNameById(item.productId),
        store: item.storeId ? storeNameById(item.storeId) : '—',
        return_status: (item.status || 'pending').charAt(0).toUpperCase() + (item.status || 'pending').slice(1),
        refund_amount: Number(item.returnAmount.toFixed(2)),
      })),
      ['refund_amount'],
      'sl_no',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      buildSheet(returnsRows, {
        title: 'Returns & Refunds Register',
        subtitle: `${expStoreName} | ${rangeLabel}`,
        notes: [
          'This sheet lists all return/refund transactions raised during the reporting period.',
          'Status: Approved = refund processed; Pending = awaiting approval; Rejected = refund denied.',
          'Refund Amount is deducted from Gross Sales to arrive at Net Sales in the Overview.',
        ],
      }),
      'Returns',
    )

    // ══════════════════════════════════════════
    // 7. REPLACEMENTS & RETURNS LEDGER
    // ══════════════════════════════════════════
    const ledgerRows = [
      ...expFilteredBills
        .filter((bill) => bill.isReplacement)
        .map((bill) => {
          const date = parseDate(bill.createdAt || bill.timestamp)
          const amt = Math.round(getEffectiveBillTotal(bill))
          return {
            transaction_date: date ? format(date, 'dd MMM yyyy HH:mm') : '',
            type: 'Replacement' as const,
            reference_id: bill.id,
            store: bill.storeId ? storeNameById(bill.storeId) : '—',
            status: 'Completed',
            credit: amt,
            debit: 0,
            amount: amt,
            remarks: 'Free replacement issued for defective/returned goods',
          }
        }),
      ...expReturns.map((item) => {
        const date = parseDate(item.createdAt)
        const amt = Math.round(item.returnAmount || 0)
        return {
          transaction_date: date ? format(date, 'dd MMM yyyy HH:mm') : '',
          type: 'Return / Refund' as const,
          reference_id: item.returnId,
          store: item.storeId ? storeNameById(item.storeId) : '—',
          status: (item.status || 'pending').charAt(0).toUpperCase() + (item.status || 'pending').slice(1),
          credit: 0,
          debit: amt,
          amount: -amt,
          remarks: `Customer refund — ${productNameById(item.productId)}`,
        }
      }),
    ].sort((a, b) => {
      const aTime = parseDate(a.transaction_date)?.getTime() || 0
      const bTime = parseDate(b.transaction_date)?.getTime() || 0
      return bTime - aTime
    })
    const numberedLedger = ledgerRows.map((row, i) => ({ sl_no: i + 1, ...row }))
    XLSX.utils.book_append_sheet(
      workbook,
      buildSheet(numberedLedger, {
        hasTotalRow: false,
        title: 'Replacements & Refunds Ledger',
        subtitle: `${expStoreName} | ${rangeLabel}`,
        notes: [
          'Credit = Amount added (replacement goods issued). Debit = Amount refunded to customer.',
          'Net Amount = Credit minus Debit. Positive = inflow, Negative = outflow.',
          'This ledger can be used for reconciliation with bank statements and GST return filings.',
        ],
      }),
      'Ledger',
    )

    // ══════════════════════════════════════════
    // 8. BILL-WISE DETAILS
    // ══════════════════════════════════════════
    const billDetailRows = expFilteredBills.map((bill, i) => {
      const date = parseDate(bill.createdAt || bill.timestamp)
      const effectiveTotal = getEffectiveBillTotal(bill)
      return {
        sl_no: i + 1,
        date: date ? format(date, 'dd MMM yyyy') : '',
        bill_id: bill.id,
        store: bill.storeId ? storeNameById(bill.storeId) : '—',
        total_items: bill.items.reduce((sum, item) => sum + item.quantity, 0),
        gross_sales: Number(effectiveTotal.toFixed(2)),
        total_discount: Number(bill.discountAmount.toFixed(2)),
        net_sales: Number((effectiveTotal - bill.discountAmount).toFixed(2)),
        type: bill.isReplacement ? 'Replacement' : 'Regular Sale',
      }
    })
    XLSX.utils.book_append_sheet(
      workbook,
      buildSheet(billDetailRows, {
        hasTotalRow: false,
        title: 'Bill-wise Transaction Details',
        subtitle: `${expStoreName} | ${rangeLabel} | ${expFilteredBills.length} bills`,
        notes: [
          'Each row represents one bill/invoice raised during the reporting period.',
          'Replacement bills are goods issued free as replacements — they appear in Gross Sales but no payment is collected.',
          'Use Bill ID to cross-reference with individual invoice records.',
        ],
      }),
      'All Bills',
    )

    const safeStoreName = expStoreName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30)
    XLSX.writeFile(workbook, `Sales_Report_${safeStoreName}_${timestamp}.xlsx`, { cellStyles: true })
  }, [
    exportStore,
    selectedRangeDays,
    dateWindows,
    bills,
    returns,
    stores,
    products,
    inventoryAnalytics,
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
                  Deep reporting with sales breakdown, store performance, inventory valuation, and audit-ready exports.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {`Showing ${selectedRangeDays} day window (${format(
                    dateWindows.currentStart,
                    'dd MMM yyyy',
                  )} - ${format(
                    dateWindows.currentEnd,
                    'dd MMM yyyy',
                  )}) | Store: ${selectedStoreName}`}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Select
                  value={selectedDaysPreset}
                  onValueChange={handleMainPresetChange}
                >
                  <SelectTrigger className="w-[150px] border-slate-300 bg-white text-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Last 30 Days</SelectItem>
                    <SelectItem value="45">Last 45 Days</SelectItem>
                    <SelectItem value="90">Last 90 Days</SelectItem>
                    <SelectItem value="150">Last 150 Days</SelectItem>
                    <SelectItem value="365">Last 365 Days</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => {
                    setRangeFrom(e.target.value)
                    setSelectedDaysPreset('custom')
                  }}
                  className="w-[170px] border-slate-300 bg-white text-slate-800"
                />

                <Input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => {
                    setRangeTo(e.target.value)
                    setSelectedDaysPreset('custom')
                  }}
                  className="w-[170px] border-slate-300 bg-white text-slate-800"
                />

                <Select value={selectedStore} onValueChange={setSelectedStore}>
                  <SelectTrigger className="w-[190px] border-slate-300 bg-white text-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stores</SelectItem>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        <div>
                          <span>{store.name}</span>
                          {store.address && (
                            <span className="ml-2 text-xs text-muted-foreground">{store.address}</span>
                          )}
                        </div>
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

                <Button
                  onClick={() => {
                    setExportStore(selectedStore)
                    setExportDialogOpen(true)
                  }}
                  className="bg-emerald-500 text-slate-900 hover:bg-emerald-400"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export Full Excel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Export Analytics Excel</DialogTitle>
              <DialogDescription>
                Choose a preset or custom date range for export.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Store</label>
                <Select value={exportStore} onValueChange={setExportStore}>
                  <SelectTrigger className="w-full border-slate-300 bg-white text-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stores</SelectItem>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        <div>
                          <span>{store.name}</span>
                          {store.address && (
                            <span className="ml-2 text-xs text-muted-foreground">{store.address}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Date Range</label>
                <Select value={selectedDaysPreset} onValueChange={handleMainPresetChange}>
                  <SelectTrigger className="w-full border-slate-300 bg-white text-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGE_PRESETS.map((days) => (
                      <SelectItem key={days} value={days.toString()}>{`Last ${days} Days`}</SelectItem>
                    ))}
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => {
                    setRangeFrom(e.target.value)
                    setSelectedDaysPreset('custom')
                  }}
                />
                <Input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => {
                    setRangeTo(e.target.value)
                    setSelectedDaysPreset('custom')
                  }}
                />
              </div>
              {!isRangeValid && (
                <p className="text-xs text-red-600">Please select a valid range: From date must be before To date.</p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!isRangeValid}
                onClick={() => {
                  setExportDialogOpen(false)
                  exportAnalyticsWorkbook()
                }}
                className="bg-emerald-500 text-slate-900 hover:bg-emerald-400"
              >
                Export Excel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-8">
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
          <MetricCard
            title="Replacement Amount"
            value={formatCurrency(currentReplacementAmount)}
            icon={<RefreshCw className="h-4 w-4 text-muted-foreground" />}
            change={replacementChange}
          />
          <MetricCard
            title="Returns Amount"
            value={formatCurrency(currentReturnsAmount)}
            icon={<TrendingDown className="h-4 w-4 text-muted-foreground" />}
            change={returnsAmountChange}
          />
          <MetricCard
            title="Net Revenue"
            value={formatCurrency(currentNetRevenue)}
            icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
            change={netRevenueChange}
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
              <p>{`Replacement amount: ${formatCurrency(currentReplacementAmount)}`}</p>
              <p>{`Net revenue after returns: ${formatCurrency(currentNetRevenue)}`}</p>
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
            <TabsTrigger value="inventory" className="rounded-lg">
              Inventory
            </TabsTrigger>
            <TabsTrigger value="returns" className="rounded-lg">
              Returns
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Revenue Composition</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
                <p>{`Replacement amount: ${formatCurrency(currentReplacementAmount)}`}</p>
                <p>{`Approved/completed returns: ${formatCurrency(currentReturnsAmount)}`}</p>
                <p>{`Net revenue: ${formatCurrency(currentNetRevenue)}`}</p>
              </CardContent>
            </Card>
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
            {/* Month/Year Navigator */}
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="icon" onClick={handleRevenuePrevMonth} disabled={isAtMinMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[120px] text-center text-lg font-semibold">
                {format(new Date(revenueYear, revenueMonth), 'MMMM')}
              </span>
              <Select
                value={String(revenueYear)}
                onValueChange={(val) => {
                  const y = Number(val)
                  setRevenueYear(y)
                  const currentNow = new Date()
                  if (y === currentNow.getFullYear() && revenueMonth > currentNow.getMonth()) {
                    setRevenueMonth(currentNow.getMonth())
                  }
                }}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {revenueYearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={handleRevenueNextMonth} disabled={isAtMaxMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Revenue, Bills and Items by Day</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart data={filteredDailyStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), 'dd MMM')} />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#2563eb" name="Revenue" />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="replacementAmount"
                      stroke="#7c3aed"
                      name="Replacement Amount"
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="returnsAmount"
                      stroke="#dc2626"
                      name="Returns Amount"
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="netRevenue"
                      stroke="#0f766e"
                      name="Net Revenue"
                    />
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
                      <TableHead className="text-right">Replacement</TableHead>
                      <TableHead className="text-right">Returns</TableHead>
                      <TableHead className="text-right">Net Revenue</TableHead>
                      <TableHead className="text-right">Bills</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Avg Bill</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDailyStats.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No revenue data for this month.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredDailyStats.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell>{format(new Date(row.date), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.replacementAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.returnsAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.netRevenue)}</TableCell>
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
                        <TableCell>
                          <div className="font-medium">{storeRow.storeName}</div>
                          {storeRow.storeAddress && (
                            <div className="text-xs text-muted-foreground">{storeRow.storeAddress}</div>
                          )}
                        </TableCell>
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
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No product sales in this period.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredProductAnalytics.slice(0, 30).map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell className="font-medium">{row.productName}</TableCell>
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
                  <p>{`Replacement amount (selected period): ${formatCurrency(currentReplacementAmount)}`}</p>
                  <p>{`Net revenue after returns: ${formatCurrency(currentNetRevenue)}`}</p>
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
