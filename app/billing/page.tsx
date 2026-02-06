"use client"

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import BillingLayout from "@/components/billing-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Plus,
  X,
  ShoppingCart,
  Search,
  Minus,
  Trash2,
  Receipt,
  User,
  Phone,
  CreditCard,
  Banknote,
  Smartphone,
  FileText,
  AlertCircle,
} from "lucide-react"
import { Product } from "@/lib/types"
import { getBarcode } from "@/app/utils/getBarcode"
import PrintButton from "@/components/PrintButton"
import { unifiedPrint } from "@/app/utils/printUtils"; // Import unifiedPrint


interface CartItem {
  productId: string
  productName: string
  quantity: number
  price: number
  total: number
  barcodes: string[] // Added barcodes to cart item
}

interface Customer {
  name?: string
  phone?: string
  email?: string
  address?: string
}

interface BillTab {
  id: string
  name: string
  cart: CartItem[]
  customer: Customer
  subtotal: number
  discountPercentage: number
  discountAmount: number
  taxPercentage: number
  taxAmount: number
  total: number
  paymentMethod: string
  notes: string
  hasUnsavedChanges: boolean
}

interface AdminUser {
  id: string
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

interface SystemStore {
  id: string
  name: string
  address: string
  phone?: string
  status: string
}

interface BillFormat {
  width: number
  height: number | "auto"
  margins: {
    top: number
    bottom: number
    left: number
    right: number
  }
  unit: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function BillingPage() {
  const router = useRouter();
const { data: products = [] } = useSWR<Product[]>(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/products", fetcher);
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [tabs, setTabs] = useState<BillTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string>("")
  const [bills, setBills] = useState<any[]>([])
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false)
  const [isConfirmCloseDialogOpen, setIsConfirmCloseDialogOpen] = useState(false)
  const [tabToClose, setTabToClose] = useState<string>("")
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    gstin: "",
    taxPercentage: 0,
    companyName: "",
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
  })
  const [stores, setStores] = useState<SystemStore[]>([])
  const [selectedStore, setSelectedStore] = useState<SystemStore | null>(null)
  const [billFormats, setBillFormats] = useState<Record<string, BillFormat>>({})
  const [storeFormats, setStoreFormats] = useState<Record<string, string>>({})
  const [selectedBillFormat, setSelectedBillFormat] = useState("A4")

