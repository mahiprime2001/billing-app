"use client"

import React, { useEffect, useMemo, useState, useRef } from "react";
import { getBarcode } from "@/app/utils/getBarcode";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { Product as ProductType, Batch } from "@/lib/types";
import { useIncrementalProducts } from "@/hooks/useIncrementalProducts";
import { ProductLoadingBar } from "@/components/ProductLoadingBar";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Warehouse,
  ShoppingCart,
  X,
  ArrowUpDown,
  Layers,
  SlidersHorizontal,
  Check,
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
  // Products load progressively in 200-row pages so the table starts populating
  // within the first page round-trip instead of waiting for the entire catalog.
  const {
    data: productsData = [],
    error: productsError,
    isLoading: productsLoading,
    isStreaming: productsStreaming,
    progress: productsProgress,
    loadedPages: productsLoadedPages,
    totalCount: productsTotalCount,
    mutate,
  } = useIncrementalProducts(200);
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
        ? p.barcode.split(',').map((b) => b.trim()).filter((b) => b !== "")
        : [],
      price: typeof p.price === 'number' ? p.price : Number((p as any).price ?? 0),
      sellingPrice:
        typeof (p as any).sellingPrice === "number"
          ? (p as any).sellingPrice
          : Number((p as any).sellingPrice ?? (p as any).selling_price ?? (p as any).displayPrice ?? (p as any).price ?? 0),
      displayPrice: (p as any).sellingPrice ?? (p as any).selling_price ?? (p as any).displayPrice ?? (p as any).price ?? 0,
      // Use createdat (app-managed, no underscore) first — it is never overwritten on updates.
      // p.createdAt can come from Supabase's created_at→camelCase conversion which may be wrong.
      createdAt: (p as any).createdat || (p as any).created_at || p.createdAt,
    }))
    .filter(p => !(p as any)._deleted);
}, [productsData]);

  // Surface fetch errors without flooding the console — the previous version
  // stringified the entire batches array on every change, which was expensive
  // for large catalogs and re-fired the effect frequently.
  useEffect(() => {
    if (productsError) console.error("Products fetch error:", productsError);
    if (batchesError) console.error("Batches fetch error:", batchesError);
  }, [productsError, batchesError]);

  const scrollableDivRef = useRef<HTMLDivElement>(null);
  const productTableTopScrollRef = useRef<HTMLDivElement>(null);
  const productTableContentRef = useRef<HTMLTableElement>(null);
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [assignedStores, setAssignedStores] = useState<SystemStore[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  // Debounce the search input so the filter pipeline doesn't rerun on every
  // keystroke when there are thousands of products in memory.
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 180);
    return () => window.clearTimeout(handle);
  }, [searchTerm]);
  // Cap on how many filtered rows we render to the DOM at once. Beyond a
  // few hundred rows the browser layout pass becomes the bottleneck, so we
  // show the first N matches and let the user click "Show more" to expand.
  const DEFAULT_ROW_CAP = 100;
  const [renderRowCap, setRenderRowCap] = useState(DEFAULT_ROW_CAP);
  // Reset the cap whenever the search / filter changes — a fresh query
  // should always start with the cheap top-N view.
  const [searchScope, setSearchScope] = useState("all")
  const [stockFilter, setStockFilter] = useState("all")
  // NEW: Advanced filters state
  const [priceRange, setPriceRange] = useState({ min: "", max: "" });
  const [batchFilter, setBatchFilter] = useState("all");
  const [sellingPriceRange, setSellingPriceRange] = useState({ min: "", max: "" });
  const [dateAddedFilter, setDateAddedFilter] = useState({ from: "", to: "" });
  const [hsnFilter, setHsnFilter] = useState("all");
  const [batchAssignmentFilter, setBatchAssignmentFilter] = useState("all");
  const [taxRange, setTaxRange] = useState({ min: "", max: "" });
  const [sortBy, setSortBy] = useState("newest");
  const [draftPriceRange, setDraftPriceRange] = useState({ min: "", max: "" });
  const [draftBatchFilter, setDraftBatchFilter] = useState("all");
  const [draftSellingPriceRange, setDraftSellingPriceRange] = useState({ min: "", max: "" });
  const [draftDateAddedFilter, setDraftDateAddedFilter] = useState({ from: "", to: "" });
  const [draftHsnFilter, setDraftHsnFilter] = useState("all");
  const [draftBatchAssignmentFilter, setDraftBatchAssignmentFilter] = useState("all");
  const [draftTaxRange, setDraftTaxRange] = useState({ min: "", max: "" });
  const [isFiltersDialogOpen, setIsFiltersDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [productsToPrint, setProductsToPrint] = useState<Product[]>([]);
  const [isBulkHsnDialogOpen, setIsBulkHsnDialogOpen] = useState(false);
  const [bulkHsnValue, setBulkHsnValue] = useState("");
  const [associatedBillsDialogOpen, setAssociatedBillsDialogOpen] = useState(false);
  const [associatedBills, setAssociatedBills] = useState<{ id: string; date: string }[]>([]);

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
  const todayDateInput = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  const clampDateToToday = (value: string) => {
    if (!value) return "";
    return value > todayDateInput ? todayDateInput : value;
  };

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
  const [showAddNameSuggestions, setShowAddNameSuggestions] = useState(false);
  const [showEditNameSuggestions, setShowEditNameSuggestions] = useState(false);
  const MAX_NAME_SUGGESTIONS = 100;

  const getNameSuggestions = (inputValue: string) => {
    const input = inputValue.trim().toLowerCase();
    if (!input) return [];

    return Array.from(new Set(products.map((p) => p.name)))
      .filter((name) => {
        const normalized = name.toLowerCase();
        return normalized.includes(input) && normalized !== input;
      })
      .slice(0, MAX_NAME_SUGGESTIONS);
  };

  const normalizeHsnCodeValue = (value: unknown): string => {
    if (value == null) return "";
    const normalized = String(value).trim();
    if (!normalized || normalized === "null" || normalized === "undefined") {
      return "";
    }
    return normalized;
  };

  const getProductHsnCodeId = (product: ProductType | Product | Record<string, unknown>): string => {
    const rawValue =
      (product as any).hsnCode ??
      (product as any).hsnCodeId ??
      (product as any).hsn_code_id;
    return normalizeHsnCodeValue(rawValue);
  };

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
    });
    setNameSuggestions([]);
    setShowAddNameSuggestions(false);
    setShowEditNameSuggestions(false);
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

  const resetProductFilters = () => {
    setSearchTerm("");
    setSearchScope("all");
    setStockFilter("all");
    setPriceRange({ min: "", max: "" });
    setBatchFilter("all");
    setSellingPriceRange({ min: "", max: "" });
    setDateAddedFilter({ from: "", to: "" });
    setHsnFilter("all");
    setBatchAssignmentFilter("all");
    setTaxRange({ min: "", max: "" });
    setSortBy("newest");

    setDraftPriceRange({ min: "", max: "" });
    setDraftBatchFilter("all");
    setDraftSellingPriceRange({ min: "", max: "" });
    setDraftDateAddedFilter({ from: "", to: "" });
    setDraftHsnFilter("all");
    setDraftBatchAssignmentFilter("all");
    setDraftTaxRange({ min: "", max: "" });
  };

  const focusBarcodeInList = (barcode: string) => {
    resetProductFilters();
    setSearchScope("barcode");
    setSearchTerm(barcode.trim());
  };

  const handleAddProduct = async () => {
    if (!formData.name || !formData.price || !formData.stock) {
      alert("Please fill in all required fields");
      return;
    }

    if (Number.parseInt(formData.stock) < 0) {
      alert("Stock quantity cannot be negative");
      return;
    }

    if (Number.parseInt(formData.price) <= 0) {
      alert("Price must be a positive number");
      return;
    }

    if (formData.sellingPrice && Number.parseInt(formData.sellingPrice) <= 0) {
      alert("Selling price must be a positive number");
      return;
    }

    const validBarcodes = Array.from(new Set(formData.barcodes.map((b) => b.trim()).filter((b) => b !== "")));
    if (validBarcodes.length === 0) {
      alert("Please add at least one barcode.");
      return;
    }

    for (const barcode of validBarcodes) {
      if (!validateBarcode(barcode)) {
        alert(`Please enter a valid barcode (1-80 characters) for: ${barcode}`);
        return;
      }
      const barcodeKey = barcode.trim().toLowerCase();
      const existingBarcode = barcodeIndex.get(barcodeKey);
      if (existingBarcode) {
        focusBarcodeInList(barcode);
        alert(`Barcode already exists: ${barcode} (Product: ${existingBarcode.name}). Filters were cleared and search was set to this barcode.`);
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
      price: Number.parseInt(formData.price),
      stock: Number.parseInt(formData.stock),
      sellingPrice: Number.parseInt(formData.sellingPrice),
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

      // Inject the new product into local state immediately. No catalog refetch
      // — that's what made Add feel slow before.
      let createdId: string | undefined;
      try {
        const body = await response.clone().json();
        createdId = body?.id;
      } catch {
        // ignore — backend may not include body in all cases
      }
      const nowIso = new Date().toISOString();
      const optimisticProduct: ProductType = {
        ...newProduct,
        id: createdId || `local-${Date.now()}`,
        createdAt: nowIso,
        updatedAt: nowIso,
      } as ProductType;
      await mutate(
        (prev) => {
          const next = Array.isArray(prev) ? [optimisticProduct, ...prev] : [optimisticProduct];
          return next;
        },
        { revalidate: false },
      );

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

    if (Number.parseInt(formData.stock) < 0) {
      alert("Stock quantity cannot be negative");
      return;
    }

    if (Number.parseInt(formData.price) <= 0) {
      alert("Price must be a positive number");
      return;
    }

    if (formData.sellingPrice && Number.parseInt(formData.sellingPrice) <= 0) {
      alert("Selling price must be a positive number");
      return;
    }

    const validBarcodes = Array.from(new Set(formData.barcodes.map((b) => b.trim()).filter((b) => b !== "")));
    if (validBarcodes.length === 0) {
      alert("Please add at least one barcode.");
      return;
    }

    for (const barcode of validBarcodes) {
      if (!validateBarcode(barcode)) {
        alert(`Please enter a valid barcode (1-80 characters) for: ${barcode}`);
        return;
      }
      const barcodeKey = barcode.trim().toLowerCase();
      const existingBarcode = barcodeIndex.get(barcodeKey);
      // Allow keeping a barcode that already belongs to the product being edited.
      if (existingBarcode && existingBarcode.id !== editingProduct.id) {
        focusBarcodeInList(barcode);
        alert(`Barcode already exists: ${barcode} (Product: ${existingBarcode.name}). Filters were cleared and search was set to this barcode.`);
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
      price: Number.parseInt(formData.price),
      stock: Number.parseInt(formData.stock),
      sellingPrice: Number.parseInt(formData.sellingPrice),
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
        let serverDetail = "";
        try {
          const body = await response.clone().json();
          serverDetail = body?.error || body?.message || JSON.stringify(body);
        } catch {
          try {
            serverDetail = await response.text();
          } catch {
            serverDetail = "";
          }
        }
        const detailLine = serverDetail ? `\n${serverDetail}` : "";
        throw new Error(
          `Failed to update product (HTTP ${response.status} ${response.statusText})${detailLine}`,
        );
      }

      const editingId = editingProduct.id;
      const nowIso = new Date().toISOString();
      await mutate(
        (prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((p) =>
            p.id === editingId
              ? ({ ...p, ...updatedProduct, updatedAt: nowIso } as ProductType)
              : p,
          );
        },
        { revalidate: false },
      );

      resetForm();
      setEditingProduct(null);
      setIsEditDialogOpen(false);
    } catch (error) {
      console.error("Error updating product:", error);
      const message = error instanceof Error ? error.message : String(error);
      alert(message || "Failed to update product.");
    }
  };

const handleDeleteProduct = async (productId: string) => {
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

    if (response.status === 409) {
      const data = await response.json();
      setAssociatedBills(data.associated_bills ?? []);
      setAssociatedBillsDialogOpen(true);
      return;
    }

    if (!response.ok) {
      throw new Error("Failed to delete product");
    }

    // Optimistically drop the row — skip the full refetch entirely.
    await mutate(
      (prev) => (Array.isArray(prev) ? prev.filter((p) => p.id !== productId) : prev),
      { revalidate: false },
    );
  } catch (error) {
    console.error("Error deleting product:", error);
    alert("Failed to delete product.");
    // On error, force a refetch so the UI reflects the real DB state.
    await mutate();
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
    await mutate(
      (prev) => (Array.isArray(prev) ? prev.filter((p) => !selectedSet.has(p.id)) : prev),
      { revalidate: false },
    );
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

      alert(`Successfully deleted ${productIdsToDelete.length} product(s)`);
    } catch (error) {
      console.error("Error deleting products in bulk:", error);
      alert("Failed to delete some products. Please try again.");
      await mutate();
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

      const responses = await Promise.all(updatePromises);
      const failed = responses.filter((r) => !r.ok);
      if (failed.length > 0) {
        let message = `Failed to update HSN code for ${failed.length} product(s)`;
        try {
          const body = await failed[0].json();
          if (body?.error) message = String(body.error);
        } catch {
          // keep default message
        }
        throw new Error(message);
      }

      // Apply the HSN change in place so the list updates instantly.
      const updatedIds = new Set(selectedProducts);
      const nowIso = new Date().toISOString();
      await mutate(
        (prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((p) =>
            updatedIds.has(p.id)
              ? ({ ...p, hsnCode: hsnValue as any, updatedAt: nowIso } as ProductType)
              : p,
          );
        },
        { revalidate: false },
      );
      setSelectedProducts([]);
      setBulkHsnValue("");
      setIsBulkHsnDialogOpen(false);
      alert(`Successfully updated HSN code for ${selectedProducts.length} products`);
    } catch (error) {
      console.error("Error updating HSN code:", error);
      alert(error instanceof Error ? error.message : "Failed to update HSN code for some products");
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
      hsnCode: getProductHsnCodeId(product),
    })
    setNameSuggestions([]);
    setShowEditNameSuggestions(false);
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
    setHsnFilter("all");
    setBatchAssignmentFilter("all");
    setTaxRange({ min: "", max: "" });
    setSortBy("newest");
    setSearchScope("all");
    setDraftPriceRange({ min: "", max: "" });
    setDraftBatchFilter("all");
    setDraftSellingPriceRange({ min: "", max: "" });
    setDraftDateAddedFilter({ from: "", to: "" });
    setDraftHsnFilter("all");
    setDraftBatchAssignmentFilter("all");
    setDraftTaxRange({ min: "", max: "" });
  };

  const syncDraftFiltersFromApplied = () => {
    setDraftPriceRange(priceRange);
    setDraftBatchFilter(batchFilter);
    setDraftSellingPriceRange(sellingPriceRange);
    setDraftDateAddedFilter(dateAddedFilter);
    setDraftHsnFilter(hsnFilter);
    setDraftBatchAssignmentFilter(batchAssignmentFilter);
    setDraftTaxRange(taxRange);
  };

  const openFiltersDialog = () => {
    syncDraftFiltersFromApplied();
    setIsFiltersDialogOpen(true);
  };

  const applyAdvancedFilters = () => {
    const normalizedDateAddedFilter = {
      from: clampDateToToday(draftDateAddedFilter.from),
      to: clampDateToToday(draftDateAddedFilter.to),
    };

    setPriceRange(draftPriceRange);
    setBatchFilter(draftBatchFilter);
    setSellingPriceRange(draftSellingPriceRange);
    setDateAddedFilter(normalizedDateAddedFilter);
    setHsnFilter(draftHsnFilter);
    setBatchAssignmentFilter(draftBatchAssignmentFilter);
    setTaxRange(draftTaxRange);
    setIsFiltersDialogOpen(false);
  };

  const hsnCodeMap = useMemo(
    () => new Map(hsnCodes.map((hsn) => [String(hsn.id), hsn])),
    [hsnCodes]
  );

  const batchMap = useMemo(
    () => new Map(batches.map((batch) => [batch.id, batch])),
    [batches]
  );

  // Index every barcode → product so dedupe checks during Add/Edit become an
  // O(1) Map lookup instead of an O(n × m) nested scan across the catalog.
  const barcodeIndex = useMemo(() => {
    const map = new Map<string, Product>();
    for (const product of products) {
      const list = product.barcodes || [];
      for (const code of list) {
        const key = String(code || "").trim().toLowerCase();
        if (key) map.set(key, product);
      }
    }
    return map;
  }, [products]);

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
    // ── Hoist invariant work OUT of the per-product loop ──
    // These values depend only on the filters, not on the product being
    // tested. Computing them once instead of N times shaves hundreds of
    // string ops + parseFloat calls per re-filter when the catalog is big.
    const q = debouncedSearchTerm.trim().toLowerCase();
    const hasQuery = q.length > 0;
    const scope = searchScope;

    const priceMin = priceRange.min !== "" ? parseFloat(priceRange.min) : -Infinity;
    const priceMax = priceRange.max !== "" ? parseFloat(priceRange.max) : Infinity;
    const sellingPriceMin = sellingPriceRange.min !== "" ? parseFloat(sellingPriceRange.min) : -Infinity;
    const sellingPriceMax = sellingPriceRange.max !== "" ? parseFloat(sellingPriceRange.max) : Infinity;
    const taxMin = taxRange.min ? parseFloat(taxRange.min) : 0;
    const taxMax = taxRange.max ? parseFloat(taxRange.max) : Infinity;
    const batchFilterStr = String(batchFilter);
    const fromDateObj = dateAddedFilter.from
      ? new Date(`${dateAddedFilter.from}T00:00:00.000`)
      : null;
    const toDateObj = dateAddedFilter.to
      ? new Date(`${dateAddedFilter.to}T23:59:59.999`)
      : null;
    const hasDateFilter = !!(fromDateObj || toDateObj);
    const hasStockFilter = stockFilter !== "all";
    const hasBatchAssignFilter = batchAssignmentFilter !== "all";
    const hasBatchFilter = batchFilter !== "all";
    const hasHsnFilter = hsnFilter !== "all";
    const hasTaxFilter = taxRange.min !== "" || taxRange.max !== "";
    const hasPriceFilter = priceRange.min !== "" || priceRange.max !== "";
    const hasSellingPriceFilter = sellingPriceRange.min !== "" || sellingPriceRange.max !== "";

    const filtered = products.filter((product) => {
      // Cheap, almost-always-true filters first — short-circuit early.
      if (hasStockFilter) {
        const stock = Number(product.stock ?? 0);
        if (stockFilter === "low" && !(stock > 0 && stock <= 5)) return false;
        if (stockFilter === "out" && stock !== 0) return false;
        if (stockFilter === "available" && !(stock > 5)) return false;
        if (stockFilter === "unordered") {
          const sold = Number((product as any).soldStock ?? 0);
          const inStores = Number(
            (product as any).inStoresStock ?? (product as any).allocatedStock ?? 0,
          );
          if (sold !== 0 || inStores !== 0) return false;
        }
      }

      if (hasPriceFilter) {
        const productPrice = Number(product.price) || 0;
        if (productPrice < priceMin || productPrice > priceMax) return false;
      }

      if (hasBatchFilter) {
        const productBatchId =
          product.batchid !== undefined && product.batchid !== null
            ? String(product.batchid)
            : "";
        if (productBatchId !== batchFilterStr) return false;
      }

      if (hasBatchAssignFilter) {
        const hasBatch = Boolean(product.batchid);
        if (batchAssignmentFilter === "with-batch" && !hasBatch) return false;
        if (batchAssignmentFilter === "without-batch" && hasBatch) return false;
      }

      if (hasSellingPriceFilter) {
        const productSellingPrice =
          Number(
            (product as any).sellingPrice ??
              (product as any).selling_price ??
              (product as any).displayPrice ??
              product.price ??
              0,
          ) || 0;
        if (productSellingPrice < sellingPriceMin || productSellingPrice > sellingPriceMax) {
          return false;
        }
      }

      if (hasDateFilter) {
        const createdAtRaw =
          (product as any).createdAt ??
          (product as any).createdat ??
          (product as any).created_at ??
          null;
        const createdAt = createdAtRaw === null
          ? null
          : new Date(typeof createdAtRaw === "number" ? createdAtRaw : String(createdAtRaw));
        if (!createdAt || isNaN(createdAt.getTime())) return false;
        if (fromDateObj && createdAt < fromDateObj) return false;
        if (toDateObj && createdAt > toDateObj) return false;
      }

      // Look up HSN once per product even if the filter doesn't need it —
      // we still need it for tax/hsn checks below.
      let hsnCodeId: string | null = null;
      const getHsnId = () => {
        if (hsnCodeId === null) hsnCodeId = getProductHsnCodeId(product);
        return hsnCodeId;
      };

      if (hasHsnFilter) {
        const id = getHsnId();
        if (hsnFilter === "none") {
          if (id.trim() !== "") return false;
        } else if (id !== hsnFilter) {
          return false;
        }
      }

      if (hasTaxFilter) {
        const productTax = Number(hsnCodeMap.get(getHsnId())?.tax ?? (product as any).tax ?? 0);
        if (productTax < taxMin || productTax > taxMax) return false;
      }

      // Search query last — it's the most expensive per-product check.
      if (hasQuery) {
        if (scope === "name") {
          if (!product.name.toLowerCase().includes(q)) return false;
        } else if (scope === "barcode") {
          if (!(getBarcode(product) || "").toLowerCase().includes(q)) return false;
        } else if (scope === "batch") {
          const batch = product.batchid ? batchMap.get(product.batchid) : undefined;
          const batchText = `${batch?.batchNumber ?? ""} ${batch?.place ?? ""}`.toLowerCase();
          if (!batchText.includes(q)) return false;
        } else if (scope === "hsn") {
          const id = getHsnId();
          const hsnText = (hsnCodeMap.get(id)?.hsnCode || id).toLowerCase();
          if (!hsnText.includes(q)) return false;
        } else {
          // scope === "all" — short-circuit on the first hit.
          if (product.name.toLowerCase().includes(q)) return true;
          if ((getBarcode(product) || "").toLowerCase().includes(q)) return true;
          const batch = product.batchid ? batchMap.get(product.batchid) : undefined;
          const batchText = `${batch?.batchNumber ?? ""} ${batch?.place ?? ""}`.toLowerCase();
          if (batchText.includes(q)) return true;
          const id = getHsnId();
          const hsnText = (hsnCodeMap.get(id)?.hsnCode || id).toLowerCase();
          if (hsnText.includes(q)) return true;
          return false;
        }
      }

      return true;
    });

    const sortedFilteredProducts = [...filtered].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      const stockA = Number(a.stock ?? 0);
      const stockB = Number(b.stock ?? 0);
      const priceA = Number(a.price ?? 0);
      const priceB = Number(b.price ?? 0);

      if (sortBy === "oldest") return dateA - dateB;
      if (sortBy === "name_asc") return nameA.localeCompare(nameB);
      if (sortBy === "name_desc") return nameB.localeCompare(nameA);
      if (sortBy === "stock_desc") return stockB - stockA;
      if (sortBy === "price_asc") return priceA - priceB;
      if (sortBy === "price_desc") return priceB - priceA;
      return dateB - dateA;
    });
  
  // console.log("Filtered Products:", sortedFilteredProducts);
  return sortedFilteredProducts;
}, [
  products,
  debouncedSearchTerm,
  searchScope,
  stockFilter,
  priceRange,
  batchFilter,
  batchAssignmentFilter,
  sellingPriceRange,
  dateAddedFilter,
  hsnFilter,
  taxRange,
  sortBy,
  hsnCodeMap,
  batchMap,
]);

  // Reset the row-render cap whenever filters change so a fresh query
  // doesn't carry over an expanded view from the previous one.
  useEffect(() => {
    setRenderRowCap(DEFAULT_ROW_CAP);
  }, [
    debouncedSearchTerm,
    searchScope,
    stockFilter,
    priceRange,
    batchFilter,
    batchAssignmentFilter,
    sellingPriceRange,
    dateAddedFilter,
    hsnFilter,
    taxRange,
    sortBy,
  ]);

  // The slice actually rendered into the DOM. Keeping this small is the
  // biggest single perf win on a big catalog because the browser layout
  // pass scales with row count.
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, renderRowCap),
    [filteredProducts, renderRowCap],
  );

  // Memoized total inventory value calculation (based on selling price)
  const totalSellingValue = useMemo(() => {
    const totalValue = filteredProducts.reduce((sum, p) => {
      const stock = Number(p.stock ?? 0);
      const sellingPrice = Number(
        (p as any).sellingPrice ??
        (p as any).selling_price ??
        (p as any).displayPrice ??
        (p as any).price ??
        0
      );
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

  const godownStats = useMemo(() => {
    let items = 0;
    let stock = 0;
    for (const p of filteredProducts) {
      const available = Number(
        (p as any).availableStock ?? (p as any).globalStock ?? p.stock ?? 0
      );
      if (available > 0) items += 1;
      stock += available;
    }
    return { items, stock };
  }, [filteredProducts]);

  const soldStats = useMemo(() => {
    let items = 0;
    let stock = 0;
    for (const p of filteredProducts) {
      const sold = Number((p as any).soldStock ?? 0);
      if (sold > 0) items += 1;
      stock += sold;
    }
    return { items, stock };
  }, [filteredProducts]);

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

  const formatDateDMY = (d?: Date | null) => {
    if (!d) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

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
        <div><strong>Date:</strong> ${formatDateDMY(titleDate)}</div>
        <div><strong>Printed At:</strong> ${printedAt}</div>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Products on ${formatDateDMY(titleDate)}</title>
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
      <h1>Products on ${formatDateDMY(titleDate)}</h1>
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
                        {(dateCounts[selectedKey] ?? 0).toString()} products on {formatDateDMY(selectedDate)}
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
            <Button variant="outline" onClick={openFiltersDialog}>
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
                    <div className="space-y-2 relative">
                      <Label htmlFor="name">Product Name *</Label>
                      <Input
                        id="name"
                        name="new-product-name"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        value={formData.name}
                        onChange={(e) => {
                          setFormData({ ...formData, name: e.target.value });
                          const suggestions = getNameSuggestions(e.target.value);
                          setNameSuggestions(suggestions);
                          setShowAddNameSuggestions(suggestions.length > 0);
                        }}
                        onFocus={() => setShowAddNameSuggestions(nameSuggestions.length > 0)}
                        onBlur={() => {
                          setTimeout(() => setShowAddNameSuggestions(false), 120);
                        }}
                        placeholder="Enter product name"
                      />
                      {showAddNameSuggestions && nameSuggestions.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-md max-h-40 overflow-y-auto">
                          {nameSuggestions.map((name, index) => (
                            <button
                              key={`${name}-${index}`}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setFormData((prev) => ({ ...prev, name }));
                                setShowAddNameSuggestions(false);
                              }}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="price">Price (₹) *</Label>
                      <Input
                        id="price"
                        type="number"
                        min="1"
                        step="1"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        placeholder="0"
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
                        min="1"
                        step="1"
                        value={formData.sellingPrice}
                        onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                        placeholder="0"
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
                          <SelectItem key={hsn.id} value={String(hsn.id)}>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Total Products</p>
                <Package className="h-5 w-5 text-blue-600 shrink-0" />
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 break-words">
                {filteredProducts.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Total Stock</p>
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 break-words">
                {totalFilteredStock}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">In Godown</p>
                <Warehouse className="h-5 w-5 text-indigo-600 shrink-0" />
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 break-words">
                {godownStats.items}
              </p>
              <p className="text-xs text-gray-500">{godownStats.stock} in stock</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Sold Units</p>
                <ShoppingCart className="h-5 w-5 text-purple-600 shrink-0" />
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 break-words">
                {soldStats.items}
              </p>
              <p className="text-xs text-gray-500">{soldStats.stock} in stock</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Selling Value</p>
                <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0" />
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 break-words">
                ₹{totalSellingValue}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Inventory Value</p>
                <Package className="h-5 w-5 text-blue-600 shrink-0" />
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 break-words">
                ₹{totalCostValue}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card>
          <CardHeader>
            <CardTitle>Product Catalog</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const scopeOptions = [
                { value: "all", label: "All Fields" },
                { value: "name", label: "Name" },
                { value: "barcode", label: "Barcode" },
                { value: "batch", label: "Batch" },
                { value: "hsn", label: "HSN" },
              ];
              const stockOptions = [
                { value: "all", label: "All", dot: "bg-slate-400" },
                { value: "available", label: "In Stock", dot: "bg-emerald-500" },
                { value: "low", label: "Low", dot: "bg-amber-500" },
                { value: "out", label: "Out", dot: "bg-rose-500" },
                { value: "unordered", label: "Unordered", dot: "bg-violet-500" },
              ];
              const sortOptions = [
                { value: "newest", label: "Newest First" },
                { value: "oldest", label: "Oldest First" },
                { value: "name_asc", label: "Name A → Z" },
                { value: "name_desc", label: "Name Z → A" },
                { value: "stock_desc", label: "Stock High → Low" },
                { value: "price_asc", label: "Price Low → High" },
                { value: "price_desc", label: "Price High → Low" },
              ];
              const scopeMap = Object.fromEntries(scopeOptions.map((o) => [o.value, o.label]));
              const stockMap = Object.fromEntries(stockOptions.map((o) => [o.value, o.label]));
              const sortMap = Object.fromEntries(sortOptions.map((o) => [o.value, o.label]));
              const filterCount =
                (searchScope !== "all" ? 1 : 0) + (stockFilter !== "all" ? 1 : 0);
              const resetFilters = () => {
                setSearchScope("all");
                setStockFilter("all");
              };
              const resetAll = () => {
                resetFilters();
                setSortBy("newest");
              };
              const anyActive = filterCount > 0 || sortBy !== "newest";
              return (
                <div className="mb-6 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <div className="w-full md:w-[460px]">
                      <div className="relative group">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 group-focus-within:text-blue-600 transition-colors" />
                        <Input
                          placeholder="Search products, barcodes, batch, HSN..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10 pr-9 h-10 bg-white border-slate-200 focus-visible:ring-blue-500/30"
                        />
                        {searchTerm && (
                          <button
                            onClick={() => setSearchTerm("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                            aria-label="Clear search"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="h-10 gap-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          >
                            <ArrowUpDown className="h-4 w-4 text-slate-500" />
                            <span className="hidden sm:inline text-xs text-slate-500">Sort:</span>
                            <span className="text-sm font-medium">{sortMap[sortBy]}</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-56 p-1">
                          {sortOptions.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => setSortBy(opt.value)}
                              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                                sortBy === opt.value
                                  ? "bg-blue-50 font-medium text-blue-700"
                                  : "text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <span>{opt.label}</span>
                              {sortBy === opt.value && <Check className="h-4 w-4" />}
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>

                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="h-10 gap-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 relative"
                          >
                            <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                            <span className="text-sm font-medium">Filters</span>
                            {filterCount > 0 && (
                              <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white">
                                {filterCount}
                              </span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-[360px] p-0">
                          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <SlidersHorizontal className="h-4 w-4 text-slate-600" />
                              <h4 className="text-sm font-semibold text-slate-900">Filters</h4>
                            </div>
                            {filterCount > 0 && (
                              <button
                                onClick={resetFilters}
                                className="text-xs font-medium text-blue-600 hover:text-blue-700"
                              >
                                Reset
                              </button>
                            )}
                          </div>

                          <div className="space-y-5 p-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                <Search className="h-3 w-3" />
                                Search In
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {scopeOptions.map((opt) => {
                                  const active = searchScope === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      onClick={() => setSearchScope(opt.value)}
                                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                                        active
                                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                <Layers className="h-3 w-3" />
                                Stock Level
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                {stockOptions.map((opt) => {
                                  const active = stockFilter === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      onClick={() => setStockFilter(opt.value)}
                                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-all ${
                                        active
                                          ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
                                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                      }`}
                                    >
                                      <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>

                      {anyActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={resetAll}
                          className="h-10 text-xs text-slate-500 hover:text-slate-900"
                        >
                          Clear all
                        </Button>
                      )}
                    </div>
                  </div>

                  {(searchScope !== "all" || stockFilter !== "all") && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {searchScope !== "all" && (
                        <button
                          onClick={() => setSearchScope("all")}
                          className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <span className="text-slate-400 group-hover:text-rose-400">Search in:</span>
                          <span className="font-medium">{scopeMap[searchScope]}</span>
                          <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                        </button>
                      )}
                      {stockFilter !== "all" && (
                        <button
                          onClick={() => setStockFilter("all")}
                          className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <span className="text-slate-400 group-hover:text-rose-400">Stock:</span>
                          <span className="font-medium">{stockMap[stockFilter]}</span>
                          <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

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

            {/* Progressive load indicator (plain static bar — no animation) */}
            <ProductLoadingBar
              isStreaming={productsStreaming}
              progress={productsProgress}
              loaded={productsData.length}
              total={productsTotalCount}
              loadedPages={productsLoadedPages}
            />

            {/* Products Table */}
            <div ref={productTableTopScrollRef} className="overflow-x-auto overflow-y-hidden mb-2">
              <div className="h-px" />
            </div>
            <div className="overflow-x-hidden max-h-[500px] overflow-y-auto relative" ref={scrollableDivRef}>
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
                    <th className="text-left p-4 font-medium">HSN Code</th>
                    <th className="text-left p-4 font-medium">Total Stock</th>
                    <th className="text-left p-4 font-medium">Available Units</th>
                    <th className="text-left p-4 font-medium">Barcodes</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((product) => {
                    const stockStatus = getStockStatus(product.stock)
                    const StatusIcon = stockStatus.icon
                    // Use the precomputed batchMap (O(1) lookup) instead of a
                    // linear .find() across the entire batches array per row.
                    const productBatch = product.batchid ? batchMap.get(product.batchid) : undefined;
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
                            ₹{Number((product as any).sellingPrice ?? (product as any).selling_price ?? (product as any).displayPrice ?? 0).toFixed(2)}
                          </span>
                        </td>

                        <td className="p-4">
                          <span className="font-medium">
                          {(() => {
                                  const hsnCodeId = getProductHsnCodeId(product);
                                  if (!hsnCodeId || hsnCodeId === "null") {
                                    return <span className="font-medium text-gray-400">N/A</span>;
                                  }
                                  // O(1) map lookup instead of hsnCodes.find() per row.
                                  const hsnCode = hsnCodeMap.get(String(hsnCodeId));
                                  return hsnCode ? (
                                    <span className="font-medium">{hsnCode.hsnCode}</span>
                                  ) : (
                                    <span className="font-medium text-gray-500">{String(hsnCodeId)}</span>
                                  );
                                })()}
                          </span>
                        </td>
                        <td className="p-4">
                          {(() => {
                            const sold = Number((product as any).soldStock ?? 0);
                            const inStores = Number(
                              (product as any).inStoresStock ?? (product as any).allocatedStock ?? 0,
                            );
                            const lifetime = Number(
                              (product as any).lifetimeStock ??
                                (Number(product.globalStock ?? product.stock ?? 0) + sold),
                            );
                            return (
                              <div className="leading-tight">
                                <div className="font-semibold text-base">{lifetime}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  Sold: <span className="tabular-nums">{sold}</span>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  In stores: <span className="tabular-nums">{inStores}</span>
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-4">
                          <span className="font-medium">{product.availableStock ?? product.stock}</span>
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
                    (dateAddedFilter.from !== "" || dateAddedFilter.to !== "") ||
                    hsnFilter !== "all" ||
                    batchAssignmentFilter !== "all" ||
                    (taxRange.min !== "" || taxRange.max !== "") ||
                    sortBy !== "newest" ||
                    searchScope !== "all"
                      ? "Try adjusting your search or filters"
                      : "Get started by adding your first product"}
                  </p>
                  {products.length > 0 && (
                    <Button variant="outline" onClick={resetProductFilters} type="button" className="mr-2">
                      Reset Filters
                    </Button>
                  )}
                  {!searchTerm && stockFilter === "all" && searchScope === "all" && (
                    <Button onClick={() => setIsAddDialogOpen(true)} type="button">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Product
                    </Button>
                  )}
                </div>
              )}
            </div>
            {filteredProducts.length > renderRowCap && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-3 text-sm">
                <div className="text-muted-foreground">
                  Showing <span className="font-semibold">{visibleProducts.length.toLocaleString()}</span>
                  {" "}of{" "}
                  <span className="font-semibold">{filteredProducts.length.toLocaleString()}</span> matches.
                  Use search or filters to narrow down further.
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRenderRowCap((c) => c + 200)}
                  >
                    Show 200 more
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRenderRowCap(filteredProducts.length)}
                  >
                    Show all
                  </Button>
                </div>
              </div>
            )}
            {filteredProducts.length > 15 && (
              <div className="flex justify-between mt-4">
                <ScrollToTopButton onClick={() => scrollableDivRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
                <ScrollToBottomButton onClick={() => scrollableDivRef.current?.scrollTo({ top: scrollableDivRef.current.scrollHeight, behavior: 'smooth' })} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* NEW: Advanced Filters Dialog */}
        <Dialog
          open={isFiltersDialogOpen}
          onOpenChange={(open) => {
            if (open) syncDraftFiltersFromApplied();
            setIsFiltersDialogOpen(open);
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
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
                    value={draftPriceRange.min}
                    onChange={(e) => setDraftPriceRange({ ...draftPriceRange, min: e.target.value })}
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={draftPriceRange.max}
                    onChange={(e) => setDraftPriceRange({ ...draftPriceRange, max: e.target.value })}
                  />
                </div>
              </div>

              {/* Batch Filter */}
              <div className="space-y-2">
                <Label>Batch</Label>
                <Select value={draftBatchFilter} onValueChange={setDraftBatchFilter}>
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
                    value={draftSellingPriceRange.min}
                    onChange={(e) => setDraftSellingPriceRange({ ...draftSellingPriceRange, min: e.target.value })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Max"
                    value={draftSellingPriceRange.max}
                    onChange={(e) => setDraftSellingPriceRange({ ...draftSellingPriceRange, max: e.target.value })}
                  />
                </div>
              </div>

              {/* Date Added Range */}
              <div className="space-y-2">
                <Label>Date Added</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={draftDateAddedFilter.from}
                    max={todayDateInput}
                    onChange={(e) => {
                      const nextFrom = clampDateToToday(e.target.value);
                      setDraftDateAddedFilter((prev) => ({
                        ...prev,
                        from: nextFrom,
                        to: prev.to && nextFrom && prev.to < nextFrom ? nextFrom : prev.to,
                      }));
                    }}
                  />
                  <Input
                    type="date"
                    value={draftDateAddedFilter.to}
                    max={todayDateInput}
                    onChange={(e) => {
                      const nextTo = clampDateToToday(e.target.value);
                      setDraftDateAddedFilter((prev) => ({
                        ...prev,
                        to: nextTo,
                        from: prev.from && nextTo && prev.from > nextTo ? nextTo : prev.from,
                      }));
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>HSN Code</Label>
                <Select value={draftHsnFilter} onValueChange={setDraftHsnFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select HSN code" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All HSN Codes</SelectItem>
                    <SelectItem value="none">No HSN Assigned</SelectItem>
                    {hsnCodes.map((hsn) => (
                      <SelectItem key={hsn.id} value={String(hsn.id)}>
                        {hsn.hsnCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Batch Assignment</Label>
                <Select value={draftBatchAssignmentFilter} onValueChange={setDraftBatchAssignmentFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter batch assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    <SelectItem value="with-batch">With Batch</SelectItem>
                    <SelectItem value="without-batch">Without Batch</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tax Range (%)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Min"
                    value={draftTaxRange.min}
                    onChange={(e) => setDraftTaxRange({ ...draftTaxRange, min: e.target.value })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Max"
                    value={draftTaxRange.max}
                    onChange={(e) => setDraftTaxRange({ ...draftTaxRange, max: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetAdvancedFilters}>
                Reset All
              </Button>
              <Button onClick={applyAdvancedFilters}>
                Apply Filters
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog to display batches for the selected day */}
        <Dialog open={isBatchesForDayDialogOpen} onOpenChange={setIsBatchesForDayDialogOpen}>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Batches on {selectedDate ? formatDateDMY(selectedDate) : ""}</DialogTitle>
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
                Products in Batch {selectedBatchForProducts?.batchNumber} on {selectedDate ? formatDateDMY(selectedDate) : ""}
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
                Products on {selectedDate ? formatDateDMY(selectedDate) : ""}
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
                <div className="space-y-2 relative">
                  <Label htmlFor="edit-name">Product Name *</Label>
                  <Input
                    id="edit-name"
                    name="edit-product-name"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      const suggestions = getNameSuggestions(e.target.value);
                      setNameSuggestions(suggestions);
                      setShowEditNameSuggestions(suggestions.length > 0);
                    }}
                    onFocus={() => setShowEditNameSuggestions(nameSuggestions.length > 0)}
                    onBlur={() => {
                      setTimeout(() => setShowEditNameSuggestions(false), 120);
                    }}
                    placeholder="Enter product name"
                  />
                  {showEditNameSuggestions && nameSuggestions.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-md max-h-40 overflow-y-auto">
                      {nameSuggestions.map((name, index) => (
                        <button
                          key={`${name}-${index}`}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setFormData((prev) => ({ ...prev, name }));
                            setShowEditNameSuggestions(false);
                          }}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-price">Price (₹) *</Label>
                  <Input
                    id="edit-price"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0"
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
                  min="1"
                  step="1"
                  value={formData.sellingPrice}
                  onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                  placeholder="0"
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
                        <SelectItem key={hsn.id} value={String(hsn.id)}>
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
              <SelectItem key={hsn.id} value={String(hsn.id)}>
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

<Dialog open={associatedBillsDialogOpen} onOpenChange={setAssociatedBillsDialogOpen}>
  <DialogContent className="sm:max-w-[480px]">
    <DialogHeader>
      <DialogTitle>Cannot Delete Product</DialogTitle>
      <DialogDescription>
        This product is associated with the following bill(s) and cannot be deleted.
      </DialogDescription>
    </DialogHeader>
    <div className="py-4">
      <div className="max-h-60 overflow-y-auto rounded-md border bg-muted p-3 space-y-1">
        {associatedBills.map((bill) => (
          <div key={bill.id} className="flex items-center justify-between text-sm font-mono px-2 py-1 rounded bg-background border">
            <span>{bill.id}</span>
            {bill.date && (
              <span className="text-muted-foreground font-sans ml-4 whitespace-nowrap">
                {new Date(bill.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
    <DialogFooter>
      <Button onClick={() => setAssociatedBillsDialogOpen(false)}>Close</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

      </div>
    </DashboardLayout>
  )
}
