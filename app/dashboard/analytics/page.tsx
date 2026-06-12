'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { differenceInCalendarDays, endOfDay, format, startOfDay, subDays } from 'date-fns'
import { formatDisplayDate, formatDisplayDateTime } from '@/app/utils/formatDate'
import * as XLSX from 'xlsx'
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Calendar,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Download,
  Layers,
  MapPin,
  Package,
  Percent,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
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
  batchId?: string
  barcode?: string
}

// One row in the grouped Product Sales Table: all variants (different ids /
// barcodes / batches) that share the same product name AND selling price are
// rolled up into a single group, with the per-variant rows kept for drill-down.
interface GroupedProductStats {
  key: string
  productName: string
  category: string
  sellingPrice: number
  quantity: number
  revenue: number
  discount: number
  bills: number
  avgSellingPrice: number
  lastSoldAt?: string
  costPrice: number
  cogs: number
  profit: number
  profitMargin: number | null
  variantCount: number
  productIds: string[]
  variants: ProductSalesStats[]
}

interface BatchRecord {
  id: string
  batchNumber: string
  place: string
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
  costPrice: number
  cogs: number
  profit: number
  profitMargin: number | null
  batchId?: string
  batchNumber?: string
}

interface ProductStoreStats {
  storeId: string
  storeName: string
  quantity: number
  revenue: number
  bills: number
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
  | 'profit'
  | 'batches'
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
    const batchIdRaw = product.batchId ?? product.batchid ?? product.batch_id

    return {
      id: String(product.id || ''),
      name: product.name || 'Unknown Product',
      category: String(product.category || 'Uncategorized').trim() || 'Uncategorized',
      costPrice,
      sellingPrice,
      stock: Number(product.stock || 0),
      createdAt: product.createdAt || product.created_at || product.createdat,
      batchId: batchIdRaw ? String(batchIdRaw) : undefined,
      barcode: typeof product.barcode === 'string' ? product.barcode : '',
    }
  })
}

const normalizeBatches = (rawBatches: any[]): BatchRecord[] => {
  return rawBatches.map((batch) => ({
    id: String(batch.id || ''),
    batchNumber: String(batch.batchNumber ?? batch.batch_number ?? batch.batchnumber ?? '').trim() || 'Unnamed Batch',
    place: String(batch.place ?? '').trim(),
    createdAt: batch.createdAt || batch.created_at || batch.createdat,
  }))
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
  'closing_stock_cost_value', 'closing_stock_selling_value', 'cogs', 'profit',
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
  category: 'Category',
  quantity: 'Qty Sold',
  avg_selling_price: 'Avg. Selling Price (₹)',
  last_sold: 'Last Sold On',
  cogs: 'COGS (₹)',
  profit: 'Profit (₹)',
  products_sold: 'Products Sold',
  total_units: 'Total Units Sold',
  count: 'Count',

  // Inventory
  stock: 'Closing Stock (Units)',
  opening_stock: 'Opening Stock (Units)',
  units_sold: 'Units Sold (Period)',
  total_products: 'No. of Products',
  opening_stock_units: 'Opening Stock (Units)',
  items_sold_units: 'Items Sold (Units)',
  closing_stock_units: 'Closing Stock (Units)',
  closing_stock_cost_value: 'Closing Stock Value at Cost (₹)',
  closing_stock_selling_value: 'Closing Stock Value at Selling Price (₹)',
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
  // Optional small table rendered above the main table (after the title block).
  summary?: { title?: string; rows: Array<Record<string, unknown>> }
}

