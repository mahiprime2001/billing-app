"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import DashboardLayout from "@/components/dashboard-layout"
import ProductAssignmentDialog, { AssignedProduct } from "@/components/product-assignment-dialog"
import { unifiedPrint } from "@/app/utils/printUtils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Plus,
  Search,
  Trash2,
  Calendar,
  Building,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Printer,
  PackagePlus,
  ArrowRightLeft,
  ClipboardList,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
} from "lucide-react"

const API = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://127.0.0.1:8080"

// --- Types ---

interface StoreType {
  id: string
  name: string
  address: string
  phone: string
  manager: string
  status: "active" | "inactive"
}

type DateCard = {
  date: string
  count: number
  totalStock: number
  totalValue: number
}

type TransferOrder = {
  id: string
  storeId?: string
  store_id?: string
  status?: string
  createdAt?: string
  created_at?: string
  assignedQtyTotal?: number
  itemCount?: number
  totalValue?: number
  missingItemCount?: number
  missingStockTotal?: number
}

type TransferOrderItem = {
  id: string
  assignedQty?: number
  assigned_qty?: number
  verifiedQty?: number
  verified_qty?: number
  products?: {
    name?: string
    barcode?: string
    sellingPrice?: number
    selling_price?: number
    batchNumber?: string
    batch_number?: string
  }
}

type TransferOrderDetails = {
  id: string
  createdAt?: string
  created_at?: string
  status?: string
  items: TransferOrderItem[]
}

// --- Helper functions ---

const normalizeStoreId = (id: string | undefined | null): string | undefined | null => {
  if (id === undefined || id === null) return id
  if (id === "store_1") return "STR-1722255700000"
  if (id.startsWith("STR-")) return id
  return id
}

const getDateKey = (value?: string) => {
  if (!value) return ""
  const text = String(value)
  return text.length >= 10 ? text.slice(0, 10) : ""
}

