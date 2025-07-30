"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import BillingLayout from "@/components/billing-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { DatePickerWithRange } from "@/components/ui/date-range-picker"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  History,
  Search,
  Filter,
  Download,
  Eye,
  Receipt,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Printer,
  FileText,
} from "lucide-react"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"

interface Sale {
  id: string
  storeId?: string
  storeName?: string
  storeAddress?: string
  customerName?: string
  customerPhone?: string
  customerEmail?: string
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
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false)
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

    // Load system settings
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.systemSettings) setSystemSettings(data.systemSettings)
      })

    loadSales()
  }, [router])

  useEffect(() => {
    filterSales()
  }, [sales, searchTerm, paymentMethodFilter, dateRange])

  const loadSales = async () => {
    try {
      const response = await fetch("/api/bills")
      if (response.ok) {
        const data = await response.json()
        const sortedSales = data.sort(
          (a: Sale, b: Sale) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        setSales(sortedSales)
      }
    } catch (error) {
      console.error("Failed to load sales:", error)
    }
  }

  const filterSales = () => {
    let filtered = [...sales]

    // Filter by search term (invoice ID, customer name, or phone)
    if (searchTerm) {
      filtered = filtered.filter(
        (sale) =>
          sale.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          sale.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          sale.customerPhone?.includes(searchTerm) ||
          sale.items.some((item) => item.productName.toLowerCase().includes(searchTerm.toLowerCase())),
      )
    }

    // Filter by payment method
    if (paymentMethodFilter !== "all") {
      filtered = filtered.filter((sale) => sale.paymentMethod === paymentMethodFilter)
    }

    // Filter by date range
    if (dateRange?.from) {
      filtered = filtered.filter((sale) => {
        const saleDate = new Date(sale.timestamp)
        const fromDate = new Date(dateRange.from!)
        const toDate = dateRange.to ? new Date(dateRange.to) : new Date()

        // Set time to start/end of day for proper comparison
        fromDate.setHours(0, 0, 0, 0)
        toDate.setHours(23, 59, 59, 999)

        return saleDate >= fromDate && saleDate <= toDate
      })
    }

    setFilteredSales(filtered)
  }

  const calculateStats = () => {
    const totalSales = filteredSales.reduce((sum, sale) => sum + sale.total, 0)
    const totalTransactions = filteredSales.length
    const totalItems = filteredSales.reduce(
      (sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    )
    const uniqueCustomers = new Set(
      filteredSales.filter((sale) => sale.customerPhone).map((sale) => sale.customerPhone),
    ).size

    const avgTransactionValue = totalTransactions > 0 ? totalSales / totalTransactions : 0

    return {
      totalSales,
      totalTransactions,
      totalItems,
      uniqueCustomers,
      avgTransactionValue,
    }
  }

  const exportToJSON = () => {
    const dataStr = JSON.stringify(filteredSales, null, 2)
    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr)

    const exportFileDefaultName = `billing-history-${format(new Date(), "yyyy-MM-dd")}.json`

    const linkElement = document.createElement("a")
    linkElement.setAttribute("href", dataUri)
    linkElement.setAttribute("download", exportFileDefaultName)
    linkElement.click()
  }

  const viewSaleDetails = (sale: Sale) => {
    setSelectedSale(sale)
    setIsDetailsDialogOpen(true)
  }

  const printReceipt = (sale: Sale) => {
    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    const receiptHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${sale.id}</title>
          <style>
            body { font-family: monospace; max-width: 300px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .company-name { font-weight: bold; font-size: 16px; }
            .store-info { font-size: 12px; margin-top: 5px; }
            .receipt-id { margin: 10px 0; font-size: 12px; }
            .customer-info { margin: 10px 0; font-size: 12px; border-top: 1px dashed #000; padding-top: 10px; }
            .items { margin: 20px 0; }
            .item { display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px; }
            .totals { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; }
            .total-line { display: flex; justify-content: space-between; margin: 3px 0; font-size: 12px; }
            .final-total { font-weight: bold; border-top: 1px solid #000; padding-top: 5px; }
            .footer { text-align: center; margin-top: 20px; font-size: 10px; }
            .gstin { font-size: 10px; margin-top: 5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">${systemSettings.companyName}</div>
            <div class="store-info">${sale.storeName}</div>
            <div class="store-info">${sale.storeAddress}</div>
            <div class="gstin">GSTIN: ${systemSettings.gstin}</div>
            <div class="receipt-id">Invoice: ${sale.id}</div>
            <div class="receipt-id">Date: ${new Date(sale.timestamp).toLocaleString()}</div>
            <div class="receipt-id">Reprint: ${new Date().toLocaleString()}</div>
          </div>
          
          ${
            sale.customerName || sale.customerPhone
              ? `
          <div class="customer-info">
            <strong>Customer Details:</strong><br>
            ${sale.customerName ? `Name: ${sale.customerName}<br>` : ""}
            ${sale.customerPhone ? `Phone: ${sale.customerPhone}<br>` : ""}
            ${sale.customerEmail ? `Email: ${sale.customerEmail}<br>` : ""}
            ${sale.customerAddress ? `Address: ${sale.customerAddress}<br>` : ""}
          </div>
          `
              : ""
          }
          
          <div class="items">
            ${sale.items
              .map(
                (item) => `
              <div class="item">
                <span>${item.productName} x${item.quantity}</span>
                <span>₹${item.total.toFixed(2)}</span>
              </div>
            `,
              )
              .join("")}
          </div>
          
          <div class="totals">
            <div class="total-line">
              <span>Subtotal:</span>
              <span>₹${sale.subtotal.toFixed(2)}</span>
            </div>
            ${
              sale.discountAmount > 0
                ? `
            <div class="total-line">
              <span>Discount (${sale.discountPercentage.toFixed(1)}%):</span>
              <span>-₹${sale.discountAmount.toFixed(2)}</span>
            </div>
            `
                : ""
            }
            <div class="total-line">
              <span>Tax (${sale.taxPercentage}%):</span>
              <span>₹${sale.taxAmount.toFixed(2)}</span>
            </div>
            <div class="total-line final-total">
              <span>TOTAL:</span>
              <span>₹${sale.total.toFixed(2)}</span>
            </div>
            <div class="total-line">
              <span>Payment:</span>
              <span>${sale.paymentMethod.toUpperCase()}</span>
            </div>
          </div>
          
          ${
            sale.notes
              ? `
          <div class="customer-info">
            <strong>Notes:</strong><br>
            ${sale.notes}
          </div>
          `
              : ""
          }
          
          <div class="footer">
            <p>Thank you for your business!</p>
            <p>Visit us again</p>
            <p>${systemSettings.companyPhone}</p>
            <p>${systemSettings.companyEmail}</p>
          </div>
        </body>
      </html>
    `

    printWindow.document.write(receiptHTML)
    printWindow.document.close()
    printWindow.print()
  }

  const stats = calculateStats()

  return (
    <BillingLayout>
      <div className="space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-purple-600 to-purple-700 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold flex items-center">
                  <History className="h-6 w-6 mr-3" />
                  Billing History
                </h1>
                <p className="text-purple-100 mt-1">View and manage transaction history</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">₹{stats.totalSales.toFixed(2)}</div>
                <div className="text-purple-100">Total Sales</div>
                <div className="text-sm text-purple-200 mt-1">{stats.totalTransactions} Transactions</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-600">₹{stats.totalSales.toFixed(2)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Transactions</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.totalTransactions}</p>
                </div>
                <Receipt className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Items Sold</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.totalItems}</p>
                </div>
                <ShoppingBag className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg. Transaction</p>
                  <p className="text-2xl font-bold text-purple-600">₹{stats.avgTransactionValue.toFixed(2)}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Filter className="h-5 w-5 mr-2" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="search" className="text-sm font-medium">
                  Search
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder="Invoice ID, customer, product..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Payment Method</Label>
                <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All methods" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Methods</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Date Range</Label>
                <DatePickerWithRange date={dateRange} setDate={setDateRange} />
              </div>

              <div className="flex items-end">
                <Button onClick={exportToJSON} variant="outline" className="w-full bg-transparent">
                  <Download className="h-4 w-4 mr-2" />
                  Export JSON
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Transaction History ({filteredSales.length})
              </div>
              {filteredSales.length > 0 && <Badge variant="secondary">{filteredSales.length} results</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice ID</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.map((sale) => (
                    <TableRow key={sale.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{sale.id}</span>
                          {sale.storeName && <span className="text-xs text-gray-500">{sale.storeName}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{format(new Date(sale.timestamp), "MMM dd, yyyy")}</span>
                          <span className="text-xs text-gray-500">{format(new Date(sale.timestamp), "hh:mm a")}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{sale.customerName || "Walk-in"}</span>
                          {sale.customerPhone && <span className="text-xs text-gray-500">{sale.customerPhone}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{sale.items.length} items</span>
                          <span className="text-xs text-gray-500">
                            {sale.items.reduce((sum, item) => sum + item.quantity, 0)} qty
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            sale.paymentMethod === "cash"
                              ? "default"
                              : sale.paymentMethod === "card"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {sale.paymentMethod.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <div className="flex flex-col items-end">
                          <span>₹{sale.total.toFixed(2)}</span>
                          {sale.discountAmount > 0 && (
                            <span className="text-xs text-green-600">-{sale.discountPercentage.toFixed(1)}% off</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => viewSaleDetails(sale)} title="View Details">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => printReceipt(sale)} title="Print Receipt">
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredSales.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No transactions found</p>
                  <p className="text-sm">Try adjusting your filters</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sale Details Dialog */}
        <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Receipt className="h-5 w-5 mr-2" />
                Transaction Details
              </DialogTitle>
              <DialogDescription>{selectedSale && `Invoice: ${selectedSale.id}`}</DialogDescription>
            </DialogHeader>
            {selectedSale && (
              <div className="space-y-6">
                {/* Transaction Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Transaction Info</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Invoice ID:</span>
                        <span className="font-medium">{selectedSale.id}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Date:</span>
                        <span>{format(new Date(selectedSale.timestamp), "MMM dd, yyyy hh:mm a")}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Payment:</span>
                        <Badge variant="outline">{selectedSale.paymentMethod.toUpperCase()}</Badge>
                      </div>
                      {selectedSale.storeName && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Store:</span>
                          <span>{selectedSale.storeName}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Customer Info */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Customer Info</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedSale.customerName ? (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Name:</span>
                            <span>{selectedSale.customerName}</span>
                          </div>
                          {selectedSale.customerPhone && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Phone:</span>
                              <span>{selectedSale.customerPhone}</span>
                            </div>
                          )}
                          {selectedSale.customerEmail && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Email:</span>
                              <span>{selectedSale.customerEmail}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-gray-500">Walk-in Customer</div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Items */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Items Purchased</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedSale.items.map((item, index) => (
                        <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{item.productName}</div>
                            <div className="text-xs text-gray-600">
                              ₹{item.price.toFixed(2)} × {item.quantity}
                            </div>
                          </div>
                          <div className="font-medium">₹{item.total.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Totals */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Bill Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Subtotal:</span>
                        <span>₹{selectedSale.subtotal.toFixed(2)}</span>
                      </div>
                      {selectedSale.discountAmount > 0 && (
                        <div className="flex justify-between text-sm text-red-600">
                          <span>Discount (${selectedSale.discountPercentage.toFixed(1)}%):</span>
                          <span>-₹{selectedSale.discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span>Tax (${selectedSale.taxPercentage}%):</span>
                        <span>₹{selectedSale.taxAmount.toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Total:</span>
                        <span>₹{selectedSale.total.toFixed(2)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Notes */}
                {selectedSale.notes && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-700">{selectedSale.notes}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>
                Close
              </Button>
              {selectedSale && (
                <Button onClick={() => printReceipt(selectedSale)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print Receipt
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BillingLayout>
  )
}