const buildSheet = (
  rows: Array<Record<string, unknown>>,
  opts?: BuildSheetOpts,
) => {
  const hasTotalRow = opts?.hasTotalRow ?? true
  const title = opts?.title
  const subtitle = opts?.subtitle
  const notes = opts?.notes || []
  const summary = opts?.summary
  const keys = rows.length > 0 ? Object.keys(rows[0]) : []

  const toLabel = (k: string) =>
    HEADER_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  const headerRow = keys.map(toLabel)

  const aoa: unknown[][] = []

  // Title block
  if (title) {
    aoa.push([title])
    if (subtitle) aoa.push([subtitle])
    aoa.push([]) // blank spacer
  }

  // Summary table block (above the main table)
  let summaryTitleIdx = -1
  let summaryHeaderIdx = -1
  let summaryDataStart = -1
  let summaryDataEnd = -1
  let summaryKeys: string[] = []
  if (summary && summary.rows.length > 0) {
    summaryKeys = Object.keys(summary.rows[0])
    if (summary.title) {
      summaryTitleIdx = aoa.length
      aoa.push([summary.title])
    }
    summaryHeaderIdx = aoa.length
    aoa.push(summaryKeys.map(toLabel))
    summaryDataStart = aoa.length
    summary.rows.forEach((row) => {
      aoa.push(summaryKeys.map((k) => row[k] ?? ''))
    })
    summaryDataEnd = aoa.length - 1
    aoa.push([]) // blank spacer before the main table
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
  if (summaryTitleIdx >= 0 && summaryKeys.length > 1) {
    merges.push({
      s: { r: summaryTitleIdx, c: 0 },
      e: { r: summaryTitleIdx, c: summaryKeys.length - 1 },
    })
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
  if (summaryHeaderIdx >= 0) {
    sheet['!rows'][summaryHeaderIdx] = { hpt: 36 }
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
        const isSummaryTitleRow = r === summaryTitleIdx
        const isSummaryHeaderRow = r === summaryHeaderIdx
        const isSummaryDataRow =
          summaryDataStart >= 0 && r >= summaryDataStart && r <= summaryDataEnd
        const isHeaderRow = r === headerRowIdx
        const isTotalRow = hasTotalRow && rows.length > 1 && r === headerRowIdx + rows.length
        const isDataRow = r > headerRowIdx && r < headerRowIdx + rows.length + 1 && !isTotalRow
        const isEvenDataRow = isDataRow && (r - headerRowIdx) % 2 === 0
        const isNoteRow = r >= notesStartRow
        const colKey =
          isSummaryHeaderRow || isSummaryDataRow ? summaryKeys[c] || '' : keys[c] || ''
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
        } else if (isSummaryTitleRow) {
          cell.s = {
            font: { bold: true, sz: 12, color: { rgb: '1E293B' } },
            fill: { patternType: 'solid', fgColor: { rgb: 'D1FAE5' } },
            alignment: { horizontal: 'center', vertical: 'center' },
          }
        } else if (isSummaryHeaderRow) {
          cell.s = {
            font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
            fill: { patternType: 'solid', fgColor: { rgb: '047857' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: thinBorder,
          }
        } else if (isSummaryDataRow) {
          const isSummaryTotalRow =
            r === summaryDataEnd && String(aoa[r]?.[0] ?? '').toUpperCase().startsWith('TOTAL')
          cell.s = {
            font: { bold: isSummaryTotalRow, sz: 10, color: { rgb: '1E293B' } },
            fill: {
              patternType: 'solid',
              fgColor: { rgb: isSummaryTotalRow ? 'D1FAE5' : 'ECFDF5' },
            },
            border: thinBorder,
            alignment: isNumeric ? { horizontal: 'right' } : { vertical: 'center' },
            numFmt: isCurrency ? '#,##0.00' : isPct ? '0.0"%"' : undefined,
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

type AccentColor = 'blue' | 'emerald' | 'amber' | 'violet' | 'rose' | 'sky'

const ACCENT_STYLES: Record<AccentColor, { bar: string; iconBg: string; cardBg: string }> = {
  blue: {
    bar: 'bg-gradient-to-b from-blue-500 to-sky-400',
    iconBg: 'bg-blue-50 text-blue-700',
    cardBg: 'from-blue-50/40 to-white',
  },
  emerald: {
    bar: 'bg-gradient-to-b from-emerald-500 to-green-400',
    iconBg: 'bg-emerald-50 text-emerald-700',
    cardBg: 'from-emerald-50/40 to-white',
  },
  amber: {
    bar: 'bg-gradient-to-b from-amber-500 to-orange-400',
    iconBg: 'bg-amber-50 text-amber-700',
    cardBg: 'from-amber-50/40 to-white',
  },
  violet: {
    bar: 'bg-gradient-to-b from-violet-500 to-purple-400',
    iconBg: 'bg-violet-50 text-violet-700',
    cardBg: 'from-violet-50/40 to-white',
  },
  rose: {
    bar: 'bg-gradient-to-b from-rose-500 to-pink-400',
    iconBg: 'bg-rose-50 text-rose-700',
    cardBg: 'from-rose-50/40 to-white',
  },
  sky: {
    bar: 'bg-gradient-to-b from-sky-500 to-cyan-400',
    iconBg: 'bg-sky-50 text-sky-700',
    cardBg: 'from-sky-50/40 to-white',
  },
}

interface MetricCardProps {
  title: string
  value: string
  icon: React.ReactNode
  change?: number | null
  subtitle?: string
  accent?: AccentColor
  progress?: number
}

const MetricCard = ({
  title,
  value,
  icon,
  change,
  subtitle,
  accent = 'blue',
  progress,
}: MetricCardProps) => {
  const styles = ACCENT_STYLES[accent]
  return (
    <Card
      className={`relative overflow-hidden border-slate-200/80 shadow-sm bg-gradient-to-br ${styles.cardBg} transition-shadow hover:shadow-md`}
    >
      <div className={`absolute left-0 top-0 h-full w-1 ${styles.bar}`} />
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 pl-4">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-slate-600">
          {title}
        </CardTitle>
        <div className={`rounded-md p-1.5 ${styles.iconBg}`}>{icon}</div>
      </CardHeader>
      <CardContent className="pl-4">
        <div className="text-2xl font-bold tracking-tight break-all leading-tight text-slate-900">
          {value}
        </div>
        {subtitle && (
          <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>
        )}
        {typeof progress === 'number' && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full ${styles.bar}`}
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
        )}
        {change !== undefined && (
          <p className="mt-2 text-xs text-muted-foreground">
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
}

export default function AnalyticsPage() {
  const router = useRouter()
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8080'

  const [bills, setBills] = useState<Bill[]>([])
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [returns, setReturns] = useState<ReturnItem[]>([])
  const [batches, setBatches] = useState<BatchRecord[]>([])
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
  const [dialogProductId, setDialogProductId] = useState<string | null>(null)
  const [dialogGroupKey, setDialogGroupKey] = useState<string | null>(null)
  const [productsLimit, setProductsLimit] = useState(30)
  const [dialogBatchId, setDialogBatchId] = useState<string | null>(null)
  const [batchSearch, setBatchSearch] = useState('')

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
      const [billsRes, storesRes, productsRes, returnsRes, batchesRes] = await Promise.all([
        fetch(`${backendUrl}/api/bills`).then((res) => res.json()),
        fetch(`${backendUrl}/api/stores`).then((res) => res.json()),
        fetch(`${backendUrl}/api/products`).then((res) => res.json()),
        fetch(`${backendUrl}/api/returns`).then((res) => res.json()),
        fetch(`${backendUrl}/api/batches`)
          .then((res) => (res.ok ? res.json() : []))
          .catch(() => []),
      ])

      setBills(normalizeBills(Array.isArray(billsRes) ? billsRes : []))
      setStores(normalizeStores(Array.isArray(storesRes) ? storesRes : []))
      setProducts(normalizeProducts(Array.isArray(productsRes) ? productsRes : []))
      setReturns(normalizeReturns(Array.isArray(returnsRes) ? returnsRes : []))
      setBatches(normalizeBatches(Array.isArray(batchesRes) ? batchesRes : []))
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

  const productCostMap = useMemo(() => {
    const map = new Map<string, number>()
    products.forEach((product) => {
      map.set(product.id, product.costPrice || 0)
    })
    return map
  }, [products])

  const productSellingMap = useMemo(() => {
    const map = new Map<string, number>()
    products.forEach((product) => {
      map.set(product.id, product.sellingPrice || 0)
    })
    return map
  }, [products])

  const productRecordMap = useMemo(() => {
    const map = new Map<string, ProductRecord>()
    products.forEach((product) => {
      map.set(product.id, product)
    })
    return map
  }, [products])

  const storeNameMap = useMemo(() => {
    const map = new Map<string, string>()
    stores.forEach((store) => {
      map.set(store.id, store.name)
    })
    return map
  }, [stores])

  const batchMap = useMemo(() => {
    const map = new Map<string, BatchRecord>()
    batches.forEach((batch) => {
      map.set(batch.id, batch)
    })
    return map
  }, [batches])

  const productBatchMap = useMemo(() => {
    const map = new Map<string, { batchId: string; batchNumber: string; place: string }>()
    products.forEach((product) => {
      if (!product.batchId) return
      const batch = batchMap.get(product.batchId)
      map.set(product.id, {
        batchId: product.batchId,
        batchNumber: batch?.batchNumber || 'Unknown Batch',
        place: batch?.place || '',
      })
    })
    return map
  }, [products, batchMap])

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
          const batchInfo = productBatchMap.get(item.productId)
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
            costPrice: productCostMap.get(item.productId) || 0,
            cogs: 0,
            profit: 0,
            profitMargin: null,
            batchId: batchInfo?.batchId,
            batchNumber: batchInfo?.batchNumber,
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
      stats.cogs = stats.costPrice * stats.quantity
      stats.profit = stats.revenue - stats.cogs
      stats.profitMargin = stats.revenue > 0 ? (stats.profit / stats.revenue) * 100 : null
    })

    return map
  }, [filteredBills, productCategoryMap, productCostMap, productBatchMap])

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

  // Roll up per-variant sales into one row per (product name + selling price).
  // Each group keeps its member variants so the drill-down dialog can show the
  // individual barcodes / batches / per-store sales.
  const groupedProductAnalytics = useMemo((): GroupedProductStats[] => {
    const groups = new Map<string, GroupedProductStats>()

    productAnalytics.forEach((variant) => {
      const sellingPrice =
        productSellingMap.get(variant.productId) ?? Math.round(variant.avgSellingPrice)
      const key = `${variant.productName.trim().toLowerCase()}||${sellingPrice}`

      let group = groups.get(key)
      if (!group) {
        group = {
          key,
          productName: variant.productName,
          category: variant.category,
          sellingPrice,
          quantity: 0,
          revenue: 0,
          discount: 0,
          bills: 0,
          avgSellingPrice: 0,
          lastSoldAt: undefined,
          costPrice: 0,
          cogs: 0,
          profit: 0,
          profitMargin: null,
          variantCount: 0,
          productIds: [],
          variants: [],
        }
        groups.set(key, group)
      }

      group.quantity += variant.quantity
      group.revenue += variant.revenue
      group.discount += variant.discount
      group.bills += variant.bills
      group.cogs += variant.cogs
      group.productIds.push(variant.productId)
      group.variants.push(variant)
      if (variant.lastSoldAt && (!group.lastSoldAt || variant.lastSoldAt > group.lastSoldAt)) {
        group.lastSoldAt = variant.lastSoldAt
      }
    })

    const list = Array.from(groups.values())
    list.forEach((group) => {
      group.variantCount = group.productIds.length
      group.avgSellingPrice = group.quantity > 0 ? group.revenue / group.quantity : 0
      group.costPrice = group.quantity > 0 ? group.cogs / group.quantity : 0
      group.profit = group.revenue - group.cogs
      group.profitMargin = group.revenue > 0 ? (group.profit / group.revenue) * 100 : null
      group.variants.sort((a, b) => b.revenue - a.revenue)
    })

    return list.sort((a, b) => b.revenue - a.revenue)
  }, [productAnalytics, productSellingMap])

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

  const currentProfitSummary = useMemo(() => {
    let revenue = 0
    let cogs = 0
    currentSalesMap.forEach((stats) => {
      revenue += stats.revenue
      cogs += stats.cogs
    })
    const profit = revenue - cogs
    return {
      revenue,
      cogs,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    }
  }, [currentSalesMap])

  const previousProfitSummary = useMemo(() => {
    let revenue = 0
    let cogs = 0
    previousPeriodBills.forEach((bill) => {
      bill.items.forEach((item) => {
        if (!item.productId) return
        revenue += item.total
        const cost = productCostMap.get(item.productId) || 0
        cogs += cost * item.quantity
      })
    })
    const profit = revenue - cogs
    return {
      revenue,
      cogs,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    }
  }, [previousPeriodBills, productCostMap])

  const productStoreBreakdown = useMemo(() => {
    const map = new Map<string, Map<string, ProductStoreStats>>()

    filteredBills.forEach((bill) => {
      if (!bill.storeId) return
      const resolvedName =
        storeNameMap.get(bill.storeId) || bill.storeName || 'Unknown Store'

      bill.items.forEach((item) => {
        if (!item.productId) return

        if (!map.has(item.productId)) {
          map.set(item.productId, new Map())
        }
        const storeMap = map.get(item.productId)!

        if (!storeMap.has(bill.storeId)) {
          storeMap.set(bill.storeId, {
            storeId: bill.storeId,
            storeName: resolvedName,
            quantity: 0,
            revenue: 0,
            bills: 0,
          })
        }
        const stats = storeMap.get(bill.storeId)!
        stats.quantity += item.quantity
        stats.revenue += item.total
        stats.bills += 1
      })
    })

    return map
  }, [filteredBills, storeNameMap])

  const topReturnedProducts = useMemo(() => {
    interface ReturnedProductRow {
      productId: string
      productName: string
      amount: number
      count: number
    }
    const map = new Map<string, ReturnedProductRow>()

    returnsInPeriod.forEach((item) => {
      const productId = item.productId || 'unknown'
      const productName =
        products.find((p) => p.id === productId)?.name || productId || 'Unknown Product'
      if (!map.has(productId)) {
        map.set(productId, { productId, productName, amount: 0, count: 0 })
      }
      const r = map.get(productId)!
      r.amount += item.returnAmount
      r.count += 1
    })

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount)
  }, [returnsInPeriod, products])

  const returnsByStore = useMemo(() => {
    interface ReturnStoreRow {
      storeId: string
      storeName: string
      amount: number
      count: number
    }
    const map = new Map<string, ReturnStoreRow>()

    returnsInPeriod.forEach((item) => {
      const sid = item.storeId || 'unknown'
      const sname = storeNameMap.get(sid) || 'Unknown Store'
      if (!map.has(sid)) {
        map.set(sid, { storeId: sid, storeName: sname, amount: 0, count: 0 })
      }
      const r = map.get(sid)!
      r.amount += item.returnAmount
      r.count += 1
    })

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount)
  }, [returnsInPeriod, storeNameMap])

  const topPerformers = useMemo(() => {
    const customerMap = new Map<string, { customerId: string; revenue: number; bills: number }>()
    filteredBills.forEach((bill) => {
      if (!bill.customerId) return
      if (!customerMap.has(bill.customerId)) {
        customerMap.set(bill.customerId, { customerId: bill.customerId, revenue: 0, bills: 0 })
      }
      const c = customerMap.get(bill.customerId)!
      c.revenue += getEffectiveBillTotal(bill)
      c.bills += 1
    })
    const bestCustomer =
      Array.from(customerMap.values()).sort((a, b) => b.revenue - a.revenue)[0] || null
    return {
      bestStore: storeAnalytics[0] || null,
      bestProduct: productAnalytics[0] || null,
      bestDay: [...dailyStats].sort((a, b) => b.revenue - a.revenue)[0] || null,
      bestCustomer,
    }
  }, [storeAnalytics, productAnalytics, dailyStats, filteredBills])

  const storeWithLeaderProduct = useMemo(() => {
    interface StoreProduct {
      productId: string
      productName: string
      quantity: number
      revenue: number
    }
    const storeProductMap = new Map<string, Map<string, StoreProduct>>()

    filteredBills.forEach((bill) => {
      if (!bill.storeId) return
      if (!storeProductMap.has(bill.storeId)) {
        storeProductMap.set(bill.storeId, new Map())
      }
      const prodMap = storeProductMap.get(bill.storeId)!

      bill.items.forEach((item) => {
        if (!item.productId) return
        if (!prodMap.has(item.productId)) {
          prodMap.set(item.productId, {
            productId: item.productId,
            productName: item.productName,
            quantity: 0,
            revenue: 0,
          })
        }
        const p = prodMap.get(item.productId)!
        p.quantity += item.quantity
        p.revenue += item.total
      })
    })

    return storeAnalytics.map((s) => {
      const prods = Array.from(storeProductMap.get(s.storeId)?.values() || [])
      const top = [...prods].sort((a, b) => b.quantity - a.quantity)[0]
      return {
        ...s,
        topProductName: top?.productName || 'N/A',
        topProductQty: top?.quantity || 0,
        topProductRevenue: top?.revenue || 0,
        productCount: prods.length,
      }
    })
  }, [filteredBills, storeAnalytics])

  const lossMakers = useMemo(
    () => productAnalytics.filter((p) => p.profit < 0).sort((a, b) => a.profit - b.profit),
    [productAnalytics],
  )

  const batchAnalytics = useMemo(() => {
    interface BatchRow {
      batchId: string
      batchNumber: string
      place: string
      productsInBatch: number
      productsSold: number
      quantitySold: number
      revenue: number
      cogs: number
      profit: number
      marginPct: number | null
      stockValue: number
      currentStock: number
      createdAt?: string
    }

    const map = new Map<string, BatchRow>()

    batches.forEach((batch) => {
      map.set(batch.id, {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        place: batch.place,
        productsInBatch: 0,
        productsSold: 0,
        quantitySold: 0,
        revenue: 0,
        cogs: 0,
        profit: 0,
        marginPct: null,
        stockValue: 0,
        currentStock: 0,
        createdAt: batch.createdAt,
      })
    })

    products.forEach((product) => {
      if (!product.batchId) return
      const row = map.get(product.batchId)
      if (!row) return
      row.productsInBatch += 1
      row.currentStock += product.stock
      row.stockValue += product.stock * product.sellingPrice
    })

    productAnalytics.forEach((sale) => {
      if (!sale.batchId) return
      const row = map.get(sale.batchId)
      if (!row) return
      row.productsSold += 1
      row.quantitySold += sale.quantity
      row.revenue += sale.revenue
      row.cogs += sale.cogs
      row.profit += sale.profit
    })

    map.forEach((row) => {
      row.marginPct = row.revenue > 0 ? (row.profit / row.revenue) * 100 : null
    })

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [batches, products, productAnalytics])

  const filteredBatchAnalytics = useMemo(() => {
    const term = batchSearch.trim().toLowerCase()
    if (!term) return batchAnalytics
    return batchAnalytics.filter(
      (row) =>
        row.batchNumber.toLowerCase().includes(term) ||
        row.place.toLowerCase().includes(term),
    )
  }, [batchAnalytics, batchSearch])

  const dialogBatch = useMemo(() => {
    if (!dialogBatchId) return null
    return batchAnalytics.find((row) => row.batchId === dialogBatchId) || null
  }, [dialogBatchId, batchAnalytics])

  const dialogBatchProducts = useMemo(() => {
    if (!dialogBatchId) return null
    const batchProductIds = new Set(
      products.filter((p) => p.batchId === dialogBatchId).map((p) => p.id),
    )
    const productRecords = products.filter((p) => p.batchId === dialogBatchId)
    const sold = productAnalytics
      .filter((sale) => sale.batchId === dialogBatchId)
      .sort((a, b) => b.quantity - a.quantity)
    const soldIds = new Set(sold.map((s) => s.productId))
    const unsold = productRecords.filter((p) => !soldIds.has(p.id))
    return {
      productsCount: batchProductIds.size,
      sold,
      unsold,
    }
  }, [dialogBatchId, products, productAnalytics])

  const dialogProductStats = useMemo(() => {
    if (!dialogProductId) return null
    return productAnalytics.find((row) => row.productId === dialogProductId) || null
  }, [dialogProductId, productAnalytics])

  const dialogStoreStats = useMemo(() => {
    if (!dialogProductId) return [] as ProductStoreStats[]
    const storeMap = productStoreBreakdown.get(dialogProductId)
    if (!storeMap) return []
    return Array.from(storeMap.values()).sort((a, b) => b.quantity - a.quantity)
  }, [dialogProductId, productStoreBreakdown])

  const dialogTotalQty = useMemo(
    () => dialogStoreStats.reduce((sum, row) => sum + row.quantity, 0),
    [dialogStoreStats],
  )

  const dialogTotalRevenue = useMemo(
    () => dialogStoreStats.reduce((sum, row) => sum + row.revenue, 0),
    [dialogStoreStats],
  )

  const dialogProductRecord = useMemo(() => {
    if (!dialogProductId) return null
    return products.find((p) => p.id === dialogProductId) || null
  }, [dialogProductId, products])

  // ----- Grouped product drill-down dialog -----
  const dialogGroup = useMemo(() => {
    if (!dialogGroupKey) return null
    return groupedProductAnalytics.find((g) => g.key === dialogGroupKey) || null
  }, [dialogGroupKey, groupedProductAnalytics])

  // Merge the per-store breakdown across every variant in the group.
  const dialogGroupStoreStats = useMemo(() => {
    if (!dialogGroup) return [] as ProductStoreStats[]
    const merged = new Map<string, ProductStoreStats>()
    dialogGroup.productIds.forEach((pid) => {
      const storeMap = productStoreBreakdown.get(pid)
      if (!storeMap) return
      storeMap.forEach((stat, storeId) => {
        const existing = merged.get(storeId)
        if (existing) {
          existing.quantity += stat.quantity
          existing.revenue += stat.revenue
          existing.bills += stat.bills
        } else {
          merged.set(storeId, { ...stat })
        }
      })
    })
    return Array.from(merged.values()).sort((a, b) => b.quantity - a.quantity)
  }, [dialogGroup, productStoreBreakdown])

  const dialogGroupTotalQty = useMemo(
    () => dialogGroupStoreStats.reduce((sum, row) => sum + row.quantity, 0),
    [dialogGroupStoreStats],
  )

  const dialogGroupTotalRevenue = useMemo(
    () => dialogGroupStoreStats.reduce((sum, row) => sum + row.revenue, 0),
    [dialogGroupStoreStats],
  )

  // Total current stock on hand across all variants in the group.
  const dialogGroupStock = useMemo(() => {
    if (!dialogGroup) return 0
    return dialogGroup.productIds.reduce(
      (sum, pid) => sum + (productRecordMap.get(pid)?.stock ?? 0),
      0,
    )
  }, [dialogGroup, productRecordMap])

  const returnStatusData = useMemo(() => {
    const statusMap = new Map<string, number>()

    returnsInPeriod.forEach((item) => {
      const key = item.status || 'unknown'
      statusMap.set(key, (statusMap.get(key) || 0) + 1)
    })

    return Array.from(statusMap.entries()).map(([name, value]) => ({ name, value }))
  }, [returnsInPeriod])

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
  const profitChange = useMemo(
    () => percentageChange(currentProfitSummary.profit, previousProfitSummary.profit),
    [currentProfitSummary.profit, previousProfitSummary.profit],
  )
  const cogsChange = useMemo(
    () => percentageChange(currentProfitSummary.cogs, previousProfitSummary.cogs),
    [currentProfitSummary.cogs, previousProfitSummary.cogs],
  )
  const marginChange = useMemo(
    () => percentageChange(currentProfitSummary.marginPct, previousProfitSummary.marginPct),
    [currentProfitSummary.marginPct, previousProfitSummary.marginPct],
  )

  const headlineMetrics = useMemo(() => {
    const revenue = currentSummary.revenue
    const bills = currentSummary.bills
    const items = currentSummary.items
    const cogs = currentProfitSummary.cogs
    const profit = currentProfitSummary.profit
    const replacementBillsCount = filteredBills.filter((b) => b.isReplacement).length
    const returnsCount = approvedReturnsInPeriod.length
    return {
      itemsPerBill: bills > 0 ? items / bills : 0,
      discountPct: revenue > 0 ? (currentSummary.discount / revenue) * 100 : 0,
      cogsPct: revenue > 0 ? (cogs / revenue) * 100 : 0,
      profitPerBill: bills > 0 ? profit / bills : 0,
      replacementPct: revenue > 0 ? (currentReplacementAmount / revenue) * 100 : 0,
      returnsPct: revenue > 0 ? (currentReturnsAmount / revenue) * 100 : 0,
      netPct: revenue > 0 ? (currentNetRevenue / revenue) * 100 : 0,
      replacementBillsCount,
      returnsCount,
    }
  }, [
    currentSummary,
    currentProfitSummary,
    currentReplacementAmount,
    currentReturnsAmount,
    currentNetRevenue,
    filteredBills,
    approvedReturnsInPeriod,
  ])

  const isSingleStore = selectedStore !== 'all'
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

  // Stores / Batches / Inventory show global (cross-store) data, so they are
  // hidden when a single store is selected — kick back to Overview if needed.
  useEffect(() => {
    if (isSingleStore && ['stores', 'batches', 'inventory'].includes(activeTab)) {
      setActiveTab('overview')
    }
  }, [isSingleStore, activeTab])

  const filteredProductAnalytics = useMemo(() => {
    const term = productSearch.trim().toLowerCase()
    if (!term) return productAnalytics

    return productAnalytics.filter((product) => {
      const batchInfo = product.batchId ? batchMap.get(product.batchId) : null
      const batchText = `${batchInfo?.batchNumber ?? ''} ${batchInfo?.place ?? ''}`.toLowerCase()
      return (
        product.productName.toLowerCase().includes(term) ||
        product.category.toLowerCase().includes(term) ||
        product.productId.toLowerCase().includes(term) ||
        batchText.includes(term)
      )
    })
  }, [productAnalytics, productSearch, batchMap])

  // Search over grouped rows — matches the group name/category/price, or any of
  // its variants' id / batch / barcode.
  const filteredGroupedProductAnalytics = useMemo(() => {
    const term = productSearch.trim().toLowerCase()
    if (!term) return groupedProductAnalytics

    return groupedProductAnalytics.filter((group) => {
      if (
        group.productName.toLowerCase().includes(term) ||
        group.category.toLowerCase().includes(term) ||
        String(group.sellingPrice).includes(term)
      ) {
        return true
      }
      return group.variants.some((variant) => {
        const batchInfo = variant.batchId ? batchMap.get(variant.batchId) : null
        const batchText = `${batchInfo?.batchNumber ?? ''} ${batchInfo?.place ?? ''}`.toLowerCase()
        const barcode = (productRecordMap.get(variant.productId)?.barcode ?? '').toLowerCase()
        return (
          variant.productId.toLowerCase().includes(term) ||
          batchText.includes(term) ||
          barcode.includes(term)
        )
      })
    })
  }, [groupedProductAnalytics, productSearch, batchMap, productRecordMap])

  useEffect(() => {
    setProductsLimit(30)
  }, [productSearch, selectedStore, rangeFrom, rangeTo])

  const topStores = storeAnalytics.slice(0, 10)
  const topProducts = filteredProductAnalytics.slice(0, 15)
  const topTrending = trendingProducts.slice(0, 15)
  const topMarginProducts = inventoryAnalytics.slice(0, 15)
  const topProfitableProducts = useMemo(
    () =>
      [...productAnalytics]
        .filter((row) => row.profit !== 0)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10),
    [productAnalytics],
  )

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
    const expProductRecordById = new Map(products.map((p) => [p.id, p]))
    const expProductAnalytics = Array.from(expProductMap.values())
      .map((p) => {
        const record = expProductRecordById.get(p.productId)
        const cogs = (record?.costPrice || 0) * p.quantity
        const profit = p.revenue - cogs
        return {
          ...p,
          category: record?.category || 'Uncategorized',
          bills: p.billIds.size,
          avgSellingPrice: p.quantity > 0 ? p.revenue / p.quantity : 0,
          cogs,
          profit,
          profitMargin: p.revenue > 0 ? (profit / p.revenue) * 100 : null,
        }
      })
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
            month: format(new Date(`${row.month}-01T00:00:00`), 'MMM yyyy'),
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
        category: row.category,
        quantity: row.quantity,
        revenue: Number(row.revenue.toFixed(2)),
        discount: Number(row.discount.toFixed(2)),
        cogs: Number(row.cogs.toFixed(2)),
        profit: Number(row.profit.toFixed(2)),
        profit_margin: row.profitMargin !== null ? Number(row.profitMargin.toFixed(1)) : 0,
        bills: row.bills,
        avg_selling_price: Number(row.avgSellingPrice.toFixed(2)),
        last_sold: row.lastSoldAt ? format(new Date(row.lastSoldAt), 'dd MMM yyyy') : 'Not sold in period',
      })),
      ['quantity', 'revenue', 'discount', 'cogs', 'profit', 'bills', 'avg_selling_price'],
      'sl_no',
    )
    const productSalesTotals = expProductAnalytics.reduce(
      (acc, row) => {
        acc.units += row.quantity
        acc.revenue += row.revenue
        acc.cogs += row.cogs
        acc.profit += row.profit
        return acc
      },
      { units: 0, revenue: 0, cogs: 0, profit: 0 },
    )
    XLSX.utils.book_append_sheet(
      workbook,
      buildSheet(productRows, {
        title: 'Product-wise Sales Report',
        subtitle: `${expStoreName} | ${rangeLabel}`,
        summary: {
          title: 'Product Sales Summary',
          rows: [
            {
              products_sold: expProductAnalytics.length,
              total_units: productSalesTotals.units,
              revenue: Number(productSalesTotals.revenue.toFixed(2)),
              cogs: Number(productSalesTotals.cogs.toFixed(2)),
              profit: Number(productSalesTotals.profit.toFixed(2)),
              profit_margin:
                productSalesTotals.revenue > 0
                  ? Number(((productSalesTotals.profit / productSalesTotals.revenue) * 100).toFixed(1))
                  : 0,
            },
          ],
        },
        notes: [
          'Qty Sold = Total units sold across all bills in the period.',
          'COGS = Cost Price × Qty Sold. Profit = Revenue − COGS.',
          'Avg. Selling Price = Revenue ÷ Qty Sold. May differ from MRP if discounts were applied.',
          'Last Sold On = Most recent sale date within the reporting period.',
        ],
      }),
      'Product Sales',
    )

    // ══════════════════════════════════════════
    // 5. INVENTORY VALUATION & MARGINS
    // ══════════════════════════════════════════
    // Units sold per product within the reporting period (store-scoped).
    const expSoldByProduct = new Map<string, number>()
    expFilteredBills.forEach((bill) => {
      bill.items.forEach((item) => {
        if (!item.productId) return
        expSoldByProduct.set(
          item.productId,
          (expSoldByProduct.get(item.productId) || 0) + item.quantity,
        )
      })
    })

    const inventoryDataRows = expInventoryAnalytics.map((row, i) => {
      const unitsSold = expSoldByProduct.get(row.productId) || 0
      return {
        sl_no: i + 1,
        product_name: row.productName,
        opening_stock: row.stock + unitsSold,
        units_sold: unitsSold,
        stock: row.stock,
        cost_price: Number(row.costPrice.toFixed(2)),
        selling_price: Number(row.sellingPrice.toFixed(2)),
        profit_per_unit: Number(row.marginPerUnit.toFixed(2)),
        profit_margin: row.marginPct !== null ? Number(row.marginPct.toFixed(1)) : 0,
        total_cost_value: Number(row.costValue.toFixed(2)),
        total_selling_value: Number(row.potentialSalesValue.toFixed(2)),
        total_potential_profit: Number(row.potentialProfit.toFixed(2)),
      }
    })

    const invMovementTotals = inventoryDataRows.reduce(
      (acc, row) => {
        acc.opening += row.opening_stock
        acc.sold += row.units_sold
        acc.closing += row.stock
        acc.costValue += row.total_cost_value
        acc.sellingValue += row.total_selling_value
        return acc
      },
      { opening: 0, sold: 0, closing: 0, costValue: 0, sellingValue: 0 },
    )

    // ── Day-by-day stock movement for the period ──
    // Units sold per product per day (store-scoped bills).
    const expSoldByDay = new Map<string, Map<string, number>>()
    expFilteredBills.forEach((bill) => {
      const date = parseDate(bill.createdAt || bill.timestamp)
      if (!date) return
      const key = format(date, 'yyyy-MM-dd')
      let dayMap = expSoldByDay.get(key)
      if (!dayMap) {
        dayMap = new Map()
        expSoldByDay.set(key, dayMap)
      }
      bill.items.forEach((item) => {
        if (!item.productId) return
        dayMap!.set(item.productId, (dayMap!.get(item.productId) || 0) + item.quantity)
      })
    })

    const expPriceByProduct = new Map(
      expInventoryAnalytics.map((r) => [r.productId, { cost: r.costPrice, sell: r.sellingPrice }]),
    )
    const globalPriceByProduct = new Map(
      products.map((p) => [p.id, { cost: p.costPrice, sell: p.sellingPrice }]),
    )
    const expCreatedAtByProduct = new Map(
      products.map((p) => [p.id, parseDate(p.createdAt)]),
    )

    // Walk backwards from today's stock: each day's opening = closing + units
    // sold that day; the previous day's closing = this day's opening.
    let runningUnits = invMovementTotals.closing
    let runningCostValue = invMovementTotals.costValue
    let runningSellingValue = invMovementTotals.sellingValue

    const dailyMovementRows: Array<Record<string, unknown>> = []
    for (
      let day = endOfDay(dateWindows.currentEnd);
      day >= dateWindows.currentStart;
      day = endOfDay(subDays(day, 1))
    ) {
      const dayKey = format(day, 'yyyy-MM-dd')
      const soldMap = expSoldByDay.get(dayKey)
      let soldUnits = 0
      let soldCostValue = 0
      let soldSellingValue = 0
      soldMap?.forEach((qty, pid) => {
        const price = expPriceByProduct.get(pid) || globalPriceByProduct.get(pid)
        soldUnits += qty
        soldCostValue += (price?.cost || 0) * qty
        soldSellingValue += (price?.sell || 0) * qty
      })

      const productsExisting = expInventoryAnalytics.filter((r) => {
        const createdAt = expCreatedAtByProduct.get(r.productId)
        return !createdAt || createdAt <= day
      }).length

      dailyMovementRows.push({
        date: format(day, 'dd MMM yyyy'),
        total_products: productsExisting,
        opening_stock_units: runningUnits + soldUnits,
        items_sold_units: soldUnits,
        closing_stock_units: runningUnits,
        closing_stock_cost_value: Number(runningCostValue.toFixed(2)),
        closing_stock_selling_value: Number(runningSellingValue.toFixed(2)),
      })

      runningUnits += soldUnits
      runningCostValue += soldCostValue
      runningSellingValue += soldSellingValue
    }
    dailyMovementRows.reverse() // oldest day first

    if (dailyMovementRows.length > 0) {
      dailyMovementRows.push({
        date: 'TOTAL (Period)',
        total_products: expInventoryAnalytics.length,
        opening_stock_units: dailyMovementRows[0].opening_stock_units,
        items_sold_units: invMovementTotals.sold,
        closing_stock_units: invMovementTotals.closing,
        closing_stock_cost_value: Number(invMovementTotals.costValue.toFixed(2)),
        closing_stock_selling_value: Number(invMovementTotals.sellingValue.toFixed(2)),
      })
    }

    const inventoryRows = appendTotalRow(
      inventoryDataRows,
      ['opening_stock', 'units_sold', 'stock', 'cost_price', 'selling_price', 'profit_per_unit', 'total_cost_value', 'total_selling_value', 'total_potential_profit'],
      'sl_no',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      buildSheet(inventoryRows, {
        title: 'Inventory Valuation & Profit Margins',
        subtitle: `${expStoreName} | ${rangeLabel} | As of ${generatedAt}`,
        summary: {
          title: `Daily Stock Movement (${rangeLabel})`,
          rows: dailyMovementRows,
        },
        notes: [
          'Daily Stock Movement: each row shows the stock position for one day — Opening Stock at the start of the day, Units Sold during the day, and Closing Stock (with its value) at the end of the day.',
          'Daily stock levels are reconstructed backwards from the current stock using billed quantities. Stock purchases/additions made during the period are not tracked, so opening figures are estimates.',
          'Opening Stock = Closing Stock + Units Sold in the period. Stock purchases/additions made during the period are not tracked, so this is an estimate.',
          'Units Sold (Period) = Total units of the product billed during the reporting period.',
          'Closing Stock = Stock remaining as of the report generation date.',
          'Cost Price = Purchase/procurement cost per unit.',
          'Selling Price = Listed retail price per unit.',
          'Profit / Unit = Selling Price minus Cost Price.',
          'Profit Margin (%) = (Profit / Unit ÷ Cost Price) × 100.',
          'Total Cost Value = Cost Price × Closing Stock. This is the capital tied up in inventory.',
          'Total Selling Value = Selling Price × Closing Stock. This is the expected revenue if all remaining stock is sold at listed price.',
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
    const returnStatusTotals = new Map<string, { count: number; amount: number }>()
    expReturns.forEach((item) => {
      const status = (item.status || 'pending').charAt(0).toUpperCase() + (item.status || 'pending').slice(1)
      const bucket = returnStatusTotals.get(status) || { count: 0, amount: 0 }
      bucket.count += 1
      bucket.amount += item.returnAmount
      returnStatusTotals.set(status, bucket)
    })
    const returnSummaryRows = Array.from(returnStatusTotals.entries()).map(([status, bucket]) => ({
      return_status: status,
      count: bucket.count,
      refund_amount: Number(bucket.amount.toFixed(2)),
    }))
    if (returnSummaryRows.length > 1) {
      returnSummaryRows.push({
        return_status: 'TOTAL',
        count: expReturns.length,
        refund_amount: Number(expReturns.reduce((s, r) => s + r.returnAmount, 0).toFixed(2)),
      })
    }
    XLSX.utils.book_append_sheet(
      workbook,
      buildSheet(returnsRows, {
        title: 'Returns & Refunds Register',
        subtitle: `${expStoreName} | ${rangeLabel}`,
        summary:
          returnSummaryRows.length > 0
            ? { title: 'Returns by Status', rows: returnSummaryRows }
            : undefined,
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
    const ledgerCredit = ledgerRows.reduce((s, r) => s + r.credit, 0)
    const ledgerDebit = ledgerRows.reduce((s, r) => s + r.debit, 0)
    const replacementCount = ledgerRows.filter((r) => r.type === 'Replacement').length
    XLSX.utils.book_append_sheet(
      workbook,
      buildSheet(numberedLedger, {
        hasTotalRow: false,
        title: 'Replacements & Refunds Ledger',
        subtitle: `${expStoreName} | ${rangeLabel}`,
        summary:
          ledgerRows.length > 0
            ? {
                title: 'Ledger Summary',
                rows: [
                  {
                    type: 'Replacements Issued',
                    count: replacementCount,
                    credit: ledgerCredit,
                    debit: 0,
                    amount: ledgerCredit,
                  },
                  {
                    type: 'Refunds Paid',
                    count: ledgerRows.length - replacementCount,
                    credit: 0,
                    debit: ledgerDebit,
                    amount: -ledgerDebit,
                  },
                  {
                    type: 'TOTAL (Net)',
                    count: ledgerRows.length,
                    credit: ledgerCredit,
                    debit: ledgerDebit,
                    amount: ledgerCredit - ledgerDebit,
                  },
                ],
              }
            : undefined,
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
    const billDetailRows = appendTotalRow(
      expFilteredBills.map((bill, i) => {
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
      }),
      ['total_items', 'gross_sales', 'total_discount', 'net_sales'],
      'sl_no',
    )
    const billTypeSummary = (['Regular Sale', 'Replacement'] as const).map((type) => {
      const rows = expFilteredBills.filter(
        (bill) => (bill.isReplacement ? 'Replacement' : 'Regular Sale') === type,
      )
      return {
        type,
        bills: rows.length,
        total_items: rows.reduce(
          (s, bill) => s + bill.items.reduce((x, item) => x + item.quantity, 0),
          0,
        ),
        gross_sales: Number(rows.reduce((s, bill) => s + getEffectiveBillTotal(bill), 0).toFixed(2)),
      }
    })
    XLSX.utils.book_append_sheet(
      workbook,
      buildSheet(billDetailRows, {
        title: 'Bill-wise Transaction Details',
        subtitle: `${expStoreName} | ${rangeLabel} | ${expFilteredBills.length} bills`,
        summary:
          expFilteredBills.length > 0
            ? { title: 'Bills Summary', rows: billTypeSummary }
            : undefined,
        notes: [
          'Each row represents one bill/invoice raised during the reporting period.',
          'Replacement bills are goods issued free as replacements — they appear in Gross Sales but no payment is collected.',
          'Use Bill ID to cross-reference with individual invoice records.',
        ],
      }),
      'All Bills',
    )

    const safeStoreName = expStoreName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30)
    const safeRange = `${format(dateWindows.currentStart, 'ddMMMyyyy')}-${format(dateWindows.currentEnd, 'ddMMMyyyy')}`
    XLSX.writeFile(workbook, `Sales_Report_${safeStoreName}_${safeRange}_${timestamp}.xlsx`, {
      cellStyles: true,
    })
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

        <Dialog
          open={dialogProductId !== null}
          onOpenChange={(open) => {
            if (!open) setDialogProductId(null)
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {dialogProductStats?.productName || 'Product Details'}
              </DialogTitle>
              <DialogDescription>
                {dialogProductStats?.category || ''}
                {dialogProductId ? ` · ID: ${dialogProductId}` : ''}
                {dialogStoreStats.length > 0 && (
                  <>
                    {' · Sold in '}
                    <strong>{dialogStoreStats.length}</strong>
                    {' store(s) for '}
                    {format(dateWindows.currentStart, 'dd MMM')}–{format(dateWindows.currentEnd, 'dd MMM yyyy')}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            {dialogProductStats && (
              <div className="space-y-4">
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Qty Sold</p>
                    <p className="text-lg font-semibold">{dialogProductStats.quantity}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="text-lg font-semibold">{formatCurrency(dialogProductStats.revenue)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Profit</p>
                    <p
                      className={`text-lg font-semibold ${
                        dialogProductStats.profit >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(dialogProductStats.profit)}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Margin</p>
                    <p className="text-lg font-semibold">
                      {dialogProductStats.profitMargin === null
                        ? 'N/A'
                        : `${dialogProductStats.profitMargin.toFixed(1)}%`}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 grid-cols-2 md:grid-cols-4 text-sm">
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs text-muted-foreground">Cost / Unit</p>
                    <p className="font-medium">{formatCurrency(dialogProductStats.costPrice)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs text-muted-foreground">Listed Selling Price</p>
                    <p className="font-medium">
                      {formatCurrency(dialogProductRecord?.sellingPrice || 0)}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs text-muted-foreground">Avg Sold Price</p>
                    <p className="font-medium">{formatCurrency(dialogProductStats.avgSellingPrice)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs text-muted-foreground">Current Stock</p>
                    <p className="font-medium">{dialogProductRecord?.stock ?? 'N/A'}</p>
                  </div>
                </div>

                {dialogStoreStats.length > 0 && (
                  <>
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-emerald-900">
                        <MapPin className="h-4 w-4" />
                        Top Selling Store
                      </div>
                      <p className="mt-1 text-base font-semibold text-emerald-900">
                        {dialogStoreStats[0].storeName}
                      </p>
                      <p className="text-xs text-emerald-800">
                        {dialogStoreStats[0].quantity} units ·{' '}
                        {formatCurrency(dialogStoreStats[0].revenue)}
                        {dialogTotalQty > 0 && (
                          <>
                            {' · '}
                            {((dialogStoreStats[0].quantity / dialogTotalQty) * 100).toFixed(1)}% of total sales
                          </>
                        )}
                      </p>
                    </div>

                    <Card className="border-slate-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Store className="h-4 w-4" /> Sales by Store
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={dialogStoreStats} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="storeName" type="category" width={140} />
                            <Tooltip
                              formatter={(value, name) =>
                                name === 'Revenue' ? formatCurrency(Number(value)) : value
                              }
                            />
                            <Legend />
                            <Bar dataKey="quantity" fill="#2563eb" name="Qty Sold" />
                            <Bar dataKey="revenue" fill="#16a34a" name="Revenue" />
                          </BarChart>
                        </ResponsiveContainer>

                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Store</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Revenue</TableHead>
                              <TableHead className="text-right">Bills</TableHead>
                              <TableHead className="text-right">Share</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dialogStoreStats.map((row) => {
                              const share =
                                dialogTotalQty > 0 ? (row.quantity / dialogTotalQty) * 100 : 0
                              return (
                                <TableRow key={row.storeId}>
                                  <TableCell className="font-medium">{row.storeName}</TableCell>
                                  <TableCell className="text-right">{row.quantity}</TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(row.revenue)}
                                  </TableCell>
                                  <TableCell className="text-right">{row.bills}</TableCell>
                                  <TableCell className="text-right">{share.toFixed(1)}%</TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                        <p className="text-xs text-muted-foreground">
                          Totals: <strong>{dialogTotalQty}</strong> units ·{' '}
                          {formatCurrency(dialogTotalRevenue)}
                        </p>
                      </CardContent>
                    </Card>
                  </>
                )}

                {dialogStoreStats.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No store sales recorded for this product in the selected period.
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogProductId(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Grouped product drill-down: variants + merged store breakdown */}
        <Dialog
          open={dialogGroupKey !== null}
          onOpenChange={(open) => {
            if (!open) setDialogGroupKey(null)
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {dialogGroup?.productName || 'Product Details'}
              </DialogTitle>
              <DialogDescription>
                {dialogGroup?.category || ''}
                {dialogGroup ? ` · ${formatCurrency(dialogGroup.sellingPrice)}` : ''}
                {dialogGroup && (
                  <>
                    {' · '}
                    <strong>{dialogGroup.variantCount}</strong>
                    {dialogGroup.variantCount === 1 ? ' variant' : ' variants'}
                  </>
                )}
                {dialogGroupStoreStats.length > 0 && (
                  <>
                    {' · Sold in '}
                    <strong>{dialogGroupStoreStats.length}</strong>
                    {' store(s) for '}
                    {format(dateWindows.currentStart, 'dd MMM')}–
                    {format(dateWindows.currentEnd, 'dd MMM yyyy')}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            {dialogGroup && (
              <div className="space-y-4">
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Qty Sold</p>
                    <p className="text-lg font-semibold">{dialogGroup.quantity}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="text-lg font-semibold">{formatCurrency(dialogGroup.revenue)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Profit</p>
                    <p
                      className={`text-lg font-semibold ${
                        dialogGroup.profit >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(dialogGroup.profit)}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Margin</p>
                    <p className="text-lg font-semibold">
                      {dialogGroup.profitMargin === null
                        ? 'N/A'
                        : `${dialogGroup.profitMargin.toFixed(1)}%`}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 grid-cols-2 md:grid-cols-4 text-sm">
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs text-muted-foreground">Avg Cost / Unit</p>
                    <p className="font-medium">{formatCurrency(dialogGroup.costPrice)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs text-muted-foreground">Listed Selling Price</p>
                    <p className="font-medium">{formatCurrency(dialogGroup.sellingPrice)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs text-muted-foreground">Avg Sold Price</p>
                    <p className="font-medium">{formatCurrency(dialogGroup.avgSellingPrice)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs text-muted-foreground">Current Stock</p>
                    <p className="font-medium">{dialogGroupStock}</p>
                  </div>
                </div>

                {/* Per-variant breakdown (different barcodes / batches) */}
                <Card className="border-slate-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Package className="h-4 w-4" /> Variants in this product
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Click a variant to see its own store-by-store sales.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Barcode</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead className="text-right">Qty Sold</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Avg Price</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dialogGroup.variants.map((variant) => {
                          const record = productRecordMap.get(variant.productId)
                          const batchInfo = variant.batchId ? batchMap.get(variant.batchId) : null
                          return (
                            <TableRow
                              key={variant.productId}
                              onClick={() => setDialogProductId(variant.productId)}
                              className="cursor-pointer hover:bg-slate-50"
                            >
                              <TableCell className="font-mono text-xs">
                                {record?.barcode || '—'}
                              </TableCell>
                              <TableCell>
                                {batchInfo ? (
                                  <div>
                                    <div className="text-sm font-medium">{batchInfo.batchNumber}</div>
                                    {batchInfo.place && (
                                      <div className="text-xs text-muted-foreground">
                                        {batchInfo.place}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">{variant.quantity}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(variant.revenue)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(variant.avgSellingPrice)}
                              </TableCell>
                              <TableCell className="text-right">{record?.stock ?? 'N/A'}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {dialogGroupStoreStats.length > 0 && (
                  <>
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-emerald-900">
                        <MapPin className="h-4 w-4" />
                        Top Selling Store
                      </div>
                      <p className="mt-1 text-base font-semibold text-emerald-900">
                        {dialogGroupStoreStats[0].storeName}
                      </p>
                      <p className="text-xs text-emerald-800">
                        {dialogGroupStoreStats[0].quantity} units ·{' '}
                        {formatCurrency(dialogGroupStoreStats[0].revenue)}
                        {dialogGroupTotalQty > 0 && (
                          <>
                            {' · '}
                            {((dialogGroupStoreStats[0].quantity / dialogGroupTotalQty) * 100).toFixed(1)}% of total sales
                          </>
                        )}
                      </p>
                    </div>

                    <Card className="border-slate-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Store className="h-4 w-4" /> Sales by Store
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={dialogGroupStoreStats} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="storeName" type="category" width={140} />
                            <Tooltip
                              formatter={(value, name) =>
                                name === 'Revenue' ? formatCurrency(Number(value)) : value
                              }
                            />
                            <Legend />
                            <Bar dataKey="quantity" fill="#2563eb" name="Qty Sold" />
                            <Bar dataKey="revenue" fill="#16a34a" name="Revenue" />
                          </BarChart>
                        </ResponsiveContainer>

                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Store</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Revenue</TableHead>
                              <TableHead className="text-right">Bills</TableHead>
                              <TableHead className="text-right">Share</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dialogGroupStoreStats.map((row) => {
                              const share =
                                dialogGroupTotalQty > 0
                                  ? (row.quantity / dialogGroupTotalQty) * 100
                                  : 0
                              return (
                                <TableRow key={row.storeId}>
                                  <TableCell className="font-medium">{row.storeName}</TableCell>
                                  <TableCell className="text-right">{row.quantity}</TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(row.revenue)}
                                  </TableCell>
                                  <TableCell className="text-right">{row.bills}</TableCell>
                                  <TableCell className="text-right">{share.toFixed(1)}%</TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                        <p className="text-xs text-muted-foreground">
                          Totals: <strong>{dialogGroupTotalQty}</strong> units ·{' '}
                          {formatCurrency(dialogGroupTotalRevenue)}
                        </p>
                      </CardContent>
                    </Card>
                  </>
                )}

                {dialogGroupStoreStats.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No store sales recorded for this product in the selected period.
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogGroupKey(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={dialogBatchId !== null}
          onOpenChange={(open) => {
            if (!open) setDialogBatchId(null)
          }}
        >
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                {dialogBatch?.batchNumber || 'Batch Details'}
              </DialogTitle>
              <DialogDescription>
                {dialogBatch?.place ? `${dialogBatch.place} · ` : ''}
                {dialogBatch?.createdAt
                  ? `Created ${formatDisplayDate(dialogBatch.createdAt)}`
                  : ''}
                {' · '}
                {dialogBatch?.productsInBatch || 0} products · Window:{' '}
                {format(dateWindows.currentStart, 'dd MMM')}–
                {format(dateWindows.currentEnd, 'dd MMM yyyy')}
              </DialogDescription>
            </DialogHeader>

            {dialogBatch && dialogBatchProducts && (
              <div className="space-y-4">
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Products in Batch</p>
                    <p className="text-lg font-semibold">{dialogBatch.productsInBatch}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Products Sold</p>
                    <p className="text-lg font-semibold">
                      {dialogBatch.productsSold}
                      <span className="ml-1 text-xs text-muted-foreground">
                        (
                        {dialogBatch.productsInBatch > 0
                          ? ((dialogBatch.productsSold / dialogBatch.productsInBatch) * 100).toFixed(0)
                          : 0}
                        %)
                      </span>
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Qty Sold</p>
                    <p className="text-lg font-semibold">{dialogBatch.quantitySold}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="text-lg font-semibold">{formatCurrency(dialogBatch.revenue)}</p>
                  </div>
                </div>

                <div className="grid gap-3 grid-cols-2 md:grid-cols-4 text-sm">
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs text-muted-foreground">COGS</p>
                    <p className="font-medium">{formatCurrency(dialogBatch.cogs)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs text-muted-foreground">Profit</p>
                    <p
                      className={`font-medium ${
                        dialogBatch.profit >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(dialogBatch.profit)}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs text-muted-foreground">Margin</p>
                    <p className="font-medium">
                      {dialogBatch.marginPct === null
                        ? 'N/A'
                        : `${dialogBatch.marginPct.toFixed(1)}%`}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs text-muted-foreground">Stock On Hand</p>
                    <p className="font-medium">
                      {dialogBatch.currentStock} units ·{' '}
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(dialogBatch.stockValue)}
                      </span>
                    </p>
                  </div>
                </div>

                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm text-emerald-800">
                      <TrendingUp className="h-4 w-4" /> Top Sellers in this Batch
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dialogBatchProducts.sold.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No products from this batch were sold in the selected period.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Qty Sold</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                            <TableHead className="text-right">Profit</TableHead>
                            <TableHead className="text-right">Margin %</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dialogBatchProducts.sold.slice(0, 10).map((row) => (
                            <TableRow
                              key={row.productId}
                              onClick={() => {
                                setDialogBatchId(null)
                                setDialogProductId(row.productId)
                              }}
                              className="cursor-pointer hover:bg-emerald-100/50"
                            >
                              <TableCell className="font-medium">{row.productName}</TableCell>
                              <TableCell className="text-right">{row.quantity}</TableCell>
                              <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                              <TableCell className="text-right">
                                <span className={row.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  {formatCurrency(row.profit)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                {row.profitMargin === null ? 'N/A' : `${row.profitMargin.toFixed(1)}%`}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                {dialogBatchProducts.sold.length > 1 && (
                  <Card className="border-amber-200 bg-amber-50/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm text-amber-800">
                        <TrendingDown className="h-4 w-4" /> Slowest Movers (sold but few units)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Qty Sold</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                            <TableHead className="text-right">Last Sold</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...dialogBatchProducts.sold]
                            .sort((a, b) => a.quantity - b.quantity)
                            .slice(0, 5)
                            .map((row) => (
                              <TableRow
                                key={row.productId}
                                onClick={() => {
                                  setDialogBatchId(null)
                                  setDialogProductId(row.productId)
                                }}
                                className="cursor-pointer hover:bg-amber-100/50"
                              >
                                <TableCell className="font-medium">{row.productName}</TableCell>
                                <TableCell className="text-right">{row.quantity}</TableCell>
                                <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                                <TableCell className="text-right text-xs">
                                  {formatDisplayDate(row.lastSoldAt, 'N/A')}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {dialogBatchProducts.unsold.length > 0 && (
                  <Card className="border-rose-200 bg-rose-50/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm text-rose-800">
                        <Boxes className="h-4 w-4" /> Not Sold in this Period (
                        {dialogBatchProducts.unsold.length})
                      </CardTitle>
                      <p className="text-xs text-rose-700">
                        Products from this batch with zero sales — potential dead stock.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Stock</TableHead>
                            <TableHead className="text-right">Cost / Unit</TableHead>
                            <TableHead className="text-right">Selling Price</TableHead>
                            <TableHead className="text-right">Blocked Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dialogBatchProducts.unsold.slice(0, 20).map((row) => (
                            <TableRow
                              key={row.id}
                              onClick={() => {
                                setDialogBatchId(null)
                                setDialogProductId(row.id)
                              }}
                              className="cursor-pointer hover:bg-rose-100/40"
                            >
                              <TableCell className="font-medium">{row.name}</TableCell>
                              <TableCell className="text-xs">{row.category}</TableCell>
                              <TableCell className="text-right">{row.stock}</TableCell>
                              <TableCell className="text-right">{formatCurrency(row.costPrice)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(row.sellingPrice)}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(row.stock * row.sellingPrice)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {dialogBatchProducts.unsold.length > 20 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Showing 20 of {dialogBatchProducts.unsold.length} unsold products.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogBatchId(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-1.5 rounded-full bg-gradient-to-b from-blue-500 to-sky-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Sales Performance
            </h2>
            <span className="text-xs text-slate-500">
              · {selectedRangeDays}-day window · {selectedStoreName}
            </span>
          </div>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            <MetricCard
              title="Revenue"
              value={formatCurrency(currentSummary.revenue)}
              icon={<DollarSign className="h-4 w-4" />}
              change={revenueChange}
              subtitle={`Avg ${formatCurrency(currentSummary.avgBill)} per bill`}
              accent="blue"
            />
            <MetricCard
              title="Bills"
              value={currentSummary.bills.toLocaleString('en-IN')}
              icon={<ShoppingCart className="h-4 w-4" />}
              change={billsChange}
              subtitle={`${headlineMetrics.itemsPerBill.toFixed(1)} items / bill avg`}
              accent="sky"
            />
            <MetricCard
              title="Items Sold"
              value={currentSummary.items.toLocaleString('en-IN')}
              icon={<Package className="h-4 w-4" />}
              change={itemsChange}
              subtitle={`Across ${currentSummary.bills.toLocaleString('en-IN')} bills`}
              accent="sky"
            />
            <MetricCard
              title="Customers"
              value={currentSummary.customers.toLocaleString('en-IN')}
              icon={<Users className="h-4 w-4" />}
              change={customerChange}
              subtitle={
                currentSummary.customers > 0
                  ? `${formatCurrency(currentSummary.revenue / currentSummary.customers)} per customer`
                  : 'No tagged customers'
              }
              accent="blue"
            />
            <MetricCard
              title="Average Bill"
              value={formatCurrency(currentSummary.avgBill)}
              icon={<Calendar className="h-4 w-4" />}
              subtitle={
                currentSummary.discount > 0
                  ? `${headlineMetrics.discountPct.toFixed(1)}% avg discount given`
                  : 'No discounts applied'
              }
              accent="blue"
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-1.5 rounded-full bg-gradient-to-b from-emerald-500 to-green-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Profitability
            </h2>
            <span className="text-xs text-slate-500">
              · COGS uses product cost price · margin = profit ÷ revenue
            </span>
          </div>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
            <MetricCard
              title="Cost of Goods Sold"
              value={formatCurrency(currentProfitSummary.cogs)}
              icon={<Package className="h-4 w-4" />}
              change={cogsChange}
              subtitle={`${headlineMetrics.cogsPct.toFixed(1)}% of revenue`}
              accent="amber"
              progress={headlineMetrics.cogsPct}
            />
            <MetricCard
              title="Total Profit"
              value={formatCurrency(currentProfitSummary.profit)}
              icon={<TrendingUp className="h-4 w-4" />}
              change={profitChange}
              subtitle={`${formatCurrency(headlineMetrics.profitPerBill)} per bill`}
              accent="emerald"
            />
            <MetricCard
              title="Profit Margin"
              value={`${currentProfitSummary.marginPct.toFixed(1)}%`}
              icon={<Percent className="h-4 w-4" />}
              change={marginChange}
              subtitle={`${formatCurrency(currentProfitSummary.profit)} earned on ${formatCurrency(
                currentProfitSummary.revenue,
              )}`}
              accent="emerald"
              progress={currentProfitSummary.marginPct}
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-1.5 rounded-full bg-gradient-to-b from-violet-500 to-purple-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Adjustments &amp; Net Position
            </h2>
            <span className="text-xs text-slate-500">
              · Net Revenue = Gross − Returns
            </span>
          </div>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-3">
            <MetricCard
              title="Replacement Amount"
              value={formatCurrency(currentReplacementAmount)}
              icon={<RefreshCw className="h-4 w-4" />}
              change={replacementChange}
              subtitle={`${headlineMetrics.replacementBillsCount} replacement bill(s) · ${headlineMetrics.replacementPct.toFixed(
                1,
              )}% of revenue`}
              accent="violet"
            />
            <MetricCard
              title="Returns Amount"
              value={formatCurrency(currentReturnsAmount)}
              icon={<TrendingDown className="h-4 w-4" />}
              change={returnsAmountChange}
              subtitle={`${headlineMetrics.returnsCount} approved return(s) · ${headlineMetrics.returnsPct.toFixed(
                1,
              )}% of revenue`}
              accent="rose"
              progress={headlineMetrics.returnsPct}
            />
            <MetricCard
              title="Net Revenue"
              value={formatCurrency(currentNetRevenue)}
              icon={<DollarSign className="h-4 w-4" />}
              change={netRevenueChange}
              subtitle={`${headlineMetrics.netPct.toFixed(1)}% of gross revenue retained`}
              accent="emerald"
              progress={headlineMetrics.netPct}
            />
          </div>
        </section>

        <div className={`grid gap-4 ${isSingleStore ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
          <Card className={PANEL_CARD_CLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                Data Coverage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-muted-foreground">Bills (selected)</span>
                <span className="font-medium">{filteredBills.length}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-muted-foreground">Bills (previous)</span>
                <span className="font-medium">{previousPeriodBills.length}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-muted-foreground">Replacement amount</span>
                <span className="font-medium">{formatCurrency(currentReplacementAmount)}</span>
              </div>
              <div
                className={`flex justify-between ${isSingleStore ? '' : 'border-b border-slate-100 pb-1.5'}`}
              >
                <span className="text-muted-foreground">Net after returns</span>
                <span className="font-medium text-emerald-700">{formatCurrency(currentNetRevenue)}</span>
              </div>
              {!isSingleStore && (
                <>
                  <div className="flex justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-muted-foreground">Products</span>
                    <span className="font-medium">{products.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stores</span>
                    <span className="font-medium">{stores.length}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {!isSingleStore && (
          <Card className={PANEL_CARD_CLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Package className="h-4 w-4 text-emerald-600" />
                Inventory Snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-muted-foreground">Total cost value</span>
                <span className="font-medium">{formatCurrency(inventorySummary.totalCostValue)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-muted-foreground">Potential sales</span>
                <span className="font-medium">{formatCurrency(inventorySummary.totalPotentialSalesValue)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-muted-foreground">Potential profit</span>
                <span className="font-medium text-emerald-700">{formatCurrency(inventorySummary.totalPotentialProfit)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-muted-foreground">Non-selling (90d)</span>
                <span className="font-medium text-amber-700">{nonSellingProducts90Days.length}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-muted-foreground">Low stock</span>
                <span className="font-medium text-amber-700">{inventorySummary.lowStockCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Out of stock</span>
                <span className="font-medium text-red-600">{inventorySummary.outOfStockCount}</span>
              </div>
            </CardContent>
          </Card>
          )}

          <Card className={PANEL_CARD_CLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Store className="h-4 w-4 text-violet-600" />
                System Snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-muted-foreground">Selected store</span>
                <span className="font-medium truncate max-w-[60%] text-right">{selectedStoreName}</span>
              </div>
              {!isSingleStore && (
                <>
                  <div className="flex justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-muted-foreground">Active stores</span>
                    <span className="font-medium">{stores.filter((store) => store.status !== 'inactive').length}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-muted-foreground">Inactive stores</span>
                    <span className="font-medium text-amber-700">{stores.filter((store) => store.status === 'inactive').length}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-muted-foreground">Pending returns</span>
                <span className="font-medium text-amber-700">
                  {returns.filter(
                    (item) =>
                      item.status === 'pending' &&
                      (!isSingleStore || item.storeId === selectedStore),
                  ).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last updated</span>
                <span className="font-medium text-xs">{formatDisplayDateTime(lastUpdated, 'N/A')}</span>
              </div>
            </CardContent>
          </Card>
        </div>


        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
          <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <TabsTrigger value="overview" className="rounded-lg">
              Overview
            </TabsTrigger>
            <TabsTrigger value="revenue" className="rounded-lg">
              Revenue
            </TabsTrigger>
            {!isSingleStore && (
              <TabsTrigger value="stores" className="rounded-lg">
                Stores
              </TabsTrigger>
            )}
            <TabsTrigger value="products" className="rounded-lg">
              Products
            </TabsTrigger>
            <TabsTrigger value="profit" className="rounded-lg">
              Profit
            </TabsTrigger>
            {!isSingleStore && (
              <TabsTrigger value="batches" className="rounded-lg">
                Batches
              </TabsTrigger>
            )}
            {!isSingleStore && (
              <TabsTrigger value="inventory" className="rounded-lg">
                Inventory
              </TabsTrigger>
            )}
            <TabsTrigger value="returns" className="rounded-lg">
              Returns
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div
              className={`grid gap-3 md:grid-cols-2 ${isSingleStore ? 'xl:grid-cols-3' : 'xl:grid-cols-4'}`}
            >
              {!isSingleStore && (
                <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                        Top Store
                      </p>
                      <Store className="h-4 w-4 text-emerald-600" />
                    </div>
                    <p className="mt-1 text-base font-semibold text-slate-900 truncate">
                      {topPerformers.bestStore?.storeName || '—'}
                    </p>
                    <p className="text-xs text-slate-600">
                      {topPerformers.bestStore
                        ? `${formatCurrency(topPerformers.bestStore.revenue)} · ${topPerformers.bestStore.bills} bills`
                        : 'No sales in period'}
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
                      Top Product
                    </p>
                    <Package className="h-4 w-4 text-blue-600" />
                  </div>
                  <p className="mt-1 text-base font-semibold text-slate-900 truncate">
                    {topPerformers.bestProduct?.productName || '—'}
                  </p>
                  <p className="text-xs text-slate-600">
                    {topPerformers.bestProduct
                      ? `${topPerformers.bestProduct.quantity} units · ${formatCurrency(topPerformers.bestProduct.revenue)}`
                      : 'No sales in period'}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                      Best Day
                    </p>
                    <Calendar className="h-4 w-4 text-amber-600" />
                  </div>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {topPerformers.bestDay
                      ? formatDisplayDate(topPerformers.bestDay.date)
                      : '—'}
                  </p>
                  <p className="text-xs text-slate-600">
                    {topPerformers.bestDay
                      ? `${formatCurrency(topPerformers.bestDay.revenue)} · ${topPerformers.bestDay.bills} bills`
                      : 'No sales in period'}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-white">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-violet-700">
                      Top Customer
                    </p>
                    <Users className="h-4 w-4 text-violet-600" />
                  </div>
                  <p className="mt-1 text-base font-semibold text-slate-900 truncate">
                    {topPerformers.bestCustomer
                      ? `ID: ${topPerformers.bestCustomer.customerId}`
                      : 'No tagged customers'}
                  </p>
                  <p className="text-xs text-slate-600">
                    {topPerformers.bestCustomer
                      ? `${formatCurrency(topPerformers.bestCustomer.revenue)} · ${topPerformers.bestCustomer.bills} bills`
                      : '—'}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Revenue Composition</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-md border border-violet-100 bg-violet-50/50 p-3">
                  <p className="text-xs text-violet-700">Replacement Amount</p>
                  <p className="font-semibold text-slate-900">{formatCurrency(currentReplacementAmount)}</p>
                </div>
                <div className="rounded-md border border-rose-100 bg-rose-50/50 p-3">
                  <p className="text-xs text-rose-700">Approved Returns</p>
                  <p className="font-semibold text-slate-900">{formatCurrency(currentReturnsAmount)}</p>
                </div>
                <div className="rounded-md border border-emerald-100 bg-emerald-50/50 p-3">
                  <p className="text-xs text-emerald-700">Net Revenue</p>
                  <p className="font-semibold text-slate-900">{formatCurrency(currentNetRevenue)}</p>
                </div>
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
                        <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#16a34a" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#16a34a" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), 'dd MMM')} />
                      <YAxis />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Legend />
                      <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#revenueFill)" name="Revenue" />
                      <Area type="monotone" dataKey="netRevenue" stroke="#16a34a" fill="url(#profitFill)" name="Net Revenue" />
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

            {!isSingleStore && (
            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Store Revenue Share</CardTitle>
                <p className="text-xs text-muted-foreground">Each store&apos;s contribution to total revenue</p>
              </CardHeader>
              <CardContent>
                {storeAnalytics.length === 0 || storeAnalytics.every((s) => s.revenue === 0) ? (
                  <p className="text-sm text-muted-foreground">No store sales in this period.</p>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={storeAnalytics.filter((s) => s.revenue > 0)}
                          dataKey="revenue"
                          nameKey="storeName"
                          innerRadius={60}
                          outerRadius={110}
                          paddingAngle={2}
                        >
                          {storeAnalytics
                            .filter((s) => s.revenue > 0)
                            .map((entry, index) => (
                              <Cell key={entry.storeId} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Store</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Share</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {storeAnalytics
                          .filter((s) => s.revenue > 0)
                          .slice(0, 8)
                          .map((row) => {
                            const totalRev = storeAnalytics.reduce((sum, s) => sum + s.revenue, 0)
                            const share = totalRev > 0 ? (row.revenue / totalRev) * 100 : 0
                            return (
                              <TableRow key={row.storeId}>
                                <TableCell className="font-medium">{row.storeName}</TableCell>
                                <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                                <TableCell className="text-right">{share.toFixed(1)}%</TableCell>
                              </TableRow>
                            )
                          })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            )}
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
                        <TableCell>{formatDisplayDate(row.date)}</TableCell>
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
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className={`${PANEL_CARD_CLASS} lg:col-span-2`}>
                <CardHeader>
                  <CardTitle>Store Revenue Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={topStores}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="storeName" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip
                        formatter={(value, name) =>
                          name === 'Revenue' ? formatCurrency(Number(value)) : value
                        }
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="revenue" fill="#2563eb" name="Revenue" />
                      <Bar yAxisId="right" dataKey="bills" fill="#16a34a" name="Bills" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className={PANEL_CARD_CLASS}>
                <CardHeader>
                  <CardTitle>Revenue Share</CardTitle>
                </CardHeader>
                <CardContent>
                  {storeAnalytics.every((s) => s.revenue === 0) ? (
                    <p className="text-sm text-muted-foreground">No store sales.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={storeAnalytics.filter((s) => s.revenue > 0)}
                          dataKey="revenue"
                          nameKey="storeName"
                          outerRadius={100}
                          label
                        >
                          {storeAnalytics
                            .filter((s) => s.revenue > 0)
                            .map((entry, index) => (
                              <Cell key={entry.storeId} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Store Performance Table</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Per-store revenue, bills, items, distinct products sold, and the leading product.
                </p>
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
                      <TableHead className="text-right">Products</TableHead>
                      <TableHead>Top Product</TableHead>
                      <TableHead className="text-right">Top Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storeWithLeaderProduct.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No store data for this filter.
                        </TableCell>
                      </TableRow>
                    )}
                    {storeWithLeaderProduct.map((storeRow) => (
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
                        <TableCell className="text-right">{storeRow.productCount}</TableCell>
                        <TableCell className="font-medium">{storeRow.topProductName}</TableCell>
                        <TableCell className="text-right">{storeRow.topProductQty}</TableCell>
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
                    placeholder="Search by product name, id, category, batch number or place"
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
                <p className="text-xs text-muted-foreground">
                  Products with the same name and selling price are grouped into one row. Click a row to see its variants (barcodes / batches) and store-by-store sales. Search supports product name, price, category, barcode and batch number / place.
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Selling Price</TableHead>
                      <TableHead className="text-center">Variants</TableHead>
                      <TableHead className="text-right">Qty Sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">COGS</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                      <TableHead className="text-right">Bills</TableHead>
                      <TableHead className="text-right">Avg Selling Price</TableHead>
                      <TableHead>Last Sold</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGroupedProductAnalytics.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground">
                          No product sales in this period.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredGroupedProductAnalytics.slice(0, productsLimit).map((row) => (
                      <TableRow
                        key={row.key}
                        onClick={() => setDialogGroupKey(row.key)}
                        className="cursor-pointer hover:bg-slate-50"
                      >
                        <TableCell className="font-medium">{row.productName}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.sellingPrice)}</TableCell>
                        <TableCell className="text-center">
                          {row.variantCount > 1 ? (
                            <Badge variant="secondary">{row.variantCount}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">1</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{row.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.cogs)}</TableCell>
                        <TableCell className="text-right">
                          <span className={row.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(row.profit)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {row.profitMargin === null ? 'N/A' : `${row.profitMargin.toFixed(1)}%`}
                        </TableCell>
                        <TableCell className="text-right">{row.bills}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.avgSellingPrice)}</TableCell>
                        <TableCell>
                          {formatDisplayDate(row.lastSoldAt, 'N/A')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {filteredGroupedProductAnalytics.length > 0 && (
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      Showing {Math.min(productsLimit, filteredGroupedProductAnalytics.length)} of{' '}
                      {filteredGroupedProductAnalytics.length} products
                    </p>
                    {productsLimit < filteredGroupedProductAnalytics.length ? (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setProductsLimit((prev) =>
                            Math.min(prev + 30, filteredGroupedProductAnalytics.length),
                          )
                        }
                      >
                        Load 30 more
                      </Button>
                    ) : (
                      productsLimit > 30 && (
                        <Button variant="ghost" size="sm" onClick={() => setProductsLimit(30)}>
                          Collapse
                        </Button>
                      )
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>


          <TabsContent value="profit" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Revenue (Sold)"
                value={formatCurrency(currentProfitSummary.revenue)}
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
              />
              <MetricCard
                title="Cost of Goods Sold"
                value={formatCurrency(currentProfitSummary.cogs)}
                icon={<Package className="h-4 w-4 text-muted-foreground" />}
                change={cogsChange}
              />
              <MetricCard
                title="Total Profit"
                value={formatCurrency(currentProfitSummary.profit)}
                icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
                change={profitChange}
              />
              <MetricCard
                title="Profit Margin"
                value={`${currentProfitSummary.marginPct.toFixed(1)}%`}
                icon={<Percent className="h-4 w-4 text-muted-foreground" />}
                change={marginChange}
              />
            </div>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>How profit is calculated</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <p>
                  <strong>Cost Price</strong> (Product master <code>price</code> field) is treated as the purchase/procurement cost per unit.
                </p>
                <p>
                  <strong>Selling Price</strong> per line item is the actual amount billed (after any per-bill discount allocated).
                </p>
                <p>
                  Profit = Σ(line item revenue) − Σ(cost price × quantity sold). Margin % = Profit ÷ Revenue × 100.
                </p>
              </CardContent>
            </Card>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Top 10 Profitable Products</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={topProfitableProducts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="productName" type="category" width={140} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#2563eb" name="Revenue" />
                    <Bar dataKey="cogs" fill="#94a3b8" name="COGS" />
                    <Bar dataKey="profit" fill="#16a34a" name="Profit" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {lossMakers.length > 0 && (
              <Card className="border-red-200 bg-red-50/30 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    Loss-Making Products
                  </CardTitle>
                  <p className="text-xs text-red-600">
                    Products where selling price was below cost. Total loss:{' '}
                    <strong>{formatCurrency(lossMakers.reduce((s, p) => s + p.profit, 0))}</strong>
                  </p>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty Sold</TableHead>
                        <TableHead className="text-right">Cost / Unit</TableHead>
                        <TableHead className="text-right">Avg Sell Price</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Loss</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lossMakers.slice(0, 20).map((row) => (
                        <TableRow
                          key={row.productId}
                          onClick={() => setDialogProductId(row.productId)}
                          className="cursor-pointer hover:bg-red-100/50"
                        >
                          <TableCell className="font-medium">{row.productName}</TableCell>
                          <TableCell className="text-right">{row.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.costPrice)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.avgSellingPrice)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {formatCurrency(row.profit)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Profit by Product</CardTitle>
                <p className="text-xs text-muted-foreground">Click any row for store-by-store breakdown</p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty Sold</TableHead>
                      <TableHead className="text-right">Cost / Unit</TableHead>
                      <TableHead className="text-right">Avg Sell Price</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">COGS</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProductAnalytics.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No product sales in this period.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredProductAnalytics
                      .slice()
                      .sort((a, b) => b.profit - a.profit)
                      .slice(0, 50)
                      .map((row) => (
                        <TableRow
                          key={row.productId}
                          onClick={() => setDialogProductId(row.productId)}
                          className="cursor-pointer hover:bg-slate-50"
                        >
                          <TableCell className="font-medium">{row.productName}</TableCell>
                          <TableCell className="text-right">{row.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.costPrice)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.avgSellingPrice)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.cogs)}</TableCell>
                          <TableCell className="text-right">
                            <span className={row.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {formatCurrency(row.profit)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {row.profitMargin === null ? 'N/A' : `${row.profitMargin.toFixed(1)}%`}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="batches" className="space-y-4">
            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-4 w-4" /> Batch Overview
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {batches.length} batch(es) tracked · {products.filter((p) => p.batchId).length} of{' '}
                  {products.length} products are batch-tagged · Click a batch to drill into its product performance.
                </p>
              </CardHeader>
              <CardContent>
                <div className="relative max-w-md mb-4">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={batchSearch}
                    onChange={(e) => setBatchSearch(e.target.value)}
                    placeholder="Search by batch number or place"
                    className="pl-9"
                  />
                </div>

                {filteredBatchAnalytics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {batches.length === 0
                      ? 'No batches found. Make sure your products are batch-tagged.'
                      : 'No batches match this search.'}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Batch</TableHead>
                        <TableHead>Place</TableHead>
                        <TableHead className="text-right">Products</TableHead>
                        <TableHead className="text-right">Sold</TableHead>
                        <TableHead className="text-right">Qty Sold</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                        <TableHead className="text-right">Margin %</TableHead>
                        <TableHead className="text-right">Stock Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBatchAnalytics.map((row) => {
                        const sellThrough =
                          row.productsInBatch > 0
                            ? (row.productsSold / row.productsInBatch) * 100
                            : 0
                        return (
                          <TableRow
                            key={row.batchId}
                            onClick={() => setDialogBatchId(row.batchId)}
                            className="cursor-pointer hover:bg-slate-50"
                          >
                            <TableCell>
                              <div className="font-medium">{row.batchNumber}</div>
                              {row.createdAt && (
                                <div className="text-xs text-muted-foreground">
                                  {formatDisplayDate(row.createdAt)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{row.place || '—'}</TableCell>
                            <TableCell className="text-right">{row.productsInBatch}</TableCell>
                            <TableCell className="text-right">
                              <span className="text-sm">
                                {row.productsSold}
                                <span className="ml-1 text-xs text-muted-foreground">
                                  ({sellThrough.toFixed(0)}%)
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{row.quantitySold}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                            <TableCell className="text-right">
                              <span className={row.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {formatCurrency(row.profit)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {row.marginPct === null ? 'N/A' : `${row.marginPct.toFixed(1)}%`}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(row.stockValue)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {batchAnalytics.filter((b) => b.revenue > 0).length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className={PANEL_CARD_CLASS}>
                  <CardHeader>
                    <CardTitle>Top Batches by Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart
                        data={batchAnalytics.filter((b) => b.revenue > 0).slice(0, 10)}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="batchNumber" type="category" width={140} />
                        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                        <Legend />
                        <Bar dataKey="revenue" fill="#2563eb" name="Revenue" />
                        <Bar dataKey="profit" fill="#16a34a" name="Profit" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className={PANEL_CARD_CLASS}>
                  <CardHeader>
                    <CardTitle>Batch Sell-Through Rate</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      % of products in each batch that had at least one sale
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart
                        data={batchAnalytics
                          .filter((b) => b.productsInBatch > 0)
                          .map((b) => ({
                            batchNumber: b.batchNumber,
                            sellThrough:
                              b.productsInBatch > 0
                                ? Number(((b.productsSold / b.productsInBatch) * 100).toFixed(1))
                                : 0,
                          }))
                          .slice(0, 10)}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} unit="%" />
                        <YAxis dataKey="batchNumber" type="category" width={140} />
                        <Tooltip formatter={(value) => `${value}%`} />
                        <Bar dataKey="sellThrough" fill="#16a34a" name="Sell-through %" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="border-amber-200 bg-amber-50/40">
                <CardContent className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Pending</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {returnsInPeriod.filter((item) => item.status === 'pending').length}
                  </p>
                  <p className="text-xs text-amber-600">Awaiting approval</p>
                </CardContent>
              </Card>
              <Card className="border-emerald-200 bg-emerald-50/40">
                <CardContent className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Approved</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {returnsInPeriod.filter((item) => item.status === 'approved' || item.status === 'completed').length}
                  </p>
                  <p className="text-xs text-emerald-600">
                    {formatCurrency(currentReturnsAmount)} refunded
                  </p>
                </CardContent>
              </Card>
              <Card className="border-rose-200 bg-rose-50/40">
                <CardContent className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-rose-700">Rejected</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {returnsInPeriod.filter((item) => item.status === 'rejected').length}
                  </p>
                  <p className="text-xs text-rose-600">Refund denied</p>
                </CardContent>
              </Card>
              <Card className="border-violet-200 bg-violet-50/40">
                <CardContent className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-violet-700">Replacements</p>
                  <p className="text-2xl font-bold text-slate-900">{headlineMetrics.replacementBillsCount}</p>
                  <p className="text-xs text-violet-600">
                    {formatCurrency(currentReplacementAmount)} issued
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className={PANEL_CARD_CLASS}>
                <CardHeader>
                  <CardTitle>Returns by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  {returnStatusData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No returns in this period.</p>
                  ) : (
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
                  )}
                </CardContent>
              </Card>

              <Card className={PANEL_CARD_CLASS}>
                <CardHeader>
                  <CardTitle>Returns by Store</CardTitle>
                </CardHeader>
                <CardContent>
                  {returnsByStore.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No store returns in this period.</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={returnsByStore.slice(0, 8)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis dataKey="storeName" type="category" width={140} />
                          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                          <Bar dataKey="amount" fill="#dc2626" name="Return Amount" />
                        </BarChart>
                      </ResponsiveContainer>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Store</TableHead>
                            <TableHead className="text-right">Returns</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {returnsByStore.slice(0, 8).map((row) => (
                            <TableRow key={row.storeId}>
                              <TableCell className="font-medium">{row.storeName}</TableCell>
                              <TableCell className="text-right">{row.count}</TableCell>
                              <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className={PANEL_CARD_CLASS}>
              <CardHeader>
                <CardTitle>Most Returned Products</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Identify problem products driving the largest refund amounts
                </p>
              </CardHeader>
              <CardContent>
                {topReturnedProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No returns in this period.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Return Count</TableHead>
                        <TableHead className="text-right">Total Refund</TableHead>
                        <TableHead className="text-right">Avg per Return</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topReturnedProducts.slice(0, 15).map((row) => (
                        <TableRow
                          key={row.productId}
                          onClick={() => row.productId !== 'unknown' && setDialogProductId(row.productId)}
                          className={row.productId !== 'unknown' ? 'cursor-pointer hover:bg-slate-50' : ''}
                        >
                          <TableCell className="font-medium">{row.productName}</TableCell>
                          <TableCell className="text-right">{row.count}</TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {formatCurrency(row.amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.count > 0 ? row.amount / row.count : 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

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
                      <TableHead>Product</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnsInPeriod.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
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
                      .map((item) => {
                        const productName =
                          products.find((p) => p.id === item.productId)?.name || item.productId || '—'
                        const sname = storeNameMap.get(item.storeId || '') || '—'
                        return (
                          <TableRow key={item.returnId}>
                            <TableCell>
                              {formatDisplayDate(item.createdAt, 'N/A')}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{item.returnId}</TableCell>
                            <TableCell>{productName}</TableCell>
                            <TableCell>{sname}</TableCell>
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
                        )
                      })}
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
