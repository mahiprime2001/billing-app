"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import OfflineBanner from "@/components/OfflineBanner" // Import OfflineBanner
import { Button } from "@/components/ui/button"
import usePolling from "@/hooks/usePolling"
import api from "@/app/utils/api"
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
import { Plus, Receipt, Trash2, Eye, Search, Percent, Printer } from "lucide-react" // Added Printer icon
import { Separator } from "@/components/ui/separator"
import { Upload } from "lucide-react" // Import Upload icon
import { unifiedPrint } from "@/app/utils/printUtils"; // Import unifiedPrint
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs" // Import Tabs components

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

interface SystemSettings {
  gstin: string
  taxPercentage: number
  companyName: string
  companyAddress: string
  companyPhone: string
  companyEmail: string
}

interface Product {
  id: string
  name: string
  price: number
  barcode: string
  stock: number // Added stock to the Product interface
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
  customerAddress?: string // Added customerAddress
  items: BillItem[]
  subtotal: number
  tax: number // This 'tax' property seems to be the calculated tax amount.
             // In generateReceiptHtml, we use bill.tax.toFixed(1)%,
             // which implies it's a percentage. Let's clarify.
             // Based on the 'createBill' function, 'tax' is `subtotal * 0.1` so it's an amount.
             // I'll adjust generateReceiptHtml to use bill.tax and systemSettings.taxPercentage
  discountPercentage: number
  discountAmount: number
  total: number
  date: string
  status: string
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  gstin?: string
  billFormat?: string
  storeName?: string
  storeAddress?: string
  storePhone?: string
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  totalBills?: number;
  totalSpent?: number;
}

