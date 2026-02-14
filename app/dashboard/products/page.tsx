"use client"

import React, { useEffect, useMemo, useState, useRef } from "react";
import { getBarcode } from "@/app/utils/getBarcode";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { Product as ProductType, Batch } from "@/lib/types";
import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Edit,
  Trash2,
  Package,
  Search,
  Download,
  Upload,
  Printer,
  AlertCircle,
  CheckCircle,
  XCircle,
  Calendar,
  Filter, // NEW: For filters button icon
} from "lucide-react";
import PrintDialog from "@/components/PrintDialog";
import { ScrollToBottomButton } from "@/components/ScrollToBottomButton";
import { ScrollToTopButton } from "@/components/ScrollToTopButton";
import { BatchInput } from "@/components/BatchInput";
import { unifiedPrint } from "@/app/utils/printUtils";

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

// NEW: HSN Code interface
interface HsnCode {
  id: string;
  hsnCode: string;
  tax?: number;
}

const fetcher = async (url: string) => {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}${url}`);
    if (!response.ok) {
      const errorData = await response.json();
      console.error(`API Error for ${url}:`, errorData);
      throw new Error(`API request failed with status ${response.status}`);
    }
    return response.json();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    throw error;
  }
};



export default function ProductsPage() {
  const router = useRouter();
  // Extend ProductType to include a 'barcodes' array for UI display purposes only
  interface Product extends ProductType {
    barcodes: string[];
  }
  const { data: productsData = [], error: productsError, isLoading: productsLoading, mutate } = useSWR<ProductType[]>(
    "/api/products",
    fetcher,
    {
      revalidateOnFocus: false,    // Don't revalidate when window gains focus
      revalidateOnReconnect: false, // Don't revalidate on reconnect  
      dedupingInterval: 5000,       // Dedupe requests within 5 seconds
      refreshInterval: 0,           // Disable auto-refresh
    }
  );
  const { data: batches = [], error: batchesError, isLoading: batchesLoading, mutate: mutateBatches } = useSWR<Batch[]>(
    "/api/batches",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 5000,
      refreshInterval: 0,
    }
  );

  // Add this new SWR hook
  const { data: hsnCodes = [], error: hsnError, isLoading: hsnLoading } = useSWR<HsnCode[]>(
    "/api/hsn-codes",           // ← adjust endpoint to match your real API route
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 10000,
      refreshInterval: 0,
    }
  );
  // Normalize data on fetch to create a 'barcodes' array from the 'barcode' string for UI
  const products: Product[] = useMemo(() => {
  if (!productsData || productsData.length === 0) return [];

  return productsData
    .map(p => ({
      ...p,
      barcodes: typeof p.barcode === 'string' && p.barcode.trim() !== ''
        ? p.barcode.split(',')
        : [],
      price: typeof p.price === 'number' ? p.price : Number((p as any).price ?? 0),
      displayPrice: (p as any).sellingPrice ?? (p as any).selling_price ?? (p as any).price ?? 0,
      // ✅ NEW: Normalize createdAt to handle both camelCase and lowercase from database
      createdAt: p.createdAt || (p as any).createdat || (p as any).created_at,
    }))
    .filter(p => !(p as any)._deleted);
}, [productsData]);

  // Debugging logs for SWR data
    // Debugging logs for SWR data
  useEffect(() => {
    console.log("=== SWR Data Debug ===");
    console.log("Products Data:", products);
    console.log("Products Count:", products.length);
    if (productsError) {
      console.error("SWR Products Error:", productsError);
    }
    console.log("Batches Data:", batches);
    console.log("Batches Count:", batches.length);
    console.log("Batches:", JSON.stringify(batches, null, 2));
    if (batchesError) {
      console.error("SWR Batches Error:", batchesError);
    }
    
    // Test batch lookup
    if (products.length > 0 && batches.length > 0) {
      const firstProduct = products[0];
      console.log("First Product:", firstProduct);
      console.log("First Product batchid:", firstProduct.batchid);
      const foundBatch = batches.find(batch => batch.id === firstProduct.batchid);
      console.log("Found Batch for first product:", foundBatch);
    }
    console.log("======================");
  }, [products, productsError, batches, batchesError]);

  const scrollableDivRef = useRef<HTMLDivElement>(null);
  const productTableTopScrollRef = useRef<HTMLDivElement>(null);
  const productTableContentRef = useRef<HTMLTableElement>(null);
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [assignedStores, setAssignedStores] = useState<SystemStore[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [stockFilter, setStockFilter] = useState("all")
  // NEW: Advanced filters state
  const [priceRange, setPriceRange] = useState({ min: "", max: "" });
  const [batchFilter, setBatchFilter] = useState("all");
  const [sellingPriceRange, setSellingPriceRange] = useState({ min: "", max: "" });
  const [dateAddedFilter, setDateAddedFilter] = useState({ from: "", to: "" });
  const [isFiltersDialogOpen, setIsFiltersDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [productsToPrint, setProductsToPrint] = useState<Product[]>([]);
  const [isBulkHsnDialogOpen, setIsBulkHsnDialogOpen] = useState(false);
  const [bulkHsnValue, setBulkHsnValue] = useState("");

  // Calendar and modal state
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isByDateDialogOpen, setIsByDateDialogOpen] = useState(false);
  const [isBatchInputOpen, setIsBatchInputOpen] = useState(false);
  const [selectedbatchid, setSelectedbatchid] = useState<string | null>(null);
  const [batchesForSelectedDate, setBatchesForSelectedDate] = useState<Batch[]>([]);
  const [unbatchedProductsForSelectedDate, setUnbatchedProductsForSelectedDate] = useState<Product[]>([]); // NEW STATE
  const [isBatchesForDayDialogOpen, setIsBatchesForDayDialogOpen] = useState(false);
  const [selectedBatchForProducts, setSelectedBatchForProducts] = useState<Batch | null>(null);
  const [isViewProductsForBatchDialogOpen, setIsViewProductsForBatchDialogOpen] = useState(false);
  const [productsToDisplayInByDateDialog, setProductsToDisplayInByDateDialog] = useState<Product[]>([]); // NEW STATE

  useEffect(() => {
    if (calendarOpen) {
      setCalendarMonth(new Date());
    }
  }, [calendarOpen]);

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    const dateKey = toKey(date);
    const productsOnDate = productsByDate[dateKey] || [];

    const batchedProductsOnDate = productsOnDate.filter(p => p.batchid);
    const currentUnbatchedProductsOnDate = productsOnDate.filter(p => !p.batchid);

    const batchidsOnDate = [...new Set(batchedProductsOnDate.map(p => p.batchid).filter(Boolean))];
    const filteredBatches = batches.filter(batch => batchidsOnDate.includes(batch.id));

    setBatchesForSelectedDate(filteredBatches);
    setUnbatchedProductsForSelectedDate(currentUnbatchedProductsOnDate); // Set unbatched products state

    if (filteredBatches.length === 0 && currentUnbatchedProductsOnDate.length > 0) {
      // If no batches but un-batched products are present, show un-batched products directly
      setProductsToDisplayInByDateDialog(currentUnbatchedProductsOnDate);
      setIsByDateDialogOpen(true);
    } else if (filteredBatches.length > 0 || currentUnbatchedProductsOnDate.length > 0) {
      // If there are any products (batched or unbatched), open the batches/unbatched dialog
      setIsBatchesForDayDialogOpen(true);
    } else {
      // No products at all for this date
      setIsBatchesForDayDialogOpen(false);
      setIsByDateDialogOpen(false);
      setSelectedDate(null);
      setProductsToDisplayInByDateDialog([]);
    }
  };

  const handleBatchCardClick = (batch: Batch) => {
    setSelectedBatchForProducts(batch);
    setIsViewProductsForBatchDialogOpen(true);
  };

  // NEW: Handle HSN code selection
 

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    stock: "",
    sellingPrice: "",
    barcodes: [""], // Initialize with one empty barcode field
    batchid: "",
    hsnCode: "",
  });
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);

   const handleHsnCodeChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      hsnCode: value,
    }));
  };

  useEffect(() => {
    const userData = localStorage.getItem("adminUser");
    if (userData) {
      const user = JSON.parse(userData);
      setCurrentUser(user);

      if (user.role === "billing_user" && user.assignedStores) {
        const savedStores = localStorage.getItem("stores");
        if (savedStores) {
          const allStores = JSON.parse(savedStores);
          const userStores = allStores.filter(
            (store: SystemStore) => user.assignedStores?.includes(store.id) && store.status === "active"
          );
          setAssignedStores(userStores);
        }
      }
    }
  }, []);

  const resetForm = () => {
    setFormData({
      name: "",
      price: "",
      stock: "",
      sellingPrice: "",
      barcodes: [""], // Reset to one empty barcode field
      batchid: "",
      hsnCode: "",
    })
  }

  const addBarcodeField = () => {
    setFormData((prev) => ({
      ...prev,
      barcodes: [...prev.barcodes, ""],
    }));
  };

  const updateBarcodeField = (index: number, value: string) => {
    setFormData((prev) => {
      const newBarcodes = [...prev.barcodes];
      newBarcodes[index] = value;
      return { ...prev, barcodes: newBarcodes };
    });
  };

  const removeBarcodeField = (index: number) => {
    setFormData((prev) => {
      const newBarcodes = prev.barcodes.filter((_, i) => i !== index);
      return { ...prev, barcodes: newBarcodes.length > 0 ? newBarcodes : [""] }; // Ensure at least one field remains
    });
  };


  const generateBarcode = () => {
  const now = new Date();

  // Date part: YYYYMMDD (8 digits)
  const yyyy = now.getFullYear().toString();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const datePart = `${yyyy}${mm}${dd}`;

  // Random part: 5 digits
  const randomPart = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");

  // Final 13-digit barcode
  return `${datePart}${randomPart}`;
};


  const validateBarcode = (barcode: string): boolean => {
    if (!barcode || barcode.trim() === "") return false;
    return barcode.length >= 1 && barcode.length <= 80;
  };

  const handleAddProduct = async () => {
    if (!formData.name || !formData.price || !formData.stock) {
      alert("Please fill in all required fields");
      return;
    }

    const validBarcodes = formData.barcodes.filter(b => b.trim() !== "");
    if (validBarcodes.length === 0) {
      alert("Please add at least one barcode.");
      return;
    }

    for (const barcode of validBarcodes) {
      if (!validateBarcode(barcode)) {
        alert(`Please enter a valid barcode (1-80 characters) for: ${barcode}`);
        return;
      }
      const existingBarcode = products.find((p) => p.barcodes?.includes(barcode)); // Use `products` for finding existing barcodes
      if (existingBarcode) {
        alert(`Barcode already exists: ${barcode} (Product: ${existingBarcode.name})`);
        return;
      }
    }

    const normalizeHsnCode = (value: unknown) => {
      if (value == null) return undefined;
      const str = String(value).trim();
      return str === "" ? undefined : str;
    };

    const newProduct: Omit<ProductType, "id" | "createdAt" | "updatedAt"> = {
      name: formData.name,
      price: Number.parseFloat(formData.price),
      stock: Number.parseInt(formData.stock),
      sellingPrice: Number.parseFloat(formData.sellingPrice),
      barcode: validBarcodes.join(","), // Join array into a comma-separated string for 'barcode' field
      batchid: formData.batchid,
      hsnCode: normalizeHsnCode(formData.hsnCode),
    };

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProduct),
      });

      if (!response.ok) {
        throw new Error("Failed to add product");
      }

      mutate();
      resetForm();
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error("Error adding product:", error);
      alert("Failed to add product.");
    }
  };

  const handleEditProduct = async () => {
    if (!editingProduct || !formData.name || !formData.price || !formData.stock) {
      alert("Please fill in all required fields");
      return;
    }

    const validBarcodes = formData.barcodes.filter(b => b.trim() !== "");
    if (validBarcodes.length === 0) {
      alert("Please add at least one barcode.");
      return;
    }

    for (const barcode of validBarcodes) {
      if (!validateBarcode(barcode)) {
        alert(`Please enter a valid barcode (1-80 characters) for: ${barcode}`);
        return;
      }
      const otherProducts = products.filter((p) => p.id !== editingProduct.id); // Use `products` for filtering
      const existingBarcode = otherProducts.find((p) => p.barcodes?.includes(barcode)); // Use `barcodes` property
      if (existingBarcode) {
        alert(`Barcode already exists: ${barcode} (Product: ${existingBarcode.name})`);
        return;
        }
    }

    const normalizeHsnCode = (value: unknown) => {
      if (value == null) return undefined;
      const str = String(value).trim();
      return str === "" ? undefined : str;
    };

    const updatedProduct: Partial<ProductType> = {
      name: formData.name,
      price: Number.parseFloat(formData.price),
      stock: Number.parseInt(formData.stock),
      sellingPrice: Number.parseFloat(formData.sellingPrice),
      barcode: validBarcodes.join(","), // Join array into a comma-separated string for 'barcode' field
      batchid: formData.batchid === "" ? undefined : formData.batchid, // Send undefined if batchid is empty
      hsnCode: normalizeHsnCode(formData.hsnCode),
    };

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/products/${editingProduct.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProduct),
      });

      if (!response.ok) {
        throw new Error("Failed to update product");
      }

      mutate();
      resetForm();
      setEditingProduct(null);
      setIsEditDialogOpen(false);
    } catch (error) {
      console.error("Error updating product:", error);
      alert("Failed to update product.");
    }
  };

const handleDeleteProduct = async (productId: string) => {
  // Optimistic update - remove from UI immediately
  mutate(productsData.filter((p) => p.id !== productId), false);

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/products/${productId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to delete product");
    }

    // Force revalidation after successful delete
    await mutate();
  } catch (error) {
    console.error("Error deleting product:", error);
    alert("Failed to delete product.");
    // Revert optimistic update on error
    mutate();
  }
};

  const handleBulkDeleteProducts = async () => {
    if (selectedProducts.length === 0) {
      return;
    }

    const productIdsToDelete = [...selectedProducts];
    const confirmed = window.confirm(
      `Are you sure you want to delete ${productIdsToDelete.length} selected product(s)? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    const selectedSet = new Set(productIdsToDelete);
    mutate(productsData.filter((p) => !selectedSet.has(p.id)), false);
    setSelectedProducts([]);

    try {
      const deleteResults = await Promise.allSettled(
        productIdsToDelete.map((productId) =>
          fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/products/${productId}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
          })
        )
      );

      const failedDeletes = deleteResults.filter(
        (result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok)
      );

      if (failedDeletes.length > 0) {
        throw new Error(`Failed to delete ${failedDeletes.length} product(s)`);
      }

      await mutate();
      alert(`Successfully deleted ${productIdsToDelete.length} product(s)`);
    } catch (error) {
      console.error("Error deleting products in bulk:", error);
      alert("Failed to delete some products. Please try again.");
      mutate();
    }
  };

  const handleBulkHsnUpdate = async () => {
    if (!bulkHsnValue || selectedProducts.length === 0) {
      alert("Please enter an HSN code value and select products");
      return;
    }

    const hsnValue = bulkHsnValue.trim();
    if (!hsnValue) {
      alert("Please enter a valid HSN code");
      return;
    }

    try {
      const updatePromises = selectedProducts.map(productId =>
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/products/${productId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hsnCode: hsnValue }),
        })
      );

      await Promise.all(updatePromises);
      
      mutate();
      setSelectedProducts([]);
      setBulkHsnValue("");
      setIsBulkHsnDialogOpen(false);
      alert(`Successfully updated HSN code for ${selectedProducts.length} products`);
    } catch (error) {
      console.error("Error updating HSN code:", error);
      alert("Failed to update HSN code for some products");
    }
  };
  const openEditDialog = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      price: product.price.toString(),
      stock: product.stock.toString(),
      sellingPrice: (product as any).sellingPrice != null ? (product as any).sellingPrice.toString() : "",
      barcodes: typeof product.barcode === 'string' && product.barcode.trim() !== ''
        ? product.barcode.split(',')
        : [""], // Initialize with existing barcode string parsed to array, or one empty field
      batchid: product.batchid || "",
      hsnCode: (product as any).hsnCode != null ? String((product as any).hsnCode) : "",
    })
    setIsEditDialogOpen(true)
  }

  const openPrintDialog = (productIds: string[]) => {
    const productsToPrint = products
      .filter(p => productIds.includes(p.id))
      .map(p => ({
        ...p,
        barcodes: typeof p.barcode === 'string' && p.barcode.trim() !== ''
          ? p.barcode.split(',')
          : [], // Ensure barcodes is always an array derived from barcode string
      }));
    setProductsToPrint(productsToPrint);
    setIsPrintDialogOpen(true);
  };

  const handlePrintSuccess = () => {
    setSelectedProducts([]);
    setProductsToPrint([]);
  };

  // Export and Import functions
  const exportProducts = () => {
    const dataStr = JSON.stringify(products, null, 2);
    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
    const exportFileDefaultName = `products_${new Date().toISOString().split("T")[0]}.json`;

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
  };

  const importProducts = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file: File | undefined = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedProducts = JSON.parse(e.target?.result as string);
        if (Array.isArray(importedProducts)) {
          for (const product of importedProducts) {
            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/products`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(product),
            });
          }
          mutate();
          alert(`Successfully imported ${importedProducts.length} products`);
        } else {
          alert("Invalid file format");
        }
      } catch (error) {
        alert("Error reading file");
      }
    };
    reader.readAsText(file);
  };

  // NEW: Reset advanced filters
  const resetAdvancedFilters = () => {
    setPriceRange({ min: "", max: "" });
    setBatchFilter("all");
    setSellingPriceRange({ min: "", max: "" });
    setDateAddedFilter({ from: "", to: "" });
  };

  useEffect(() => {
    const topScroll = productTableTopScrollRef.current;
    const bottomScroll = scrollableDivRef.current;
    const content = productTableContentRef.current;

    if (!topScroll || !bottomScroll || !content) {
      return;
    }

    const topTrack = topScroll.firstElementChild as HTMLDivElement | null;
    if (!topTrack) {
      return;
    }

    let syncing = false;

    const syncTrackWidth = () => {
      topTrack.style.width = `${content.scrollWidth}px`;
    };

    const onTopScroll = () => {
      if (syncing) return;
      syncing = true;
      bottomScroll.scrollLeft = topScroll.scrollLeft;
      syncing = false;
    };

    const onBottomScroll = () => {
      if (syncing) return;
      syncing = true;
      topScroll.scrollLeft = bottomScroll.scrollLeft;
      syncing = false;
    };

    syncTrackWidth();

    topScroll.addEventListener("scroll", onTopScroll, { passive: true });
    bottomScroll.addEventListener("scroll", onBottomScroll, { passive: true });

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncTrackWidth) : null;
    if (resizeObserver) {
      resizeObserver.observe(content);
    }
    window.addEventListener("resize", syncTrackWidth);

    return () => {
      topScroll.removeEventListener("scroll", onTopScroll);
      bottomScroll.removeEventListener("scroll", onBottomScroll);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncTrackWidth);
    };
  }, [products.length, productsLoading]);

  // Extended filtered products logic
  const filteredProducts = useMemo(() => {
    // console.log("Filtering products. Current products array:", products);
    const typedProducts: Product[] = products;
    const filtered = typedProducts.filter((product) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = searchTerm === "" ||
      product.name.toLowerCase().includes(q) ||
      (() => {
        const bc = getBarcode(product);
        return bc ? bc.toLowerCase().includes(q) : false;
      })();

    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "low" && product.stock <= 5) ||
      (stockFilter === "out" && product.stock === 0) ||
      (stockFilter === "available" && product.stock > 5);

    // NEW: Price range filter
    const productPrice = Number(product.price) || 0; // Ensure price is a number, default to 0
    const priceMin = priceRange.min ? parseFloat(priceRange.min) : 0;
    const priceMax = priceRange.max ? parseFloat(priceRange.max) : Infinity;
    const matchesPrice = productPrice >= priceMin && productPrice <= priceMax;

    // NEW: Batch filter
    const matchesBatch = batchFilter === "all" || product.batchid === batchFilter;

    // NEW: Selling Price range filter
    const sellingPriceMin = sellingPriceRange.min ? parseFloat(sellingPriceRange.min) : 0;
    const sellingPriceMax = sellingPriceRange.max ? parseFloat(sellingPriceRange.max) : Infinity;
    const productSellingPrice = Number((product as any).sellingPrice) || 0; // Ensure sellingPrice is a number, default to 0
    const matchesSellingPrice = productSellingPrice >= sellingPriceMin && productSellingPrice <= sellingPriceMax;

    // NEW: Date added filter (using createdAt if available)
    let matchesDate = true;
    if (dateAddedFilter.from || dateAddedFilter.to) {
      const createdAt = (product as any).createdAt ? new Date((product as any).createdAt) : null;
      if (createdAt && !isNaN(createdAt.getTime())) {
        const fromDate = dateAddedFilter.from ? new Date(dateAddedFilter.from) : null;
        const toDate = dateAddedFilter.to ? new Date(dateAddedFilter.to) : null;
        if (fromDate) matchesDate = matchesDate && createdAt >= fromDate;
        if (toDate) matchesDate = matchesDate && createdAt <= toDate;
      } else {
        matchesDate = false; // Skip if no createdAt
      }
    }

    const match = matchesSearch && matchesStock && matchesPrice && matchesBatch && matchesSellingPrice && matchesDate;
    // console.log(`Product ${product.name} (ID: ${product.id}) - Matches: ${match}`); // Too verbose, enable if needed
    return match;
  });
  
  // Sort filtered products by date (newest first)
  const sortedFilteredProducts = filtered.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA; // Descending order (newest first)
  });
  
  // console.log("Filtered Products:", sortedFilteredProducts);
  return sortedFilteredProducts;
}, [products, searchTerm, stockFilter, priceRange, batchFilter, sellingPriceRange, dateAddedFilter]);

  // Memoized total inventory value calculation (based on selling price)
  const totalSellingValue = useMemo(() => {
    const totalValue = filteredProducts.reduce((sum, p) => {
      const stock = Number(p.stock ?? 0);
      const sellingPrice = Number((p as any).sellingPrice ?? (p as any).price ?? 0);
      if (isNaN(stock) || isNaN(sellingPrice)) {
        console.warn(`Invalid stock or selling price for product ${p.id}: stock=${p.stock}, sellingPrice=${sellingPrice}`);
        return sum;
      }
      return sum + (stock * sellingPrice);
    }, 0);
    
    console.log("Calculated Total Selling Value:", totalValue.toFixed(2));
    return totalValue.toFixed(2);
  }, [filteredProducts]);

  // Memoized total inventory cost value calculation (based on cost price)
  const totalCostValue = useMemo(() => {
    const totalValue = filteredProducts.reduce((sum, p) => {
      const stock = Number(p.stock ?? 0);
      const costPrice = Number(p.price ?? 0);
      if (isNaN(stock) || isNaN(costPrice)) {
        console.warn(`Invalid stock or cost price for product ${p.id}: stock=${p.stock}, costPrice=${costPrice}`);
        return sum;
      }
      return sum + (stock * costPrice);
    }, 0);
    
    console.log("Calculated Total Cost Value:", totalValue.toFixed(2));
    return totalValue.toFixed(2);
  }, [filteredProducts]);

  const totalFilteredStock = useMemo(
    () => filteredProducts.reduce((sum, p) => sum + Number(p.stock ?? 0), 0),
    [filteredProducts]
  );

  const getStockStatus = (stock: number) => {
    if (stock === 0) return { label: "Out of Stock", variant: "destructive" as const, icon: XCircle }
    if (stock <= 5) return { label: "Low Stock", variant: "secondary" as const, icon: AlertCircle }
    return { label: "In Stock", variant: "default" as const, icon: CheckCircle }
  }

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts((prev: string[]) =>
      prev.includes(productId) ? prev.filter((id: string) => id !== productId) : [...prev, productId]
    );
  };

  const selectAllProducts = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map((p: Product) => p.id));
    }
  };

  // Calendar helpers (unchanged from original)
  const fmtMonthYear = (d: Date) =>
    d.toLocaleString(undefined, { month: "long", year: "numeric" });

  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const toKey = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const productsByDate = useMemo(() => {
  const map: Record<string, Product[]> = {};
  for (const p of products) {
    // ✅ NEW: Check both createdAt (camelCase) and createdat (lowercase) from database
    const createdAtValue = p?.createdAt || (p as any)?.createdat;
    
    if (!createdAtValue) {
      console.log('Product missing createdAt:', p);
      continue;
    }
    
    const d = new Date(createdAtValue);
    if (Number.isNaN(d.getTime())) {
      console.log('Invalid date for product:', p, 'createdAt:', createdAtValue);
      continue;
    }
    
    const key = d.toISOString().slice(0, 10);
    map[key] = [...(map[key] || []), p];
  }
  console.log('Final productsByDate map:', map);
  return map;
}, [products]);


  const dateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const k in productsByDate) counts[k] = productsByDate[k].length;
    return counts;
  }, [productsByDate]);

  const selectedKey = selectedDate ? toKey(selectedDate) : "";

  const generatePrintHtml = (
    list: Product[],
    titleDate: Date,
    storeName?: string,
    printMeta?: {
      batchId?: string;
      batchName?: string;
      batchPlace?: string;
      printedAt?: Date;
    }
  ) => { // Keep type as Product[]
    let totalStock = 0;
    let totalValue = 0;

    const rows = list
      .map((p) => {
        const stock = (p as any).stock ?? 0;
        const price = Number((p as any).price ?? 0);
        const value = stock * price;

        totalStock += stock;
        totalValue += value;

        const allBarcodes = (p.barcode && p.barcode.trim() !== '')
          ? p.barcode.split(',').map(b => `<span style="display:block;">${b}</span>`).join("")
          : "N/A";

        return `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;">${allBarcodes}</td>
          <td style="padding:6px;border:1px solid #ddd;">${p.name}</td>
          <td style="padding:6px;border:1px solid #ddd; text-align:right;">${stock}</td>
          <td style="padding:6px;border:1px solid #ddd; text-align:right;">₹${price.toFixed(2)}</td>
          <td style="padding:6px;border:1px solid #ddd; text-align:right;">₹${value.toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    const storeInfoHtml = storeName ? `<p style="font-size: 8px; margin-bottom: 6px;">Store: ${storeName}</p>` : '';
    const printedAt = (printMeta?.printedAt ?? new Date()).toLocaleString();
    const detailsHtml = `
      <div style="font-size:8px; margin-bottom:8px; border:1px solid #ddd; padding:6px;">
        <div><strong>Batch ID:</strong> ${printMeta?.batchId || "N/A"}</div>
        <div><strong>Batch Name:</strong> ${printMeta?.batchName || "N/A"}</div>
        <div><strong>Batch Place:</strong> ${printMeta?.batchPlace || "N/A"}</div>
        <div><strong>Date:</strong> ${titleDate.toDateString()}</div>
        <div><strong>Printed At:</strong> ${printedAt}</div>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Products on ${titleDate.toDateString()}</title>
          <style>
            @media print {
              @page { margin: 12mm; }
              body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; font-size: 8px; line-height: 1.25; }
              h1 { font-size: 10px; margin-bottom: 8px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { font-size: 8px; padding: 4px !important; }
              th { background:#f3f4f6; }
              tfoot { font-weight: bold; }
              tfoot { display: table-footer-group; }
              @page {
                @bottom-right {
                  content: "Page " counter(page) " of " counter(pages);
                }
              }
            }
            @media print {
              tfoot {
                display: table-row-group;
              }
            }
          </style>
        </head>
        <body>
          <h1>Products on ${titleDate.toDateString()}</h1>
          ${storeInfoHtml}
          ${detailsHtml}
          <table>
            <thead>
              <tr>
                <th style="padding:6px;border:1px solid #ddd; text-align:left;">Product Barcode Number</th>
                <th style="padding:6px;border:1px solid #ddd; text-align:left;">Product Name</th>
                <th style="padding:6px;border:1px solid #ddd; text-align:right;">Stock</th>
                <th style="padding:6px;border:1px solid #ddd; text-align:right;">Price</th>
                <th style="padding:6px;border:1px solid #ddd; text-align:right;">Value (Total Value)</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding:6px;border:1px solid #ddd; text-align:right;">Total:</td>
                <td style="padding:6px;border:1px solid #ddd; text-align:right;">${totalStock}</td>
                <td style="padding:6px;border:1px solid #ddd; text-align:right;"></td>
                <td style="padding:6px;border:1px solid #ddd; text-align:right;">₹${totalValue.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          <script>
            // window.onload = function() { // Not needed for unifiedPrint
            //   window.print();
            //   setTimeout(function(){ window.close(); }, 300);
            // };
          </script>
        </body>
      </html>
    `;
  };

  return (
    <DashboardLayout>
      <div className="w-full min-w-0 space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Product Management</h1>
            <p className="text-gray-600 mt-2">Manage your inventory and product catalog</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Calendar popover */}
            <div className="relative">
              <Button variant="outline" onClick={() => setCalendarOpen((v) => !v)}>
                <Calendar className="h-4 w-4 mr-2" />
                Calendar
              </Button>
              {calendarOpen && (
                <div className="absolute right-0 z-50 mt-2 bg-white border rounded shadow-lg p-3 w-80">
                  {/* Month header */}
                  <div className="flex items-center justify-between mb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                      }
                    >
                      ◀
                    </Button>
                    <div className="text-sm font-medium">{fmtMonthYear(calendarMonth)}</div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                      }
                    >
                      ▶
                    </Button>
                  </div>

                  {/* Weekday headers */}
                  <div className="grid grid-cols-7 text-[11px] text-gray-500 mb-1">
                    <div className="text-center">Su</div>
                    <div className="text-center">Mo</div>
                    <div className="text-center">Tu</div>
                    <div className="text-center">We</div>
                    <div className="text-center">Th</div>
                    <div className="text-center">Fr</div>
                    <div className="text-center">Sa</div>
                  </div>

                  {/* Days grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {(() => {
                      const first = startOfMonth(calendarMonth);
                      const firstWeekday = first.getDay();
                      const total = daysInMonth(calendarMonth);
                      const cells: React.JSX.Element[] = [];

                      // Leading blanks
                      for (let i = 0; i < firstWeekday; i++) {
                        cells.push(<div key={`b-${i}`} className="h-8" />);
                      }

                      // Actual days
                      for (let day = 1; day <= total; day++) {
                        const d = new Date(
                          calendarMonth.getFullYear(),
                          calendarMonth.getMonth(),
                          day
                        );
                        const key = toKey(d);
                        const count = dateCounts[key] ?? 0;
                        const today = sameDay(d, new Date());

                        let cls =
                          "h-8 w-8 mx-auto flex items-center justify-center rounded-full cursor-pointer select-none ";
                        if (today) {
                          cls += "border-2 border-red-500 text-red-600 ";
                        } else if (count > 0) {
                          cls += "bg-blue-100 text-blue-700 ";
                        } else {
                          cls += "text-gray-400 ";
                        }

                        cells.push(
                          <div key={key} className="flex items-center justify-center">
                            <div
                              className={cls}
                              title={count > 0 ? `${count} products` : "No products"}
                              onClick={() => handleDayClick(d)}
                            >
                              {day}
                            </div>
                          </div>
                        );
                      }

                      return cells;
                    })()}
                  </div>

                  {/* Day actions */}
                  {selectedDate && (
                    <div className="mt-3 border-t pt-3">
                      <div className="text-sm mb-2">
                        {(dateCounts[selectedKey] ?? 0).toString()} products on {selectedDate.toDateString()}
                      </div>
                      {/* Removed "View all products" and "Print all products" buttons */}
                    </div>
                  )}
                  <div className="mt-3 border-t pt-3 text-right">
                    <Button variant="outline" size="sm" onClick={() => setCalendarOpen(false)}>
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Import */}
            <input type="file" accept=".json" onChange={importProducts} className="hidden" id="import-products" />
            <Button variant="outline" onClick={() => document.getElementById("import-products")?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>

            {/* Export */}
            <Button variant="outline" onClick={exportProducts}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>

            {/* NEW: Filters Button */}
            <Button variant="outline" onClick={() => setIsFiltersDialogOpen(true)}>
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>

            {/* Add Product */}
            <Dialog
              open={isAddDialogOpen}
              onOpenChange={(open) => {
                setIsAddDialogOpen(open);
                if (!open) {
                  resetForm();
                  setSelectedbatchid(null); // Reset selected batch when dialog closes
                } else {
                  resetForm(); // Reset form when dialog opens
                  setSelectedbatchid(null); // Reset selected batch when dialog opens
                }
              }}
            >
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Product
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Product</DialogTitle>
                  <DialogDescription>Create a new product with barcode information</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Product Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => {
                          setFormData({ ...formData, name: e.target.value });
                          const input = e.target.value.toLowerCase();
                          const suggestions = products
                            .map((p) => p.name)
                            .filter((name) => name.toLowerCase().includes(input) && name.toLowerCase() !== input)
                            .slice(0, 5);
                          setNameSuggestions(suggestions);
                        }}
                        placeholder="Enter product name"
                        list="product-name-suggestions"
                      />
                      <datalist id="product-name-suggestions">
                        {nameSuggestions.map((name, index) => (
                          <option key={`${name}-${index}`} value={name} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="price">Price (₹) *</Label>
                      <Input
                        id="price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stock">Stock Quantity *</Label>
                      <Input
                        id="stock"
                        type="number"
                        min="0"
                        value={formData.stock}
                        onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sellingPrice">Selling Price (₹)</Label>
                      <Input
                        id="sellingPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.sellingPrice}
                        onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                    <Label htmlFor="hsnCode">HSN Code</Label>
                    <Select
                      value={formData.hsnCode || "none"}
                      onValueChange={(value) => handleHsnCodeChange(value === "none" ? "" : value)}
                    >
                      <SelectTrigger id="hsnCode">
                        <SelectValue placeholder="Select HSN Code" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {hsnCodes.map((hsn) => (
                          <SelectItem key={hsn.id} value={hsn.id}>
                            {hsn.hsnCode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formData.hsnCode && (
                      <p className="text-xs text-muted-foreground">
                        Tax: {Number(hsnCodes.find((h) => String(h.id) === String(formData.hsnCode))?.tax ?? 0).toFixed(2)}%
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="batch">Batch (Optional)</Label>
                    <Select
                      value={formData.batchid || ""}
                      onValueChange={(value) => {
                        setFormData({ ...formData, batchid: value === "no-batch-selected" ? "" : value });
                      }}
                    >
                      <SelectTrigger id="batch">
                        <SelectValue placeholder="Select a batch" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no-batch-selected">No Batch</SelectItem> {/* Option for no batch */}
                        {batches.map((batch, index) => (
                          <SelectItem key={`${batch.id}-${index}`} value={batch.id}>
                            <div className="flex flex-col">
                              <span>{batch.place}</span>
                              <span className="text-xs text-muted-foreground">{batch.batchNumber}</span>
                            </div>
                          </SelectItem>
                        ))}
                        <Separator className="my-2" />
                        <Button
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => setIsBatchInputOpen(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          New Batch
                        </Button>
                      </SelectContent>
                    </Select>
                  </div>
                  </div>
                  
                  {/* Batch Selection (Optional) */}
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Barcodes *</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addBarcodeField}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add Barcode
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {formData.barcodes.map((barcode, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <Input
                            value={barcode}
                            onChange={(e) => updateBarcodeField(index, e.target.value)}
                            placeholder="Enter barcode or click generate"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => updateBarcodeField(index, generateBarcode())}
                          >
                            Generate
                          </Button>
                          {formData.barcodes.length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeBarcodeField(index)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsAddDialogOpen(false)
                      resetForm()
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleAddProduct}>Add Product</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {/* Batch Input Dialog */}
            <BatchInput
              isOpen={isBatchInputOpen}
              onOpenChange={setIsBatchInputOpen}
            />
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Package className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Products</p>
                  <p className="text-2xl font-bold text-gray-900">{filteredProducts.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Stock</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {totalFilteredStock}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <AlertCircle className="h-8 w-8 text-yellow-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Value of Selling Price</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ₹{totalSellingValue}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Package className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Inventory Price Value</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ₹{totalCostValue}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card>
          <CardHeader>
            <CardTitle>Product Catalog</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search products or barcodes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by stock" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stock Levels</SelectItem>
                  <SelectItem value="available">In Stock</SelectItem>
                  <SelectItem value="low">Low Stock</SelectItem>
                  <SelectItem value="out">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Bulk Actions */}
            {selectedProducts.length > 0 && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-700">
                    {selectedProducts.length} product(s) selected
                  </span>
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm" onClick={() => setIsBulkHsnDialogOpen(true)}>
                      Update HSN Code
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkDeleteProducts}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Selected
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openPrintDialog(selectedProducts)}>
                      <Printer className="h-4 w-4 mr-2" />
                      Print Labels
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedProducts([])}>
                      Clear Selection
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Products Table */}
            <div ref={productTableTopScrollRef} className="overflow-x-auto overflow-y-hidden mb-2">
              <div className="h-px" />
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto relative" ref={scrollableDivRef}>
              <table ref={productTableContentRef} className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4">
                      <input
                        type="checkbox"
                        checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                        onChange={selectAllProducts}
                        className="rounded"
                      />
                    </th>
                    <th className="text-left p-4 font-medium">Product</th>
                    <th className="text-left p-4 font-medium">Batch</th>
                    <th className="text-left p-4 font-medium">Price</th>
                    <th className="text-left p-4 font-medium">Selling Price</th>
                    <th className="text-left p-4 font-medium">Tax (%)</th>
                    <th className="text-left p-4 font-medium">HSN Code</th>
                    <th className="text-left p-4 font-medium">Stock</th>
                    <th className="text-left p-4 font-medium">Barcodes</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const stockStatus = getStockStatus(product.stock)
                    const StatusIcon = stockStatus.icon
                    const productBatch = batches.find(batch => batch.id === product.batchid);
                    // console.log(`Product: ${product.name}, batchid: ${product.batchid}, ProductBatch:`, productBatch); // Debugging line
                    return (
                      <tr key={product.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={selectedProducts.includes(product.id)}
                            onChange={() => toggleProductSelection(product.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="p-4">
                          <div>
                            <div className="font-medium">{product.name}</div>
                            <div className="text-xs text-gray-500">
                              {product.createdAt ? new Date(product.createdAt).toLocaleDateString() : ''}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div>
                            <div className="font-medium">Batch: {productBatch?.batchNumber || "N/A"}</div>
                            <div className="text-xs text-muted-foreground">Place: {productBatch?.place || "N/A"}</div>
                          </div>
                        </td>
                       
                        {/* Price column - Your cost price */}
                        <td className="p-4">
                          <span className="font-medium">
                            ₹{Number(product.price ?? 0).toFixed(2)}
                          </span>
                        </td>

                        {/* Selling Price column - Customer price */}
                        <td className="p-4">
                          <span className="font-medium">
                            ₹{Number((product as any).sellingPrice ?? (product as any).selling_price ?? 0).toFixed(2)}
                          </span>
                        </td>

                        <td className="p-4">
                          <span className="font-medium">
                            {(() => {
                              const hsnCodeId = (product as any).hsnCode;
                              const hsnTax = hsnCodes.find((h) => String(h.id) === String(hsnCodeId))?.tax;
                              return Number(hsnTax ?? (product as any).tax ?? 0).toFixed(2);
                            })()}%
                          </span>
                        </td>

                        <td className="p-4">
                          <span className="font-medium">
                          {(() => {
                                  const hsnCodeId = product.hsnCode;
                                  if (!hsnCodeId || hsnCodeId === "null" || hsnCodeId === null) {
                                    return <span className="font-medium text-gray-400">N/A</span>;
                                  }
                                  
                                  const hsnCode = hsnCodes.find(h => 
                                    String(h.id) === String(hsnCodeId)
                                  );
                                  
                                  return hsnCode ? (
                                    <span className="font-medium">{hsnCode.hsnCode}</span>
                                  ) : (
                                    <span className="font-medium text-gray-500">{String(hsnCodeId)}</span>
                                  );
                                })()}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-medium">{product.stock}</span>
                        </td>
                        <td className="p-4">
                          <div className="space-y-1">
                            {product.barcodes && product.barcodes.length > 0 ? (
                              product.barcodes.map((barcodeItem, idx) => (
                                <code key={idx} className="text-xs bg-gray-100 px-2 py-1 rounded block">
                                  {barcodeItem}
                                </code>
                              ))
                            ) : (
                              <code className="text-xs text-muted-foreground px-2 py-1 rounded block">N/A</code>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant={stockStatus.variant} className="flex items-center w-fit">
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {stockStatus.label}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center space-x-2">
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(product)}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openPrintDialog([product.id])}>
                              <Printer className="h-3 w-3" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 bg-transparent"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Product</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{product.name}"? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteProduct(product.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filteredProducts.length === 0 && (
                <div className="text-center py-12">
                  <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-medium text-gray-900 mb-2">No products found</h3>
                  <p className="text-gray-500 mb-4">
                    {searchTerm || stockFilter !== "all" ||
                    (priceRange.min !== "" || priceRange.max !== "") ||
                    batchFilter !== "all" ||
                    (sellingPriceRange.min !== "" || sellingPriceRange.max !== "") ||
                    (dateAddedFilter.from !== "" || dateAddedFilter.to !== "")
                      ? "Try adjusting your search or filters"
                      : "Get started by adding your first product"}
                  </p>
                  {!searchTerm && stockFilter === "all" && (
                    <Button onClick={() => setIsAddDialogOpen(true)} type="button">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Product
                    </Button>
                  )}
                </div>
              )}
            </div>
            {filteredProducts.length > 15 && (
              <div className="flex justify-between mt-4">
                <ScrollToTopButton onClick={() => scrollableDivRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
                <ScrollToBottomButton onClick={() => scrollableDivRef.current?.scrollTo({ top: scrollableDivRef.current.scrollHeight, behavior: 'smooth' })} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* NEW: Advanced Filters Dialog */}
        <Dialog open={isFiltersDialogOpen} onOpenChange={setIsFiltersDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Advanced Filters</DialogTitle>
              <DialogDescription>Refine your product search with additional criteria.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {/* Price Range */}
              <div className="space-y-2">
                <Label>Price Range (₹)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={priceRange.min}
                    onChange={(e) => setPriceRange({ ...priceRange, min: e.target.value })}
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={priceRange.max}
                    onChange={(e) => setPriceRange({ ...priceRange, max: e.target.value })}
                  />
                </div>
              </div>

              {/* Batch Filter */}
              <div className="space-y-2">
                <Label>Batch</Label>
                <Select value={batchFilter} onValueChange={setBatchFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Batches</SelectItem>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.batchNumber} ({batch.place})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selling Price Range */}
              <div className="space-y-2">
                <Label>Selling Price Range (₹)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Min"
                    value={sellingPriceRange.min}
                    onChange={(e) => setSellingPriceRange({ ...sellingPriceRange, min: e.target.value })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Max"
                    value={sellingPriceRange.max}
                    onChange={(e) => setSellingPriceRange({ ...sellingPriceRange, max: e.target.value })}
                  />
                </div>
              </div>

              {/* Date Added Range */}
              <div className="space-y-2">
                <Label>Date Added</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={dateAddedFilter.from}
                    onChange={(e) => setDateAddedFilter({ ...dateAddedFilter, from: e.target.value })}
                  />
                  <Input
                    type="date"
                    value={dateAddedFilter.to}
                    onChange={(e) => setDateAddedFilter({ ...dateAddedFilter, to: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetAdvancedFilters}>
                Reset All
              </Button>
              <Button onClick={() => setIsFiltersDialogOpen(false)}>
                Apply Filters
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog to display batches for the selected day */}
        <Dialog open={isBatchesForDayDialogOpen} onOpenChange={setIsBatchesForDayDialogOpen}>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Batches on {selectedDate ? selectedDate.toDateString() : ""}</DialogTitle>
              <DialogDescription>Select a batch to view its products.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {unbatchedProductsForSelectedDate.length > 0 && (
                <Card
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => {
                    setProductsToDisplayInByDateDialog(unbatchedProductsForSelectedDate);
                    setIsBatchesForDayDialogOpen(false);
                    setIsByDateDialogOpen(true);
                  }}
                >
                  <CardHeader>
                    <CardTitle>Un-Batched Products</CardTitle>
                    <CardDescription>{unbatchedProductsForSelectedDate.length} products not assigned to a batch</CardDescription>
                  </CardHeader>
                </Card>
              )}

              {batchesForSelectedDate.length > 0 && (
                <>
                  {unbatchedProductsForSelectedDate.length > 0 && <Separator className="my-2" />}
                  {batchesForSelectedDate.map((batch) => (
                    <Card key={batch.id} className="cursor-pointer hover:bg-gray-50" onClick={() => handleBatchCardClick(batch)}>
                      <CardHeader>
                        <CardTitle>{batch.batchNumber}</CardTitle>
                        <CardDescription>{batch.place}</CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </>
              )}

              {batchesForSelectedDate.length === 0 && unbatchedProductsForSelectedDate.length === 0 && (
                <p className="text-center text-muted-foreground">No products found for this date.</p>
              )}
            </div>
            <DialogFooter className="mt-4 flex justify-end items-center space-x-2">
              <Button variant="outline" onClick={() => setIsBatchesForDayDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog to view products for a specific batch on a specific date */}
        <Dialog open={isViewProductsForBatchDialogOpen} onOpenChange={setIsViewProductsForBatchDialogOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Products in Batch {selectedBatchForProducts?.batchNumber} on {selectedDate ? selectedDate.toDateString() : ""}
              </DialogTitle>
              <DialogDescription>
                Listed by product id, name, stock, and price.
              </DialogDescription>
            </DialogHeader>

            {/* Logic for productsForBatchAndDate moved outside IIFE */}
            {(() => {
              let totalStock = 0;
              let totalValue = 0;
              const productsForBatchAndDate = (productsByDate[selectedKey] || []).filter(
                (p) => p.batchid === selectedBatchForProducts?.id
              );

              const rows = productsForBatchAndDate.map((p) => {
                const productBatch = batches.find(batch => batch.id === p.batchid);
                const stock = Number((p as any).stock) || 0; // Ensure stock is a number, default to 0
                const price = Number((p as any).price) || 0; // Ensure price is a number, default to 0
                const value = stock * price;

                totalStock += stock;
                totalValue += value;

                const barcodeArray = (p.barcode && p.barcode.trim() !== '')
  ? p.barcode.split(',').map(b => b.trim()).filter(b => b !== '')
  : [];

return (
  <tr key={(p as any).id} className="border-b hover:bg-gray-50">
    <td className="p-2">
      {barcodeArray.length > 0 ? (
        <div className="space-y-1">
          {barcodeArray.map((barcode, idx) => (
            <div key={idx} className="text-xs bg-gray-100 px-2 py-1 rounded">
              {barcode}
            </div>
          ))}
        </div>
      ) : (
        "N/A"
      )}
    </td>
    <td className="p-2">{(p as any).name}</td>
    <td className="p-2">{productBatch?.batchNumber || "N/A"} ({productBatch?.place || "N/A"})</td>
    <td className="p-2 text-right">{stock}</td>
    <td className="p-2 text-right">₹{price.toFixed(2)}</td>
    <td className="p-2 text-right">₹{value.toFixed(2)}</td>
  </tr>
);

              });

              return (
                <div className="overflow-x-auto max-h-[calc(90vh-180px)] relative" ref={scrollableDivRef}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Product Barcode Number</th>
                        <th className="text-left p-2">Product Name</th>
                        <th className="text-left p-2">Product Batch Number</th>
                        <th className="text-right p-2">Stock</th>
                        <th className="text-right p-2">Price</th>
                        <th className="text-right p-2">Value (Total Value)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows}
                      <tr className="font-bold border-t">
                        <td colSpan={3} className="p-2 text-right">Total:</td>
                        <td className="p-2 text-right">{totalStock}</td>
                        <td className="p-2 text-right"></td>
                        <td className="p-2 text-right">₹{totalValue.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <DialogFooter className="mt-4 flex justify-end items-center space-x-2">
                <Button variant="outline" onClick={() => setIsViewProductsForBatchDialogOpen(false)}>
                  Close
                </Button>
              <Button
                onClick={() => {
                  if (!selectedDate || !selectedBatchForProducts) return;
                  const productsToPrint = (productsByDate[selectedKey] || []).filter(
                    (p) => p.batchid === selectedBatchForProducts.id
                  );
                  const productIdsToPrint = productsToPrint.map(p => p.id);
                  const htmlContent = generatePrintHtml(
                    productsToPrint as Product[],
                    selectedDate,
                    assignedStores?.[0]?.name || "Siri Art Jewellers",
                    {
                      batchId: selectedBatchForProducts.id,
                      batchName: selectedBatchForProducts.batchNumber,
                      batchPlace: selectedBatchForProducts.place,
                    }
                  );
                  unifiedPrint({
                    htmlContent,
                    useBackendPrint: true,
                    storeName: assignedStores?.[0]?.name || "Siri Art Jewellers",
                  });
                }}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* NEW: Dialog to display products for the selected day when no batches are present */}
        <Dialog open={isByDateDialogOpen} onOpenChange={setIsByDateDialogOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Products on {selectedDate ? selectedDate.toDateString() : ""}
              </DialogTitle>
              <DialogDescription>
                Listed by product id, name, stock, and price.
              </DialogDescription>
            </DialogHeader>

            {(() => {
              let totalStock = 0;
              let totalValue = 0;
              const productsForCurrentDisplay = productsToDisplayInByDateDialog; // Use the new state variable

              const rows = productsForCurrentDisplay.map((p) => {
                const productBatch = batches.find(batch => batch.id === p.batchid);
                const stock = Number((p as any).stock) || 0;
                const price = Number((p as any).price) || 0;
                const value = stock * price;

                totalStock += stock;
                totalValue += value;

                const barcodeArray = (p.barcode && p.barcode.trim() !== '')
                  ? p.barcode.split(',').map(b => b.trim()).filter(b => b !== '')
                  : [];

                return (
                  <tr key={(p as any).id} className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      {barcodeArray.length > 0 ? (
                        <div className="space-y-1">{barcodeArray.map((barcode, idx) => (
                            <div key={idx} className="text-xs bg-gray-100 px-2 py-1 rounded">{barcode}</div>
                          ))}
                        </div>
                      ) : (
                        "N/A"
                      )}
                    </td>
                    <td className="p-2">{(p as any).name}</td>
                    <td className="p-2">{productBatch?.batchNumber || "N/A"} ({productBatch?.place || "N/A"})</td>
                    <td className="p-2 text-right">{stock}</td>
                    <td className="p-2 text-right">₹{price.toFixed(2)}</td>
                    <td className="p-2 text-right">₹{value.toFixed(2)}</td>
                  </tr>
                );
              });

              return (
                <div className="overflow-x-auto max-h-[calc(90vh-180px)] relative" ref={scrollableDivRef}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Product Barcode Number</th>
                        <th className="text-left p-2">Product Name</th>
                        <th className="text-left p-2">Product Batch</th>
                        <th className="text-right p-2">Stock</th>
                        <th className="text-right p-2">Price</th>
                        <th className="text-right p-2">Value (Total Value)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows}
                      <tr className="font-bold border-t">
                        <td colSpan={3} className="p-2 text-right">Total:</td>
                        <td className="p-2 text-right">{totalStock}</td>
                        <td className="p-2 text-right"></td>
                        <td className="p-2 text-right">₹${totalValue.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <DialogFooter className="mt-4 flex justify-end items-center space-x-2">
                <Button variant="outline" onClick={() => setIsByDateDialogOpen(false)}>
                  Close
                </Button>
              <Button
                onClick={() => {
                  if (!selectedDate) return;
                  const productsToPrint = productsToDisplayInByDateDialog; // Use the products currently displayed in the dialog
                  const productIdsToPrint = productsToPrint.map(p => p.id);
                  const htmlContent = generatePrintHtml(
                    productsToPrint,
                    selectedDate,
                    assignedStores?.[0]?.name || "Siri Art Jewellers",
                    {
                      batchId: "N/A",
                      batchName: "Un-batched / Mixed",
                    }
                  );
                  unifiedPrint({
                    htmlContent,
                    useBackendPrint: true,
                    storeName: assignedStores?.[0]?.name || "Siri Art Jewellers",
                  });
                }}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PrintDialog
          products={productsToPrint}
          isOpen={isPrintDialogOpen}
          onClose={() => setIsPrintDialogOpen(false)}
          onPrintSuccess={handlePrintSuccess}
          storeName={assignedStores?.[0]?.name || "Siri Art Jewellers"}
          forceBackendPrint={true}
          batches={batches}
        />

        {/* Edit Product Dialog (unchanged, but with formData updates if needed) */}
        <Dialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) {
              resetForm();
              setEditingProduct(null);
              setSelectedbatchid(null); // Reset selected batch when edit dialog closes
            }
          }}
        >
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
              <DialogDescription>Update product information and barcode details</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Product Name *</Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      const input = e.target.value.toLowerCase();
                      const suggestions = products
                        .map((p) => p.name)
                        .filter((name) => name.toLowerCase().includes(input) && name.toLowerCase() !== input)
                        .slice(0, 5);
                      setNameSuggestions(suggestions);
                    }}
                    placeholder="Enter product name"
                    list="product-name-suggestions-edit"
                  />
                  <datalist id="product-name-suggestions-edit">
                    {nameSuggestions.map((name, index) => (
                      <option key={`${name}-${index}`} value={name} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-price">Price (₹) *</Label>
                  <Input
                    id="edit-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-stock">Stock Quantity *</Label>
                  <Input
                    id="edit-stock"
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-sellingPrice">Selling Price (₹)</Label>
                <Input
                  id="edit-sellingPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.sellingPrice}
                  onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-hsnCode">HSN Code</Label>
                  <Select
                    value={formData.hsnCode || "none"}
                    onValueChange={(value) => handleHsnCodeChange(value === "none" ? "" : value)}
                  >
                    <SelectTrigger id="edit-hsnCode">
                      <SelectValue placeholder="Select HSN Code" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {hsnCodes.map((hsn) => (
                        <SelectItem key={hsn.id} value={hsn.id}>
                          {hsn.hsnCode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.hsnCode && (
                    <p className="text-xs text-muted-foreground">
                      Tax: {Number(hsnCodes.find((h) => String(h.id) === String(formData.hsnCode))?.tax ?? 0).toFixed(2)}%
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                <Label htmlFor="edit-batch">Batch (Optional)</Label>
                <Select
                  value={formData.batchid || ""}
                      onValueChange={(value) => {
                        setFormData({ ...formData, batchid: value === "no-batch-selected" ? "" : value });
                      }}
                >
                  <SelectTrigger id="edit-batch">
                    <SelectValue placeholder="Select a batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-batch-selected">No Batch</SelectItem> {/* Option for no batch */}
                    {batches.map((batch, index) => (
                      <SelectItem key={`${batch.id}-${index}`} value={batch.id}>
                        <div className="flex flex-col">
                          <span>{batch.place}</span>
                          <span className="text-xs text-muted-foreground">{batch.batchNumber}</span>
                        </div>
                      </SelectItem>
                    ))}
                    <Separator className="my-2" />
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => setIsBatchInputOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      New Batch
                    </Button>
                  </SelectContent>
                </Select>
              </div>
            </div>
              {/* Batch Selection for Edit Product (Optional) */}
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Barcodes *</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addBarcodeField}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Barcode
                  </Button>
                </div>
                <div className="space-y-2">
                  {formData.barcodes.map((barcode, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Input
                        value={barcode}
                        onChange={(e) => updateBarcodeField(index, e.target.value)}
                        placeholder="Enter barcode or click generate"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateBarcodeField(index, generateBarcode())}
                      >
                        Generate
                      </Button>
                      {formData.barcodes.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeBarcodeField(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false)
                  resetForm()
                  setEditingProduct(null)
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleEditProduct}>Update Product</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Bulk HSN Code Update Dialog */}
<Dialog open={isBulkHsnDialogOpen} onOpenChange={setIsBulkHsnDialogOpen}>
  <DialogContent className="sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle>Update HSN Code for Selected Products</DialogTitle>
      <DialogDescription>
        Set HSN code for {selectedProducts.length} selected product(s)
      </DialogDescription>
    </DialogHeader>
    <div className="grid gap-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="bulk-hsn">HSN Code</Label>
        <Select
          value={bulkHsnValue || "none"}
          onValueChange={(value) => setBulkHsnValue(value === "none" ? "" : value)}
        >
          <SelectTrigger id="bulk-hsn">
            <SelectValue placeholder="Select HSN Code" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {hsnCodes.map((hsn) => (
              <SelectItem key={hsn.id} value={hsn.id}>
                {hsn.hsnCode}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => {
          setIsBulkHsnDialogOpen(false);
          setBulkHsnValue("");
        }}
      >
        Cancel
      </Button>
      <Button onClick={handleBulkHsnUpdate}>
        Update HSN Code
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
      </div>
    </DashboardLayout>
  )
}