const formatDateTime = (value?: string) => {
  if (!value) return "-"
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const getAssignedQty = (item: TransferOrderItem) => Number(item.assignedQty ?? item.assigned_qty ?? 0)
const getVerifiedQty = (item: TransferOrderItem) => Number(item.verifiedQty ?? item.verified_qty ?? 0)
const getItemPrice = (item: TransferOrderItem) =>
  Number(item.products?.sellingPrice ?? item.products?.selling_price ?? 0)
const getItemName = (item: TransferOrderItem) => item.products?.name || "Unknown Product"
const getItemBarcode = (item: TransferOrderItem) => item.products?.barcode || "-"
const getItemBatch = (item: TransferOrderItem) =>
  item.products?.batchNumber || item.products?.batch_number || "-"

const enrichOrdersWithValue = async (orderList: TransferOrder[]): Promise<TransferOrder[]> => {
  return Promise.all(
    orderList.map(async (order) => {
      try {
        const res = await fetch(`${API}/api/transfer-orders/${order.id}`)
        if (res.ok) {
          const detail = await res.json()
          const items: TransferOrderItem[] = Array.isArray(detail?.items) ? detail.items : []
          const totalValue = items.reduce((sum, item) => {
            return sum + getAssignedQty(item) * getItemPrice(item)
          }, 0)
          const missingItemCount = items.reduce((count, item) => {
            const missing = Math.max(0, getAssignedQty(item) - getVerifiedQty(item))
            return count + (missing > 0 ? 1 : 0)
          }, 0)
          const missingStockTotal = items.reduce((sum, item) => {
            return sum + Math.max(0, getAssignedQty(item) - getVerifiedQty(item))
          }, 0)
          return { ...order, totalValue, missingItemCount, missingStockTotal }
        }
      } catch {}
      return { ...order, totalValue: 0, missingItemCount: 0, missingStockTotal: 0 }
    })
  )
}

const getOrderStatus = (order: TransferOrder) => String(order.status || "pending").toLowerCase()

const isPendingOrder = (order: TransferOrder) => {
  const status = getOrderStatus(order)
  return status === "pending" || status === "in_progress" || status === "in-progress"
}

const isCompletedOrder = (order: TransferOrder) => {
  const status = getOrderStatus(order)
  return status === "completed" || status === "closed_with_issues" || status === "closed-with-issues"
}

const getStatusMeta = (item: TransferOrderItem) => {
  const assigned = getAssignedQty(item)
  const verified = getVerifiedQty(item)
  if (verified <= 0) return { label: "Pending", variant: "secondary" as const, verified, unverified: assigned }
  if (verified >= assigned) return { label: "Verified", variant: "default" as const, verified, unverified: 0 }
  return { label: "Partial", variant: "outline" as const, verified, unverified: Math.max(0, assigned - verified) }
}

const escapeHtml = (value: string | number) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")

// --- Mini Calendar ---

function MiniCalendar({
  dates,
  selectedDate,
  onDateSelect,
  dataLabel = "Has data",
}: {
  dates: DateCard[]
  selectedDate: string | null
  onDateSelect: (date: string) => void
  dataLabel?: string
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const dateDataMap = new Map(dates.map((d) => [d.date, d]))
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayOfWeek = firstDay.getDay()

  const calendarDays: (null | { day: number; dateStr: string; isToday: boolean; hasData: boolean; data?: DateCard })[] = []
  for (let i = 0; i < startingDayOfWeek; i++) calendarDays.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    const dateData = dateDataMap.get(dateStr)
    calendarDays.push({ day, dateStr, isToday: dateStr === todayStr, hasData: !!dateData, data: dateData })
  }

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  return (
    <div className="bg-white rounded-2xl border p-5">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(year, month - 1))} className="h-8 w-8 p-0">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-base font-semibold">{monthNames[month]} {year}</h3>
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(year, month + 1))} className="h-8 w-8 p-0">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map((d) => (
          <div key={d} className="text-xs font-medium text-gray-500 text-center p-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, index) => {
          if (!day) return <div key={index} className="h-9" />
          const isSelected = selectedDate === day.dateStr
          return (
            <button
              key={day.dateStr}
              onClick={() => day.hasData && onDateSelect(day.dateStr)}
              disabled={!day.hasData}
              className={`
                h-9 w-9 text-xs rounded-lg relative transition-all duration-200 mx-auto
                ${isSelected && day.hasData
                  ? "bg-blue-600 text-white font-semibold shadow-md"
                  : day.hasData
                    ? "bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium border border-blue-200"
                    : day.isToday
                      ? "bg-gray-100 text-gray-900 font-medium"
                      : "text-gray-400 hover:bg-gray-50"
                }
                ${!day.hasData ? "cursor-default" : "cursor-pointer"}
              `}
            >
              {day.day}
              {day.hasData && (
                <div className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${isSelected ? "bg-white" : "bg-blue-500"}`} />
              )}
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 bg-blue-500 rounded-full" />
          <span>{dataLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 bg-gray-300 rounded-full" />
          <span>No data</span>
        </div>
      </div>
    </div>
  )
}

// --- Main Orders Page ---

export default function OrdersPage() {
  const router = useRouter()

  // Stores
  const [stores, setStores] = useState<StoreType[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all")
  const [storesLoading, setStoresLoading] = useState(true)

  // Transfer orders
  const [orders, setOrders] = useState<TransferOrder[]>([])
  const [dates, setDates] = useState<DateCard[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [orderStatusFilter, setOrderStatusFilter] = useState<"all" | "pending" | "completed">("all")
  const [orderSearch, setOrderSearch] = useState("")
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null)

  // Order details dialog
  const [selectedOrder, setSelectedOrder] = useState<TransferOrder | null>(null)
  const [orderDetails, setOrderDetails] = useState<TransferOrderDetails | null>(null)
  const [isLoadingOrderDetails, setIsLoadingOrderDetails] = useState(false)
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false)

  // Active tab
  const [activeTab, setActiveTab] = useState<"create" | "orders" | "summary">("orders")

  // Create order - store search
  const [createStoreSearch, setCreateStoreSearch] = useState("")

  // Summary tab state
  const [summaryStoreId, setSummaryStoreId] = useState<string>("")
  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }, [])
  const [summaryFrom, setSummaryFrom] = useState<string>(todayStr)
  const [summaryTo, setSummaryTo] = useState<string>(todayStr)
  const [summaryOrders, setSummaryOrders] = useState<(TransferOrder & { totalValue?: number })[]>([])
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)

  // Auth check
  useEffect(() => {
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    const userData = localStorage.getItem("adminUser")
    if (isLoggedIn !== "true" || !userData) {
      router.push("/")
      return
    }
    const user = JSON.parse(userData)
    if (user.role !== "super_admin" && user.role !== "admin") {
      router.push("/")
      return
    }
    fetchStores()
  }, [router])

  const fetchStores = async () => {
    setStoresLoading(true)
    try {
      const res = await fetch(`${API}/api/stores`)
      if (res.ok) {
        const data = await res.json()
        const activeStores = (Array.isArray(data) ? data : []).filter(
          (s: any) => s.status === "active"
        ) as StoreType[]
        setStores(activeStores)
      }
    } catch (e) {
      console.error("Error loading stores:", e)
    } finally {
      setStoresLoading(false)
    }
  }

  // Fetch transfer orders when store selection changes or stores finish loading
  useEffect(() => {
    if (storesLoading) return
    if (selectedStoreId === "all") {
      if (stores.length > 0) fetchAllTransferOrders()
    } else if (selectedStoreId) {
      fetchTransferOrders(selectedStoreId)
    }
  }, [selectedStoreId, storesLoading, stores.length])

  const fetchAllTransferOrders = async () => {
    setIsLoadingOrders(true)
    setOrders([])
    setDates([])
    setSelectedDate(null)

    try {
      const allOrders: TransferOrder[] = []
      await Promise.all(
        stores.map(async (store) => {
          try {
            const normalizedId = normalizeStoreId(store.id) || store.id
            const res = await fetch(`${API}/api/stores/${normalizedId}/transfer-orders`)
            if (res.ok) {
              const payload = await res.json()
              const list = Array.isArray(payload) ? payload : []
              list.forEach((order: any) => {
                allOrders.push({
                  ...order,
                  storeId: store.id,
                  createdAt: order.createdAt || order.created_at,
                })
              })
            }
          } catch {}
        })
      )
      const enriched = await enrichOrdersWithValue(allOrders)
      processOrders(enriched)
    } catch (e) {
      console.error("Error fetching all transfer orders:", e)
    } finally {
      setIsLoadingOrders(false)
    }
  }

  const fetchTransferOrders = async (storeId: string) => {
    setIsLoadingOrders(true)
    setOrders([])
    setDates([])
    setSelectedDate(null)

    try {
      const normalizedId = normalizeStoreId(storeId) || storeId
      const res = await fetch(`${API}/api/stores/${normalizedId}/transfer-orders`)
      if (res.ok) {
        const payload = await res.json()
        const list = Array.isArray(payload) ? payload : []
        const normalized: TransferOrder[] = list.map((order: any) => ({
          ...order,
          storeId,
          createdAt: order.createdAt || order.created_at,
        }))
        const enriched = await enrichOrdersWithValue(normalized)
        processOrders(enriched)
      }
    } catch (e) {
      console.error("Error fetching transfer orders:", e)
    } finally {
      setIsLoadingOrders(false)
    }
  }

  const processOrders = (orderList: TransferOrder[]) => {
    setOrders(orderList)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 120)
    const grouped = new Map<string, number>()
    orderList.forEach((order) => {
      const dateKey = getDateKey(order.createdAt || order.created_at)
      if (!dateKey) return
      const asDate = new Date(`${dateKey}T00:00:00`)
      if (asDate < cutoff) return
      grouped.set(dateKey, (grouped.get(dateKey) || 0) + 1)
    })
    const dateCards: DateCard[] = Array.from(grouped.entries())
      .map(([date, count]) => ({ date, count, totalStock: 0, totalValue: 0 }))
      .sort((a, b) => b.date.localeCompare(a.date))
    setDates(dateCards)
  }

  const filteredOrders = useMemo(() => {
    let list = [...orders]
    if (selectedDate) {
      list = list.filter((order) => getDateKey(order.createdAt || order.created_at) === selectedDate)
    }
    if (orderStatusFilter === "pending") list = list.filter(isPendingOrder)
    else if (orderStatusFilter === "completed") list = list.filter(isCompletedOrder)

    if (orderSearch.trim()) {
      const term = orderSearch.trim().toLowerCase()
      list = list.filter((o) => o.id.toLowerCase().includes(term))
    }

    list.sort((a, b) => {
      const aTs = new Date(a.createdAt || a.created_at || "").getTime()
      const bTs = new Date(b.createdAt || b.created_at || "").getTime()
      return bTs - aTs
    })
    return list
  }, [orders, selectedDate, orderStatusFilter, orderSearch])

  // Stats
  const stats = useMemo(() => {
    const total = orders.length
    const pending = orders.filter(isPendingOrder).length
    const completed = orders.filter(isCompletedOrder).length
    const totalQty = orders.reduce((sum, o) => sum + (o.assignedQtyTotal || 0), 0)
    return { total, pending, completed, totalQty }
  }, [orders])

  const orderTotals = useMemo(() => {
    if (!orderDetails?.items?.length) return { totalProducts: 0, totalAmount: 0, totalLines: 0 }
    const totalProducts = orderDetails.items.reduce((sum, item) => sum + getAssignedQty(item), 0)
    const totalAmount = orderDetails.items.reduce((sum, item) => sum + getAssignedQty(item) * getItemPrice(item), 0)
    return { totalProducts, totalAmount, totalLines: orderDetails.items.length }
  }, [orderDetails])

  const openOrderDetails = async (order: TransferOrder) => {
    try {
      setIsLoadingOrderDetails(true)
      setSelectedOrder(order)
      setOrderDetails(null)
      setIsOrderDialogOpen(true)

      let response: Response | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch(`${API}/api/transfer-orders/${order.id}`)
        if (response.ok) break
        if (attempt < 2) await new Promise((r) => setTimeout(r, 350 * (attempt + 1)))
      }

      if (!response || !response.ok) {
        setOrderDetails({ id: order.id, createdAt: order.createdAt || order.created_at, status: order.status || "pending", items: [] })
        return
      }

      const payload = await response.json()
      setOrderDetails({
        id: payload?.id || order.id,
        createdAt: payload?.createdAt || payload?.created_at || order.createdAt || order.created_at,
        status: payload?.status || order.status || "pending",
        items: Array.isArray(payload?.items) ? payload.items : [],
      })
    } catch {
      setOrderDetails({ id: order.id, createdAt: order.createdAt || order.created_at, status: order.status || "pending", items: [] })
    } finally {
      setIsLoadingOrderDetails(false)
    }
  }

  const handleDeleteOrder = async (order: TransferOrder) => {
    const confirmed = window.confirm(`Delete order ${order.id}? This action cannot be undone.`)
    if (!confirmed) return

    try {
      setDeletingOrderId(order.id)
      const response = await fetch(`${API}/api/transfer-orders/${order.id}`, { method: "DELETE" })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error || "Failed to delete order")
      }

      setOrders((prev) => {
        const next = prev.filter((row) => row.id !== order.id)
        processOrders(next)
        return next
      })

      if (selectedOrder?.id === order.id) {
        setIsOrderDialogOpen(false)
        setSelectedOrder(null)
        setOrderDetails(null)
      }
    } catch (error: any) {
      alert(error?.message || "Unable to delete order right now")
    } finally {
      setDeletingOrderId(null)
    }
  }

  // Refresh orders after a product assignment
  const handleProductAssignment = async (_storeId: string, _products: AssignedProduct[]) => {
    if (selectedStoreId === "all") await fetchAllTransferOrders()
    else await fetchTransferOrders(selectedStoreId)
  }

  const filteredCreateStores = useMemo(() => {
    if (!createStoreSearch.trim()) return stores
    const term = createStoreSearch.trim().toLowerCase()
    return stores.filter(
      (s) => s.name.toLowerCase().includes(term) || s.address?.toLowerCase().includes(term)
    )
  }, [stores, createStoreSearch])

  const getStoreName = (order: TransferOrder) => {
    const storeId = order.storeId || order.store_id
    if (!storeId) return "Unknown Store"
    const store = stores.find((s) => s.id === storeId || normalizeStoreId(s.id) === normalizeStoreId(storeId))
    return store?.name || storeId
  }

  const handleOrderPrint = async () => {
    if (!orderDetails) return
    const store = stores.find((s) => s.id === (selectedOrder?.storeId || selectedOrder?.store_id))
    const storeName = store?.name || "Store"
    const orderDateLabel = formatDateTime(orderDetails.createdAt || orderDetails.created_at)

    const rows = (orderDetails.items || [])
      .map((item, idx) => {
        const qty = getAssignedQty(item)
        const price = getItemPrice(item)
        const amount = qty * price
        return `<tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(getItemBarcode(item))}</td>
          <td>${escapeHtml(getItemName(item))}</td>
          <td>${escapeHtml(getItemBatch(item))}</td>
          <td style="text-align:right">${qty}</td>
          <td style="text-align:right">${escapeHtml("\u20B9")}${amount.toFixed(2)}</td>
        </tr>`
      })
      .join("")

    const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Transfer Order ${escapeHtml(orderDetails.id)}</title>
<style>
  @media print { @page { margin: 12mm; } body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; font-size: 10px; line-height: 1.3; color: #111; } h1 { font-size: 14px; margin: 0 0 8px 0; } .meta { font-size: 10px; margin-bottom: 8px; border: 1px solid #ddd; padding: 6px; } .meta-row { margin: 2px 0; } table { width: 100%; border-collapse: collapse; margin-top: 8px; } th, td { border: 1px solid #ddd; padding: 6px; font-size: 10px; text-align: left; } th { background: #f3f4f6; } tr.total-row td { font-weight: bold; background: #f9fafb; } }
  body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; padding: 16px; color: #111; } .meta { font-size: 11px; margin-bottom: 10px; border: 1px solid #ddd; padding: 8px; } .meta-row { margin: 3px 0; } table { width: 100%; border-collapse: collapse; margin-top: 10px; } th, td { border: 1px solid #ddd; padding: 6px; font-size: 11px; text-align: left; } th { background: #f3f4f6; } .right { text-align: right; }
</style></head><body>
  <h1>Transfer Order - ${escapeHtml(storeName)}</h1>
  <div class="meta">
    <div class="meta-row"><strong>Order ID:</strong> ${escapeHtml(orderDetails.id)}</div>
    <div class="meta-row"><strong>Date:</strong> ${escapeHtml(orderDateLabel)}</div>
    <div class="meta-row"><strong>Printed At:</strong> ${escapeHtml(new Date().toLocaleString())}</div>
  </div>
  <table><thead><tr><th>S.No</th><th>Product Barcode</th><th>Product Name</th><th>Batch</th><th class="right">Quantity</th><th class="right">Amount</th></tr></thead>
  <tbody>${rows}
  <tr class="total-row"><td colspan="4"><strong>Total</strong></td><td class="right">${orderTotals.totalProducts}</td><td class="right">${escapeHtml("\u20B9")}${orderTotals.totalAmount.toFixed(2)}</td></tr></tbody></table>
</body></html>`

    await unifiedPrint({ htmlContent, isThermalPrinter: false, useBackendPrint: true, storeName })
  }

  // ==================== SUMMARY LOGIC ====================

  // Auto-select first store for summary when stores load
  useEffect(() => {
    if (stores.length > 0 && !summaryStoreId) {
      setSummaryStoreId(stores[0].id)
    }
  }, [stores])

  const fetchSummary = async () => {
    if (!summaryStoreId || !summaryFrom || !summaryTo) return
    setIsLoadingSummary(true)
    setSummaryOrders([])

    try {
      const normalizedId = normalizeStoreId(summaryStoreId) || summaryStoreId
      const res = await fetch(`${API}/api/stores/${normalizedId}/transfer-orders`)
      if (!res.ok) { setIsLoadingSummary(false); return }

      const payload = await res.json()
      const list: TransferOrder[] = (Array.isArray(payload) ? payload : []).map((o: any) => ({
        ...o,
        storeId: summaryStoreId,
        createdAt: o.createdAt || o.created_at,
      }))

      // Filter by selected date
      const dayOrders = list.filter((o) => {
        const dk = getDateKey(o.createdAt || o.created_at)
        return dk >= summaryFrom && dk <= summaryTo
      })

      // Fetch details for each order to get total value
      const enriched = await Promise.all(
        dayOrders.map(async (order) => {
          try {
            const detailRes = await fetch(`${API}/api/transfer-orders/${order.id}`)
            if (detailRes.ok) {
              const detail = await detailRes.json()
              const items: TransferOrderItem[] = Array.isArray(detail?.items) ? detail.items : []
              const totalValue = items.reduce((sum, item) => {
                const qty = getAssignedQty(item)
                const price = getItemPrice(item)
                return sum + qty * price
              }, 0)
              return { ...order, totalValue }
            }
          } catch {}
          return { ...order, totalValue: 0 }
        })
      )

      enriched.sort((a, b) => {
        const aTs = new Date(a.createdAt || a.created_at || "").getTime()
        const bTs = new Date(b.createdAt || b.created_at || "").getTime()
        return aTs - bTs
      })

      setSummaryOrders(enriched)
    } catch (e) {
      console.error("Error fetching summary:", e)
    } finally {
      setIsLoadingSummary(false)
    }
  }

  useEffect(() => {
    if (activeTab === "summary" && summaryStoreId && summaryFrom && summaryTo) {
      fetchSummary()
    }
  }, [activeTab, summaryStoreId, summaryFrom, summaryTo])

  const summaryTotals = useMemo(() => {
    const totalOrders = summaryOrders.length
    const totalStock = summaryOrders.reduce((sum, o) => sum + (o.assignedQtyTotal || 0), 0)
    const totalItems = summaryOrders.reduce((sum, o) => sum + (o.itemCount || 0), 0)
    const totalValue = summaryOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0)
    return { totalOrders, totalStock, totalItems, totalValue }
  }, [summaryOrders])

  const summaryStoreName = stores.find((s) => s.id === summaryStoreId)?.name || "Store"

  const handleSummaryPrint = async () => {
    if (summaryOrders.length === 0) return

    const rows = summaryOrders
      .map((order, idx) => {
        return `<tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(getDateKey(order.createdAt || order.created_at || ""))}</td>
          <td style="font-family:monospace;font-size:10px">${escapeHtml(order.id)}</td>
          <td style="text-align:right">${order.itemCount || 0}</td>
          <td style="text-align:right">${order.assignedQtyTotal || 0}</td>
          <td style="text-align:right">${escapeHtml("\u20B9")}${(order.totalValue || 0).toFixed(2)}</td>
        </tr>`
      })
      .join("")

    const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Daily Orders Summary - ${escapeHtml(summaryStoreName)}</title>
<style>
  @media print { @page { margin: 12mm; } }
  body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; padding: 16px; color: #111; }
  h1 { font-size: 16px; margin: 0 0 4px 0; }
  .subtitle { font-size: 12px; color: #555; margin-bottom: 12px; }
  .meta { font-size: 11px; margin-bottom: 10px; border: 1px solid #ddd; padding: 8px; display: flex; gap: 24px; }
  .meta-item { display: flex; flex-direction: column; }
  .meta-label { font-size: 9px; color: #888; text-transform: uppercase; }
  .meta-value { font-size: 13px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 11px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  .right { text-align: right; }
  tr.total-row td { font-weight: 700; background: #f9fafb; }
</style></head><body>
  <h1>Daily Orders Summary</h1>
  <div class="subtitle">${escapeHtml(summaryStoreName)} &mdash; ${escapeHtml(summaryFrom)}${summaryFrom !== summaryTo ? ` to ${escapeHtml(summaryTo)}` : ""}</div>
  <div class="meta">
    <div class="meta-item"><span class="meta-label">Orders</span><span class="meta-value">${summaryTotals.totalOrders}</span></div>
    <div class="meta-item"><span class="meta-label">Total Items</span><span class="meta-value">${summaryTotals.totalItems}</span></div>
    <div class="meta-item"><span class="meta-label">Total Stock</span><span class="meta-value">${summaryTotals.totalStock}</span></div>
    <div class="meta-item"><span class="meta-label">Total Value</span><span class="meta-value">${escapeHtml("\u20B9")}${summaryTotals.totalValue.toFixed(2)}</span></div>
    <div class="meta-item"><span class="meta-label">Printed At</span><span class="meta-value">${escapeHtml(new Date().toLocaleString())}</span></div>
  </div>
  <table>
    <thead><tr><th>S.No</th><th>Date</th><th>Order ID</th><th class="right">Items</th><th class="right">Total Stock</th><th class="right">Total Value</th></tr></thead>
    <tbody>${rows}
    <tr class="total-row"><td colspan="3"><strong>Grand Total</strong></td><td class="right">${summaryTotals.totalItems}</td><td class="right">${summaryTotals.totalStock}</td><td class="right">${escapeHtml("\u20B9")}${summaryTotals.totalValue.toFixed(2)}</td></tr></tbody>
  </table>
</body></html>`

    await unifiedPrint({ htmlContent, isThermalPrinter: false, useBackendPrint: true, storeName: summaryStoreName })
  }

  const selectedStoreName = selectedStoreId === "all"
    ? "All Stores"
    : stores.find((s) => s.id === selectedStoreId)?.name || "Store"

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
            <p className="text-muted-foreground mt-1">Create, track, and manage store transfer orders</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-[220px]">
                <Building className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Select store" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores</SelectItem>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Orders</p>
                  <p className="text-2xl font-bold mt-1">{stats.total}</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <ClipboardList className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold mt-1">{stats.pending}</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold mt-1">{stats.completed}</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Qty</p>
                  <p className="text-2xl font-bold mt-1">{stats.totalQty}</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center">
                  <Package className="h-5 w-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "create" | "orders" | "summary")} className="space-y-6">
          <TabsList className="bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="orders" className="rounded-lg gap-2 px-4 data-[state=active]:shadow-sm">
              <ArrowRightLeft className="h-4 w-4" />
              Transfer Orders
            </TabsTrigger>
            <TabsTrigger value="create" className="rounded-lg gap-2 px-4 data-[state=active]:shadow-sm">
              <PackagePlus className="h-4 w-4" />
              Create Order
            </TabsTrigger>
            <TabsTrigger value="summary" className="rounded-lg gap-2 px-4 data-[state=active]:shadow-sm">
              <Printer className="h-4 w-4" />
              Daily Summary
            </TabsTrigger>
          </TabsList>

          {/* ==================== TRANSFER ORDERS TAB ==================== */}
          <TabsContent value="orders" className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Left: Calendar */}
              <div className="xl:col-span-1 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-600" /> Calendar
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectedStoreId === "all" ? fetchAllTransferOrders() : fetchTransferOrders(selectedStoreId)}
                    disabled={isLoadingOrders}
                    className="gap-1"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingOrders ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
                {isLoadingOrders ? (
                  <div className="h-80 flex items-center justify-center border rounded-2xl bg-gray-50">
                    <div className="text-center space-y-2">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Loading orders...</p>
                    </div>
                  </div>
                ) : (
                  <MiniCalendar
                    dates={dates}
                    selectedDate={selectedDate}
                    onDateSelect={setSelectedDate}
                    dataLabel="Has transfer orders"
                  />
                )}

                {/* Quick summary under calendar */}
                {selectedDate && (
                  <Card className="bg-blue-50/50 border-blue-200">
                    <CardContent className="pt-4 pb-3">
                      <p className="text-sm font-medium text-blue-900">
                        {selectedDate}
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        {filteredOrders.length} order(s) on this date
                      </p>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)} className="mt-2 h-7 text-xs text-blue-700 hover:text-blue-900 hover:bg-blue-100 px-2">
                        Clear date filter
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right: Orders List */}
              <div className="xl:col-span-2 space-y-4">
                {/* Search and filters */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by order ID..."
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex gap-2">
                    {(["all", "pending", "completed"] as const).map((f) => (
                      <Button
                        key={f}
                        variant={orderStatusFilter === f ? "default" : "outline"}
                        size="sm"
                        onClick={() => setOrderStatusFilter(f)}
                        className="capitalize"
                      >
                        {f === "all" && <Filter className="h-3.5 w-3.5 mr-1" />}
                        {f === "pending" && <Clock className="h-3.5 w-3.5 mr-1" />}
                        {f === "completed" && <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                        {f}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Orders header */}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    {selectedDate ? `Orders on ${selectedDate}` : `All Orders`}
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({filteredOrders.length})
                    </span>
                  </h3>
                </div>

                {/* Orders list */}
                <div className="space-y-3 max-h-[calc(100vh-420px)] overflow-y-auto pr-1">
                  {filteredOrders.length > 0 ? (
                    filteredOrders.map((order) => {
                      const statusStr = getOrderStatus(order)
                      const isPending = isPendingOrder(order)
                      const isInProgress = statusStr === "in_progress" || statusStr === "in-progress"
                      return (
                        <div
                          key={order.id}
                          className="border rounded-xl p-5 hover:border-blue-200 hover:shadow-md transition-all group bg-white"
                        >
                          <div className="flex justify-between items-start gap-4">
                            <button
                              onClick={() => openOrderDetails(order)}
                              className="text-left flex-1 min-w-0"
                            >
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-base group-hover:text-blue-600 transition-colors truncate">
                                  {order.id}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-sm text-muted-foreground">
                                  {formatDateTime(order.createdAt || order.created_at)}
                                </span>
                                {selectedStoreId === "all" && (
                                  <Badge variant="outline" className="text-xs font-normal">
                                    <Building className="h-3 w-3 mr-1" />
                                    {getStoreName(order)}
                                  </Badge>
                                )}
                              </div>
                            </button>

                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <Badge
                                  variant={isPending ? "secondary" : "default"}
                                  className={
                                    isPending
                                      ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                                      : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                  }
                                >
                                  {statusStr.replace(/_/g, " ")}
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-2">
                                  {order.itemCount || 0} items &middot; {order.assignedQtyTotal || 0} qty
                                </p>
                                {isInProgress && (
                                  <p className="text-xs text-amber-700 mt-1 font-medium">
                                    missing: {order.missingItemCount || 0} item + {order.missingStockTotal || 0}  stock
                                  </p>
                                )}
                                <p className="text-sm font-semibold mt-1">
                                  {"\u20B9"}{(order.totalValue || 0).toFixed(2)}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => handleDeleteOrder(order)}
                                disabled={deletingOrderId === order.id}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-center border rounded-2xl bg-gray-50/50">
                      <ClipboardList className="h-12 w-12 text-gray-300 mb-3" />
                      <p className="font-medium text-gray-500">No orders found</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {orderSearch || selectedDate || orderStatusFilter !== "all"
                          ? "Try adjusting your filters"
                          : "Create your first order using the Create Order tab"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ==================== CREATE ORDER TAB ==================== */}
          <TabsContent value="create" className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-1">Select a Store</h3>
              <p className="text-sm text-muted-foreground mb-4">Choose which store you want to send stock to, then the assignment dialog will open.</p>
              <div className="relative mb-6 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search stores..."
                  value={createStoreSearch}
                  onChange={(e) => setCreateStoreSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {filteredCreateStores.length === 0 ? (
              <div className="text-center py-16">
                <Building className="h-14 w-14 text-gray-300 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {createStoreSearch ? "No stores match your search" : "No active stores found"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredCreateStores.map((store) => (
                  <ProductAssignmentDialog
                    key={store.id}
                    storeId={store.id}
                    storeName={store.name}
                    trigger={
                      <Card className="cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group">
                        <CardContent className="pt-5 pb-5">
                          <div className="flex items-start gap-4">
                            <div className="h-11 w-11 rounded-xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center shrink-0 transition-colors">
                              <Building className="h-5 w-5 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-base group-hover:text-blue-600 transition-colors truncate">
                                {store.name}
                              </h4>
                              {store.address && (
                                <p className="text-sm text-muted-foreground mt-0.5 truncate">{store.address}</p>
                              )}
                              {store.phone && (
                                <p className="text-xs text-muted-foreground mt-1">{store.phone}</p>
                              )}
                            </div>
                            <div className="shrink-0">
                              <div className="h-9 w-9 rounded-lg bg-green-50 group-hover:bg-green-100 flex items-center justify-center transition-colors">
                                <Plus className="h-5 w-5 text-green-600" />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    }
                    onAssign={handleProductAssignment}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ==================== DAILY SUMMARY TAB ==================== */}
          <TabsContent value="summary" className="space-y-6">
            {/* Controls */}
            <Card>
              <CardContent className="pt-5 pb-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Store</label>
                    <Select value={summaryStoreId} onValueChange={setSummaryStoreId}>
                      <SelectTrigger className="w-[240px]">
                        <Building className="h-4 w-4 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Select store" />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map((store) => (
                          <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">From</label>
                    <Input
                      type="date"
                      value={summaryFrom}
                      onChange={(e) => setSummaryFrom(e.target.value)}
                      className="w-[170px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">To</label>
                    <Input
                      type="date"
                      value={summaryTo}
                      onChange={(e) => setSummaryTo(e.target.value)}
                      className="w-[170px]"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={fetchSummary}
                    disabled={isLoadingSummary || !summaryStoreId}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingSummary ? "animate-spin" : ""}`} />
                    Load
                  </Button>
                  <Button
                    onClick={handleSummaryPrint}
                    disabled={summaryOrders.length === 0}
                    className="gap-2"
                  >
                    <Printer className="h-4 w-4" />
                    Print Summary
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Summary stat cards */}
            {summaryOrders.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-blue-50/40 border-blue-200">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground font-medium">Orders</p>
                    <p className="text-2xl font-bold mt-1">{summaryTotals.totalOrders}</p>
                  </CardContent>
                </Card>
                <Card className="bg-amber-50/40 border-amber-200">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground font-medium">Total Items</p>
                    <p className="text-2xl font-bold mt-1">{summaryTotals.totalItems}</p>
                  </CardContent>
                </Card>
                <Card className="bg-emerald-50/40 border-emerald-200">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground font-medium">Total Stock</p>
                    <p className="text-2xl font-bold mt-1">{summaryTotals.totalStock}</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50/40 border-purple-200">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground font-medium">Total Value</p>
                    <p className="text-2xl font-bold mt-1">{"\u20B9"}{summaryTotals.totalValue.toFixed(2)}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Summary table */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      Orders for {summaryStoreName} {summaryFrom === summaryTo ? `on ${summaryFrom}` : `from ${summaryFrom} to ${summaryTo}`}
                    </CardTitle>
                    <CardDescription>
                      {summaryOrders.length} order(s)
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingSummary ? (
                  <div className="flex items-center justify-center py-16">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Loading...</span>
                  </div>
                ) : summaryOrders.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <ClipboardList className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="font-medium">No orders found</p>
                    <p className="text-sm mt-1">Select a store and date, then click Load</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-14">S.No</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Items</TableHead>
                        <TableHead className="text-right">Total Stock</TableHead>
                        <TableHead className="text-right">Total Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryOrders.map((order, idx) => (
                        <TableRow
                          key={order.id}
                          className="cursor-pointer hover:bg-blue-50/50"
                          onClick={() => openOrderDetails(order)}
                        >
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>{getDateKey(order.createdAt || order.created_at || "")}</TableCell>
                          <TableCell className="font-mono text-sm font-medium">{order.id}</TableCell>
                          <TableCell>
                            <Badge
                              variant={isPendingOrder(order) ? "secondary" : "default"}
                              className={
                                isPendingOrder(order)
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }
                            >
                              {String(order.status || "pending").replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{order.itemCount || 0}</TableCell>
                          <TableCell className="text-right font-semibold">{order.assignedQtyTotal || 0}</TableCell>
                          <TableCell className="text-right font-semibold">{"\u20B9"}{(order.totalValue || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={4} className="font-semibold">Grand Total</TableCell>
                        <TableCell className="text-right font-semibold">{summaryTotals.totalItems}</TableCell>
                        <TableCell className="text-right font-semibold">{summaryTotals.totalStock}</TableCell>
                        <TableCell className="text-right font-semibold text-lg">{"\u20B9"}{summaryTotals.totalValue.toFixed(2)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ==================== ORDER DETAILS DIALOG ==================== */}
        <Dialog open={isOrderDialogOpen} onOpenChange={setIsOrderDialogOpen}>
          <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-8 py-6 border-b bg-gradient-to-r from-slate-50 to-white">
              <DialogTitle className="text-2xl">Transfer Order Details</DialogTitle>
              {selectedOrder && (
                <DialogDescription asChild>
                  <div className="text-base text-muted-foreground">
                    Order ID: <span className="font-mono font-medium">{selectedOrder.id}</span>
                    {selectedStoreId === "all" && (
                      <span className="ml-3">
                        <Badge variant="outline">
                          <Building className="h-3 w-3 mr-1" />
                          {getStoreName(selectedOrder)}
                        </Badge>
                      </span>
                    )}
                  </div>
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="flex-1 overflow-auto p-8">
              {isLoadingOrderDetails ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center space-y-3">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    <p className="text-muted-foreground">Loading order details...</p>
                  </div>
                </div>
              ) : orderDetails ? (
                <div className="space-y-8">
                  {/* Summary cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-5 pb-4">
                        <p className="text-xs text-muted-foreground">Order ID</p>
                        <p className="font-mono text-sm font-semibold mt-1 truncate">{orderDetails.id}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-5 pb-4">
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="font-semibold text-sm mt-1">{formatDateTime(orderDetails.createdAt || orderDetails.created_at)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-5 pb-4">
                        <p className="text-xs text-muted-foreground">Status</p>
                        <div className="mt-1">
                          <Badge variant={isPendingOrder(orderDetails as any) ? "secondary" : "default"}>
                            {String(orderDetails.status || "pending").replace(/_/g, " ")}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-5 pb-4">
                        <p className="text-xs text-muted-foreground">Total Value</p>
                        <p className="font-semibold text-lg mt-1 text-emerald-600">{"\u20B9"}{orderTotals.totalAmount.toFixed(2)}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Items table */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-base">Order Items</CardTitle>
                        <Badge variant="outline">{orderTotals.totalLines} items</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="w-14">S.No</TableHead>
                            <TableHead>Barcode</TableHead>
                            <TableHead>Product Name</TableHead>
                            <TableHead>Batch</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderDetails.items.map((item, idx) => {
                            const qty = getAssignedQty(item)
                            const amount = qty * getItemPrice(item)
                            const statusMeta = getStatusMeta(item)
                            return (
                              <TableRow key={idx}>
                                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                                <TableCell className="font-mono text-sm">{getItemBarcode(item)}</TableCell>
                                <TableCell className="font-medium">{getItemName(item)}</TableCell>
                                <TableCell className="font-mono text-sm">{getItemBatch(item)}</TableCell>
                                <TableCell className="text-right font-semibold">{qty}</TableCell>
                                <TableCell><Badge variant={statusMeta.variant}>{statusMeta.label}</Badge></TableCell>
                                <TableCell className="text-right font-medium">{"\u20B9"}{amount.toFixed(2)}</TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={4} className="font-semibold">Total</TableCell>
                            <TableCell className="text-right font-semibold">{orderTotals.totalProducts}</TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-right font-semibold text-lg">{"\u20B9"}{orderTotals.totalAmount.toFixed(2)}</TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-20 text-muted-foreground">
                  <AlertCircle className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                  Could not load order details.
                </div>
              )}
            </div>

            <DialogFooter className="px-8 py-5 border-t bg-gray-50/50">
              <Button variant="outline" onClick={() => setIsOrderDialogOpen(false)}>Close</Button>
              <Button onClick={handleOrderPrint} disabled={!orderDetails} className="gap-2">
                <Printer className="h-4 w-4" />
                Print Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
