"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/dashboard-layout";
import OfflineBanner from "@/components/OfflineBanner";
import { Button } from "@/components/ui/button";
import usePolling from "@/hooks/usePolling";
import api from "@/app/utils/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Receipt, Trash2, Eye, Search, Percent, Printer, RefreshCw, ArrowUpDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Upload } from "lucide-react";
import { unifiedPrint } from "@/app/utils/printUtils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface BillFormat {
  width: number;
  height: number | "auto";
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  unit: string;
}

interface SystemSettings {
  gstin: string;
  taxPercentage: number;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  barcode?: string;
  stock?: number;
}

interface BillItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  total: number;
}

interface Bill {
  id: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: BillItem[];
  subtotal: number;
  tax: number;
  taxPercentage?: number;
  discountPercentage: number;
  discountAmount: number;
  total: number;
  date: string;
  status: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  gstin?: string;
  billFormat?: string;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
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

type BillSortKey = "date" | "total" | "discount" | "customer" | "items";

export default function BillingPage() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [billSearchTerm, setBillSearchTerm] = useState("");
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isCustomerViewDialogOpen, setIsCustomerViewDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [billSortKey, setBillSortKey] = useState<BillSortKey>("date");
  const [billSortDirection, setBillSortDirection] = useState<"asc" | "desc">("desc");

