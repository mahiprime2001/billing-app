"use client"
import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

// Helper function to normalize store IDs
const normalizeStoreId = (id: string | undefined | null): string | undefined | null => {
  if (id === undefined || id === null) return id;
  if (id === 'store_1') return 'STR-1722255700000';
  if (id.startsWith('STR-')) return id;
  return id;
};

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  Edit,
  Trash2,
  Search,
  MapPin,
  Phone,
  Mail,
  User,
  TrendingUp,
  Receipt,
  Calendar,
  Building,
  Info,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Printer,
} from "lucide-react"
import ProductAssignmentDialog, {
  AssignedProduct,
} from "@/components/product-assignment-dialog";
import { unifiedPrint } from "@/app/utils/printUtils";

const API = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://127.0.0.1:8080"

interface StoreType {
  id: string
  name: string
  address: string
  phone: string
  manager: string
  status: "active" | "inactive"
  createdAt: string
  totalRevenue: number
  totalBills: number
  lastBillDate: string
  productCount?: number;
  totalStock?: number;
}

type StoreLiveInventoryRow = {
  id?: string
  quantity?: number
  products?: {
    name?: string
    barcode?: string
    price?: number
  }
  name?: string
  barcode?: string
  price?: number
}


type DateCard = {
  date: string
  count: number
  totalStock: number
  totalValue: number
}

type TransferOrder = {
  id: string
  status?: string
  createdAt?: string
  created_at?: string
  assignedQtyTotal?: number
  itemCount?: number
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
  }
}

type TransferOrderDetails = {
  id: string
  createdAt?: string
  created_at?: string
  status?: string
  items: TransferOrderItem[]
}