export default function BillingPage() {
  const router = useRouter()
  const [isOnline, setIsOnline] = useState(true); // State to track online status
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const [billSearchTerm, setBillSearchTerm] = useState("") // Renamed for clarity
  const [customerSearchTerm, setCustomerSearchTerm] = useState("") // New search term for customers
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false) // State for import dialog
  const [importFile, setImportFile] = useState<File | null>(null) // State for the selected import file
  const [isCustomerViewDialogOpen, setIsCustomerViewDialogOpen] = useState(false); // New state for customer view dialog
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null); // New state for selected customer

  // Form state
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [billItems, setBillItems] = useState<BillItem[]>([])
  const [selectedProductId, setSelectedProductId] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [discountPercentage, setDiscountPercentage] = useState(0)
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    gstin: "",
    taxPercentage: 0,
    companyName: "",
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
  });
  const [billFormats, setBillFormats] = useState<Record<string, BillFormat>>({});
  const [selectedBillFormat, setSelectedBillFormat] = useState("A4"); // Default format

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("adminLoggedIn", "true")
    }

    // Load system settings and bill formats
    fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.systemSettings) setSystemSettings(data.systemSettings);
        if (data.billFormats) setBillFormats(data.billFormats);
      })
      .catch((error) => console.error("Failed to load system settings and bill formats:", error));

    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    if (isLoggedIn !== "true") {
      router.push("/")
      return
    }

    // Set initial online status
    setIsOnline(navigator.onLine);

    // Add event listeners for online/offline
    window.addEventListener("online", () => setIsOnline(true));
    window.addEventListener("offline", () => setIsOnline(false));

    return () => {
      window.removeEventListener("online", () => setIsOnline(true));
      window.removeEventListener("offline", () => setIsOnline(false));
    };
  }, [router]);

  const fetchData = useCallback(async (
    supabaseEndpoint: string,
    localStorageEndpoint: string,
    updateLocalStorageEndpoint: string,
    dataType: string
  ) => {
    if (isOnline) {
      try {
        const supabaseResponse = await api.get(supabaseEndpoint);
        const data = supabaseResponse.data;

        // Custom mapping for bills
        let processedData = data;
        if (dataType === 'bills') {
          processedData = data.map((bill: any) => ({
            ...bill,
            date: bill.timestamp,
            tax: bill.taxAmount,
            status: bill.status || "Paid",
            items: bill.items ? JSON.parse(bill.items) : [], // Parse items if it's a JSON string
          }));
        } else if (dataType === 'products') {
          processedData = data.map((product: any) => ({
            ...product,
            stock: product.stock || 0,
          }));
        }
        
        // Update local JSON with fresh Supabase data
        await api.post(updateLocalStorageEndpoint, processedData);
        return processedData;
      } catch (error) {
        console.warn(`Failed to fetch ${dataType} from Supabase, falling back to local:`, error);
      }
    }
    // Fallback to local JSON if offline or Supabase fetch failed
    const localResponse = await api.get(localStorageEndpoint);
    
    // Custom mapping for bills from local storage
    if (dataType === 'bills') {
      return localResponse.data.map((bill: any) => ({
        ...bill,
        date: bill.timestamp,
        tax: bill.taxAmount,
        status: bill.status || "Paid",
        items: bill.items ? JSON.parse(bill.items) : [], // Parse items if it's a JSON string
      }));
    } else if (dataType === 'products') {
      return localResponse.data.map((product: any) => ({
        ...product,
        stock: product.stock || 0,
      }));
    }
    return localResponse.data;
  }, [isOnline]);

  const fetchProducts = useCallback(() => fetchData(
    "/api/supabase/products",
    "/api/local/products",
    "/api/local/products/update",
    "products"
  ), [fetchData]);

  const fetchBills = useCallback(async () => {
    if (isOnline) {
      try {
        const response = await api.get('/api/supabase/bills-with-details');
        const data = response.data;
        
        // Map to match your Bill interface
        const processedData = data.map((bill: any) => ({
          ...bill,
          date: bill.timestamp,
          tax: bill.taxAmount,
          status: bill.status || 'Paid',
        }));
        
        // Update local storage
        await api.post('/api/local/bills/update', processedData);
        return processedData;
      } catch (error) {
        console.warn('Failed to fetch bills from Supabase, falling back to local', error);
      }
    }
    
    // Fallback to local
    const localResponse = await api.get('/api/local/bills');
    return localResponse.data.map((bill: any) => ({
      ...bill,
      date: bill.timestamp,
      tax: bill.taxAmount,
      status: bill.status || 'Paid',
    }));
  }, [isOnline]);

  const fetchCustomers = useCallback(() => fetchData(
    "/api/supabase/customers",
    "/api/local/customers",
    "/api/local/customers/update",
    "customers"
  ), [fetchData]);


  const { data: productsData, loading: productsLoading, error: productsError } = usePolling<Product[]>(fetchProducts, { interval: 5000 });
  const { data: billsData, loading: billsLoading, error: billsError, refetch: refetchBills } = usePolling<Bill[]>(fetchBills, { interval: 5000 });
  const { data: customersData, loading: customersLoading, error: customersError } = usePolling<Customer[]>(fetchCustomers, { interval: 5000 });


  // Handle loading and error states (optional, but good practice)
  useEffect(() => {
    if (productsError) console.error("Failed to load products:", productsError);
    if (billsError) console.error("Failed to load bills:", billsError);
    if (customersError) console.error("Failed to load customers:", customersError);
  }, [productsError, billsError, customersError]);

  // Ensure products and bills are initialized as empty arrays if polling hasn't returned data yet
  const currentProducts = productsData || [];
  const currentBills = billsData || [];
  const currentCustomers = customersData || [];

  const addItemToBill = () => {
    if (!selectedProductId) return

    const product = currentProducts.find((p) => p.id === selectedProductId)
    if (!product) return

    const price = product.price !== undefined && product.price !== null ? product.price : 0; // Ensure price is a number
    const availableStock = product.stock !== undefined && product.stock !== null ? product.stock : Infinity; // Use Infinity if stock is not tracked

    const existingItemIndex = billItems.findIndex((item) => item.productId === selectedProductId)

    let newQuantity = quantity;
    if (existingItemIndex >= 0) {
      newQuantity = billItems[existingItemIndex].quantity + quantity;
    }

    if (newQuantity > availableStock) {
      alert(`Cannot add ${quantity} more units of ${product.name}. Only ${availableStock - (existingItemIndex >= 0 ? billItems[existingItemIndex].quantity : 0)} units available.`);
      return;
    }

    if (existingItemIndex >= 0) {
      const updatedItems = [...billItems]
      updatedItems[existingItemIndex].quantity = newQuantity;
      updatedItems[existingItemIndex].total = updatedItems[existingItemIndex].quantity * price
      setBillItems(updatedItems)
    } else {
      const newItem: BillItem = {
        productId: product.id,
        productName: product.name,
        price: price,
        quantity: quantity,
        total: price * quantity,
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

  const createBill = async () => {
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
      companyName: systemSettings.companyName,
      companyAddress: systemSettings.companyAddress,
      companyPhone: systemSettings.companyPhone,
      companyEmail: systemSettings.companyEmail,
      gstin: systemSettings.gstin,
      billFormat: selectedBillFormat,
      // storeName, storeAddress, storePhone are not available in this context,
      // they would typically come from the selected store during checkout in billing/page.tsx
    }

    try {
      const response = await api.post("/api/bills", newBill);

      if (!response.status.toString().startsWith('2')) {
        throw new Error("Failed to create bill");
      }

      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setBillItems([]);
      setDiscountPercentage(0);
      setIsCreateDialogOpen(false);
      refetchBills(); // Refetch bills to update the local state and trigger potential sync
    } catch (error) {
      console.error("Error creating bill:", error);
      alert("Failed to create bill.");
    }
  };

  const deleteBill = async (id: string) => {
    try {
      const response = await api.delete(`/api/bills/${id}`);

      if (!response.status.toString().startsWith('2')) {
        throw new Error("Failed to delete bill");
      }
      refetchBills(); // Refetch bills to update the local state
    } catch (error) {
      console.error("Error deleting bill:", error);
    }
  };

  const viewBill = (bill: Bill) => {
    setSelectedBill(bill)
    setIsViewDialogOpen(true)
  }

  const viewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsCustomerViewDialogOpen(true);
  };

  // Generate receipt HTML
  const generateReceiptHtml = (bill: Bill, format: BillFormat): string => {
    const isLetter = format.width === 216 && format.height === 279;
    const isA4 = format.width === 210 && format.height === 297;
    const isThermal = format.width <= 80;
    const maxWidth = isThermal ? "80mm" : isLetter ? "216mm" : isA4 ? "210mm" : `${format.width}mm`;

    // Use bill's own company info if available, otherwise fallback to system settings
    const companyName = bill.companyName || systemSettings.companyName;
    const companyAddress = bill.companyAddress || systemSettings.companyAddress;
    const companyPhone = bill.companyPhone || systemSettings.companyPhone;
    const companyEmail = bill.companyEmail || systemSettings.companyEmail;
    const gstin = bill.gstin || systemSettings.gstin;

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
            <div class="company-name">${companyName}</div>
            <div>${companyAddress}</div>
            <div>Phone: ${companyPhone}</div>
            <div>Email: ${companyEmail}</div>
            <div class="invoice-title">INVOICE</div>
          </div>

          <div class="section">
            <div class="row">
              <div><strong>Invoice ID:</strong> ${bill.id}</div>
              <div><strong>Date:</strong> ${new Date(bill.date).toLocaleString()}</div>
            </div>
            ${gstin ? `<div><strong>GSTIN:</strong> ${gstin}</div>` : ""}
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
                <td class="label">Tax (${systemSettings.taxPercentage}%):</td>
                <td class="value">₹${bill.tax.toFixed(2)}</td>
              </tr>
              <tr>
                <td class="label">Total:</td>
                <td class="value"><strong>₹${bill.total.toFixed(2)}</strong></td>
              </tr>
            </table>
          </div>

          <div class="footer">
            <p>Thank you for your business!</p>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintBill = async (billToPrint: Bill) => {
    const formatName = billToPrint.billFormat || selectedBillFormat;
    const format = billFormats[formatName] || billFormats.A4; // Fallback to A4 if format not found

    const receiptHtml = generateReceiptHtml(billToPrint, format);

    try {
      await unifiedPrint({ htmlContent: receiptHtml });
    } catch (printError) {
      console.error("Failed to send print job:", printError);
      alert("Failed to print bill. Please check console for details.");
    }
  };

  const filteredBills = currentBills.filter((bill) => {
    const customerName = bill.customerName || ""
    const billId = bill.id || ""
    const searchLower = billSearchTerm.toLowerCase()

    return customerName.toLowerCase().includes(searchLower) || billId.includes(searchLower)
  })

  const filteredCustomers = currentCustomers.filter((customer) => {
    const customerName = customer.name || "";
    const customerEmail = customer.email || "";
    const customerPhone = customer.phone || "";
    const searchLower = customerSearchTerm.toLowerCase();

    return customerName.toLowerCase().includes(searchLower) ||
           customerEmail.toLowerCase().includes(searchLower) ||
           customerPhone.toLowerCase().includes(searchLower);
  });

  const { subtotal, tax, discountAmount, total } = calculateTotals()

  // Quick discount preset buttons
  const discountPresets = [5, 10, 15, 20, 25]

  const handleImportBills = async () => {
    if (!importFile) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedBills = JSON.parse(e.target?.result as string);
        // Send to API for processing
        const response = await api.post("/api/bills/import", importedBills);

        if (!response.status.toString().startsWith('2')) {
          throw new Error("Failed to import bills");
        }
        console.log("Bills imported successfully");
        setIsImportDialogOpen(false);
        setImportFile(null);
      } catch (error) {
        console.error("Error parsing or importing bills:", error);
      }
    };
    reader.readAsText(importFile);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {!isOnline && <OfflineBanner />} {/* Display offline banner */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Billing System</h1>
            <p className="text-muted-foreground">Create and manage bills with discount adjustments</p>
            {(productsLoading || billsLoading || customersLoading) && <p className="text-sm text-blue-500">Loading data...</p>}
            {(productsError || billsError || customersError) && <p className="text-sm text-red-500">Error loading data.</p>}
          </div>
          <div className="flex space-x-2">
            {/* Import Bills Dialog */}
            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!isOnline}> {/* Disable import when offline */}
                  <Upload className="h-4 w-4 mr-2" />
                  Import Bills
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Bills from JSON</DialogTitle>
                  <DialogDescription>Upload a JSON file containing bill data.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Input
                    id="billFile"
                    type="file"
                    accept=".json"
                    onChange={(e) => setImportFile(e.target.files ? e.target.files[0] : null)}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => handleImportBills()} disabled={!importFile}>
                    Import
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Create Bill Dialog */}
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
                            {currentProducts.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name} - ₹{product.price ? product.price.toFixed(2) : '0.00'} (Stock: {product.stock})
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

                      {/* Discount and Total Section */}
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

                        {/* Total (Non-editable) */}
                        <div className="flex justify-between items-center text-xl font-bold">
                          <span>Total:</span>
                          <span>₹{total.toFixed(2)}</span>
                        </div>

                        {discountPercentage > 0 && (
                          <div className="text-center">
                            <p className="text-sm text-green-600 font-medium">
                              Customer saves ₹{discountAmount.toFixed(2)} ({discountPercentage.toFixed(1)}% discount)
                            </p>
                          </div>
                        )}
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
        </div>

        <Tabs defaultValue="bills" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bills">Bills History</TabsTrigger>
            <TabsTrigger value="customers">Customers Info</TabsTrigger>
          </TabsList>
          <TabsContent value="bills">
            <Card>
              <CardHeader>
                <CardTitle>Bills History</CardTitle>
                <CardDescription>{currentBills.length} bills created</CardDescription>
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search bills..."
                    value={billSearchTerm}
                    onChange={(e) => setBillSearchTerm(e.target.value)}
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
                              <div className="font-medium">{bill.customerName || "Walk-in Customer"}</div>
                              {bill.customerEmail && (
                                <div className="text-sm text-muted-foreground">{bill.customerEmail}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{new Date(bill.date).toLocaleDateString()}</TableCell>
                          <TableCell>{bill.items?.length || 0} items</TableCell>
                          <TableCell>
                            {bill.discountAmount > 0 ? (
                              <div className="text-sm">
                                <div className="text-red-600 font-medium">-{bill.discountPercentage.toFixed(1)}%</div>
                                <div className="text-xs text-red-600">-₹{bill.discountAmount.toFixed(2)}</div>
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
                              <Button variant="outline" size="sm" onClick={() => handlePrintBill(bill)}>
                                <Printer className="h-4 w-4" />
                              </Button>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Are you sure?</DialogTitle>
                                    <DialogDescription>
                                      This action cannot be undone. This will permanently delete the bill ({bill.id}).
                                    </DialogDescription>
                                  </DialogHeader>
                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => (document.querySelector('[data-state="open"]') as HTMLElement)?.click()}>
                                      Cancel
                                    </Button>
                                    <Button variant="destructive" onClick={() => deleteBill(bill.id)}>
                                      Delete
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
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
                      {billSearchTerm ? "Try adjusting your search terms" : "Create your first bill to get started"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="customers">
            <Card>
              <CardHeader>
                <CardTitle>Customers Information</CardTitle>
                <CardDescription>{currentCustomers.length} registered customers</CardDescription>
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search customers..."
                    value={customerSearchTerm}
                    onChange={(e) => setCustomerSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {filteredCustomers.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Total Bills</TableHead>
                        <TableHead>Total Spent</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.map((customer) => {
                        const customerBills = currentBills.filter(bill => bill.customerEmail === customer.email || bill.customerPhone === customer.phone);
                        const totalSpent = customerBills.reduce((sum, bill) => sum + bill.total, 0);

                        return (
                          <TableRow key={customer.id}>
                            <TableCell className="font-medium">{customer.name}</TableCell>
                            <TableCell>{customer.email || "N/A"}</TableCell>
                            <TableCell>{customer.phone || "N/A"}</TableCell>
                            <TableCell>{customer.address || "N/A"}</TableCell>
                            <TableCell>{customerBills.length}</TableCell>
                            <TableCell>₹{totalSpent.toFixed(2)}</TableCell>
                            <TableCell>
                              <Button variant="outline" size="sm" onClick={() => viewCustomer(customer)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <h3 className="text-lg font-medium">No customers found</h3>
                    <p className="text-muted-foreground">
                      {customerSearchTerm ? "Try adjusting your search terms" : "Customers will appear here once they have bills"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

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
                      <div>{selectedBill.customerName || "Walk-in Customer"}</div>
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
                      {selectedBill.items?.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell>₹{item.price.toFixed(2)}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>₹{item.total.toFixed(2)}</TableCell>
                        </TableRow>
                      )) || []}
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
                    <span>₹{(selectedBill.tax || 0).toFixed(2)}</span>
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
              {selectedBill && (
                <Button onClick={() => handlePrintBill(selectedBill)} className="bg-blue-600 hover:bg-blue-700">
                  <Printer className="h-4 w-4 mr-2" />
                  Print Bill
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Customer Dialog */}
        <Dialog open={isCustomerViewDialogOpen} onOpenChange={setIsCustomerViewDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Customer Details</DialogTitle>
              <DialogDescription>{selectedCustomer?.name}</DialogDescription>
            </DialogHeader>

            {selectedCustomer && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium">Contact Information</h4>
                    <div className="text-sm text-muted-foreground mt-1">
                      <div>Email: {selectedCustomer.email || "N/A"}</div>
                      <div>Phone: {selectedCustomer.phone || "N/A"}</div>
                      <div>Address: {selectedCustomer.address || "N/A"}</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium">Spending Overview</h4>
                    <div className="text-sm text-muted-foreground mt-1">
                      <div>Total Bills: {currentBills.filter(bill => bill.customerEmail === selectedCustomer.email || bill.customerPhone === selectedCustomer.phone).length}</div>
                      <div>Total Spent: ₹{currentBills.filter(bill => bill.customerEmail === selectedCustomer.email || bill.customerPhone === selectedCustomer.phone).reduce((sum, bill) => sum + bill.total, 0).toFixed(2)}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Bills by {selectedCustomer.name}</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentBills.filter(bill => bill.customerEmail === selectedCustomer.email || bill.customerPhone === selectedCustomer.phone).map((bill) => (
                        <TableRow key={bill.id}>
                          <TableCell className="font-mono">#{bill.id}</TableCell>
                          <TableCell>{new Date(bill.date).toLocaleDateString()}</TableCell>
                          <TableCell>₹{bill.total.toFixed(2)}</TableCell>
                          <TableCell><Badge variant="default">{bill.status}</Badge></TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" onClick={() => {
                              setSelectedBill(bill);
                              setIsViewDialogOpen(true);
                              setIsCustomerViewDialogOpen(false); // Close customer dialog when opening bill dialog
                            }}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCustomerViewDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  )
}
