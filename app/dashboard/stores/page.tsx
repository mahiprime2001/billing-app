"use client"
import type React from "react"
import { useEffect, useState } from "react"
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
  ChevronLeft,
  ChevronRight,
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


type DateCard = {
  date: string
  count: number
  totalStock: number
  totalValue: number
}

type Row = {
  id: string
  barcode: string
  name: string
  price: number
  stock: number
  rowValue: number
}

// iOS-style Mini Calendar Component (unchanged)
function MiniCalendar({
  dates,
  selectedDate,
  onDateSelect,
}: {
  dates: DateCard[]
  selectedDate: string | null
  onDateSelect: (date: string) => void
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
          <span>Has inventory</span>
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
  // ... (keeping existing implementation)
  const [days, setDays] = useState(90);
  const [dates, setDates] = useState<DateCard[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<{
    totalStock: number;
    totalValue: number;
  }>({ totalStock: 0, totalValue: 0 });
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    if (!open || !store) return;
    setIsLoadingCalendar(true);
    fetch(`${API}/api/stores/${store.id}/inventory-calendar?days=${days}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success && Array.isArray(j.calendar)) {
          setDates(j.calendar);
        } else {
          setDates([]);
        }
      })
      .catch(() => setDates([]))
      .finally(() => setIsLoadingCalendar(false));
  }, [open, store, days]);

  useEffect(() => {
    if (!open || !store || !selectedDate) return;
    setIsLoadingDetails(true);
    fetch(`${API}/api/stores/${store.id}/inventory-by-date/${selectedDate}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.rows && Array.isArray(j.rows)) {
          setRows(j.rows);
          setTotals({
            totalStock: j.totalStock || 0,
            totalValue: j.totalValue || 0,
          });
        } else {
          setRows([]);
          setTotals({ totalStock: 0, totalValue: 0 });
        }
      })
      .catch(() => {
        setRows([]);
        setTotals({ totalStock: 0, totalValue: 0 });
      })
      .finally(() => setIsLoadingDetails(false));
  }, [open, store, selectedDate]);

  const handlePrint = async () => {
    const src = document.getElementById("printable-table")?.outerHTML;
    const htmlContent = `
      <html>
        <head>
          <title>Store Inventory - ${store?.name}</title>
          <style>
            body{font-family:Inter,system-ui,Arial;padding:12px}
            .print-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:15px;padding-bottom:10px;border-bottom:1px solid #eee}
            table{width:100%;border-collapse:collapse}
            th,td{border:1px solid #000;padding:6px;text-align:left;font-size:12px}
            tfoot td{font-weight:600}
            @page{size:auto;margin:10mm}
          </style>
        </head>
        <body>
          <div class="print-header">
            <h1>${store?.name} - Store Inventory</h1>
            <p>${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</p>
          </div>
          ${src}
        </body>
      </html>
    `;
    await unifiedPrint({htmlContent, isThermalPrinter: false, useBackendPrint: false});
  };

  if (!open || !store) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-lg font-semibold flex items-center">
            <Building className="h-5 w-5 mr-2 text-blue-600" />
            {store.name} - Inventory Overview
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                Inventory Calendar
              </h3>
              {isLoadingCalendar ? (
                <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-200 rounded-lg">
                  <p className="text-gray-500 text-sm">Loading calendar...</p>
                </div>
              ) : (
                <MiniCalendar
                  dates={dates}
                  selectedDate={selectedDate}
                  onDateSelect={setSelectedDate}
                />
              )}
            </div>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                {selectedDate ? "Product Details" : "Select a date to view products"}
              </h3>
              {selectedDate ? (
                isLoadingDetails ? (
                  <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-200 rounded-lg">
                    <p className="text-gray-500 text-sm">Loading details...</p>
                  </div>
                ) : rows.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
                    <Table id="printable-table">
                      <TableHeader className="bg-slate-100 sticky top-0">
                        <TableRow>
                          <TableHead className="text-xs">S.No</TableHead>
                          <TableHead className="text-xs">Barcode</TableHead>
                          <TableHead className="text-xs">Product</TableHead>
                          <TableHead className="text-xs">Price</TableHead>
                          <TableHead className="text-xs">Stock</TableHead>
                          <TableHead className="text-xs">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, i) => (
                          <TableRow key={r.id} className="hover:bg-gray-50">
                            <TableCell className="text-xs">{i + 1}</TableCell>
                            <TableCell className="text-xs font-mono">{r.barcode}</TableCell>
                            <TableCell className="text-xs">{r.name}</TableCell>
                            <TableCell className="text-xs">₹{r.price.toFixed(2)}</TableCell>
                            <TableCell className="text-xs">{r.stock}</TableCell>
                            <TableCell className="text-xs">₹{r.rowValue.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      {rows.length > 0 && (
                        <TableFooter className="bg-slate-50">
                          <TableRow>
                            <TableCell colSpan={4} className="text-xs font-semibold">Totals</TableCell>
                            <TableCell className="text-xs font-semibold">{totals.totalStock}</TableCell>
                            <TableCell className="text-xs font-semibold">₹{totals.totalValue.toFixed(2)}</TableCell>
                          </TableRow>
                        </TableFooter>
                      )}
                    </Table>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-200 rounded-lg">
                    <div className="text-center">
                      <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">No inventory data available for this date</p>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-200 rounded-lg">
                  <div className="text-center">
                    <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">Click on a highlighted date in the calendar to view inventory details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
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
      router.push("/billing")
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
        alert(`Failed to save store: ${errorData.message}`)
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
          alert(`Failed to delete store: ${errorData.message}`)
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
    
    // Refresh stores data to show updated inventory stats
    await loadData();
    
    // Show success message
    alert(`Successfully assigned ${products.length} products to ${stores.find(s => s.id === storeId)?.name}`);
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
        alert(`Failed to update status: ${errorData.message}`)
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
                            />
                            {getStatusBadge(store.status)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button variant="outline" size="sm" onClick={() => handleEdit(store)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openStoreModal(store)}
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
                              onClick={() => handleDelete(store.id)}
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