// iOS-style Mini Calendar Component (unchanged)
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
  
  const dateDataMap = new Map(dates.map(d => [d.date, d]))
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayOfWeek = firstDay.getDay()
  
  const calendarDays = []
  
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null)
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dateData = dateDataMap.get(dateStr);
    calendarDays.push({
      day,
      dateStr,
      isToday: dateStr === todayStr,
      hasData: !!dateData,
      data: dateData,
    });
  }
  
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]
  
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  
  const goToPrevMonth = () => {
    setCurrentMonth(new Date(year, month - 1))
  }
  
  const goToNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1))
  }
  
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={goToPrevMonth}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold">
          {monthNames[month]} {year}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={goToNextMonth}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map(day => (
          <div key={day} className="text-xs font-medium text-gray-500 text-center p-2">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, index) => {
          if (!day) {
            return <div key={index} className="h-8" />
          }
          
          const isSelected = selectedDate === day.dateStr
          const isToday = day.isToday
          const hasData = day.hasData
          
          return (
            <button
              key={day.dateStr}
              onClick={() => hasData && onDateSelect(day.dateStr)}
              disabled={!hasData}
              className={`
                h-8 w-8 text-xs rounded-md relative transition-all duration-200
                ${isSelected && hasData 
                  ? 'bg-blue-600 text-white font-semibold' 
                  : hasData 
                    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium border border-blue-200' 
                    : isToday 
                      ? 'bg-gray-100 text-gray-900 font-medium' 
                      : 'text-gray-400 hover:bg-gray-50'
                }
                ${!hasData ? 'cursor-default' : 'cursor-pointer'}
              `}
            >
              {day.day}
              {hasData && (
                <div className={`
                  absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full
                  ${isSelected ? 'bg-white' : 'bg-blue-500'}
                `} />
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

// Store Insight Modal Component (unchanged)
function StoreInsightModal({
  open,
  onClose,
  store,
}: {
  open: boolean;
  onClose: () => void;
  store: StoreType | null;
}) {
  const [days] = useState(120);
  const [activeInsightTab, setActiveInsightTab] = useState<"live-feed" | "all-orders">("live-feed");
  const [hasLoadedLiveFeed, setHasLoadedLiveFeed] = useState(false);
  const [inventoryRows, setInventoryRows] = useState<StoreLiveInventoryRow[]>([]);
  const [liveBills, setLiveBills] = useState<any[]>([]);
  const [liveProductSearch, setLiveProductSearch] = useState("");
  const [selectedLiveBillTab, setSelectedLiveBillTab] = useState("");
  const [isLoadingLiveFeed, setIsLoadingLiveFeed] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [dates, setDates] = useState<DateCard[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [orders, setOrders] = useState<TransferOrder[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<"all" | "pending" | "completed">("all");
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<TransferOrder | null>(null);
  const [orderDetails, setOrderDetails] = useState<TransferOrderDetails | null>(null);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
  const [isLoadingOrderDetails, setIsLoadingOrderDetails] = useState(false);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);

  const getDateKey = (value?: string) => {
    if (!value) return "";
    const text = String(value);
    return text.length >= 10 ? text.slice(0, 10) : "";
  };
  const getBillStoreId = (bill: any) =>
    normalizeStoreId(bill?.storeId || bill?.storeid || bill?.store_id);
  const getBillDate = (bill: any) => bill?.timestamp || bill?.date || bill?.createdAt || bill?.created_at || "";

  const formatDateTime = (value?: string) => {
    if (!value) return "-";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getAssignedQty = (item: TransferOrderItem) => Number(item.assignedQty ?? item.assigned_qty ?? 0);
  const getVerifiedQty = (item: TransferOrderItem) => Number(item.verifiedQty ?? item.verified_qty ?? 0);
  const getItemPrice = (item: TransferOrderItem) =>
    Number(item.products?.sellingPrice ?? item.products?.selling_price ?? 0);
  const getItemName = (item: TransferOrderItem) => item.products?.name || "Unknown Product";
  const getItemBarcode = (item: TransferOrderItem) => item.products?.barcode || "-";
  const getOrderStatus = (order: TransferOrder) => String(order.status || "pending").toLowerCase();

  const isPendingOrder = (order: TransferOrder) => {
    const status = getOrderStatus(order);
    return status === "pending" || status === "in_progress" || status === "in-progress";
  };

  const isCompletedOrder = (order: TransferOrder) => {
    const status = getOrderStatus(order);
    return status === "completed" || status === "closed_with_issues" || status === "closed-with-issues";
  };

  const getStatusMeta = (item: TransferOrderItem) => {
    const assigned = getAssignedQty(item);
    const verified = getVerifiedQty(item);
    if (verified <= 0) return { label: "Pending", variant: "secondary" as const, verified, unverified: assigned };
    if (verified >= assigned) return { label: "Verified", variant: "default" as const, verified, unverified: 0 };
    return {
      label: "Partial Verified",
      variant: "outline" as const,
      verified,
      unverified: Math.max(0, assigned - verified),
    };
  };

  const orderTotals = useMemo(() => {
    if (!orderDetails?.items?.length) return { totalProducts: 0, totalAmount: 0, totalLines: 0 };
    const totalProducts = orderDetails.items.reduce((sum, item) => sum + getAssignedQty(item), 0);
    const totalAmount = orderDetails.items.reduce((sum, item) => sum + getAssignedQty(item) * getItemPrice(item), 0);
    return { totalProducts, totalAmount, totalLines: orderDetails.items.length };
  }, [orderDetails]);

  const fetchLiveData = async (showLoader = false) => {
    if (!store) return;
    const normalizedStoreId = normalizeStoreId(store.id) || store.id;
    if (showLoader) setIsLoadingLiveFeed(true);
    try {
      const [inventoryRes, billsRes] = await Promise.all([
        fetch(`${API}/api/stores/${normalizedStoreId}/assigned-products`),
        fetch(`${API}/api/bills?storeId=${encodeURIComponent(normalizedStoreId)}&page=1&pageSize=200&paginate=1&details=0`),
      ]);

      if (inventoryRes.ok) {
        const invData = await inventoryRes.json();
        const rows = Array.isArray(invData) ? invData : [];
        const inStockOnly = rows.filter((row: StoreLiveInventoryRow) => Number(row?.quantity || 0) > 0);
        setInventoryRows(inStockOnly);
      }

      if (billsRes.ok) {
        const billsData = await billsRes.json();
        const list = Array.isArray(billsData) ? billsData : billsData?.data || [];
        const filtered = (Array.isArray(list) ? list : [])
          .filter((bill) => getBillStoreId(bill) === normalizeStoreId(store.id))
          .sort((a, b) => new Date(getBillDate(b)).getTime() - new Date(getBillDate(a)).getTime());
        setLiveBills(filtered.slice(0, 100));
      }

      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      console.error("Error loading store live feed:", error);
    } finally {
      if (showLoader) setIsLoadingLiveFeed(false);
    }
  };

  useEffect(() => {
    if (!open || !store || activeInsightTab !== "live-feed") return;
    fetchLiveData(!hasLoadedLiveFeed);
    setHasLoadedLiveFeed(true);
    const timer = setInterval(() => fetchLiveData(false), 30000);
    return () => clearInterval(timer);
  }, [open, store?.id, activeInsightTab, hasLoadedLiveFeed]);

  useEffect(() => {
    if (!open || !store) return;
    setActiveInsightTab("live-feed");
    setHasLoadedLiveFeed(false);
    setInventoryRows([]);
    setLiveBills([]);
    setLiveProductSearch("");
    setSelectedLiveBillTab("");
    setLastUpdated("");
    setOrders([]);
    setDates([]);
    setSelectedDate(null);
    setOrderStatusFilter("all");
  }, [open, store?.id]);

  useEffect(() => {
    if (!open || !store || activeInsightTab !== "all-orders") return;

    setIsLoadingCalendar(true);
    setOrders([]);
    setDates([]);
    setSelectedDate(null);

    const normalizedStoreId = normalizeStoreId(store.id) || store.id;
    fetch(`${API}/api/stores/${normalizedStoreId}/transfer-orders`)
      .then((r) => r.json())
      .then((payload) => {
        const list = Array.isArray(payload) ? payload : [];
        console.log("Transfer orders fetched:", list.length, "orders");
        const normalized: TransferOrder[] = list.map((order: any) => ({
          ...order,
          createdAt: order.createdAt || order.created_at,
        }));
        setOrders(normalized);

        const recentDaysCutoff = new Date();
        recentDaysCutoff.setDate(recentDaysCutoff.getDate() - days);

        const grouped = new Map<string, number>();
        normalized.forEach((order) => {
          const createdAt = order.createdAt || order.created_at;
          const dateKey = getDateKey(createdAt);
          if (!dateKey) return;
          const asDate = new Date(`${dateKey}T00:00:00`);
          if (asDate < recentDaysCutoff) return;
          grouped.set(dateKey, (grouped.get(dateKey) || 0) + 1);
        });

        const dateCards: DateCard[] = Array.from(grouped.entries())
          .map(([date, count]) => ({ date, count, totalStock: 0, totalValue: 0 }))
          .sort((a, b) => b.date.localeCompare(a.date));
        setDates(dateCards);
        console.log("Calendar dates populated:", dateCards.length, "dates");
      })
      .catch((err) => {
        console.error("Error fetching transfer orders:", err);
        setOrders([]);
        setDates([]);
      })
      .finally(() => setIsLoadingCalendar(false));
  }, [open, store, days, activeInsightTab]);

  const filteredOrders = useMemo(() => {
    let list = [...orders];

    if (selectedDate) {
      list = list.filter((order) => getDateKey(order.createdAt || order.created_at) === selectedDate);
    }

    if (orderStatusFilter === "pending") {
      list = list.filter(isPendingOrder);
    } else if (orderStatusFilter === "completed") {
      list = list.filter(isCompletedOrder);
    }

    list.sort((a, b) => {
      const aTs = new Date(a.createdAt || a.created_at || "").getTime();
      const bTs = new Date(b.createdAt || b.created_at || "").getTime();
      return bTs - aTs;
    });

    return list;
  }, [orders, selectedDate, orderStatusFilter]);

  const filteredInventoryRows = useMemo(() => {
    const search = liveProductSearch.trim().toLowerCase();
    if (!search) return inventoryRows;
    return inventoryRows.filter((row) => {
      const productObj = row.products || {};
      const barcode = String(productObj.barcode || row.barcode || "").toLowerCase();
      const name = String(productObj.name || row.name || "").toLowerCase();
      return barcode.includes(search) || name.includes(search);
    });
  }, [inventoryRows, liveProductSearch]);

  const liveBillTabs = useMemo(() => {
    if (liveBills.length === 0) return [] as Array<{ key: string; label: string; bills: any[] }>;

    const dayGroups = new Map<string, any[]>();
    liveBills.forEach((bill: any) => {
      const dateText = getBillDate(bill);
      const dt = dateText ? new Date(dateText) : null;
      if (!dt || Number.isNaN(dt.getTime())) return;
      const dayKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(
        2,
        "0",
      )}`;
      dayGroups.set(dayKey, [...(dayGroups.get(dayKey) || []), bill]);
    });

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(
      2,
      "0",
    )}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(
      yesterday.getDate(),
    ).padStart(2, "0")}`;

    return Array.from(dayGroups.keys())
      .sort((a, b) => b.localeCompare(a))
      .map((dayKey) => {
        const dayBills = [...(dayGroups.get(dayKey) || [])].sort(
          (a, b) => new Date(getBillDate(b)).getTime() - new Date(getBillDate(a)).getTime(),
        );
        const dt = new Date(`${dayKey}T00:00:00`);
        const dateLabel = dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
        const label =
          dayKey === todayKey ? `Today (${dateLabel})` : dayKey === yesterdayKey ? `Yesterday (${dateLabel})` : dateLabel;

        return {
          key: dayKey,
          label,
          bills: dayBills,
        };
      });
  }, [liveBills]);

  useEffect(() => {
    if (liveBillTabs.length === 0) {
      setSelectedLiveBillTab("");
      return;
    }
    if (!liveBillTabs.some((tab) => tab.key === selectedLiveBillTab)) {
      setSelectedLiveBillTab(liveBillTabs[0].key);
    }
  }, [liveBillTabs, selectedLiveBillTab]);

  const activeLiveBills = useMemo(() => {
    const activeTab = liveBillTabs.find((tab) => tab.key === selectedLiveBillTab);
    return activeTab?.bills || [];
  }, [liveBillTabs, selectedLiveBillTab]);

  useEffect(() => {
    if (!open) {
      setIsOrderDialogOpen(false);
      setSelectedOrder(null);
      setOrderDetails(null);
    }
  }, [open]);

  const openOrderDetails = async (order: TransferOrder) => {
    try {
      setIsLoadingOrderDetails(true);
      setSelectedOrder(order);
      setOrderDetails(null);
      setIsOrderDialogOpen(true);

      const maxAttempts = 3;
      let response: Response | null = null;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        response = await fetch(`${API}/api/transfer-orders/${order.id}`);
        if (response.ok) break;
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
        }
      }

      if (!response || !response.ok) {
        setOrderDetails({
          id: order.id,
          createdAt: order.createdAt || order.created_at,
          status: order.status || "pending",
          items: [],
        });
        return;
      }

      const payload = await response.json();
      setOrderDetails({
        id: payload?.id || order.id,
        createdAt: payload?.createdAt || payload?.created_at || order.createdAt || order.created_at,
        status: payload?.status || order.status || "pending",
        items: Array.isArray(payload?.items) ? payload.items : [],
      });
    } catch (error) {
      console.warn("Error loading transfer order details, using fallback payload.");
      setOrderDetails({
        id: order.id,
        createdAt: order.createdAt || order.created_at,
        status: order.status || "pending",
        items: [],
      });
    } finally {
      setIsLoadingOrderDetails(false);
    }
  };

  const handleDeleteOrder = async (order: TransferOrder) => {
    if (!store) return;
    const confirmed = window.confirm(`Delete order ${order.id}? This will remove it from local cache and Supabase.`);
    if (!confirmed) return;

    try {
      setDeletingOrderId(order.id);
      const response = await fetch(`${API}/api/transfer-orders/${order.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.error || "Failed to delete order";
        throw new Error(message);
      }

      setOrders((prev) => {
        const next = prev.filter((row) => row.id !== order.id);
        const recentDaysCutoff = new Date();
        recentDaysCutoff.setDate(recentDaysCutoff.getDate() - days);
        const grouped = new Map<string, number>();
        next.forEach((row) => {
          const dateKey = getDateKey(row.createdAt || row.created_at);
          if (!dateKey) return;
          const asDate = new Date(`${dateKey}T00:00:00`);
          if (asDate < recentDaysCutoff) return;
          grouped.set(dateKey, (grouped.get(dateKey) || 0) + 1);
        });
        const dateCards: DateCard[] = Array.from(grouped.entries())
          .map(([date, count]) => ({ date, count, totalStock: 0, totalValue: 0 }))
          .sort((a, b) => b.date.localeCompare(a.date));
        setDates(dateCards);
        if (selectedDate && !dateCards.some((d) => d.date === selectedDate)) {
          setSelectedDate(null);
        }
        return next;
      });

      if (selectedOrder?.id === order.id) {
        setIsOrderDialogOpen(false);
        setSelectedOrder(null);
        setOrderDetails(null);
      }
    } catch (error: any) {
      alert(error?.message || "Unable to delete order right now");
    } finally {
      setDeletingOrderId(null);
    }
  };

  const escapeHtml = (value: string | number) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const handleOrderPrint = async () => {
    if (!orderDetails || !store) return;
    const orderDateLabel = formatDateTime(orderDetails.createdAt || orderDetails.created_at);
    const rows = (orderDetails.items || [])
      .map((item, idx) => {
        const qty = getAssignedQty(item);
        const price = getItemPrice(item);
        const amount = qty * price;
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${escapeHtml(getItemBarcode(item))}</td>
            <td>${escapeHtml(getItemName(item))}</td>
            <td style="text-align:right">${qty}</td>
            <td style="text-align:right">₹${amount.toFixed(2)}</td>
          </tr>
        `;
      })
      .join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Transfer Order ${escapeHtml(orderDetails.id)}</title>
          <style>
            @media print {
              @page { margin: 12mm; }
              body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; font-size: 10px; line-height: 1.3; color: #111; }
              h1 { font-size: 14px; margin: 0 0 8px 0; }
              .meta { font-size: 10px; margin-bottom: 8px; border: 1px solid #ddd; padding: 6px; }
              .meta-row { margin: 2px 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 8px; }
              th, td { border: 1px solid #ddd; padding: 6px; font-size: 10px; text-align: left; }
              th { background: #f3f4f6; }
              tfoot { display: table-footer-group; font-weight: bold; }
            }
            body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; padding: 16px; color: #111; }
            .meta { font-size: 11px; margin-bottom: 10px; border: 1px solid #ddd; padding: 8px; }
            .meta-row { margin: 3px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 6px; font-size: 11px; text-align: left; }
            th { background: #f3f4f6; }
            .right { text-align: right; }
          </style>
        </head>
        <body>
          <h1>Transfer Order - ${escapeHtml(store.name)}</h1>
          <div class="meta">
            <div class="meta-row"><strong>Order ID:</strong> ${escapeHtml(orderDetails.id)}</div>
            <div class="meta-row"><strong>Date:</strong> ${escapeHtml(orderDateLabel)}</div>
            <div class="meta-row"><strong>Printed At:</strong> ${escapeHtml(new Date().toLocaleString())}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Product Barcode</th>
                <th>Product Name</th>
                <th class="right">Quantity</th>
                <th class="right">Amount</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td colspan="3">Total</td>
                <td class="right">${orderTotals.totalProducts}</td>
                <td class="right">₹${orderTotals.totalAmount.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `;

    await unifiedPrint({
      htmlContent,
      isThermalPrinter: false,
      useBackendPrint: true,
      storeName: store.name,
    });
  };

  if (!open || !store) return null;

  const totalStock = inventoryRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalBillAmount = liveBills.reduce((sum, bill) => sum + Number(bill?.total || 0), 0);
  const activeTabBillAmount = activeLiveBills.reduce((sum, bill) => sum + Number(bill?.total || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[94vh] flex flex-col p-0 overflow-hidden border-0 shadow-2xl">
        {/* Header */}
        <DialogHeader className="border-b px-8 py-6 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
              <Building className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-semibold tracking-tight">{store.name}</DialogTitle>
              <p className="text-sm text-muted-foreground">Store Insights • Real-time Overview</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <Tabs
            value={activeInsightTab}
            onValueChange={(v) => setActiveInsightTab(v as "live-feed" | "all-orders")}
            className="flex flex-col h-full"
          >
            {/* Tabs Navigation */}
            <div className="px-8 pt-6 pb-4 border-b bg-white">
              <TabsList className="grid w-full max-w-md grid-cols-2 bg-gray-100 p-1.5 rounded-2xl">
                <TabsTrigger value="live-feed" className="rounded-xl py-3 data-[state=active]:shadow-sm">
                  Live Feed
                </TabsTrigger>
                <TabsTrigger value="all-orders" className="rounded-xl py-3 data-[state=active]:shadow-sm">
                  Transfer Orders
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ===================== LIVE FEED TAB ===================== */}
            <TabsContent value="live-feed" className="flex-1 p-8 overflow-auto">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-semibold">Live Activity</h3>
                  <p className="text-muted-foreground">Current inventory and recent sales</p>
                </div>
                <Button onClick={() => fetchLiveData(true)} disabled={isLoadingLiveFeed} className="gap-2">
                  <RefreshCw className={`h-4 w-4 ${isLoadingLiveFeed ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Products Section */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Products in Store</CardTitle>
                    <CardDescription>
                      {filteredInventoryRows.length} / {inventoryRows.length} items • Total stock: {totalStock}
                    </CardDescription>
                    <Input
                      placeholder="Search barcode or product name..."
                      value={liveProductSearch}
                      onChange={(e) => setLiveProductSearch(e.target.value)}
                      className="mt-2"
                    />
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[calc(100vh-280px)] overflow-auto">
                      <Table>
                        <TableHeader className="bg-gray-50 sticky top-0">
                          <TableRow>
                            <TableHead>Barcode</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                            <TableHead className="text-right">Price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredInventoryRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                                {liveProductSearch ? "No products match your search" : "No assigned products"}
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredInventoryRows.map((row, idx) => {
                              const p = row.products || {};
                              return (
                                <TableRow key={idx} className="hover:bg-blue-50/50">
                                  <TableCell className="font-mono">{p.barcode || row.barcode || "-"}</TableCell>
                                  <TableCell className="font-medium">{p.name || row.name || "Unknown"}</TableCell>
                                  <TableCell className="text-right font-semibold">{row.quantity || 0}</TableCell>
                                  <TableCell className="text-right">₹{(p.price || row.price || 0).toFixed(2)}</TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Bills Section */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Recent Bills</CardTitle>
                    <CardDescription>
                      {activeLiveBills.length} bills • ₹{activeTabBillAmount.toFixed(2)} 
                      <span className="text-muted-foreground"> (Total: ₹{totalBillAmount.toFixed(2)})</span>
                      {lastUpdated && <div className="text-xs text-muted-foreground mt-1">Updated {lastUpdated}</div>}
                    </CardDescription>

                    <div className="flex flex-wrap gap-2 mt-3">
                      {liveBillTabs.map((tab) => (
                        <Button
                          key={tab.key}
                          size="sm"
                          variant={selectedLiveBillTab === tab.key ? "default" : "outline"}
                          onClick={() => setSelectedLiveBillTab(tab.key)}
                        >
                          {tab.label}
                        </Button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[calc(100vh-280px)] overflow-auto">
                      <Table>
                        <TableHeader className="bg-gray-50 sticky top-0">
                          <TableRow>
                            <TableHead>Bill ID</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeLiveBills.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                                No bills in selected period
                              </TableCell>
                            </TableRow>
                          ) : (
                            activeLiveBills.map((bill) => (
                              <TableRow key={bill.id} className="hover:bg-gray-50">
                                <TableCell className="font-mono text-sm">{bill.id}</TableCell>
                                <TableCell>{formatDateTime(getBillDate(bill))}</TableCell>
                                <TableCell className="text-right font-semibold text-emerald-600">
                                  ₹{Number(bill.total || 0).toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="capitalize">
                                    {bill.status || "completed"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ===================== ALL ORDERS TAB ===================== */}
            <TabsContent value="all-orders" className="flex-1 p-8 overflow-auto">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 h-full">
                {/* Calendar */}
                <div>
                  <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Calendar className="h-5 w-5" /> Transfer Calendar
                  </h3>
                  {isLoadingCalendar ? (
                    <div className="h-96 flex items-center justify-center border rounded-3xl bg-gray-50">
                      Loading calendar...
                    </div>
                  ) : (
                    <MiniCalendar
                      dates={dates}
                      selectedDate={selectedDate}
                      onDateSelect={setSelectedDate}
                      dataLabel="Has transfer orders"
                    />
                  )}
                </div>

                {/* Orders List */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold">
                      {selectedDate ? `Orders • ${selectedDate}` : "All Transfer Orders"}
                    </h3>
                    <div className="flex gap-2">
                      {["all", "pending", "completed"].map((f) => (
                        <Button
                          key={f}
                          variant={orderStatusFilter === f ? "default" : "outline"}
                          size="sm"
                          onClick={() => setOrderStatusFilter(f as any)}
                        >
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Button>
                      ))}
                      {selectedDate && (
                        <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>
                          Clear Date
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto space-y-3 pr-2">
                    {filteredOrders.length > 0 ? (
                      filteredOrders.map((order) => (
                        <div
                          key={order.id}
                          className="border rounded-2xl p-6 hover:border-blue-200 hover:shadow transition-all group"
                        >
                          <div className="flex justify-between items-start">
                            <button
                              onClick={() => openOrderDetails(order)}
                              className="text-left flex-1"
                            >
                              <p className="font-semibold text-lg group-hover:text-blue-600 transition-colors">
                                {order.id}
                              </p>
                              <p className="text-sm text-muted-foreground mt-1">
                                {formatDateTime(order.createdAt || order.created_at)}
                              </p>
                            </button>

                            <div className="text-right">
                              <Badge variant={isPendingOrder(order) ? "secondary" : "default"}>
                                {String(order.status || "pending").replace(/_/g, " ")}
                              </Badge>
                              <p className="text-xs text-muted-foreground mt-2">
                                {order.itemCount || 0} items • {order.assignedQtyTotal || 0} qty
                              </p>
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:bg-red-50 ml-4"
                              onClick={() => handleDeleteOrder(order)}
                              disabled={deletingOrderId === order.id}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="h-80 flex flex-col items-center justify-center text-center border rounded-3xl bg-gray-50">
                        <Calendar className="h-14 w-14 text-gray-300 mb-4" />
                        <p className="text-muted-foreground">No orders found for the selected filter</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="border-t px-8 py-6 bg-white">
          <Button variant="outline" onClick={onClose} className="px-10">
            Close
          </Button>
        </DialogFooter>

        {/* ===================== ORDER DETAILS DIALOG ===================== */}
        <Dialog open={isOrderDialogOpen} onOpenChange={setIsOrderDialogOpen}>
          <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-8 py-6 border-b">
              <DialogTitle className="text-2xl">Transfer Order Details</DialogTitle>
              {selectedOrder && (
                <DialogDescription className="text-base">
                  Order ID: <span className="font-mono font-medium">{selectedOrder.id}</span>
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="flex-1 overflow-auto p-8">
              {isLoadingOrderDetails ? (
                <div className="flex items-center justify-center h-64">Loading order details...</div>
              ) : orderDetails ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <p className="text-xs text-muted-foreground">Order ID</p>
                        <p className="font-mono text-lg font-semibold mt-1">{orderDetails.id}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <p className="text-xs text-muted-foreground">Store</p>
                        <p className="font-semibold mt-1">{store.name}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="font-semibold mt-1">{formatDateTime(orderDetails.createdAt)}</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle>Order Items</CardTitle>
                        <Badge variant="outline">{orderTotals.totalLines} items</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>S.No</TableHead>
                            <TableHead>Barcode</TableHead>
                            <TableHead>Product Name</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderDetails.items.map((item, idx) => {
                            const qty = getAssignedQty(item);
                            const amount = qty * getItemPrice(item);
                            const statusMeta = getStatusMeta(item);

                            return (
                              <TableRow key={idx}>
                                <TableCell>{idx + 1}</TableCell>
                                <TableCell className="font-mono">{getItemBarcode(item)}</TableCell>
                                <TableCell>{getItemName(item)}</TableCell>
                                <TableCell className="text-right font-medium">{qty}</TableCell>
                                <TableCell>
                                  <Badge variant={statusMeta.variant}>
                                    {statusMeta.label}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  ₹{amount.toFixed(2)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={3} className="font-semibold">Total</TableCell>
                            <TableCell className="text-right font-semibold">{orderTotals.totalProducts}</TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-right font-semibold text-lg">
                              ₹{orderTotals.totalAmount.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-20 text-muted-foreground">Could not load order details.</div>
              )}
            </div>

            <DialogFooter className="px-8 py-6 border-t">
              <Button variant="outline" onClick={() => setIsOrderDialogOpen(false)}>
                Close
              </Button>
              <Button onClick={handleOrderPrint} disabled={!orderDetails}>
                <Printer className="mr-2 h-4 w-4" />
                Print Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

export default function StoresPage() {
  const router = useRouter()
  const [stores, setStores] = useState<StoreType[]>([])
  const [bills, setBills] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<StoreType | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    manager: "",
    status: "active" as "active" | "inactive",
  })

  // Store insight modal state
  const [insightOpen, setInsightOpen] = useState(false)
  const [selectedStore, setSelectedStore] = useState<StoreType | null>(null)

  
  useEffect(() => {
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    const userData = localStorage.getItem("adminUser")

    if (isLoggedIn !== "true" || !userData) {
      router.push("/")
      return
    }

    const user = JSON.parse(userData)
    let assignedStoreId: string | undefined | null;

    if (user.role === "admin") {
      assignedStoreId = normalizeStoreId(user.assignedStoreId);
    } else if (user.role !== "super_admin") {
      router.push("/")
      return
    }

    loadData(assignedStoreId)
  }, [router])

  const loadData = async (assignedStoreId?: string | null) => {
    try {
      const [storesResponse, billsResponse] = await Promise.all([
        fetch(`${API}/api/stores`),
        fetch(`${API}/api/bills`)
      ]);

      if (storesResponse.ok) {
        let storesData: StoreType[] = await storesResponse.json();
        const seenIds = new Set<string>();
        const uniqueStores = storesData.map((store: any) => {
          let uniqueId = store.id || store.ID || store._id;
          if (!uniqueId || seenIds.has(uniqueId)) {
            uniqueId = crypto.randomUUID();
          }
          seenIds.add(uniqueId);
          return { ...store, id: uniqueId } as StoreType;
        });

        if (assignedStoreId) {
          const filtered = uniqueStores.filter(store => normalizeStoreId(store.id) === assignedStoreId);
          setStores(filtered);
        } else {
          setStores(uniqueStores);
        }
      }

      if (billsResponse.ok) {
        const billsData = await billsResponse.json();
        setBills(billsData);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
  }

  
  const calculateStoreAnalytics = (storeId: string) => {
    const storeBills = bills.filter((bill) => normalizeStoreId(bill.storeId) === normalizeStoreId(storeId))
    const totalRevenue = storeBills.reduce((sum, bill) => sum + (bill.total || 0), 0)
    const totalBills = storeBills.length
    const lastBillDate = storeBills.length > 0
      ? storeBills.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
      : ""

    return { totalRevenue, totalBills, lastBillDate }
  }

  const refreshStoreStats = async (storeId: string) => {
    try {
      const response = await fetch(`${API}/api/stores/${storeId}/stats`);
      if (!response.ok) return;

      const stats = await response.json();
      setStores((prev) =>
        prev.map((store) =>
          store.id === storeId
            ? {
                ...store,
                productCount: stats.productCount ?? store.productCount,
                totalStock: stats.totalStock ?? store.totalStock,
                totalRevenue: stats.totalRevenue ?? store.totalRevenue,
                totalBills: stats.totalBills ?? store.totalBills,
              }
            : store
        )
      );
    } catch (error) {
      console.error("Error refreshing store stats:", error);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.address) {
      alert("Please fill in all required fields")
      return
    }

    const storeData = {
      name: formData.name,
      address: formData.address,
      phone: formData.phone,
      manager: formData.manager,
      status: formData.status,
    }

    try {
      let response
      if (editingStore) {
        response = await fetch(`${API}/api/stores/${editingStore.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(storeData),
        })
      } else {
        response = await fetch(`${API}/api/stores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(storeData),
        })
      }

      if (response.ok) {
        await loadData()
        resetForm()
        setIsDialogOpen(false)
      } else {
        const errorData = await response.json()
        alert(`Failed to save store: ${errorData.error || errorData.message || "Unknown error"}`)
      }
    } catch (error) {
      console.error("Error saving store:", error)
      alert("An error occurred while saving the store.")
    }
  }

  const handleEdit = (store: StoreType) => {
    setEditingStore(store)
    setFormData({
      name: store.name,
      address: store.address,
      phone: store.phone,
      manager: store.manager,
      status: store.status,
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    const normalizedId = normalizeStoreId(id);
    const storeBills = bills.filter((bill) => normalizeStoreId(bill.storeId) === normalizedId)
    if (storeBills.length > 0) {
      alert(`Cannot delete store. It has ${storeBills.length} associated bills. Please deactivate instead.`)
      return
    }

    if (confirm("Are you sure you want to delete this store? This action cannot be undone.")) {
      try {
        const response = await fetch(`${API}/api/stores/${id}`, { method: "DELETE" })
        if (response.ok) {
          await loadData()
        } else {
          const errorData = await response.json()
          alert(`Failed to delete store: ${errorData.error || errorData.message || "Unknown error"}`)
        }
      } catch (error) {
        console.error("Error deleting store:", error)
        alert("An error occurred while deleting the store.")
      }
    }
  }

  // ✅ UPDATED: Enhanced product assignment handler
  const handleProductAssignment = async (storeId: string, products: AssignedProduct[]) => {
    console.log('✅ Products assigned to store:', storeId, products);
    
    // Refresh only this store stats instead of reloading all stores and bills
    await refreshStoreStats(storeId);
  }

  
  const toggleStoreStatus = async (id: string) => {
    const store = stores.find((s) => s.id === id)
    if (!store) return

    const newStatus = store.status === "active" ? "inactive" : "active"
    try {
      const response = await fetch(`${API}/api/stores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        await loadData()
      } else {
        const errorData = await response.json()
        alert(`Failed to update status: ${errorData.error || errorData.message || "Unknown error"}`)
      }
    } catch (error) {
      console.error("Error updating status:", error)
      alert("An error occurred while updating the store status.")
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      address: "",
      phone: "",
      manager: "",
      status: "active",
    })
    setEditingStore(null)
  }

  const getStatusBadge = (status: string) => {
    return status === "active" ? (
      <Badge className="bg-green-100 text-green-800">Active</Badge>
    ) : (
      <Badge variant="secondary">Inactive</Badge>
    )
  }

  const openStoreModal = (store: StoreType) => {
    setSelectedStore(store)
    setInsightOpen(true)
  }

  const filteredStores = stores.filter((store) => {
    const searchTermLower = searchTerm.toLowerCase();
    return (
      store.name?.toLowerCase().includes(searchTermLower) ||
      store.address?.toLowerCase().includes(searchTermLower) ||
      store.manager?.toLowerCase().includes(searchTermLower)
    );
  })

  const totalRevenue = bills.reduce((sum, bill) => sum + (bill.total || 0), 0);
  const totalBills = bills.length;
  const activeStores = stores.filter((store) => store.status === "active").length;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Store Management</h1>
            <p className="text-gray-600 mt-2">Manage your store locations and track performance</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} className="bg-blue-600 hover:bg-blue-700 shadow-lg">
                <Plus className="h-4 w-4 mr-2" />
                Add New Store
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl flex items-center">
                  <Building className="h-6 w-6 mr-2 text-blue-600" />
                  {editingStore ? "Edit Store" : "Add New Store"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="grid gap-6 py-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Store Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter store name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Store Address *</Label>
                      <Textarea
                        id="address"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="Enter complete store address"
                        rows={3}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="Enter phone number"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="manager">Store Manager</Label>
                      <Input
                        id="manager"
                        value={formData.manager}
                        onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                        placeholder="Enter manager name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Store Status</Label>
                      <div className="flex items-center space-x-2 pt-2">
                        <Switch
                          id="status"
                          checked={formData.status === "active"}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, status: checked ? "active" : "inactive" })
                          }
                        />
                        <Label htmlFor="status">Store is active</Label>
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter className="flex space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                    {editingStore ? "Update Store" : "Create Store"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Analytics Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Stores</CardTitle>
              <Building className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stores.length}</div>
              <p className="text-xs text-muted-foreground">{activeStores} active stores</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{totalRevenue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Across all stores</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bills</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalBills}</div>
              <p className="text-xs text-muted-foreground">Bills generated</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average per Store</CardTitle>
              <Building className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₹{activeStores > 0 ? (totalRevenue / activeStores).toFixed(2) : "0.00"}
              </div>
              <p className="text-xs text-muted-foreground">Revenue per active store</p>
            </CardContent>
          </Card>
        </div>

        {/* Stores List */}
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-2xl">Store Locations</CardTitle>
                <CardDescription>
                  {stores.length} total stores • {activeStores} active • {stores.length - activeStores} inactive
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search stores..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredStores.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>Store Details</TableHead>
                      <TableHead>Store Info</TableHead>
                      <TableHead>Store Inventory</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStores.map((store) => (
                      <TableRow key={store.id} className="hover:bg-gray-50">
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium flex items-center">
                              <Building className="h-4 w-4 mr-2 text-blue-600" />
                              {store.name}
                            </div>
                            <div className="text-sm text-gray-500 flex items-start">
                              <MapPin className="h-3 w-3 mr-1 mt-0.5 text-gray-400" />
                              <span className="line-clamp-2">{store.address}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {store.phone && (
                              <div className="text-sm flex items-center">
                                <Phone className="h-3 w-3 mr-1 text-gray-400" />
                                {store.phone}
                              </div>
                            )}
                            {store.manager && (
                              <div className="text-sm flex items-center">
                                <User className="h-3 w-3 mr-1 text-gray-400" />
                                {store.manager}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-2xl font-bold text-black-600">
                              {store.productCount || 0}
                            </div>
                            <div className="text-xs text-gray-500">
                              {store.totalStock || 0} total stock
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-sm font-medium">
                              ₹{(store.totalRevenue || 0).toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {store.totalBills || 0} bills
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={store.status === "active"}
                              onCheckedChange={() => toggleStoreStatus(store.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            {getStatusBadge(store.status)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEdit(store)
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                openStoreModal(store)
                              }}
                              className="bg-blue-50 hover:bg-blue-100 border-blue-200"
                              title="Store insights"
                            >
                              <Info className="h-4 w-4" />
                            </Button>
                            {/* ✅ UPDATED: Product assignment with available stock */}
                            <ProductAssignmentDialog
                              storeId={store.id}
                              storeName={store.name}
                              trigger={
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => e.stopPropagation()}
                                  className="bg-green-50 hover:bg-green-100 border-green-200"
                                  title="Assign products (shows available stock)"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              }
                              onAssign={handleProductAssignment}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(store.id)
                              }}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-16">
                <Building className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-900 mb-2">No stores found</h3>
                <p className="text-gray-500 mb-6">
                  {searchTerm ? "Try adjusting your search criteria" : "Create your first store to get started"}
                </p>
                {!searchTerm && (
                  <Button onClick={() => setIsDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Store
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Store Insight Modal */}
        <StoreInsightModal
          open={insightOpen}
          onClose={() => setInsightOpen(false)}
          store={selectedStore}
        />
      </div>
    </DashboardLayout>
  )
}