  useEffect(() => {
    const userData = localStorage.getItem("adminUser")

    if (!userData) {
      router.push("/")
      return
    }

    const user = JSON.parse(userData)
    setCurrentUser(user)

    // Load system settings
    fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.systemSettings) setSystemSettings(data.systemSettings)
        if (data.billFormats) setBillFormats(data.billFormats)
        if (data.storeFormats) setStoreFormats(data.storeFormats)
      })

    // Load bills
    fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/bills")
      .then((res) => {
        if (res.status === 401) {
          router.push("/") // Redirect to login on auth error
          return null
        }
        if (!res.ok) {
          throw new Error("Failed to fetch bills")
        }
        return res.json()
      })
      .then((data) => {
        if (data) {
          const sortedBills = data.sort(
            (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          )
          setBills(sortedBills)
        }
      })
      .catch((error) => {
        console.error("Failed to load bills:", error)
      })

    // Load stores
    fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/stores")
      .then((res) => res.json())
      .then((allStores) => {
        const activeStores = allStores.filter((store: SystemStore) => store.status === "active")
        setStores(activeStores)

        if (user.role === "billing_user" && user.assignedStores) {
          const userStores = activeStores.filter((store: SystemStore) => user.assignedStores?.includes(store.id))
          if (userStores.length > 0) {
            setSelectedStore(userStores[0])
          }
        } else if (activeStores.length > 0) {
          setSelectedStore(activeStores[0])
        }
      })

  }, [router]);

  useEffect(() => {
    if (!Array.isArray(products)) {
      setFilteredProducts([]);
      return;
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const filtered = products.filter((product) => {
        const nameMatch = product.name.toLowerCase().includes(q);
        const barcode = getBarcode(product);
        const barcodeMatch = barcode ? barcode.toLowerCase().includes(q) : false;
        return nameMatch || barcodeMatch;
      });
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts(products.slice(0, 20));
    }
  }, [searchTerm, products]);

  useEffect(() => {
    if (systemSettings.taxPercentage > 0) {
      setTabs((prevTabs) => {
        if (prevTabs.length === 0) {
          return prevTabs
        }
        const needsUpdate = prevTabs.some(
          (tab) => tab.taxPercentage !== systemSettings.taxPercentage,
        )
        if (!needsUpdate) {
          return prevTabs
        }
        return prevTabs.map((tab) => {
          if (tab.taxPercentage !== systemSettings.taxPercentage) {
            const newSubtotal = tab.subtotal
            const newDiscountAmount = (newSubtotal * tab.discountPercentage) / 100
            const taxableAmount = newSubtotal - newDiscountAmount
            const newTaxAmount = (taxableAmount * systemSettings.taxPercentage) / 100
            const newTotal = taxableAmount + newTaxAmount

            return {
              ...tab,
              taxPercentage: systemSettings.taxPercentage,
              taxAmount: newTaxAmount,
              total: newTotal,
            }
          }
          return tab
        })
      })
    }
  }, [systemSettings.taxPercentage]);

  useEffect(() => {
    if (tabs.length === 0 && systemSettings.companyName) {
      const initialTab: BillTab = {
        id: "tab-1",
        name: "Bill #1",
        cart: [],
        customer: {},
        subtotal: 0,
        discountPercentage: 0,
        discountAmount: 0,
        taxPercentage: systemSettings.taxPercentage,
        taxAmount: 0,
        total: 0,
        paymentMethod: "cash",
        notes: "",
        hasUnsavedChanges: false,
      };
      setTabs([initialTab]);
      setActiveTabId(initialTab.id);
    }
  }, [tabs.length, systemSettings]);

  const createNewTab = () => {
    const newTabNumber = tabs.length + 1
    const newTab: BillTab = {
      id: `tab-${Date.now()}`,
      name: `Bill #${newTabNumber}`,
      cart: [],
      customer: {},
      subtotal: 0,
      discountPercentage: 0,
      discountAmount: 0,
      taxPercentage: systemSettings.taxPercentage,
      taxAmount: 0,
      total: 0,
      paymentMethod: "cash",
      notes: "",
      hasUnsavedChanges: false,
    }
    setTabs([...tabs, newTab])
    setActiveTabId(newTab.id)
  }

  const closeTab = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId)
    if (tab?.hasUnsavedChanges) {
      setTabToClose(tabId)
      setIsConfirmCloseDialogOpen(true)
      return
    }

    if (tabs.length === 1) {
      resetTab(tabId)
      return
    }

    const newTabs = tabs.filter((t) => t.id !== tabId)
    setTabs(newTabs)

    if (activeTabId === tabId) {
      const currentIndex = tabs.findIndex((t) => t.id === tabId)
      const nextTab = newTabs[currentIndex] || newTabs[currentIndex - 1] || newTabs[0]
      setActiveTabId(nextTab.id)
    }
  }

  const confirmCloseTab = () => {
    if (tabs.length === 1) {
      resetTab(tabToClose)
    } else {
      const newTabs = tabs.filter((t) => t.id !== tabToClose)
      setTabs(newTabs)

      if (activeTabId === tabToClose) {
        const currentIndex = tabs.findIndex((t) => t.id === tabToClose)
        const nextTab = newTabs[currentIndex] || newTabs[currentIndex - 1] || newTabs[0]
        setActiveTabId(nextTab.id)
      }
    }

    setIsConfirmCloseDialogOpen(false)
    setTabToClose("")
  }

  const resetTab = (tabId: string) => {
    setTabs(
      tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              cart: [],
              customer: {},
              subtotal: 0,
              discountPercentage: 0,
              discountAmount: 0,
              taxAmount: 0,
              total: 0,
              notes: "",
              hasUnsavedChanges: false,
            }
          : tab,
      ),
    )
  }

  const updateTab = (tabId: string, updates: Partial<BillTab>) => {
    setTabs(
      tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              ...updates,
              hasUnsavedChanges: true,
            }
          : tab,
      ),
    )
  }

  const getActiveTab = (): BillTab | undefined => {
    return tabs.find((tab) => tab.id === activeTabId)
  }

  const addToCart = (product: Product) => {
    const activeTab = getActiveTab()
    if (!activeTab) return

    if (product.stock <= 0) {
      alert("Product is out of stock")
      return
    }

    const existingItem = activeTab.cart.find((item) => item.productId === product.id)

    // Prefer selling price when available
    const unitPrice = Number((product as any).sellingPrice ?? (product as any).selling_price ?? product.price ?? 0)

    let newCart: CartItem[]
    if (existingItem) {
      if (existingItem.quantity >= product.stock) {
        alert(`Cannot add more. Maximum available: ${product.stock}`)
        return
      }
        newCart = activeTab.cart.map((item) =>
        item.productId === product.id
          ? {
              ...item,
              quantity: item.quantity + 1,
              total: (item.quantity + 1) * item.price,
            }
          : item,
      )
    } else {
      newCart = [
        ...activeTab.cart,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          price: unitPrice,
          total: unitPrice,
          barcodes: product.barcode ? [product.barcode] : [], // Convert single barcode to array
        },
      ]
    }

    // Calculate totals for the updated cart
    const subtotal = newCart.reduce((sum, item) => sum + item.total, 0)
    const discountAmount = (subtotal * activeTab.discountPercentage) / 100
    const taxableAmount = subtotal - discountAmount
    const taxAmount = (taxableAmount * activeTab.taxPercentage) / 100
    const total = taxableAmount + taxAmount

    updateTab(activeTabId, {
      cart: newCart,
      subtotal,
      discountAmount,
      taxAmount,
      total,
    })
  }

  const updateCartItemQuantity = (productId: string, quantity: number) => {
    const activeTab = getActiveTab()
    if (!activeTab) return

    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }

    const product = products.find((p) => p.id === productId)
    if (product && quantity > product.stock) {
      alert(`Cannot exceed available stock: ${product.stock}`)
      return
    }

    const newCart = activeTab.cart.map((item) =>
      item.productId === productId
        ? {
            ...item,
            quantity,
            total: quantity * item.price,
          }
        : item,
    )

    // Calculate totals for the updated cart
    const subtotal = newCart.reduce((sum, item) => sum + item.total, 0)
    const discountAmount = (subtotal * activeTab.discountPercentage) / 100
    const taxableAmount = subtotal - discountAmount
    const taxAmount = (taxableAmount * activeTab.taxPercentage) / 100
    const total = taxableAmount + taxAmount

    updateTab(activeTabId, {
      cart: newCart,
      subtotal,
      discountAmount,
      taxAmount,
      total,
    })
  }

  const removeFromCart = (productId: string) => {
    const activeTab = getActiveTab()
    if (!activeTab) return

    const newCart = activeTab.cart.filter((item) => item.productId !== productId)

    // Calculate totals for the updated cart
    const subtotal = newCart.reduce((sum, item) => sum + item.total, 0)
    const discountAmount = (subtotal * activeTab.discountPercentage) / 100
    const taxableAmount = subtotal - discountAmount
    const taxAmount = (taxableAmount * activeTab.taxPercentage) / 100
    const total = taxableAmount + taxAmount

    updateTab(activeTabId, {
      cart: newCart,
      subtotal,
      discountAmount,
      taxAmount,
      total,
    })
  }

  const updateDiscount = (percentage: number) => {
    const activeTab = getActiveTab()
    if (!activeTab) return

    const validPercentage = Math.max(0, Math.min(100, percentage))
    const discountAmount = (activeTab.subtotal * validPercentage) / 100
    const taxableAmount = activeTab.subtotal - discountAmount
    const taxAmount = (taxableAmount * activeTab.taxPercentage) / 100
    const total = taxableAmount + taxAmount

    updateTab(activeTabId, {
      discountPercentage: validPercentage,
      discountAmount,
      taxAmount,
      total,
    })
  }

  const updateTotal = (newTotal: number) => {
    const activeTab = getActiveTab()
    if (!activeTab || activeTab.subtotal === 0) return

    // Calculate what the discount should be based on the new total
    const expectedTotal = activeTab.subtotal + activeTab.taxAmount
    const discountAmount = Math.max(0, expectedTotal - newTotal)
    const discountPercentage = activeTab.subtotal > 0 ? (discountAmount / activeTab.subtotal) * 100 : 0

    updateTab(activeTabId, {
      total: newTotal,
      discountAmount,
      discountPercentage,
    })
  }

  const updateCustomer = (customer: Customer) => {
    const activeTab = getActiveTab()
    if (!activeTab) return

    updateTab(activeTabId, { customer })
    setIsCustomerDialogOpen(false)
  }

  const processPayment = async () => {
    const activeTab = getActiveTab()
    if (!activeTab || activeTab.cart.length === 0 || !selectedStore) return

    // Get the bill format for this store
    const formatName = storeFormats[selectedStore.id] || selectedBillFormat
    const format = billFormats[formatName] || billFormats.A4

    const bill = {
      id: `INV-${Date.now()}`,
      storeId: selectedStore.id,
      storeName: selectedStore.name,
      storeAddress: selectedStore.address,
      storePhone: selectedStore.phone,
      customerName: activeTab.customer.name || "",
      customerPhone: activeTab.customer.phone || "",
      customerEmail: activeTab.customer.email || "",
      customerAddress: activeTab.customer.address || "",
      items: activeTab.cart,
      subtotal: activeTab.subtotal,
      taxPercentage: activeTab.taxPercentage,
      taxAmount: activeTab.taxAmount,
      discountPercentage: activeTab.discountPercentage,
      discountAmount: activeTab.discountAmount,
      total: activeTab.total,
      paymentMethod: activeTab.paymentMethod,
      timestamp: new Date().toISOString(),
      notes: activeTab.notes,
      gstin: systemSettings.gstin,
      companyName: systemSettings.companyName,
      companyAddress: systemSettings.companyAddress,
      companyPhone: systemSettings.companyPhone,
      companyEmail: systemSettings.companyEmail,
      billFormat: formatName,
      createdBy: currentUser?.id || "Unknown",
    }

    // Save to json file via api
    try {
      await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bill),
      })
    } catch (error) {
      console.error("Failed to save bill:", error)
      // Handle error appropriately
    }

    // Update stock
    for (const item of activeTab.cart) {
      const product = products.find((p) => p.id === item.productId)
      if (product) {
        const newStock = product.stock - item.quantity
        try {
          await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + `/api/products/${item.productId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stock: newStock }),
          })
        } catch (error) {
          console.error(`Failed to update stock for product ${item.productId}:`, error)
        }
      }
    }

    // Generate receipt HTML
    const receiptHtml = generateReceiptHtml(bill, format);

    // Print receipt using unifiedPrint
    try {
      await unifiedPrint({ htmlContent: receiptHtml });
    } catch (printError) {
      console.error("Failed to send print job:", printError);
      // Handle print error (e.g., show a toast)
    }

    // Reset the tab
    resetTab(activeTabId);
    setIsPaymentDialogOpen(false);
  };

  const generateReceiptHtml = (bill: any, format: BillFormat): string => {
    const isLetter = format.width === 216 && format.height === 279;
    const isA4 = format.width === 210 && format.height === 297;
    const isThermal = format.width <= 80;
    const maxWidth = isThermal ? "80mm" : isLetter ? "216mm" : isA4 ? "210mm" : `${format.width}mm`;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${bill.id}</title>
          <style>
            @page {
              size: ${isLetter ? "letter" : isA4 ? "A4" : `${format.width}mm ${format.height === "auto" ? "auto" : `${format.height}mm`}`};
              margin: ${format.margins.top}mm ${format.margins.right}mm ${format.margins.bottom}mm ${format.margins.left}mm;
            }
            body {
              font-family: 'Arial', sans-serif;
              max-width: ${maxWidth};
              margin: 0 auto;
              font-size: 13px;
              color: #000;
            }
            .header, .footer {
              text-align: center;
              padding: 10px 0;
            }
            .company-name {
              font-size: 18px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .invoice-title {
              font-size: 16px;
              font-weight: bold;
              margin-top: 10px;
            }
            .section {
              margin: 20px 0;
            }
            .section-title {
              font-weight: bold;
              border-bottom: 1px solid #ccc;
              margin-bottom: 5px;
            }
            .row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 6px;
            }
            .items-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }
            .items-table th, .items-table td {
              border: 1px solid #ccc;
              padding: 6px 8px;
              text-align: left;
            }
            .items-table th {
              background-color: #f2f2f2;
            }
            .totals {
              margin-top: 10px;
              width: 100%;
            }
            .totals td {
              padding: 6px;
            }
            .totals .label {
              text-align: right;
              font-weight: bold;
            }
            .totals .value {
              text-align: right;
              width: 100px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">${bill.companyName}</div>
            <div>${bill.companyAddress}</div>
            <div>Phone: ${bill.companyPhone}</div>
            <div>Email: ${bill.companyEmail}</div>
            <div class="invoice-title">INVOICE</div>
          </div>

          <div class="section">
            <div class="row">
              <div><strong>Invoice ID:</strong> ${bill.id}</div>
              <div><strong>Date:</strong> ${new Date(bill.timestamp).toLocaleString()}</div>
            </div>
            ${bill.gstin ? `<div><strong>GSTIN:</strong> ${bill.gstin}</div>` : ""}
          </div>

          ${
            bill.customerName || bill.customerPhone
              ? `
          <div class="section">
            <div class="section-title">Customer Details</div>
            ${bill.customerName ? `<div>Name: ${bill.customerName}</div>` : ""}
            ${bill.customerPhone ? `<div>Phone: ${bill.customerPhone}</div>` : ""}
            ${bill.customerEmail ? `<div>Email: ${bill.customerEmail}</div>` : ""}
            ${bill.customerAddress ? `<div>Address: ${bill.customerAddress}</div>` : ""}
          </div>`
              : ""
          }

          <div class="section">
            <table class="items-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${bill.items
                  .map(
                    (item: any, i: number) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${item.productName}</td>
                    <td>${item.quantity}</td>
                    <td>₹${item.price.toFixed(2)}</td>
                    <td>₹${item.total.toFixed(2)}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>

          <div class="section">
            <table class="totals">
              <tr>
                <td class="label">Subtotal:</td>
                <td class="value">₹${bill.subtotal.toFixed(2)}</td>
              </tr>
              ${
                bill.discountAmount > 0
                  ? `<tr>
                      <td class="label">Discount (${bill.discountPercentage.toFixed(1)}%):</td>
                      <td class="value">-₹${bill.discountAmount.toFixed(2)}</td>
                    </tr>`
                  : ""
              }
              <tr>
                <td class="label">Tax (${bill.taxPercentage}%):</td>
                <td class="value">₹${bill.taxAmount.toFixed(2)}</td>
              </tr>
              <tr>
                <td class="label">Total:</td>
                <td class="value"><strong>₹${bill.total.toFixed(2)}</strong></td>
              </tr>
              <tr>
                <td class="label">Payment:</td>
                <td class="value">${bill.paymentMethod.toUpperCase()}</td>
              </tr>
            </table>
          </div>

          ${
            bill.notes
              ? `<div class="section">
                  <div class="section-title">Notes</div>
                  <div>${bill.notes}</div>
                </div>`
              : ""
          }

          <div class="footer">
            <p>Thank you for your business!</p>
          </div>
        </body>
      </html>
    `;
  };


  const activeTab = getActiveTab()

  const recentBills = useMemo(() => bills.slice(0, 10), [bills]);

  return (
    <BillingLayout>
      <div className="h-full flex flex-col">
        {/* Browser-style Tabs */}
        <div className="flex items-center bg-gray-100 border-b border-gray-200 px-2 py-1">
          <div className="flex items-center space-x-1 flex-1 overflow-x-auto">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`
                  relative flex items-center px-4 py-2 min-w-0 max-w-48 cursor-pointer group
                  ${
                    activeTabId === tab.id
                      ? "bg-white border-t-2 border-blue-500 text-blue-600"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  }
                  rounded-t-lg border-l border-r border-gray-300 mr-1
                  transition-all duration-200
                `}
                style={{
                  clipPath:
                    activeTabId === tab.id
                      ? "polygon(8px 100%, 0 0, calc(100% - 8px) 0, 100% 100%)"
                      : "polygon(4px 100%, 0 0, calc(100% - 4px) 0, 100% 100%)",
                }}
                onClick={() => setActiveTabId(tab.id)}
              >
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <FileText className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate text-sm font-medium">{tab.name}</span>
                  {tab.cart.length > 0 && (
                    <Badge variant="secondary" className="h-5 text-xs">
                      {tab.cart.length}
                    </Badge>
                  )}
                  {tab.hasUnsavedChanges && (
                    <div className="h-2 w-2 bg-orange-500 rounded-full flex-shrink-0" title="Unsaved changes" />
                  )}
                </div>
                {tabs.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 ml-2 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={createNewTab}
            className="ml-2 h-8 w-8 p-0 bg-gray-200 hover:bg-gray-300 rounded-full"
            title="New Tab"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Tab Content */}
        {activeTab && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel - Products */}
            <div className="w-1/2 border-r border-gray-200 flex flex-col">
              <div className="p-4 border-b border-gray-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search products by name or barcode..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-2">
                  {filteredProducts.map((product) => (
                    <Card
                      key={product.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => addToCart(product)}
                    >
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="font-medium text-sm">{product.name}</h3>
                            {(() => {
                              const barcode = getBarcode(product);
                              return barcode ? (
                                <p className="text-xs text-gray-500 mt-1">Barcode: {barcode}</p>
                              ) : null;
                            })()}
                          </div>
                                  <div className="text-right">
                                    {/* Show selling price (support both camelCase and snake_case) */}
                                    {((product as any).sellingPrice ?? (product as any).selling_price) != null ? (
                                      <p className="font-bold text-green-600">
                                        Selling: ₹${Number((product as any).sellingPrice ?? (product as any).selling_price).toFixed(2)}
                                      </p>
                                    ) : (
                                      <p className="font-bold text-green-600">₹${Number(product.price ?? 0).toFixed(2)}</p>
                                    )}

                                    {/* Show regular price if different or available */}
                                    {product.price != null && Number(product.price) !== Number((product as any).sellingPrice ?? (product as any).selling_price) && (
                                      <p className="text-sm text-gray-500">Price: ₹${Number(product.price).toFixed(2)}</p>
                                    )}

                                    <p className="text-xs text-gray-500">Stock: ${product.stock}</p>
                                  </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {filteredProducts.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No products found</p>
                      <p className="text-sm">Try adjusting your search terms</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right Panel - Cart & Billing */}
            <div className="w-1/2 flex flex-col">
              {/* Cart Header */}
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold flex items-center">
                    <ShoppingCart className="h-5 w-5 mr-2" />
                    ${activeTab.name}
                  </h2>
                  <div className="flex items-center space-x-2">
                    {activeTab && selectedStore && billFormats && (
                      <PrintButton
                        htmlContent={generateReceiptHtml(
                          {
                            id: `INV-${Date.now()}`, // Placeholder ID for preview printing
                            storeId: selectedStore.id,
                            storeName: selectedStore.name,
                            storeAddress: selectedStore.address,
                            storePhone: selectedStore.phone,
                            customerName: activeTab.customer.name || "",
                            customerPhone: activeTab.customer.phone || "",
                            customerEmail: activeTab.customer.email || "",
                            customerAddress: activeTab.customer.address || "",
                            items: activeTab.cart,
                            subtotal: activeTab.subtotal,
                            taxPercentage: activeTab.taxPercentage,
                            taxAmount: activeTab.taxAmount,
                            discountPercentage: activeTab.discountPercentage,
                            discountAmount: activeTab.discountAmount,
                            total: activeTab.total,
                            paymentMethod: activeTab.paymentMethod,
                            timestamp: new Date().toISOString(),
                            notes: activeTab.notes,
                            gstin: systemSettings.gstin,
                            companyName: systemSettings.companyName,
                            companyAddress: systemSettings.companyAddress,
                            companyPhone: systemSettings.companyPhone,
                            companyEmail: systemSettings.companyEmail,
                            billFormat: selectedBillFormat,
                            createdBy: currentUser?.id || "Unknown",
                          },
                          billFormats[storeFormats[selectedStore.id] || selectedBillFormat] || billFormats.A4,
                        )}
                        isThermalPrinter={
                          (billFormats[storeFormats[selectedStore.id] || selectedBillFormat] || billFormats.A4)
                            .width <= 80
                        }
                      />
                    )}
                    <Button variant="outline" size="sm" onClick={() => setIsCustomerDialogOpen(true)}>
                      <User className="h-4 w-4 mr-1" />
                      Customer
                    </Button>
                    {activeTab.cart.length > 0 && (
                      <Button size="sm" onClick={() => setIsPaymentDialogOpen(true)}>
                        <Receipt className="h-4 w-4 mr-1" />
                        Checkout
                      </Button>
                    )}
                  </div>
                </div>
                {/* Customer Info */}
                {(activeTab.customer.name || activeTab.customer.phone) && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center space-x-2 text-sm">
                      <User className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">${activeTab.customer.name || "Customer"}</span>
                      {activeTab.customer.phone && (
                        <>
                          <Phone className="h-3 w-3 text-gray-500" />
                          <span className="text-gray-600">${activeTab.customer.phone}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Cart Items */}
              <ScrollArea className="flex-1">
                <div className="p-4">
                  {activeTab.cart.length > 0 ? (
                    <div className="space-y-3">
                      {activeTab.cart.map((item) => (
                        <Card key={item.productId}>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <h4 className="font-medium text-sm">${item.productName}</h4>
                                <p className="text-xs text-gray-600">₹${item.price.toFixed(2)} each</p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => updateCartItemQuantity(item.productId, item.quantity - 1)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="w-8 text-center text-sm font-medium">${item.quantity}</span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => updateCartItemQuantity(item.productId, item.quantity + 1)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removeFromCart(item.productId)}
                                  className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex justify-between items-center mt-2">
                              <span className="text-sm text-gray-600">Total:</span>
                              <span className="font-bold">₹${item.total.toFixed(2)}</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Cart is empty</p>
                      <p className="text-sm">Add products from the left panel</p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Cart Summary */}
              {activeTab.cart.length > 0 ? (
                <div className="p-4 border-t border-gray-200 bg-gray-50">
                  <div className="space-y-3">
                    {/* Discount */}
                    <div className="flex items-center space-x-2">
                      <Label className="text-sm">Discount %:</Label>
                      <Input
                        type="number"
                        value={activeTab.discountPercentage}
                        onChange={(e) => updateDiscount(Number(e.target.value))}
                        className="w-20 h-8"
                        min="0"
                        max="100"
                      />
                      <span className="text-sm text-gray-600">(-₹${activeTab.discountAmount.toFixed(2)})</span>
                    </div>

                    {/* Totals */}
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>₹${activeTab.subtotal.toFixed(2)}</span>
                      </div>
                      {activeTab.discountAmount > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>Discount:</span>
                          <span>-₹${activeTab.discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Tax (${activeTab.taxPercentage}%):</span>
                        <span>₹${activeTab.taxAmount.toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total:</span>
                        <div className="flex items-center space-x-2">
                          <span>₹</span>
                          <Input
                            type="number"
                            value={activeTab.total.toFixed(2)}
                            onChange={(e) => updateTotal(Number(e.target.value))}
                            className="w-24 h-8 text-right font-bold"
                            step="0.01"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <Label className="text-sm">Notes:</Label>
                      <Textarea
                        value={activeTab.notes}
                        onChange={(e) => updateTab(activeTabId, { notes: e.target.value })}
                        placeholder="Add notes for this bill..."
                        className="mt-1 h-16 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 flex flex-col h-full">
                  <h3 className="font-semibold mb-2">Recent Bills</h3>
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="space-y-2">
                      {recentBills.map((bill) => (
                        <Card key={bill.id}>
                          <CardContent className="p-3 text-sm">
                            <div className="flex justify-between">
                              <span className="font-medium">${bill.id}</span>
                              <span className="font-bold">₹${bill.total.toFixed(2)}</span>
                            </div>
                            <div className="text-xs text-gray-600">
                              ${new Date(bill.timestamp).toLocaleString()}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Customer Dialog */}
        <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <User className="h-5 w-5 mr-2" />
                Customer Information
              </DialogTitle>
              <DialogDescription>Add customer details for this bill</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="customerName">Name</Label>
                <Input id="customerName" defaultValue={activeTab?.customer.name || ""} placeholder="Customer name" />
              </div>
              <div>
                <Label htmlFor="customerPhone">Phone</Label>
                <Input id="customerPhone" defaultValue={activeTab?.customer.phone || ""} placeholder="Phone number" />
              </div>
              <div>
                <Label htmlFor="customerEmail">Email</Label>
                <Input id="customerEmail" defaultValue={activeTab?.customer.email || ""} placeholder="Email address" />
              </div>
              <div>
                <Label htmlFor="customerAddress">Address</Label>
                <Textarea
                  id="customerAddress"
                  defaultValue={activeTab?.customer.address || ""}
                  placeholder="Customer address"
                  className="h-20"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCustomerDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const name = (document.getElementById("customerName") as HTMLInputElement)?.value
                  const phone = (document.getElementById("customerPhone") as HTMLInputElement)?.value
                  const email = (document.getElementById("customerEmail") as HTMLInputElement)?.value
                  const address = (document.getElementById("customerAddress") as HTMLTextAreaElement)?.value
                  updateCustomer({ name, phone, email, address })
                }}
              >
                Save Customer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payment Dialog */}
        <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <CreditCard className="h-5 w-5 mr-2" />
                Process Payment
              </DialogTitle>
              <DialogDescription>Complete the transaction and select bill format</DialogDescription>
            </DialogHeader>
            {activeTab && (
              <div className="space-y-4">
                {/* Bill Format Selection */}
                <div>
                  <Label className="text-sm font-medium">Bill Format</Label>
                  <Select value={selectedBillFormat} onValueChange={setSelectedBillFormat}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(billFormats).map(([formatName, format]) => (
                        <SelectItem key={formatName} value={formatName}>
                          {formatName.replace("_", " ")} (${format.width}×
                          ${format.height === "auto" ? "Auto" : format.height}mm)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Bill Summary */}
                <Card>
                  <CardContent className="p-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Items:</span>
                        <span>
                          ${activeTab.cart.length} (${activeTab.cart.reduce((sum, item) => sum + item.quantity, 0)} qty)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>₹${activeTab.subtotal.toFixed(2)}</span>
                      </div>
                      {activeTab.discountAmount > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>Discount (${activeTab.discountPercentage.toFixed(1)}%):</span>
                          <span>-₹${activeTab.discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Tax (${activeTab.taxPercentage}%):</span>
                        <span>₹${activeTab.taxAmount.toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total:</span>
                        <span>₹${activeTab.total.toFixed(2)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Payment Method */}
                <div>
                  <Label className="text-sm font-medium">Payment Method</Label>
                  <Select
                    value={activeTab.paymentMethod}
                    onValueChange={(value) => updateTab(activeTabId, { paymentMethod: value })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">
                        <div className="flex items-center">
                          <Banknote className="h-4 w-4 mr-2" />
                          Cash
                        </div>
                      </SelectItem>
                      <SelectItem value="card">
                        <div className="flex items-center">
                          <CreditCard className="h-4 w-4 mr-2" />
                          Card
                        </div>
                      </SelectItem>
                      <SelectItem value="upi">
                        <div className="flex items-center">
                          <Smartphone className="h-4 w-4 mr-2" />
                          UPI
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Store Info */}
                {selectedStore && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="text-sm">
                        <div className="font-medium">Store: ${selectedStore.name}</div>
                        <div className="text-gray-600 mt-1">${selectedStore.address}</div>
                        {selectedStore.phone && <div className="text-gray-600">Phone: ${selectedStore.phone}</div>}
                        <div className="text-gray-600">GSTIN: ${systemSettings.gstin}</div>
                        <div className="text-gray-600">Tax Rate: ${systemSettings.taxPercentage}%</div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Customer Info */}
                {(activeTab.customer.name || activeTab.customer.phone) && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="text-sm">
                        <div className="font-medium flex items-center">
                          <User className="h-4 w-4 mr-2" />
                          Customer Details
                        </div>
                        <div className="mt-2 space-y-1 text-gray-600">
                          {activeTab.customer.name && <div>Name: ${activeTab.customer.name}</div>}
                          {activeTab.customer.phone && <div>Phone: ${activeTab.customer.phone}</div>}
                          {activeTab.customer.email && <div>Email: ${activeTab.customer.email}</div>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={processPayment} className="bg-green-600 hover:bg-green-700">
                <Receipt className="h-4 w-4 mr-2" />
                Complete Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm Close Tab Dialog */}
        <Dialog open={isConfirmCloseDialogOpen} onOpenChange={setIsConfirmCloseDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <AlertCircle className="h-5 w-5 mr-2 text-orange-500" />
                Unsaved Changes
              </DialogTitle>
              <DialogDescription>This tab has unsaved changes. Are you sure you want to close it?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsConfirmCloseDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmCloseTab}>
                Close Tab
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BillingLayout>
  )
}
