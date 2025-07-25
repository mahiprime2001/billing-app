"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
} from "lucide-react"

interface StoreType {
  id: string
  name: string
  address: string
  phone: string
  email: string
  manager: string
  status: "active" | "inactive"
  createdDate: string
  totalRevenue: number
  totalBills: number
  lastBillDate: string
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
    email: "",
    manager: "",
    status: "active" as "active" | "inactive",
  })

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    const userData = localStorage.getItem("adminUser")

    if (isLoggedIn !== "true" || !userData) {
      router.push("/")
      return
    }

    const user = JSON.parse(userData)
    if (user.role !== "super_admin") {
      router.push("/billing")
      return
    }

    loadData()
  }, [router])

  const loadData = () => {
    // Load stores
    const savedStores = localStorage.getItem("stores")
    if (savedStores) {
      setStores(JSON.parse(savedStores))
    } else {
      // Initialize with sample stores
      const sampleStores: StoreType[] = [
        {
          id: "1",
          name: "Siri Art Jewellery - Main Branch",
          address: "123 Jewelry Street, Diamond District, Mumbai, Maharashtra 400001",
          phone: "+91 98765 43210",
          email: "main@siriartjewellery.com",
          manager: "Rajesh Kumar",
          status: "active",
          createdDate: new Date().toISOString(),
          totalRevenue: 0,
          totalBills: 0,
          lastBillDate: "",
        },
        {
          id: "2",
          name: "Siri Art Jewellery - Mall Branch",
          address: "Shop 45, Phoenix Mall, Pune, Maharashtra 411001",
          phone: "+91 98765 43211",
          email: "mall@siriartjewellery.com",
          manager: "Priya Sharma",
          status: "active",
          createdDate: new Date().toISOString(),
          totalRevenue: 0,
          totalBills: 0,
          lastBillDate: "",
        },
      ]
      setStores(sampleStores)
      localStorage.setItem("stores", JSON.stringify(sampleStores))
    }

    // Load bills to calculate store analytics
    const savedBills = localStorage.getItem("bills")
    if (savedBills) {
      setBills(JSON.parse(savedBills))
    }
  }

  const calculateStoreAnalytics = (storeId: string) => {
    const storeBills = bills.filter((bill) => bill.storeId === storeId)
    const totalRevenue = storeBills.reduce((sum, bill) => sum + (bill.total || 0), 0)
    const totalBills = storeBills.length
    const lastBillDate =
      storeBills.length > 0
        ? storeBills.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
        : ""

    return { totalRevenue, totalBills, lastBillDate }
  }

  const saveStores = (updatedStores: StoreType[]) => {
    // Update analytics for each store
    const storesWithAnalytics = updatedStores.map((store) => {
      const analytics = calculateStoreAnalytics(store.id)
      return {
        ...store,
        totalRevenue: analytics.totalRevenue || 0,
        totalBills: analytics.totalBills || 0,
        lastBillDate: analytics.lastBillDate || "",
      }
    })

    setStores(storesWithAnalytics)
    localStorage.setItem("stores", JSON.stringify(storesWithAnalytics))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.address) {
      alert("Please fill in all required fields")
      return
    }

    const storeData: StoreType = {
      id: editingStore?.id || Date.now().toString(),
      name: formData.name,
      address: formData.address,
      phone: formData.phone,
      email: formData.email,
      manager: formData.manager,
      status: formData.status,
      createdDate: editingStore?.createdDate || new Date().toISOString(),
      totalRevenue: editingStore?.totalRevenue || 0,
      totalBills: editingStore?.totalBills || 0,
      lastBillDate: editingStore?.lastBillDate || "",
    }

    let updatedStores: StoreType[]
    if (editingStore) {
      updatedStores = stores.map((s) => (s.id === editingStore.id ? storeData : s))
    } else {
      updatedStores = [...stores, storeData]
    }

    saveStores(updatedStores)
    resetForm()
    setIsDialogOpen(false)
  }

  const handleEdit = (store: StoreType) => {
    setEditingStore(store)
    setFormData({
      name: store.name,
      address: store.address,
      phone: store.phone,
      email: store.email,
      manager: store.manager,
      status: store.status,
    })
    setIsDialogOpen(true)
  }

  const handleDelete = (id: string) => {
    // Check if store has associated bills
    const storeBills = bills.filter((bill) => bill.storeId === id)
    if (storeBills.length > 0) {
      alert(`Cannot delete store. It has ${storeBills.length} associated bills. Please deactivate instead.`)
      return
    }

    if (confirm("Are you sure you want to delete this store? This action cannot be undone.")) {
      const updatedStores = stores.filter((s) => s.id !== id)
      saveStores(updatedStores)
    }
  }

  const toggleStoreStatus = (id: string) => {
    const updatedStores = stores.map((s) =>
      s.id === id ? { ...s, status: s.status === "active" ? "inactive" : "active" } : s,
    )
    saveStores(updatedStores)
  }

  const resetForm = () => {
    setFormData({
      name: "",
      address: "",
      phone: "",
      email: "",
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

  const filteredStores = stores.filter((store) => {
    const matchesSearch =
      store.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      store.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      store.manager.toLowerCase().includes(searchTerm.toLowerCase())

    return matchesSearch
  })

  // Calculate total analytics with null checks
  const totalRevenue = stores.reduce((sum, store) => sum + (store.totalRevenue || 0), 0)
  const totalBills = stores.reduce((sum, store) => sum + (store.totalBills || 0), 0)
  const activeStores = stores.filter((store) => store.status === "active").length

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
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
                <DialogDescription>
                  {editingStore
                    ? "Update store information and details"
                    : "Create a new store location with complete details"}
                </DialogDescription>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="Enter phone number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="Enter email address"
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
                      <TableHead>Contact Info</TableHead>
                      <TableHead>Performance</TableHead>
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
                            <div className="text-xs text-gray-400">
                              Created: {new Date(store.createdDate).toLocaleDateString()}
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
                            {store.email && (
                              <div className="text-sm flex items-center">
                                <Mail className="h-3 w-3 mr-1 text-gray-400" />
                                {store.email}
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
                            <div className="text-sm font-medium">₹{(store.totalRevenue || 0).toFixed(2)}</div>
                            <div className="text-xs text-gray-500">{store.totalBills || 0} bills</div>
                            {store.lastBillDate && (
                              <div className="text-xs text-gray-400 flex items-center">
                                <Calendar className="h-3 w-3 mr-1" />
                                Last: {new Date(store.lastBillDate).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={store.status === "active"}
                              onCheckedChange={() => toggleStoreStatus(store.id)}
                              size="sm"
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
                              onClick={() => handleDelete(store.id)}
                              className="text-red-600 hover:text-red-700"
                              disabled={bills.filter((bill) => bill.storeId === store.id).length > 0}
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
      </div>
    </DashboardLayout>
  )
}
