"use client"

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Receipt, Trash2, Eye, Search, Calculator, Percent } from "lucide-react"
import { Separator } from "@/components/ui/separator"

interface Product {
  id: string
  name: string
  price: number
  barcode: string
}

interface BillItem {
  productId: string
  productName: string
  price: number
  quantity: number
  total: number
}

interface Bill {
  id: string
  customerName: string
  customerEmail: string
  customerPhone: string
  items: BillItem[]
  subtotal: number
  tax: number
  discountPercentage: number
  discountAmount: number
  total: number
  date: string
  status: string
}

export default function BillingPage() {
  const router = useRouter()
  const [bills, setBills] = useState<Bill[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  // Form state
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [billItems, setBillItems] = useState<BillItem[]>([])
  const [selectedProductId, setSelectedProductId] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [discountPercentage, setDiscountPercentage] = useState(0)
  const [isEditingTotal, setIsEditingTotal] = useState(false)
  const [tempTotal, setTempTotal] = useState("")

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    if (isLoggedIn !== "true") {
      router.push("/")
      return
    }

    loadData()
  }, [router])

  const loadData = () => {
    // Load products
    const savedProducts = localStorage.getItem("products")
    if (savedProducts) {
      setProducts(JSON.parse(savedProducts))
    }

    // Load bills
    const savedBills = localStorage.getItem("bills")
    if (savedBills) {
      setBills(JSON.parse(savedBills))
    }
  }

  const saveBills = (updatedBills: Bill[]) => {
    setBills(updatedBills)
    localStorage.setItem("bills", JSON.stringify(updatedBills))
  }

  const addItemToBill = () => {
    if (!selectedProductId) return

    const product = products.find((p) => p.id === selectedProductId)
    if (!product) return

    const existingItemIndex = billItems.findIndex((item) => item.productId === selectedProductId)

    if (existingItemIndex >= 0) {
      const updatedItems = [...billItems]
      updatedItems[existingItemIndex].quantity += quantity
      updatedItems[existingItemIndex].total = updatedItems[existingItemIndex].quantity * product.price
      setBillItems(updatedItems)
    } else {
      const newItem: BillItem = {
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: quantity,
        total: product.price * quantity,
      }
      setBillItems([...billItems, newItem])
    }

    setSelectedProductId("")
    setQuantity(1)
  }

  const removeItemFromBill = (productId: string) => {
    setBillItems(billItems.filter((item) => item.productId !== productId))
  }

  const calculateTotals = () => {
    const subtotal = billItems.reduce((sum, item) => sum + item.total, 0)
    const tax = subtotal * 0.1 // 10% tax
    const discountAmount = (subtotal * discountPercentage) / 100
    const total = subtotal + tax - discountAmount
    return { subtotal, tax, discountAmount, total }
  }

  const handleDiscountPercentageChange = (newPercentage: number) => {
    const validPercentage = Math.max(0, Math.min(100, newPercentage))
    setDiscountPercentage(validPercentage)
  }

  const handleTotalEdit = () => {
    const { subtotal, tax } = calculateTotals()
    const currentTotal = subtotal + tax - (subtotal * discountPercentage) / 100
    setTempTotal(currentTotal.toFixed(2))
    setIsEditingTotal(true)
  }

  const handleTotalChange = (newTotalStr: string) => {
    const newTotal = Number.parseFloat(newTotalStr) || 0
    const { subtotal, tax } = calculateTotals()
    const totalBeforeDiscount = subtotal + tax

    if (newTotal > totalBeforeDiscount) {
      // If new total is higher than before discount, set discount to 0
      setDiscountPercentage(0)
    } else if (newTotal >= 0) {
      // Calculate new discount percentage based on the new total
      const newDiscountAmount = totalBeforeDiscount - newTotal
      const newDiscountPercentage = totalBeforeDiscount > 0 ? (newDiscountAmount / totalBeforeDiscount) * 100 : 0
      setDiscountPercentage(Math.max(0, Math.min(100, newDiscountPercentage)))
    }
  }

  const handleTotalSave = () => {
    handleTotalChange(tempTotal)
    setIsEditingTotal(false)
  }

  const handleTotalCancel = () => {
    setIsEditingTotal(false)
    setTempTotal("")
  }

  const createBill = () => {
    if (!customerName || billItems.length === 0) return

    const { subtotal, tax, discountAmount, total } = calculateTotals()

    const newBill: Bill = {
      id: Date.now().toString(),
      customerName,
      customerEmail,
      customerPhone,
      items: billItems,
      subtotal,
      tax,
      discountPercentage,
      discountAmount,
      total,
      date: new Date().toISOString(),
      status: "Paid",
    }

    const updatedBills = [...bills, newBill]
    saveBills(updatedBills)

    // Reset form
    setCustomerName("")
    setCustomerEmail("")
    setCustomerPhone("")
    setBillItems([])
    setDiscountPercentage(0)
    setIsCreateDialogOpen(false)
  }

  const deleteBill = (id: string) => {
    const updatedBills = bills.filter((bill) => bill.id !== id)
    saveBills(updatedBills)
  }

  const viewBill = (bill: Bill) => {
    setSelectedBill(bill)
    setIsViewDialogOpen(true)
  }

  const filteredBills = bills.filter(
    (bill) => bill.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || bill.id.includes(searchTerm),
  )

  const { subtotal, tax, discountAmount, total } = calculateTotals()

  // Quick discount preset buttons
  const discountPresets = [5, 10, 15, 20, 25]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Billing System</h1>
            <p className="text-muted-foreground">Create and manage bills with real-time discount adjustments</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Bill
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Bill</DialogTitle>
                <DialogDescription>Enter customer details and add products to create a bill</DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Customer Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Customer Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="customerName">Customer Name</Label>
                      <Input
                        id="customerName"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerEmail">Email (optional)</Label>
                      <Input
                        id="customerEmail"
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerPhone">Phone (optional)</Label>
                      <Input
                        id="customerPhone"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Add Products */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Add Products</h3>
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <Label htmlFor="product">Select Product</Label>
                      <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} - ₹{product.price.toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(Number.parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <Button onClick={addItemToBill} disabled={!selectedProductId}>
                      Add Item
                    </Button>
                  </div>
                </div>

                {/* Bill Items */}
                {billItems.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Bill Items</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {billItems.map((item) => (
                          <TableRow key={item.productId}>
                            <TableCell>{item.productName}</TableCell>
                            <TableCell>₹{item.price.toFixed(2)}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>₹{item.total.toFixed(2)}</TableCell>
                            <TableCell>
                              <Button variant="outline" size="sm" onClick={() => removeItemFromBill(item.productId)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Enhanced Discount and Total Section */}
                    <div className="bg-gray-50 p-6 rounded-lg space-y-4">
                      <div className="flex justify-between text-base">
                        <span>Subtotal:</span>
                        <span className="font-medium">₹{subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-base">
                        <span>Tax (10%):</span>
                        <span className="font-medium">₹{tax.toFixed(2)}</span>
                      </div>

                      {/* Discount Section with Presets */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center text-base">
                            <Percent className="h-4 w-4 mr-2" />
                            Discount Percentage:
                          </Label>
                          <div className="flex items-center space-x-2">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={discountPercentage.toFixed(1)}
                              onChange={(e) => handleDiscountPercentageChange(Number.parseFloat(e.target.value) || 0)}
                              className="w-20 text-right"
                            />
                            <span className="text-sm">%</span>
                          </div>
                        </div>

                        {/* Quick Discount Presets */}
                        <div className="flex flex-wrap gap-2">
                          <span className="text-sm text-gray-600 mr-2">Quick:</span>
                          {discountPresets.map((preset) => (
                            <Button
                              key={preset}
                              variant="outline"
                              size="sm"
                              onClick={() => setDiscountPercentage(preset)}
                              className="text-xs h-7"
                            >
                              {preset}%
                            </Button>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDiscountPercentage(0)}
                            className="text-xs h-7"
                          >
                            Clear
                          </Button>
                        </div>

                        {discountPercentage > 0 && (
                          <div className="flex justify-between text-base text-red-600">
                            <span>Discount ({discountPercentage.toFixed(1)}%):</span>
                            <span className="font-medium">-₹{discountAmount.toFixed(2)}</span>
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Editable Total */}
                      <div className="flex justify-between items-center text-xl font-bold">
                        <span>Total:</span>
                        <div className="flex items-center space-x-2">
                          {isEditingTotal ? (
                            <div className="flex items-center space-x-2">
                              <span>₹</span>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={tempTotal}
                                onChange={(e) => setTempTotal(e.target.value)}
                                className="w-32 text-right font-bold text-xl"
                                autoFocus
                                onKeyPress={(e) => {
                                  if (e.key === "Enter") {
                                    handleTotalSave()
                                  } else if (e.key === "Escape") {
                                    handleTotalCancel()
                                  }
                                }}
                              />
                              <Button size="sm" onClick={handleTotalSave} className="h-8">
                                ✓
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleTotalCancel}
                                className="h-8 bg-transparent"
                              >
                                ✕
                              </Button>
                            </div>
                          ) : (
                            <div
                              className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors"
                              onClick={handleTotalEdit}
                              title="Click to edit total amount"
                            >
                              <span>₹{total.toFixed(2)}</span>
                              <Calculator className="h-4 w-4 text-gray-400" />
                            </div>
                          )}
                        </div>
                      </div>

                      {discountPercentage > 0 && (
                        <div className="text-center">
                          <p className="text-sm text-green-600 font-medium">
                            Customer saves ₹{discountAmount.toFixed(2)} ({discountPercentage.toFixed(1)}% discount)
                          </p>
                        </div>
                      )}

                      <div className="text-xs text-gray-500 text-center">
                        💡 Tip: Click on the total amount to edit it directly. Discount will be recalculated
                        automatically.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createBill} disabled={!customerName || billItems.length === 0}>
                  Create Bill
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bills History</CardTitle>
            <CardDescription>{bills.length} bills created</CardDescription>
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search bills..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            {filteredBills.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBills.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell className="font-mono">#{bill.id}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{bill.customerName}</div>
                          {bill.customerEmail && (
                            <div className="text-sm text-muted-foreground">{bill.customerEmail}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{new Date(bill.date).toLocaleDateString()}</TableCell>
                      <TableCell>{bill.items.length} items</TableCell>
                      <TableCell>
                        {bill.discountPercentage > 0 ? (
                          <div className="text-sm">
                            <div className="text-red-600 font-medium">{bill.discountPercentage.toFixed(1)}%</div>
                            <div className="text-xs text-gray-500">₹{bill.discountAmount.toFixed(2)}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">No discount</span>
                        )}
                      </TableCell>
                      <TableCell className="font-bold">₹{bill.total.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant="default">{bill.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm" onClick={() => viewBill(bill)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => deleteBill(bill.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium">No bills found</h3>
                <p className="text-muted-foreground">
                  {searchTerm ? "Try adjusting your search terms" : "Create your first bill to get started"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* View Bill Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Bill Details</DialogTitle>
              <DialogDescription>Bill #{selectedBill?.id}</DialogDescription>
            </DialogHeader>

            {selectedBill && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium">Customer Information</h4>
                    <div className="text-sm text-muted-foreground mt-1">
                      <div>{selectedBill.customerName}</div>
                      {selectedBill.customerEmail && <div>{selectedBill.customerEmail}</div>}
                      {selectedBill.customerPhone && <div>{selectedBill.customerPhone}</div>}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium">Bill Information</h4>
                    <div className="text-sm text-muted-foreground mt-1">
                      <div>Date: {new Date(selectedBill.date).toLocaleDateString()}</div>
                      <div>Status: {selectedBill.status}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Items</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedBill.items.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell>₹{item.price.toFixed(2)}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>₹{item.total.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-2 text-right bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>₹{selectedBill.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span>₹{selectedBill.tax.toFixed(2)}</span>
                  </div>
                  {selectedBill.discountPercentage > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Discount ({selectedBill.discountPercentage.toFixed(1)}%):</span>
                      <span>-₹{selectedBill.discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total:</span>
                    <span>₹{selectedBill.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
