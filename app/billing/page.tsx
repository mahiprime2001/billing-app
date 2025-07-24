"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import BillingLayout from "@/components/billing-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Separator } from "@/components/ui/separator"
import { Plus, Minus, ShoppingCart, Trash2, Receipt, Search, Package, MapPin, Clock } from "lucide-react"
import { User } from "lucide-react" // Import User component

interface Product {
  id: string
  name: string
  price: number
  barcodes: string[]
  stock: number
  category?: string
}

interface CartItem {
  product: Product
  quantity: number
}

interface AdminUser {
  name: string
  email: string
  role: "super_admin" | "billing_user" | "temporary_user"
  assignedStores?: string[]
}

interface SystemStore {
  id: string
  name: string
  address: string
  status: string
}

export default function BillingPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null)
  const [selectedStore, setSelectedStore] = useState<SystemStore | null>(null)
  const [availableStores, setAvailableStores] = useState<SystemStore[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [barcodeInput, setBarcodeInput] = useState("")
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<any>(null)
  const [isStoreSelectionOpen, setIsStoreSelectionOpen] = useState(false)

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    const userData = localStorage.getItem("adminUser")

    if (isLoggedIn !== "true" || !userData) {
      router.push("/")
      return
    }

    const user = JSON.parse(userData)
    setCurrentUser(user)

    // Load stores
    const savedStores = localStorage.getItem("stores")
    if (savedStores) {
      const allStores = JSON.parse(savedStores)
      const activeStores = allStores.filter((store: SystemStore) => store.status === "active")

      if (user.role === "billing_user" && user.assignedStores) {
        // Billing users can only access their assigned stores
        const userStores = activeStores.filter((store: SystemStore) => user.assignedStores?.includes(store.id))
        setAvailableStores(userStores)
        if (userStores.length === 1) {
          setSelectedStore(userStores[0])
        }
      } else if (user.role === "temporary_user") {
        // Temporary users can access all stores but must select one
        setAvailableStores(activeStores)
        setIsStoreSelectionOpen(true)
      } else {
        // Super admins can access all stores
        setAvailableStores(activeStores)
        if (activeStores.length > 0) {
          setSelectedStore(activeStores[0])
        }
      }
    }

    loadProducts()
  }, [router])

  const loadProducts = () => {
    const savedProducts = localStorage.getItem("products")
    if (savedProducts) {
      const parsedProducts = JSON.parse(savedProducts)
      const safeProducts = parsedProducts.map((product: Product) => ({
        ...product,
        barcodes: product.barcodes || [],
      }))
      setProducts(safeProducts)
    }
  }

  const handleStoreSelection = (storeId: string) => {
    const store = availableStores.find((s) => s.id === storeId)
    if (store) {
      setSelectedStore(store)
      setIsStoreSelectionOpen(false)

      // For temporary users, store the selected store in session
      if (currentUser?.role === "temporary_user") {
        sessionStorage.setItem("selectedStore", JSON.stringify(store))
      }
    }
  }

  const addToCart = (product: Product, quantity = 1) => {
    if (product.stock < quantity) {
      alert(`Insufficient stock. Available: ${product.stock}`)
      return
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.product.id === product.id)
      if (existingItem) {
        const newQuantity = existingItem.quantity + quantity
        if (newQuantity > product.stock) {
          alert(`Cannot add more. Maximum available: ${product.stock}`)
          return prevCart
        }
        return prevCart.map((item) => (item.product.id === product.id ? { ...item, quantity: newQuantity } : item))
      } else {
        return [...prevCart, { product, quantity }]
      }
    })
  }

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }

    const product = products.find((p) => p.id === productId)
    if (product && quantity > product.stock) {
      alert(`Cannot exceed available stock: ${product.stock}`)
      return
    }

    setCart((prevCart) => prevCart.map((item) => (item.product.id === productId ? { ...item, quantity } : item)))
  }

  const removeFromCart = (productId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.product.id !== productId))
  }

  const handleBarcodeSearch = () => {
    if (!barcodeInput.trim()) return

    const product = products.find((p) =>
      (p.barcodes || []).some((barcode) => barcode.toLowerCase().includes(barcodeInput.toLowerCase())),
    )

    if (product) {
      addToCart(product)
      setBarcodeInput("")
    } else {
      alert("Product not found with this barcode")
    }
  }

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + item.product.price * item.quantity, 0)
  }

  const calculateTax = (subtotal: number) => {
    return subtotal * 0.18 // 18% GST
  }

  const generateBill = () => {
    if (cart.length === 0) {
      alert("Cart is empty")
      return
    }

    if (!selectedStore) {
      alert("Please select a store")
      return
    }

    const subtotal = calculateTotal()
    const tax = calculateTax(subtotal)
    const total = subtotal + tax

    const receipt = {
      id: `BILL-${Date.now()}`,
      store: selectedStore,
      items: cart.map((item) => ({
        name: item.product.name,
        price: item.product.price,
        quantity: item.quantity,
        total: item.product.price * item.quantity,
      })),
      subtotal,
      tax,
      total,
      timestamp: new Date().toISOString(),
      cashier: currentUser?.name || "Unknown",
      cashierRole: currentUser?.role || "unknown",
    }

    // Update product stock
    const updatedProducts = products.map((product) => {
      const cartItem = cart.find((item) => item.product.id === product.id)
      if (cartItem) {
        return {
          ...product,
          stock: product.stock - cartItem.quantity,
        }
      }
      return product
    })

    setProducts(updatedProducts)
    localStorage.setItem("products", JSON.stringify(updatedProducts))

    // Save bill to history
    const savedBills = localStorage.getItem("bills")
    const bills = savedBills ? JSON.parse(savedBills) : []
    bills.push(receipt)
    localStorage.setItem("bills", JSON.stringify(bills))

    setLastReceipt(receipt)
    setCart([])
    setIsReceiptDialogOpen(true)
  }

  const printReceipt = () => {
    if (!lastReceipt) return

    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    const receiptHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${lastReceipt.id}</title>
          <style>
            body { font-family: monospace; max-width: 300px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .store-name { font-weight: bold; font-size: 16px; }
            .store-address { font-size: 12px; margin-top: 5px; }
            .receipt-id { margin: 10px 0; font-size: 12px; }
            .items { margin: 20px 0; }
            .item { display: flex; justify-content: space-between; margin: 5px 0; }
            .totals { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; }
            .total-line { display: flex; justify-content: space-between; margin: 3px 0; }
            .final-total { font-weight: bold; border-top: 1px solid #000; padding-top: 5px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="store-name">${lastReceipt.store.name}</div>
            <div class="store-address">${lastReceipt.store.address}</div>
            <div class="receipt-id">Receipt: ${lastReceipt.id}</div>
            <div class="receipt-id">Date: ${new Date(lastReceipt.timestamp).toLocaleString()}</div>
            <div class="receipt-id">Cashier: ${lastReceipt.cashier} (${lastReceipt.cashierRole})</div>
          </div>
          
          <div class="items">
            ${lastReceipt.items
              .map(
                (item: any) => `
              <div class="item">
                <span>${item.name} x${item.quantity}</span>
                <span>₹${item.total.toFixed(2)}</span>
              </div>
            `,
              )
              .join("")}
          </div>
          
          <div class="totals">
            <div class="total-line">
              <span>Subtotal:</span>
              <span>₹${lastReceipt.subtotal.toFixed(2)}</span>
            </div>
            <div class="total-line">
              <span>Tax (18%):</span>
              <span>₹${lastReceipt.tax.toFixed(2)}</span>
            </div>
            <div class="total-line final-total">
              <span>Total:</span>
              <span>₹${lastReceipt.total.toFixed(2)}</span>
            </div>
          </div>
          
          <div class="footer">
            <p>Thank you for your business!</p>
            <p>Visit us again</p>
          </div>
        </body>
      </html>
    `

    printWindow.document.write(receiptHTML)
    printWindow.document.close()
    printWindow.print()
  }

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.barcodes || []).some((barcode) => barcode.toLowerCase().includes(searchTerm.toLowerCase())),
  )

  // Store Selection Dialog for Temporary Users
  if (isStoreSelectionOpen && currentUser?.role === "temporary_user") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
              <MapPin className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="flex items-center justify-center">
              <Clock className="h-5 w-5 mr-2" />
              Select Store Location
            </CardTitle>
            <p className="text-gray-600 mt-2">Welcome, {currentUser.name}! Please select a store to continue.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {availableStores.map((store) => (
                <Button
                  key={store.id}
                  variant="outline"
                  className="w-full justify-start h-auto p-4 bg-transparent"
                  onClick={() => handleStoreSelection(store.id)}
                >
                  <div className="text-left">
                    <div className="font-medium">{store.name}</div>
                    <div className="text-sm text-gray-500 mt-1">{store.address}</div>
                  </div>
                </Button>
              ))}
            </div>

            <div className="text-center pt-4 border-t">
              <p className="text-xs text-gray-500">All billing operations will be associated with the selected store</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!selectedStore) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>No Store Selected</CardTitle>
            <p className="text-gray-600 mt-2">Please contact your administrator to assign a store.</p>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <BillingLayout>
      <div className="space-y-6">
        {/* Store Info Header */}
        <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">{selectedStore.name}</h1>
                <p className="text-blue-100 mt-1">{selectedStore.address}</p>
                <div className="flex items-center mt-2 text-blue-100">
                  <User className="h-4 w-4 mr-2" />
                  <span>
                    {currentUser?.name} ({currentUser?.role?.replace("_", " ")})
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">₹{calculateTotal().toFixed(2)}</div>
                <div className="text-blue-100">Cart Total</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Product Search and List */}
          <div className="lg:col-span-2 space-y-6">
            {/* Search Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Search className="h-5 w-5 mr-2" />
                  Product Search
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex space-x-2">
                  <Input
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <div className="flex space-x-2">
                  <Input
                    placeholder="Scan or enter barcode..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleBarcodeSearch()}
                    className="flex-1"
                  />
                  <Button onClick={handleBarcodeSearch}>Add</Button>
                </div>
              </CardContent>
            </Card>

            {/* Product Grid */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Package className="h-5 w-5 mr-2" />
                  Products ({filteredProducts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => addToCart(product)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium text-sm">{product.name}</h3>
                        <Badge
                          variant={product.stock > 5 ? "default" : product.stock > 0 ? "secondary" : "destructive"}
                        >
                          Stock: {product.stock}
                        </Badge>
                      </div>
                      <div className="text-lg font-bold text-blue-600 mb-2">₹{product.price.toFixed(2)}</div>
                      {product.category && (
                        <Badge variant="outline" className="text-xs">
                          {product.category}
                        </Badge>
                      )}
                      {(product.barcodes || []).length > 0 && (
                        <div className="mt-2">
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded">{(product.barcodes || [])[0]}</code>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {filteredProducts.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No products found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Shopping Cart */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <ShoppingCart className="h-5 w-5 mr-2" />
                    Cart ({cart.length})
                  </div>
                  {cart.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setCart([])}>
                      Clear
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{item.product.name}</h4>
                        <p className="text-sm text-gray-600">₹{item.product.price.toFixed(2)} each</p>
                      </div>
                      <div className="flex items-center space-x-2 ml-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {cart.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Cart is empty</p>
                  </div>
                )}

                {cart.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Subtotal:</span>
                        <span>₹{calculateTotal().toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Tax (18%):</span>
                        <span>₹{calculateTax(calculateTotal()).toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Total:</span>
                        <span>₹{(calculateTotal() + calculateTax(calculateTotal())).toFixed(2)}</span>
                      </div>
                    </div>
                    <Button className="w-full mt-4" onClick={generateBill}>
                      <Receipt className="h-4 w-4 mr-2" />
                      Generate Bill
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Receipt Dialog */}
        <Dialog open={isReceiptDialogOpen} onOpenChange={setIsReceiptDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Receipt className="h-5 w-5 mr-2" />
                Bill Generated
              </DialogTitle>
              <DialogDescription>Your bill has been generated successfully</DialogDescription>
            </DialogHeader>
            {lastReceipt && (
              <div className="space-y-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="font-bold text-lg">{lastReceipt.store.name}</div>
                  <div className="text-sm text-gray-600">{lastReceipt.store.address}</div>
                  <div className="text-sm text-gray-600 mt-2">Receipt: {lastReceipt.id}</div>
                  <div className="text-sm text-gray-600">{new Date(lastReceipt.timestamp).toLocaleString()}</div>
                </div>

                <div className="space-y-2">
                  {lastReceipt.items.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span>
                        {item.name} x{item.quantity}
                      </span>
                      <span>₹{item.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>₹{lastReceipt.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tax (18%):</span>
                    <span>₹{lastReceipt.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Total:</span>
                    <span>₹{lastReceipt.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsReceiptDialogOpen(false)}>
                Close
              </Button>
              <Button onClick={printReceipt}>Print Receipt</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BillingLayout>
  )
}
