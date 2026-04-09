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
import {
  Plus,
  Edit,
  Trash2,
  Search,
  MapPin,
  Phone,
  User,
  TrendingUp,
  Receipt,
  Building,
  Info,
  RefreshCw,
} from "lucide-react"

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


// Store Insight Modal Component
function StoreInsightModal({
  open,
  onClose,
  store,
}: {
  open: boolean;
  onClose: () => void;
  store: StoreType | null;
}) {
  const [hasLoadedLiveFeed, setHasLoadedLiveFeed] = useState(false);
  const [inventoryRows, setInventoryRows] = useState<StoreLiveInventoryRow[]>([]);
  const [liveBills, setLiveBills] = useState<any[]>([]);
  const [liveProductSearch, setLiveProductSearch] = useState("");
  const [selectedLiveBillTab, setSelectedLiveBillTab] = useState("");
  const [isLoadingLiveFeed, setIsLoadingLiveFeed] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

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
    if (!open || !store) return;
    fetchLiveData(!hasLoadedLiveFeed);
    setHasLoadedLiveFeed(true);
    const timer = setInterval(() => fetchLiveData(false), 30000);
    return () => clearInterval(timer);
  }, [open, store?.id, hasLoadedLiveFeed]);

  useEffect(() => {
    if (!open || !store) return;
    setHasLoadedLiveFeed(false);
    setInventoryRows([]);
    setLiveBills([]);
    setLiveProductSearch("");
    setSelectedLiveBillTab("");
    setLastUpdated("");
  }, [open, store?.id]);

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

    const monthGroups = new Map<string, any[]>();
    liveBills.forEach((bill: any) => {
      const dateText = getBillDate(bill);
      const dt = dateText ? new Date(dateText) : null;
      if (!dt || Number.isNaN(dt.getTime())) return;
      const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      monthGroups.set(monthKey, [...(monthGroups.get(monthKey) || []), bill]);
    });

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const tabs: Array<{ key: string; label: string; bills: any[] }> = [];

    Array.from(monthGroups.keys())
      .sort((a, b) => b.localeCompare(a))
      .forEach((monthKey) => {
        const monthBills = [...(monthGroups.get(monthKey) || [])].sort(
          (a, b) => new Date(getBillDate(b)).getTime() - new Date(getBillDate(a)).getTime(),
        );

        if (monthKey < currentMonthKey) {
          const monthDate = new Date(`${monthKey}-01T00:00:00`);
          tabs.push({
            key: `month:${monthKey}`,
            label: monthDate.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
            bills: monthBills,
          });
          return;
        }

        const dayGroups = new Map<string, any[]>();
        monthBills.forEach((bill: any) => {
          const dayKey = getDateKey(getBillDate(bill));
          if (!dayKey) return;
          dayGroups.set(dayKey, [...(dayGroups.get(dayKey) || []), bill]);
        });

        Array.from(dayGroups.keys())
          .sort((a, b) => b.localeCompare(a))
          .forEach((dayKey) => {
            const dayDate = new Date(`${dayKey}T00:00:00`);
            tabs.push({
              key: `day:${dayKey}`,
              label: dayDate.toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
              bills: [...(dayGroups.get(dayKey) || [])].sort(
                (a, b) => new Date(getBillDate(b)).getTime() - new Date(getBillDate(a)).getTime(),
              ),
            });
          });
      });

    return tabs;
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

        <div className="flex-1 overflow-auto p-8">
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
              <CardHeader className="pb-4">
                <CardTitle>Products in Store</CardTitle>
                <CardDescription>
                  {filteredInventoryRows.length} / {inventoryRows.length} items &bull; Total stock: {totalStock}
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
                <div className="mt-2 overflow-x-auto">
                  <div className="flex gap-2 min-w-max pb-1">
                    {liveBillTabs.map((tab) => (
                    <Button
                      key={tab.key}
                      size="sm"
                      variant={selectedLiveBillTab === tab.key ? "default" : "outline"}
                      onClick={() => setSelectedLiveBillTab(tab.key)}
                      className="shrink-0"
                    >
                      {tab.label}
                    </Button>
                    ))}
                  </div>
                </div>
                <CardDescription>
                  {activeLiveBills.length} bills &bull; ₹{activeTabBillAmount.toFixed(2)}
                  <span className="text-muted-foreground"> (Total: ₹{totalBillAmount.toFixed(2)})</span>
                  {lastUpdated && <div className="text-xs text-muted-foreground mt-1">Updated {lastUpdated}</div>}
                </CardDescription>
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
        </div>

        <DialogFooter className="border-t px-8 py-6 bg-white">
          <Button variant="outline" onClick={onClose} className="px-10">
            Close
          </Button>
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
      router.push("/")
      return
    }

    loadData(assignedStoreId)
  }, [router])

  const loadData = async (assignedStoreId?: string | null) => {
    // Fetch stores immediately — don't block on bills
    fetch(`${API}/api/stores`)
      .then(async (storesResponse) => {
        if (!storesResponse.ok) return;
        const storesData: any[] = await storesResponse.json();
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
      })
      .catch((error) => console.error("Error loading stores:", error));

    // Fetch bills separately — slow Supabase retries won't block the stores list
    fetch(`${API}/api/bills`)
      .then(async (billsResponse) => {
        if (!billsResponse.ok) return;
        const billsData = await billsResponse.json();
        setBills(billsData);
      })
      .catch((error) => console.error("Error loading bills:", error));
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