  // Form state
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [discountPercentage, setDiscountPercentage] = useState(0);

  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    gstin: "",
    taxPercentage: 0,
    companyName: "",
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
  });

  const [billFormats, setBillFormats] = useState<Record<string, BillFormat>>({});
  const [selectedBillFormat, setSelectedBillFormat] = useState("A4");

  // Initial load
  useEffect(() => {
    console.log("BillingPage: Component mounting...");

    if (typeof window !== "undefined") {
      localStorage.setItem("adminLoggedIn", "true");
    }

    // Load system settings
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/settings`)
      .then((res) => res.json())
      .then((data) => {
        console.log("Settings: Loaded settings", data);
        if (data.systemSettings) {
          // Handle both camelCase and snake_case
          const settings = data.systemSettings;
          const normalizedSettings = {
            gstin: settings.gstin || "",
            taxPercentage: settings.taxPercentage || settings.tax_percentage || 0,
            companyName: settings.companyName || settings.company_name || "",
            companyAddress: settings.companyAddress || settings.company_address || "",
            companyPhone: settings.companyPhone || settings.company_phone || "",
            companyEmail: settings.companyEmail || settings.company_email || "",
          };
          console.log("Settings: Normalized settings", normalizedSettings);
          setSystemSettings(normalizedSettings);
        }
        if (data.billFormats) {
          setBillFormats(data.billFormats);
        }
      })
      .catch((error) => console.error("Failed to load system settings and bill formats", error));

    const isLoggedIn = localStorage.getItem("adminLoggedIn");
    if (isLoggedIn !== "true") {
      router.push("/");
      return;
    }

    setIsOnline(navigator.onLine);
    window.addEventListener("online", () => setIsOnline(true));
    window.addEventListener("offline", () => setIsOnline(false));

    return () => {
      window.removeEventListener("online", () => setIsOnline(true));
      window.removeEventListener("offline", () => setIsOnline(false));
    };
  }, [router]);

  // Optimized fetch function with silent updates
  const fetchData = useCallback(
    async (
      supabaseEndpoint: string,
      localStorageEndpoint: string,
      updateLocalStorageEndpoint: string,
      dataType: string
    ) => {
      console.log(`fetchData: Fetching ${dataType}...`);

      if (isOnline) {
        try {
          console.log(`fetchData: Fetching ${dataType} from Supabase...`);
          const supabaseResponse = await api.get(supabaseEndpoint);
          const data = supabaseResponse.data;
          console.log(`fetchData: Raw ${dataType} from API`, data);

          let processedData = data;

          if (dataType === "products") {
            processedData = data.map((product: any) => ({
              ...product,
              stock: product.stock || 0,
            }));
          } else if (dataType === "customers") {
            // FIX: Normalize customer field names
            processedData = data.map((customer: any) => ({
              id: customer.id,
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
              address: customer.address,
              createdAt: customer.createdat || customer.createdAt,
              updatedAt: customer.updatedat || customer.updatedAt,
            }));
          }

          console.log(`fetchData: Processed ${dataType}`, processedData);

          // Silent background update
          api.post(updateLocalStorageEndpoint, processedData).catch(() => {});

          return processedData;
        } catch (error) {
          console.warn(`Failed to fetch ${dataType} from Supabase, falling back to local`, error);
          console.log(`fetchData: Falling back to local for ${dataType}`);
          const localResponse = await api.get(localStorageEndpoint);
          console.log(`fetchData: Local ${dataType} data`, localResponse.data);

          if (dataType === "products") {
            return localResponse.data.map((product: any) => ({
              ...product,
              stock: product.stock || 0,
            }));
          } else if (dataType === "customers") {
            // FIX: Normalize customer field names from local storage too
            return localResponse.data.map((customer: any) => ({
              id: customer.id,
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
              address: customer.address,
              createdAt: customer.createdat || customer.createdAt,
              updatedAt: customer.updatedat || customer.updatedAt,
            }));
          }
          return localResponse.data;
        }
      }
    },
    [isOnline]
  );

  const fetchProducts = useCallback(
    () => fetchData("/api/supabase/products", "/api/local/products", "/api/local/products/update", "products"),
    [fetchData]
  );

  const fetchBills = useCallback(async () => {
    console.log("fetchBills: Starting fetch...");

    if (isOnline) {
      try {
        console.log("fetchBills: Fetching from Supabase...");
        const response = await api.get("/api/supabase/bills-with-details");
        const data = response.data;
        console.log("fetchBills: Raw data from API", data);
        console.log("fetchBills: Number of bills", data.length);

        // Check first bill's items
        if (data.length > 0 && data[0].items) {
          console.log("fetchBills: First bill items", data[0].items);
          console.log("fetchBills: First item details", data[0].items[0]);
        }

        const processedData = data.map((bill: any) => {
          console.log(`fetchBills: Processing bill ${bill.id}`);
          // FIX: Handle discount percentage - prioritize the correct field
          const discountPct = bill.discountpercentage || bill.discountPercentage || 0;
          const discountAmt = bill.discountamount || bill.discountAmount || 0;

          // FIX: Handle tax percentage and amount
          const taxPct = bill.taxpercentage || bill.taxPercentage || 0;
          const taxAmt = bill.taxamount || bill.taxAmount || bill.tax || 0;

          return {
            ...bill,
            date: bill.timestamp || bill.date,
            tax: taxAmt,
            taxPercentage: taxPct,
            status: bill.status || "Paid",
            items: typeof bill.items === "string" ? JSON.parse(bill.items) : bill.items,
            discountPercentage: discountPct,
            discountAmount: discountAmt,
          };
        });

        console.log("fetchBills: Final processed data", processedData);

        // Silent background update
        api.post("/api/local/bills/update", processedData).catch(() => {});

        return processedData;
      } catch (error) {
        console.error("fetchBills: Error fetching from Supabase", error);
        console.log("fetchBills: Falling back to local storage");
        const localResponse = await api.get("/api/local/bills");
        console.log("fetchBills: Local data", localResponse.data);

        return localResponse.data.map((bill: any) => {
          // FIX: Handle discount percentage in local data too
          const discountPct = bill.discountpercentage || bill.discountPercentage || 0;
          const discountAmt = bill.discountamount || bill.discountAmount || 0;

          // FIX: Handle tax percentage and amount
          const taxPct = bill.taxpercentage || bill.taxPercentage || 0;
          const taxAmt = bill.taxamount || bill.taxAmount || bill.tax || 0;

          return {
            ...bill,
            date: bill.timestamp || bill.date,
            tax: taxAmt,
            taxPercentage: taxPct,
            status: bill.status || "Paid",
            items: typeof bill.items === "string" ? JSON.parse(bill.items) : bill.items,
            discountPercentage: discountPct,
            discountAmount: discountAmt,
          };
        });
      }
    }
  }, [isOnline]);

  const fetchCustomers = useCallback(
    () => fetchData("/api/supabase/customers", "/api/local/customers", "/api/local/customers/update", "customers"),
    [fetchData]
  );

  // Use polling with LONGER intervals (20 seconds instead of 5)
  const { data: productsData, loading: productsLoading, error: productsError, refetch: refetchProducts } = usePolling<Product[]>(fetchProducts, { interval: 20000 });
  const { data: billsData, loading: billsLoading, error: billsError, refetch: refetchBills } = usePolling<Bill[]>(fetchBills, { interval: 20000 });
  const { data: customersData, loading: customersLoading, error: customersError, refetch: refetchCustomers } = usePolling<Customer[]>(fetchCustomers, { interval: 20000 });

  // Manual refresh function
  const handleManualRefresh = async () => {
    console.log("handleManualRefresh: Manual refresh triggered.");
    setIsRefreshing(true);
    try {
      await Promise.all([refetchProducts(), refetchBills(), refetchCustomers()]);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Handle errors
  useEffect(() => {
    if (productsError) console.error("Failed to load products", productsError);
    if (billsError) console.error("Failed to load bills", billsError);
    if (customersError) console.error("Failed to load customers", customersError);
  }, [productsError, billsError, customersError]);

  const currentProducts = useMemo<Product[]>(() => productsData ?? [], [productsData]);
  const currentBills = useMemo<Bill[]>(() => billsData ?? [], [billsData]);
  const currentCustomers = useMemo<Customer[]>(() => customersData ?? [], [customersData]);

  useEffect(() => {
    console.log("Products: Updated products data", productsData);
  }, [productsData]);

  useEffect(() => {
    console.log("Bills: Updated bills data", billsData);
  }, [billsData]);

  useEffect(() => {
    console.log("Customers: Updated customers data", customersData);
  }, [customersData]);

  const addItemToBill = () => {
    if (!selectedProductId) return;

    const product = currentProducts.find((p: Product) => p.id === selectedProductId);
    if (!product) return;

    console.log("addItemToBill: Adding product to bill", product, "Quantity:", quantity);

    const price = product.price !== undefined && product.price !== null ? product.price : 0;
    const availableStock = product.stock !== undefined && product.stock !== null ? product.stock : Infinity;

    const existingItemIndex = billItems.findIndex((item) => item.productId === selectedProductId);

    let newQuantity = quantity;
    if (existingItemIndex >= 0) {
      newQuantity = billItems[existingItemIndex].quantity + quantity;
    }

    if (newQuantity > availableStock) {
      alert(
        `Cannot add ${quantity} more units of ${product.name}. Only ${availableStock - (existingItemIndex >= 0 ? billItems[existingItemIndex].quantity : 0)} units available.`
      );
      return;
    }

    if (existingItemIndex >= 0) {
      const updatedItems = [...billItems];
      updatedItems[existingItemIndex].quantity = newQuantity;
      updatedItems[existingItemIndex].total = updatedItems[existingItemIndex].quantity * price;
      setBillItems(updatedItems);
    } else {
      const newItem: BillItem = {
        productId: product.id,
        productName: product.name,
        price: price,
        quantity: quantity,
        total: price * quantity,
      };
      setBillItems([...billItems, newItem]);
    }

    setSelectedProductId("");
    setQuantity(1);
  };

  const removeItemFromBill = (productId: string) => {
    console.log("removeItemFromBill: Removing product ID from bill", productId);
    setBillItems(billItems.filter((item) => item.productId !== productId));
  };

  const calculateTotals = () => {
    const subtotal = billItems.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.1;
    const discountAmount = (subtotal * discountPercentage) / 100;
    const total = subtotal + tax - discountAmount;
    return { subtotal, tax, discountAmount, total };
  };

  const handleDiscountPercentageChange = (newPercentage: number) => {
    const validPercentage = Math.max(0, Math.min(100, newPercentage));
    setDiscountPercentage(validPercentage);
  };

  const createBill = async () => {
    if (!customerName || billItems.length === 0) return;

    console.log("createBill: Attempting to create bill...");

    const { subtotal, tax, discountAmount, total } = calculateTotals();

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
    };

    console.log("createBill: Bill payload", newBill);

    try {
      const response = await api.post("/api/bills", newBill);
      console.log("createBill: API response", response);

      if (!response.status.toString().startsWith("2")) {
        throw new Error("Failed to create bill");
      }

      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setBillItems([]);
      setDiscountPercentage(0);
      setIsCreateDialogOpen(false);

      // Immediate refresh after creating bill
      refetchBills();
    } catch (error) {
      console.error("Error creating bill", error);
      alert("Failed to create bill.");
    }
  };

  const deleteBills = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const responses = await Promise.all(ids.map((id) => api.delete(`/api/bills/${id}`)));
      const hasFailures = responses.some((response) => !response.status.toString().startsWith("2"));
      if (hasFailures) {
        throw new Error("Failed to delete bill");
      }

      setSelectedBillIds((prev) => prev.filter((id) => !ids.includes(id)));
      setDeleteTargetIds([]);
      setIsDeleteDialogOpen(false);
      refetchBills();
    } catch (error) {
      console.error("Error deleting bills", error);
    }
  };

  const openDeleteDialog = (billId: string) => {
    setDeleteTargetIds([billId]);
    setIsDeleteDialogOpen(true);
  };

  const openBulkDeleteDialog = () => {
    if (selectedBillIds.length === 0) return;
    setDeleteTargetIds(selectedBillIds);
    setIsDeleteDialogOpen(true);
  };

  const toggleBillSelection = (billId: string, checked: boolean) => {
    setSelectedBillIds((prev) => {
      if (checked) {
        if (prev.includes(billId)) return prev;
        return [...prev, billId];
      }
      return prev.filter((id) => id !== billId);
    });
  };

  const toggleSelectAllFilteredBills = (checked: boolean) => {
    const filteredIds = filteredBills.map((bill: Bill) => bill.id);

    if (!checked) {
      setSelectedBillIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
      return;
    }

    setSelectedBillIds((prev) => {
      const merged = new Set([...prev, ...filteredIds]);
      return Array.from(merged);
    });
  };

  const toggleBillSortDirection = () => {
    setBillSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const viewBill = (bill: Bill) => {
    console.log("viewBill: Viewing bill", bill);
    setSelectedBill(bill);
    setIsViewDialogOpen(true);
  };

  const viewCustomer = (customer: Customer) => {
    console.log("viewCustomer: Viewing customer", customer);
    setSelectedCustomer(customer);
    setIsCustomerViewDialogOpen(true);
  };

  const generateReceiptHtml = (bill: Bill, format: BillFormat): string => {
    console.log("generateReceiptHtml: Bill data", bill);
    console.log("generateReceiptHtml: System settings", systemSettings);

    const isLetter = format.width === 216 && format.height === 279;
    const isA4 = format.width === 210 && format.height === 297;
    const isThermal = format.width === 80;

    const maxWidth = isThermal ? "80mm" : isLetter ? "216mm" : isA4 ? "210mm" : `${format.width}mm`;

    // FIX: Handle both camelCase and snake_case from settings
    const settingsAny = systemSettings as any;
    const companyName = bill.companyName || systemSettings.companyName || settingsAny.company_name || "UNDEFINED";
    const companyAddress = bill.companyAddress || systemSettings.companyAddress || settingsAny.company_address || undefined;
    const companyPhone = bill.companyPhone || systemSettings.companyPhone || settingsAny.company_phone || undefined;
    const companyEmail = bill.companyEmail || systemSettings.companyEmail || settingsAny.company_email || undefined;
    const gstin = bill.gstin || systemSettings.gstin || settingsAny.gstin || "";
    const taxPercentage = bill.taxPercentage || systemSettings.taxPercentage || settingsAny.tax_percentage || 0;

    console.log("generateReceiptHtml: Using company info", {
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      gstin,
      taxPercentage,
    });

    // Responsive font sizes based on format
    const headerFontSize = isThermal ? "14px" : "18px";
    const bodyFontSize = isThermal ? "11px" : "13px";
    const titleFontSize = isThermal ? "13px" : "16px";

    return `<!DOCTYPE html>
<html>
<head>
  <title>Invoice - ${bill.id}</title>
  <style>
    @page {
      size: ${isLetter ? "letter" : isA4 ? "A4" : `${format.width}mm ${format.height === "auto" ? "auto" : format.height + "mm"}`};
      margin: ${format.margins.top}mm ${format.margins.right}mm ${format.margins.bottom}mm ${format.margins.left}mm;
    }
    body {
      font-family: Arial, sans-serif;
      max-width: ${maxWidth};
      margin: 0 auto;
      font-size: ${bodyFontSize};
      color: #000;
      padding: ${isThermal ? "5px 0" : "0"};
    }
    .header, .footer {
      text-align: center;
      padding: ${isThermal ? "5px 0" : "10px 0"};
    }
    .company-name {
      font-size: ${headerFontSize};
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .company-details {
      font-size: ${isThermal ? "10px" : "12px"};
      line-height: 1.4;
    }
    .invoice-title {
      font-size: ${titleFontSize};
      font-weight: bold;
      margin-top: ${isThermal ? "5px" : "10px"};
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: ${isThermal ? "3px 0" : "5px 0"};
    }
    .section {
      margin: ${isThermal ? "10px 0" : "15px 0"};
    }
    .section-title {
      font-weight: bold;
      border-bottom: 1px dashed #000;
      margin-bottom: 5px;
      padding-bottom: 2px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      margin-bottom: ${isThermal ? "3px" : "5px"};
      font-size: ${isThermal ? "10px" : "12px"};
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: ${isThermal ? "5px" : "10px"};
      font-size: ${isThermal ? "10px" : bodyFontSize};
    }
    .items-table th, .items-table td {
      border: 1px solid #000;
      padding: ${isThermal ? "3px 4px" : "6px 8px"};
      text-align: left;
    }
    .items-table th {
      background-color: #f2f2f2;
      font-weight: bold;
    }
    .items-table td.number {
      text-align: right;
    }
    .totals {
      margin-top: ${isThermal ? "10px" : "15px"};
      border-top: 1px dashed #000;
      padding-top: ${isThermal ? "5px" : "10px"};
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: ${isThermal ? "3px" : "5px"};
      font-size: ${isThermal ? "11px" : "13px"};
    }
    .totals-row.total {
      font-weight: bold;
      font-size: ${isThermal ? "13px" : "15px"};
      border-top: 2px solid #000;
      padding-top: 5px;
      margin-top: 5px;
    }
    .footer {
      margin-top: ${isThermal ? "10px" : "20px"};
      font-size: ${isThermal ? "10px" : "12px"};
      border-top: 1px dashed #000;
      padding-top: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${companyName}</div>
    <div class="company-details">
      ${companyAddress}<br>
      Phone: ${companyPhone}<br>
      Email: ${companyEmail}
      ${gstin ? `<br>GSTIN: ${gstin}` : ""}
    </div>
  </div>

  <div class="invoice-title">INVOICE</div>

  <div class="section">
    <div class="row">
      <span><strong>Invoice:</strong> ${bill.id.substring(5, 17)}</span>
      <span><strong>Date:</strong> ${new Date(bill.date).toLocaleDateString()}</span>
    </div>
    ${
      bill.customerName || bill.customerPhone
        ? `
    <div class="row">
      <span><strong>Customer:</strong> ${bill.customerName || "Walk-in"}</span>
      ${bill.customerPhone ? `<span>${bill.customerPhone}</span>` : ""}
    </div>`
        : ""
    }
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th style="width: ${isThermal ? "10%" : "8%"}">#</th>
        <th style="width: ${isThermal ? "40%" : "45%"}">Item</th>
        <th style="width: ${isThermal ? "15%" : "12%"}" class="number">Qty</th>
        <th style="width: ${isThermal ? "17%" : "17%"}" class="number">Rate</th>
        <th style="width: ${isThermal ? "18%" : "18%"}" class="number">Total</th>
      </tr>
    </thead>
    <tbody>
      ${bill.items
        .map((item: any, i: number) => {
          const productName = item.productName || item.product_name || item.productname || "Item";
          return `
        <tr>
          <td>${i + 1}</td>
          <td>${productName}</td>
          <td class="number">${item.quantity}</td>
          <td class="number">₹${item.price.toFixed(2)}</td>
          <td class="number">₹${item.total.toFixed(2)}</td>
        </tr>`;
        })
        .join("")}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row">
      <span>Subtotal</span>
      <span>₹${bill.subtotal.toFixed(2)}</span>
    </div>
    ${
      bill.discountAmount && bill.discountAmount > 0
        ? `
    <div class="totals-row" style="color: #c00">
      <span>Discount (${bill.discountPercentage.toFixed(1)}%)</span>
      <span>-₹${bill.discountAmount.toFixed(2)}</span>
    </div>`
        : ""
    }
    <div class="totals-row">
      <span>Tax (${taxPercentage.toFixed(1)}%)</span>
      <span>₹${bill.tax.toFixed(2)}</span>
    </div>
    <div class="totals-row total">
      <span>TOTAL</span>
      <span>₹${bill.total.toFixed(2)}</span>
    </div>
  </div>

  <div class="footer">
    <p style="margin: 5px 0;">Thank you for your business!</p>
    ${isThermal ? '<p style="margin: 5px 0; font-size: 9px;">Powered by SIRI Billing System</p>' : ""}
  </div>
</body>
</html>`;
  };

  const handlePrintBill = async (billToPrint: Bill) => {
    console.log("handlePrintBill: Printing bill", billToPrint);
    console.log("handlePrintBill: System settings", systemSettings);
    console.log("handlePrintBill: Bill items", billToPrint.items);

    const formatName = billToPrint.billFormat || selectedBillFormat;
    const defaultFormat: BillFormat = {
      width: 210,
      height: 297,
      margins: { top: 10, bottom: 10, left: 10, right: 10 },
      unit: "mm",
    };
    const format = billFormats[formatName] || billFormats["A4"] || defaultFormat;

    console.log("handlePrintBill: Using bill format", format);

    const receiptHtml = generateReceiptHtml(billToPrint, format);

    try {
      await unifiedPrint({ htmlContent: receiptHtml });
    } catch (printError) {
      console.error("Failed to send print job", printError);
      alert("Failed to print bill. Please check console for details.");
    }
  };

  const filteredBills = useMemo(() => {
    const searchLower = billSearchTerm.toLowerCase();
    const filtered = currentBills.filter((bill: Bill) => {
      const customerName = bill.customerName || "";
      const billId = bill.id || "";
      return customerName.toLowerCase().includes(searchLower) || billId.includes(searchLower);
    });

    const getComparableValue = (bill: Bill) => {
      switch (billSortKey) {
        case "total":
          return bill.total || 0;
        case "discount":
          return bill.discountAmount || 0;
        case "customer":
          return (bill.customerName || "").toLowerCase();
        case "items":
          return bill.items?.length || 0;
        case "date":
        default:
          return new Date(bill.date).getTime();
      }
    };

    const sorted = [...filtered].sort((a, b) => {
      const aVal = getComparableValue(a);
      const bVal = getComparableValue(b);

      if (typeof aVal === "string" && typeof bVal === "string") {
        const comp = aVal.localeCompare(bVal);
        return billSortDirection === "asc" ? comp : -comp;
      }

      const comp = Number(aVal) - Number(bVal);
      return billSortDirection === "asc" ? comp : -comp;
    });

    return sorted;
  }, [currentBills, billSearchTerm, billSortDirection, billSortKey]);

  const allFilteredBillsSelected =
    filteredBills.length > 0 && filteredBills.every((bill) => selectedBillIds.includes(bill.id));
  const someFilteredBillsSelected =
    !allFilteredBillsSelected && filteredBills.some((bill) => selectedBillIds.includes(bill.id));

  const filteredCustomers = currentCustomers.filter((customer: Customer) => {
    const customerName = customer.name || "";
    const customerEmail = customer.email || "";
    const customerPhone = customer.phone || "";
    const searchLower = customerSearchTerm.toLowerCase();
    return (
      customerName.toLowerCase().includes(searchLower) ||
      customerEmail.toLowerCase().includes(searchLower) ||
      customerPhone.toLowerCase().includes(searchLower)
    );
  });

  useEffect(() => {
    const currentBillIdSet = new Set(currentBills.map((bill) => bill.id));
    setSelectedBillIds((prev) => {
      const next = prev.filter((id) => currentBillIdSet.has(id));
      // Avoid triggering renders when the filtered list is unchanged
      if (next.length === prev.length && next.every((id, idx) => id === prev[idx])) {
        return prev;
      }
      return next;
    });
  }, [currentBills]);

  const { subtotal, tax, discountAmount, total } = calculateTotals();

  const discountPresets = [5, 10, 15, 20, 25];

  const handleImportBills = async () => {
    if (!importFile) return;

    console.log("handleImportBills: Importing bills from file", importFile.name);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedBills = JSON.parse(e.target?.result as string);
        console.log("handleImportBills: Parsed bills for import", importedBills);

        const response = await api.post("/api/bills/import", importedBills);
        console.log("handleImportBills: Import API response", response);

        if (!response.status.toString().startsWith("2")) {
          throw new Error("Failed to import bills");
        }

        console.log("Bills imported successfully");
        setIsImportDialogOpen(false);
        setImportFile(null);
        refetchBills();
      } catch (error) {
        console.error("Error parsing or importing bills", error);
      }
    };
    reader.readAsText(importFile);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-full overflow-x-auto">
        {!isOnline && <OfflineBanner />}

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Billing System</h1>
            <p className="text-muted-foreground">Create and manage bills with discount adjustments</p>
            {(productsLoading || billsLoading || customersLoading) && (
              <p className="text-sm text-blue-500">Loading data...</p>
            )}
            {(productsError || billsError || customersError) && (
              <p className="text-sm text-red-500">Error loading data.</p>
            )}
          </div>

          <div className="flex space-x-2">
            {/* Manual Refresh Button */}
            <Button variant="outline" onClick={handleManualRefresh} disabled={isRefreshing || !isOnline}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>

            {/* Import Bills Dialog */}
            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!isOnline}>
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
                  <Button onClick={handleImportBills} disabled={!importFile}>
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
                        <Label htmlFor="productSelect">Product</Label>
                        <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a product" />
                          </SelectTrigger>
                          <SelectContent>
                            {currentProducts.map((product: Product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name} - ₹{product.price ? product.price.toFixed(2) : "0.00"} (Stock: {product.stock})
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
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removeItemFromBill(item.productId)}
                                >
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
                          <span>Subtotal</span>
                          <span className="font-medium">₹{subtotal.toFixed(2)}</span>
                        </div>

                        <div className="flex justify-between text-base">
                          <span>Tax (10%)</span>
                          <span className="font-medium">₹{tax.toFixed(2)}</span>
                        </div>

                        {/* Discount Section */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="flex items-center text-base">
                              <Percent className="h-4 w-4 mr-2" />
                              Discount Percentage
                            </Label>
                            <div className="flex items-center space-x-2">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={discountPercentage.toFixed(1)}
                                onChange={(e) =>
                                  handleDiscountPercentageChange(Number.parseFloat(e.target.value) || 0)
                                }
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
                              <span>Discount ({discountPercentage.toFixed(1)}%)</span>
                              <span className="font-medium">-₹{discountAmount.toFixed(2)}</span>
                            </div>
                          )}
                        </div>

                        <Separator />

                        {/* Total */}
                        <div className="flex justify-between items-center text-xl font-bold">
                          <span>Total</span>
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

        {/* Tabs for Bills and Customers */}
        <Tabs defaultValue="bills" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bills">Bills History</TabsTrigger>
            <TabsTrigger value="customers">Customers Info</TabsTrigger>
          </TabsList>

          {/* Bills Tab */}
          <TabsContent value="bills">
            <Card>
              <CardHeader>
                <CardTitle>Bills History</CardTitle>
                <CardDescription>{currentBills.length} bills created</CardDescription>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center space-x-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search bills..."
                      value={billSearchTerm}
                      onChange={(e) => setBillSearchTerm(e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                  <Select value={billSortKey} onValueChange={(value) => setBillSortKey(value as BillSortKey)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="total">Total</SelectItem>
                      <SelectItem value="discount">Discount Amount</SelectItem>
                      <SelectItem value="items">Items Count</SelectItem>
                      <SelectItem value="customer">Customer Name</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={toggleBillSortDirection}>
                    <ArrowUpDown className="h-4 w-4 mr-1" />
                    {billSortDirection === "asc" ? "Ascending" : "Descending"}
                  </Button>
                  {selectedBillIds.length > 0 && (
                    <Button variant="destructive" size="sm" onClick={openBulkDeleteDialog}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Selected ({selectedBillIds.length})
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {filteredBills.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={allFilteredBillsSelected || (someFilteredBillsSelected ? "indeterminate" : false)}
                            onCheckedChange={(checked) => toggleSelectAllFilteredBills(checked === true)}
                            aria-label="Select all bills"
                          />
                        </TableHead>
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
                      {filteredBills.map((bill: Bill) => (
                        <TableRow key={bill.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedBillIds.includes(bill.id)}
                              onCheckedChange={(checked) => toggleBillSelection(bill.id, checked === true)}
                              aria-label={`Select bill ${bill.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono">{bill.id}</TableCell>
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
                              <Button variant="outline" size="sm" onClick={() => openDeleteDialog(bill.id)}>
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
                      {billSearchTerm ? "Try adjusting your search terms" : "Create your first bill to get started"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customers Tab */}
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
                      {filteredCustomers.map((customer: Customer) => {
                        // FIX: Match bills by customerId instead of name/email/phone
                        const customerBills = currentBills.filter((bill: Bill) => {
                          const billCustomerId = (bill as any).customerId || (bill as any).customerid;
                          return billCustomerId === customer.id;
                        });
                        
                        const totalSpent = customerBills.reduce((sum: number, bill: Bill) => sum + (bill.total || 0), 0);

                        return (
                          <TableRow key={customer.id}>
                            <TableCell className="font-medium">{customer.name || "N/A"}</TableCell>
                            <TableCell>{customer.email || "N/A"}</TableCell>
                            <TableCell>{customer.phone || "N/A"}</TableCell>
                            <TableCell>{customer.address || "N/A"}</TableCell>
                            <TableCell>{customerBills.length}</TableCell>
                            <TableCell>₹{totalSpent.toFixed(2)}</TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => viewCustomer(customer)}
                              >
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
              <DialogDescription>Bill: {selectedBill?.id}</DialogDescription>
            </DialogHeader>

            {selectedBill && (
              <div className="space-y-6">
                {/* Customer & Bill Information */}
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
                      <div>Date: {new Date(selectedBill.date).toLocaleString()}</div>
                      <div>Status: {selectedBill.status}</div>
                      {selectedBill.taxPercentage !== undefined && selectedBill.taxPercentage > 0 && (
                        <div>Tax Rate: {selectedBill.taxPercentage}%</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items Table */}
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
                      {selectedBill.items?.map((item: any, index: number) => {
                        // Handle both camelCase and snake_case field names
                        const productName = item.productName || item.product_name || item.productname || "Unknown Product";
                        const price = item.price || 0;
                        const quantity = item.quantity || 0;
                        const total = item.total || 0;

                        return (
                          <TableRow key={index}>
                            <TableCell>{productName}</TableCell>
                            <TableCell>₹{price.toFixed(2)}</TableCell>
                            <TableCell>{quantity}</TableCell>
                            <TableCell>₹{total.toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Totals Section */}
                <div className="space-y-2 text-right bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>₹{selectedBill.subtotal.toFixed(2)}</span>
                  </div>

                  {/* Tax with percentage */}
                  <div className="flex justify-between">
                    <span>
                      Tax {selectedBill.taxPercentage !== undefined && selectedBill.taxPercentage > 0 && `(${selectedBill.taxPercentage}%)`}
                    </span>
                    <span>₹{(selectedBill.tax || 0).toFixed(2)}</span>
                  </div>

                  {/* Discount */}
                  {selectedBill.discountPercentage > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Discount ({selectedBill.discountPercentage.toFixed(1)}%)</span>
                      <span>-₹{selectedBill.discountAmount.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Total */}
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
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

        <Dialog
          open={isDeleteDialogOpen}
          onOpenChange={(open) => {
            setIsDeleteDialogOpen(open);
            if (!open) setDeleteTargetIds([]);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Are you sure?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete{" "}
                {deleteTargetIds.length > 1 ? `${deleteTargetIds.length} selected bills` : `bill ${deleteTargetIds[0] || ""}`}.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setDeleteTargetIds([]);
                }}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => deleteBills(deleteTargetIds)}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Customer Dialog */}
        <Dialog open={isCustomerViewDialogOpen} onOpenChange={setIsCustomerViewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Customer Details</DialogTitle>
              <DialogDescription>{selectedCustomer?.name}</DialogDescription>
            </DialogHeader>

            {selectedCustomer && (
              <div className="space-y-6 overflow-y-auto pr-2">
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
                      {(() => {
                        {/* FIX: Match bills by customerId */}
                        const customerBills = currentBills.filter((bill: Bill) => {
                          const billCustomerId = (bill as any).customerId || (bill as any).customerid;
                          return billCustomerId === selectedCustomer.id;
                        });
                        
                        const totalSpent = customerBills.reduce((sum: number, bill: Bill) => sum + (bill.total || 0), 0);

                        return (
                          <>
                            <div>Total Bills: {customerBills.length}</div>
                            <div>Total Spent: ₹{totalSpent.toFixed(2)}</div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div>
  <h4 className="font-medium mb-2">
    Bills by {selectedCustomer.name}
  </h4>

  <div className="max-h-[360px] overflow-y-auto border rounded-md">
    <Table>
      <TableHeader className="sticky top-0 bg-white z-10">
        <TableRow>
          <TableHead>Bill ID</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {currentBills
          .filter((bill: Bill) => {
            const billCustomerId =
              (bill as any).customerId || (bill as any).customerid;
            return billCustomerId === selectedCustomer.id;
          })
          .map((bill: Bill) => (
            <TableRow key={bill.id}>
              <TableCell className="font-mono">
                {bill.id}
              </TableCell>

              <TableCell>
                {new Date(bill.date).toLocaleDateString()}
              </TableCell>

              <TableCell>
                ₹{bill.total.toFixed(2)}
              </TableCell>

              <TableCell>
                <Badge>{bill.status}</Badge>
              </TableCell>

              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedBill(bill);
                    setIsViewDialogOpen(true);
                    setIsCustomerViewDialogOpen(false);
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  </div>
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
  );
}
