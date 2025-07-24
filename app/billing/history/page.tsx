"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import BillingLayout from "@/components/billing-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Download, Calendar, User, Package, DollarSign, RefreshCw, Eye, FileText } from "lucide-react"
import { format } from "date-fns"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface Sale {
  id: string
  storeId?: string
  storeName?: string
  storeAddress?: string
  customerName?: string
  customerPhone?: string
  customerAddress?: string
  items: Array<{
    productId: string
    productName: string
    quantity: number
    price: number
    total: number
  }>
  subtotal: number
  taxPercentage: number
  taxAmount: number
  discountPercentage: number
  discountAmount: number
  total: number
  paymentMethod: string
  timestamp: string
  notes?: string
}

interface AdminUser {
  name: string
  email: string
  role: "super_admin" | "billing_user" | "temporary_user"
  assignedStores?: string[]
  isTemporary?: boolean
}

interface SystemSettings {
  gstin: string
  taxPercentage: number
  companyName: string
  companyAddress: string
  companyPhone: string
  companyEmail: string
}

export default function BillingHistoryPage() {
  const router = useRouter()
  const [sales, setSales] = useState<Sale[]>([])
  const [filteredSales, setFilteredSales] = useState<Sale[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    gstin: "27AAFCV2449G1Z7",
    taxPercentage: 18,
    companyName: "SIRI ART JEWELLERY",
    companyAddress: "123 Jewelry Street, Diamond District, Mumbai, Maharashtra 400001",
    companyPhone: "+91 98765 43210",
    companyEmail: "info@siriartjewellery.com",
  })

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    const userData = localStorage.getItem("adminUser")

    if (isLoggedIn !== "true" || !userData) {
      router.push("/")
      return
    }

    const user = JSON.parse(userData)
    setCurrentUser(user)
    loadData(user)
  }, [router])

  useEffect(() => {
    // Filter sales based on search term
    if (searchTerm.trim()) {
      const filtered = sales.filter(
        (sale) =>
          sale.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (sale.customerName && sale.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (sale.customerPhone && sale.customerPhone.includes(searchTerm)) ||
          (sale.storeName && sale.storeName.toLowerCase().includes(searchTerm.toLowerCase())),
      )
      setFilteredSales(filtered)
    } else {
      setFilteredSales(sales)
    }
  }, [searchTerm, sales])

  const loadData = (user: AdminUser) => {
    // Load system settings
    const savedSettings = localStorage.getItem("systemSettings")
    if (savedSettings) {
      setSystemSettings(JSON.parse(savedSettings))
    }

    // Load sales and filter based on user role and assigned stores
    const savedSales = localStorage.getItem("sales")
    if (savedSales) {
      try {
        const allSales: Sale[] = JSON.parse(savedSales)

        // Validate and clean sales data
        const validSales = allSales.map((sale) => ({
          ...sale,
          subtotal: Number(sale.subtotal) || 0,
          taxPercentage: Number(sale.taxPercentage) || 0,
          taxAmount: Number(sale.taxAmount) || 0,
          discountPercentage: Number(sale.discountPercentage) || 0,
          discountAmount: Number(sale.discountAmount) || 0,
          total: Number(sale.total) || 0,
          items: (sale.items || []).map((item) => ({
            ...item,
            quantity: Number(item.quantity) || 0,
            price: Number(item.price) || 0,
            total: Number(item.total) || 0,
          })),
        }))

        // Filter sales based on user role and assigned stores
        let userSales: Sale[] = []
        if (user.role === "super_admin") {
          userSales = validSales // Super admin sees all sales
        } else if (user.role === "billing_user" && user.assignedStores) {
          userSales = validSales.filter((sale) => user.assignedStores?.includes(sale.storeId || ""))
        } else if (user.isTemporary) {
          // Temporary users see all sales (they can work at any store)
          userSales = validSales
        }

        // Sort by date (newest first)
        userSales.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setSales(userSales)
        setFilteredSales(userSales)
      } catch (error) {
        console.error("Error loading sales data:", error)
        setSales([])
        setFilteredSales([])
      }
    }
  }

  // Safe number formatting function
  const formatCurrency = (value: number | undefined | null): string => {
    const num = Number(value) || 0
    return `₹${num.toFixed(2)}`
  }

  // Safe percentage formatting function
  const formatPercentage = (value: number | undefined | null): string => {
    const num = Number(value) || 0
    return `${num.toFixed(1)}%`
  }

  // Export sales to Excel with enhanced data
  const exportSales = async () => {
    if (!currentUser) {
      alert("User information not available")
      return
    }

    try {
      const XLSX = await import("xlsx")

      if (filteredSales.length === 0) {
        alert("No transactions found to export")
        return
      }

      // Prepare detailed export data
      const exportData: any[] = []

      filteredSales.forEach((sale) => {
        // Add transaction header row
        exportData.push({
          "Company Name": systemSettings.companyName,
          "Store/Branch": sale.storeName || "N/A",
          "Store Address": sale.storeAddress || "N/A",
          "Invoice Number": sale.id,
          Date: format(new Date(sale.timestamp), "dd/MM/yyyy"),
          Time: format(new Date(sale.timestamp), "HH:mm:ss"),
          "Customer Phone": sale.customerPhone || "N/A",
          "Customer Name": sale.customerName || "N/A",
          "Customer Address": sale.customerAddress || "N/A",
          "Item Name": "",
          Quantity: "",
          "Unit Price": "",
          "Item Total": "",
          Subtotal: "",
          "Tax Rate": "",
          "Tax Amount": "",
          "Discount Rate": "",
          "Discount Amount": "",
          "Final Amount": "",
          "Payment Method": sale.paymentMethod?.toUpperCase() || "N/A",
          Notes: sale.notes || "",
        })

        // Add items
        const items = sale.items || []
        items.forEach((item, index) => {
          exportData.push({
            "Company Name": index === 0 ? "ITEMS:" : "",
            "Store/Branch": "",
            "Store Address": "",
            "Invoice Number": "",
            Date: "",
            Time: "",
            "Customer Phone": "",
            "Customer Name": "",
            "Customer Address": "",
            "Item Name": item.productName || "N/A",
            Quantity: Number(item.quantity) || 0,
            "Unit Price": formatCurrency(item.price),
            "Item Total": formatCurrency(item.total),
            Subtotal: index === 0 ? formatCurrency(sale.subtotal) : "",
            "Tax Rate": index === 0 ? formatPercentage(sale.taxPercentage) : "",
            "Tax Amount": index === 0 ? formatCurrency(sale.taxAmount) : "",
            "Discount Rate": index === 0 ? formatPercentage(sale.discountPercentage) : "",
            "Discount Amount": index === 0 ? formatCurrency(sale.discountAmount) : "",
            "Final Amount": index === 0 ? formatCurrency(sale.total) : "",
            "Payment Method": "",
            Notes: "",
          })
        })

        // Add separator row
        exportData.push({
          "Company Name": "---",
          "Store/Branch": "---",
          "Store Address": "---",
          "Invoice Number": "---",
          Date: "---",
          Time: "---",
          "Customer Phone": "---",
          "Customer Name": "---",
          "Customer Address": "---",
          "Item Name": "---",
          Quantity: "---",
          "Unit Price": "---",
          "Item Total": "---",
          Subtotal: "---",
          "Tax Rate": "---",
          "Tax Amount": "---",
          "Discount Rate": "---",
          "Discount Amount": "---",
          "Final Amount": "---",
          "Payment Method": "---",
          Notes: "---",
        })
      })

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Transaction History")

      // Generate file and trigger download
      const wbArrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })
      const blob = new Blob([wbArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })

      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url

      // Create filename based on user role
      const userStores = currentUser.role === "super_admin" ? "All-Stores" : "Store-Transactions"
      link.download = `${systemSettings.companyName}-${userStores}-${new Date().toISOString().split("T")[0]}.xlsx`

      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      alert(`Exported ${filteredSales.length} transactions successfully`)
    } catch (error) {
      console.error("Error exporting transactions:", error)
      alert("Error exporting transactions. Please try again.")
    }
  }

  // Calculate totals with safe number handling
  const totalRevenue = filteredSales.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0)
  const totalTransactions = filteredSales.length
  const totalItems = filteredSales.reduce(
    (sum, sale) => sum + (sale.items || []).reduce((itemSum, item) => itemSum + (Number(item.quantity) || 0), 0),
    0,
  )
  const averageTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0

  return (
    <BillingLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Transaction History</h1>
            <p className="text-gray-600 mt-2">
              {currentUser?.role === "super_admin"
                ? "View all transactions across all stores"
                : "View transactions from assigned stores"}
            </p>
          </div>
          <div className="flex space-x-3">
            <Button onClick={exportSales} variant="outline" className="bg-green-50 hover:bg-green-100">
              <Download className="h-4 w-4 mr-2" />
              Export History
            </Button>
            <Button onClick={() => loadData(currentUser!)} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">From {totalTransactions} transactions</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalTransactions}</div>
              <p className="text-xs text-muted-foreground">Completed transactions</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems}</div>
              <p className="text-xs text-muted-foreground">Total items</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Transaction</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(averageTransactionValue)}</div>
              <p className="text-xs text-muted-foreground">Per transaction</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Transactions Table */}
        <Card className="shadow-lg border-0">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Transaction History</CardTitle>
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search transactions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
            </div>
            <CardDescription>
              Showing {filteredSales.length} of {sales.length} transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">{sale.id}</code>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{sale.storeName || "N/A"}</div>
                        <div className="text-sm text-gray-500">{systemSettings.companyName}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{sale.customerPhone || "Walk-in Customer"}</div>
                        {sale.customerName && <div className="text-sm text-gray-500">{sale.customerName}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{(sale.items || []).length} items</Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-bold">{formatCurrency(sale.total)}</div>
                        {(Number(sale.discountAmount) || 0) > 0 && (
                          <div className="text-sm text-green-600">-{formatCurrency(sale.discountAmount)} discount</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div>{format(new Date(sale.timestamp), "dd/MM/yyyy")}</div>
                        <div className="text-sm text-gray-500">{format(new Date(sale.timestamp), "HH:mm")}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{(sale.paymentMethod || "N/A").toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => setSelectedSale(sale)}>
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle className="flex items-center">
                              <FileText className="h-5 w-5 mr-2" />
                              Transaction Details - {sale.id}
                            </DialogTitle>
                            <DialogDescription>Complete transaction information and items</DialogDescription>
                          </DialogHeader>
                          {selectedSale && (
                            <div className="space-y-6">
                              {/* Transaction Header */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <h3 className="font-semibold mb-2">Company Information</h3>
                                  <p className="text-sm font-medium">{systemSettings.companyName}</p>
                                  <p className="text-sm">{selectedSale.storeName || "N/A"}</p>
                                  <p className="text-sm text-gray-600">{selectedSale.storeAddress || "N/A"}</p>
                                  <p className="text-sm text-gray-600">GSTIN: {systemSettings.gstin}</p>
                                </div>
                                <div>
                                  <h3 className="font-semibold mb-2">Transaction Information</h3>
                                  <p className="text-sm">Invoice ID: {selectedSale.id}</p>
                                  <p className="text-sm">
                                    Date: {format(new Date(selectedSale.timestamp), "dd/MM/yyyy HH:mm")}
                                  </p>
                                  <p className="text-sm">
                                    Payment: {(selectedSale.paymentMethod || "N/A").toUpperCase()}
                                  </p>
                                </div>
                              </div>

                              {/* Customer Information */}
                              <div>
                                <h3 className="font-semibold mb-2">Customer Information</h3>
                                <p className="text-sm">Phone: {selectedSale.customerPhone || "N/A"}</p>
                                {selectedSale.customerName && (
                                  <p className="text-sm">Name: {selectedSale.customerName}</p>
                                )}
                                {selectedSale.customerAddress && (
                                  <p className="text-sm">Address: {selectedSale.customerAddress}</p>
                                )}
                              </div>

                              {/* Items */}
                              <div>
                                <h3 className="font-semibold mb-2">Items ({(selectedSale.items || []).length})</h3>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Product</TableHead>
                                      <TableHead>Qty</TableHead>
                                      <TableHead>Rate</TableHead>
                                      <TableHead>Amount</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(selectedSale.items || []).map((item, index) => (
                                      <TableRow key={index}>
                                        <TableCell className="font-medium">{item.productName || "N/A"}</TableCell>
                                        <TableCell>{Number(item.quantity) || 0}</TableCell>
                                        <TableCell>{formatCurrency(item.price)}</TableCell>
                                        <TableCell>{formatCurrency(item.total)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>

                              {/* Totals */}
                              <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <span>Subtotal:</span>
                                    <span>{formatCurrency(selectedSale.subtotal)}</span>
                                  </div>
                                  {(Number(selectedSale.discountAmount) || 0) > 0 && (
                                    <div className="flex justify-between text-red-600">
                                      <span>Discount ({formatPercentage(selectedSale.discountPercentage)}):</span>
                                      <span>-{formatCurrency(selectedSale.discountAmount)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between">
                                    <span>Tax ({formatPercentage(selectedSale.taxPercentage)}):</span>
                                    <span>{formatCurrency(selectedSale.taxAmount)}</span>
                                  </div>
                                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                                    <span>TOTAL:</span>
                                    <span>{formatCurrency(selectedSale.total)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredSales.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">No transactions found</p>
                <p className="text-sm">
                  {searchTerm ? `No transactions match "${searchTerm}"` : "No transactions have been recorded yet"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </BillingLayout>
  )
}
