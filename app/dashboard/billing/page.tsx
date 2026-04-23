"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
import { Plus, Receipt, Trash2, Eye, Search, Percent, Printer, RefreshCw, ArrowUpDown, Pencil, RotateCcw, CalendarIcon, SlidersHorizontal, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Upload } from "lucide-react";
import { unifiedPrint } from "@/app/utils/printUtils";
import PrintableInvoice, { type PrintableInvoiceData } from "@/components/printable-invoice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";

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
  sellingPrice?: number;
  selling_price?: number;
  displayPrice?: number;
  tax?: number;
  barcode?: string;
  stock?: number;
}

interface BillItem {
  productId: string;
  productName: string;
  price: number;
  sellingPrice?: number;
  quantity: number;
  total: number;
  taxPercentage?: number;
  hsnCode?: string;
  damageReason?: string;
  isReplacementItem?: boolean;
  replacedProductId?: string;
  replacedProductName?: string;
}

interface Bill {
  id: string;
  storeId?: string;
  customerId?: string;
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
  isReplacement?: boolean;
  replacementFinalAmount?: number;
  replacementOriginalBillId?: string;
  paymentMethod?: string;
  createdBy?: string;
  timestamp?: string;
  taxAmount?: number;
}

const WALK_IN_CUSTOMER_ID = "CUST-1754821420265";
const WALK_IN_CUSTOMER_NAME = "Walk-in Customer";
const BILL_EDIT_WINDOW_HOURS = 24;
const BILL_EDIT_WINDOW_MS = BILL_EDIT_WINDOW_HOURS * 60 * 60 * 1000;
const BILLING_POLL_INTERVAL_MS = 300000;
const WALK_IN_CUSTOMER_FALLBACK: Customer = {
  id: WALK_IN_CUSTOMER_ID,
  name: WALK_IN_CUSTOMER_NAME,
  email: "",
  phone: "",
  address: "",
};

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
  const getStoredAdminName = () => {
    if (typeof window === "undefined") return undefined;
    const raw = localStorage.getItem("adminUser");
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      return parsed?.name;
    } catch {
      return undefined;
    }
  };
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
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [billSortKey, setBillSortKey] = useState<BillSortKey>("date");
  const [billSortDirection, setBillSortDirection] = useState<"asc" | "desc">("desc");
  const [printBill, setPrintBill] = useState<Bill | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const printPaperSize = "Thermal 80mm";
  const [adminUser, setAdminUser] = useState<{ id?: string; name?: string; role?: string; email?: string } | null>(null);
  const [creatorNameById, setCreatorNameById] = useState<Record<string, string>>({});
  const [allProductNameById, setAllProductNameById] = useState<Record<string, string>>({});
  const [extraBills, setExtraBills] = useState<any[]>([]);
  const [nextBillsPage, setNextBillsPage] = useState(2);
  const [hasMoreBillsToLoad, setHasMoreBillsToLoad] = useState(true);
  const [isLoadingMoreBills, setIsLoadingMoreBills] = useState(false);
  const [billsTotalCount, setBillsTotalCount] = useState<number | null>(null);
  // Lightweight summary of ALL bills (no item details) — used only for the stats cards
  // so totals are accurate without loading full detailed data into the table.
  const [statsBills, setStatsBills] = useState<any[] | null>(null);

  // Filters: date range + store (server-side, applies to table, stats, and count).
  const [filterFromDate, setFilterFromDate] = useState<string>("");
  const [filterToDate, setFilterToDate] = useState<string>("");
  const [filterStoreId, setFilterStoreId] = useState<string>("all");
  const [storesList, setStoresList] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/api/stores");
        const payload = res?.data;
        const list: any[] = Array.isArray(payload) ? payload : payload?.data || [];
        const mapped = list
          .map((s: any) => ({ id: String(s.id || s.storeId || s.store_id || ""), name: String(s.name || "Unnamed") }))
          .filter((s) => s.id);
        if (!cancelled) setStoresList(mapped);
      } catch (err) {
        console.warn("Failed to load stores list", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dateRange: DateRange | undefined = useMemo(() => {
    if (!filterFromDate && !filterToDate) return undefined;
    const parse = (s: string) => (s ? new Date(`${s}T00:00:00`) : undefined);
    return {
      from: parse(filterFromDate),
      to: parse(filterToDate),
    } as DateRange;
  }, [filterFromDate, filterToDate]);

  const setDateRange = (range: DateRange | undefined) => {
    const toIso = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : "");
    setFilterFromDate(toIso(range?.from));
    setFilterToDate(toIso(range?.to));
  };

  const applyDatePreset = (preset: "today" | "7d" | "30d" | "month" | "clear") => {
    if (preset === "clear") {
      setFilterFromDate("");
      setFilterToDate("");
      return;
    }
    const today = new Date();
    const end = today;
    let start = today;
    if (preset === "today") {
      start = today;
    } else if (preset === "7d") {
      start = new Date(today);
      start.setDate(today.getDate() - 6);
    } else if (preset === "30d") {
      start = new Date(today);
      start.setDate(today.getDate() - 29);
    } else if (preset === "month") {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    setFilterFromDate(format(start, "yyyy-MM-dd"));
    setFilterToDate(format(end, "yyyy-MM-dd"));
  };

  const activeFilterCount =
    (filterFromDate || filterToDate ? 1 : 0) + (filterStoreId !== "all" ? 1 : 0);

  const clearAllFilters = () => {
    setFilterFromDate("");
    setFilterToDate("");
    setFilterStoreId("all");
  };

  const formatDateLabel = (iso?: string) => {
    if (!iso) return "";
    try {
      return format(new Date(`${iso}T00:00:00`), "MMM d, yyyy");
    } catch {
      return iso;
    }
  };

  const dateLabel = (() => {
    if (filterFromDate && filterToDate) {
      return `${formatDateLabel(filterFromDate)} – ${formatDateLabel(filterToDate)}`;
    }
    if (filterFromDate) return `From ${formatDateLabel(filterFromDate)}`;
    if (filterToDate) return `Until ${formatDateLabel(filterToDate)}`;
    return "";
  })();

  const activeStoreLabel = useMemo(() => {
    if (filterStoreId === "all") return "";
    return storesList.find((s) => s.id === filterStoreId)?.name || filterStoreId;
  }, [filterStoreId, storesList]);

  const buildBillsQuery = useCallback((page: number, pageSize: number, details: 0 | 1) => {
    const params = new URLSearchParams();
    params.set("paginate", "1");
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("details", String(details));
    if (filterFromDate) params.set("from", filterFromDate);
    if (filterToDate) params.set("to", filterToDate);
    if (filterStoreId && filterStoreId !== "all") params.set("storeId", filterStoreId);
    return `/api/bills?${params.toString()}`;
  }, [filterFromDate, filterToDate, filterStoreId]);

  // Form state
  const [customerName, setCustomerName] = useState(WALK_IN_CUSTOMER_NAME);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(WALK_IN_CUSTOMER_ID);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [discountMode, setDiscountMode] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [lastScanValue, setLastScanValue] = useState("");

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
    if (typeof window !== "undefined") {
      localStorage.setItem("adminLoggedIn", "true");
      const storedAdmin = localStorage.getItem("adminUser");
      if (storedAdmin) {
        try {
          const parsed = JSON.parse(storedAdmin);
          setAdminUser(parsed);
        } catch (parseError) {
          console.error("Failed to parse admin user from localStorage", parseError);
        }
      }
    }

    // Load system settings
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/settings`)
      .then((res) => res.json())
      .then((data) => {
        if (data.systemSettings) {
          const settings = data.systemSettings;
          const normalizedSettings = {
            gstin: settings.gstin || "",
            taxPercentage: settings.taxPercentage || settings.tax_percentage || 0,
            companyName: settings.companyName || settings.company_name || settings.companyname || "",
            companyAddress: settings.companyAddress || settings.company_address || settings.companyaddress || "",
            companyPhone: settings.companyPhone || settings.company_phone || settings.companyphone || "",
            companyEmail: settings.companyEmail || settings.company_email || settings.companyemail || "",
          };
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

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const response = await api.get("/api/users");
        const rows = Array.isArray(response?.data) ? response.data : [];
        const map = rows.reduce((acc: Record<string, string>, row: any) => {
          const id = String(row?.id || row?.userId || row?.user_id || "").trim();
          const name = String(row?.name || row?.fullName || row?.full_name || "").trim();
          if (id && name) acc[id] = name;
          return acc;
        }, {});
        setCreatorNameById(map);
      } catch (error) {
        console.warn("Failed to load users for bill creator mapping", error);
        setCreatorNameById({});
      }
    };

    void loadUsers();
  }, []);

  useEffect(() => {
    const loadAllProductsForNameLookup = async () => {
      try {
        const extractRows = (payload: any): any[] => {
          if (Array.isArray(payload)) return payload;
          if (Array.isArray(payload?.data)) return payload.data;
          return [];
        };

        // Try merged endpoint first; fallback to local cache endpoint.
        const [mergedResp, localResp] = await Promise.allSettled([
          api.get("/api/products"),
          api.get("/api/local/products"),
        ]);

        const mergedRows =
          mergedResp.status === "fulfilled" ? extractRows(mergedResp.value?.data) : [];
        const localRows =
          localResp.status === "fulfilled" ? extractRows(localResp.value?.data) : [];
        const rows = mergedRows.length > 0 ? mergedRows : localRows;

        const map: Record<string, string> = {};
        rows.forEach((row: any) => {
          const id = String(row?.id || "").trim();
          const name = String(row?.name || "").trim();
          if (id && name) map[id] = name;
        });
        setAllProductNameById(map);
      } catch (error) {
        console.warn("Failed to load all-products name lookup", error);
        setAllProductNameById({});
      }
    };

    void loadAllProductsForNameLookup();
  }, []);

  // Optimized fetch function with silent updates
  const fetchData = useCallback(
    async (
      supabaseEndpoint: string,
      localStorageEndpoint: string,
      updateLocalStorageEndpoint: string,
      dataType: string
    ) => {
      try {
        const supabaseResponse = await api.get(supabaseEndpoint);
        const data = supabaseResponse.data;
        let processedData = data;

        if (dataType === "products") {
          processedData = data.map((product: any) => ({
            ...product,
            stock: product.stock || 0,
            sellingPrice:
              product.sellingPrice ??
              product.selling_price ??
              product.displayPrice ??
              product.price ??
              0,
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

        // If cloud returns empty but local JSON has data, prefer local to avoid blank UI
        // during temporary Supabase/circuit-open windows.
        if (Array.isArray(processedData) && processedData.length === 0) {
          const localFallback = await api.get(localStorageEndpoint).catch(() => null);
          const localRows = Array.isArray(localFallback?.data) ? localFallback.data : [];
          if (localRows.length > 0) {
            if (dataType === "products") {
              return localRows.map((product: any) => ({
                ...product,
                stock: product.stock || 0,
                sellingPrice:
                  product.sellingPrice ??
                  product.selling_price ??
                  product.displayPrice ??
                  product.price ??
                  0,
              }));
            }
            if (dataType === "customers") {
              return localRows.map((customer: any) => ({
                id: customer.id,
                name: customer.name,
                email: customer.email,
                phone: customer.phone,
                address: customer.address,
                createdAt: customer.createdat || customer.createdAt,
                updatedAt: customer.updatedat || customer.updatedAt,
              }));
            }
            return localRows;
          }
        }

        // Silent background update
        api.post(updateLocalStorageEndpoint, processedData).catch(() => {});

        return processedData;
      } catch (error) {
        console.warn(`Failed to fetch ${dataType} from Supabase, falling back to local`, error);
        const localResponse = await api.get(localStorageEndpoint);

        if (dataType === "products") {
          return localResponse.data.map((product: any) => ({
            ...product,
            stock: product.stock || 0,
            sellingPrice:
              product.sellingPrice ??
              product.selling_price ??
              product.displayPrice ??
              product.price ??
              0,
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
    },
    []
  );

  const fetchProducts = useCallback(
    () => fetchData("/api/supabase/products-for-billing", "/api/local/products-for-billing", "/api/local/products/update", "products"),
    [fetchData]
  );

  const fetchBills = useCallback(async () => {
    const safeParseItems = (rawItems: unknown): unknown => {
      if (typeof rawItems !== "string") return rawItems;
      try {
        return JSON.parse(rawItems);
      } catch {
        return [];
      }
    };

    const mapBills = (rows: any[]) =>
      rows.map((bill: any) => {
        // FIX: Handle discount percentage - prioritize the correct field
        const discountPct = bill.discountpercentage || bill.discountPercentage || 0;
        const discountAmt = bill.discountamount || bill.discountAmount || 0;

        // FIX: Handle tax percentage and amount
        const taxPct = bill.taxpercentage || bill.taxPercentage || 0;
        const taxAmt = bill.taxamount || bill.taxAmount || bill.tax || 0;
        const isReplacement = Boolean(bill.isReplacement ?? bill.is_replacement);
        const replacementFinalAmount = Number(
          bill.replacementFinalAmount ?? bill.replacement_final_amount ?? 0
        );
        const replacementOriginalBillId =
          bill.replacementOriginalBillId ?? bill.replacement_original_bill_id ?? "";
        const paymentMethod = bill.paymentMethod ?? bill.paymentmethod ?? "";
        const createdBy =
          bill.createdBy ||
          bill.createdby ||
          bill.created_by ||
          adminUser?.name ||
          getStoredAdminName();

        return {
          ...bill,
          date: bill.timestamp || bill.date,
          tax: taxAmt,
          taxPercentage: taxPct,
          status: bill.status || "Paid",
          items: safeParseItems(bill.items ?? bill.billItems ?? bill.bill_items),
          discountPercentage: discountPct,
          discountAmount: discountAmt,
          isReplacement,
          replacementFinalAmount,
          replacementOriginalBillId,
          paymentMethod,
          createdBy,
        };
      });

    const extractBillsArray = (payload: any): any[] => {
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.data)) return payload.data;
      return [];
    };

    try {
      // Use paginated endpoint to avoid fetching all bills at once
      const response = await api.get(buildBillsQuery(1, 200, 1));
      const data = extractBillsArray(response.data);
      let processedData = mapBills(data);

      // If API returns empty during transient backend/supabase windows, fallback to local bills.
      if (processedData.length === 0) {
        const localResponse = await api.get("/api/local/bills").catch(() => null);
        const localData = extractBillsArray(localResponse?.data);
        if (localData.length > 0) {
          processedData = mapBills(localData);
        }
      }
      // Silent background update
      api.post("/api/local/bills/update", processedData).catch(() => {});
      return processedData;
    } catch (error) {
      console.error("fetchBills: Error fetching from backend, falling back to local", error);
      const localResponse = await api.get("/api/local/bills");
      const localData = extractBillsArray(localResponse.data);
      return mapBills(localData);
    }
  }, [adminUser, buildBillsQuery]);

  const fetchCustomers = useCallback(
    () => fetchData("/api/supabase/customers", "/api/local/customers", "/api/local/customers/update", "customers"),
    [fetchData]
  );

  // Use slower polling to reduce backend/Supabase pressure.
  const { data: productsData, loading: productsLoading, error: productsError, refetch: refetchProducts } = usePolling<Product[]>(fetchProducts, { interval: BILLING_POLL_INTERVAL_MS });
  const { data: billsData, loading: billsLoading, error: billsError, refetch: refetchBills } = usePolling<Bill[]>(fetchBills, { interval: BILLING_POLL_INTERVAL_MS });
  const { data: customersData, loading: customersLoading, error: customersError, refetch: refetchCustomers } = usePolling<Customer[]>(fetchCustomers, { interval: BILLING_POLL_INTERVAL_MS });

  // Manual refresh function
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      setExtraBills([]);
      setNextBillsPage(2);
      setHasMoreBillsToLoad(true);
      setBillsTotalCount(null);
      setStatsBills(null);
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

  // Reset paginated and stats loaders whenever a filter changes, then refetch page 1.
  const filterKey = `${filterFromDate}|${filterToDate}|${filterStoreId}`;
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setExtraBills([]);
    setNextBillsPage(2);
    setHasMoreBillsToLoad(true);
    setBillsTotalCount(null);
    setStatsBills(null);
    refetchBills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // On-demand loader for older bills — pulls one page at a time when user clicks "Load more".
  const loadMoreBills = useCallback(async () => {
    if (isLoadingMoreBills || !hasMoreBillsToLoad) return;
    setIsLoadingMoreBills(true);
    try {
      const response = await api.get(buildBillsQuery(nextBillsPage, 200, 1));
      const payload = response?.data;
      const list: any[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
        ? payload.data
        : [];
      if (list.length > 0) {
        setExtraBills((prev) => [...prev, ...list]);
      }
      const hasMore = Boolean(payload?.hasMore) && list.length > 0;
      setHasMoreBillsToLoad(hasMore);
      setNextBillsPage((p) => p + 1);
      if (typeof payload?.total === "number") {
        setBillsTotalCount(payload.total);
      }
    } catch (err) {
      console.error("Failed to load older bills page", nextBillsPage, err);
    } finally {
      setIsLoadingMoreBills(false);
    }
  }, [nextBillsPage, hasMoreBillsToLoad, isLoadingMoreBills, buildBillsQuery]);

  // Infinite-scroll sentinel: when it enters the viewport, request the next page.
  const billsSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = billsSentinelRef.current;
    if (!node) return;
    if (!hasMoreBillsToLoad) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMoreBillsToLoad && !isLoadingMoreBills) {
          loadMoreBills();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMoreBills, hasMoreBillsToLoad, isLoadingMoreBills]);

  // hasMoreBillsToLoad starts optimistically true — loadMoreBills will flip it to
  // false once the server returns an empty page or hasMore: false. This avoids the
  // brittle "length >= pageSize" heuristic and keeps the infinite-scroll sentinel
  // rendered until we actually hit the end.

  // Background: load a lightweight summary of ALL bills (details=0) so the top
  // stats cards reflect totals across the full dataset (respecting active filters).
  // Restarts whenever filters change.
  useEffect(() => {
    if (!billsData) return;
    let cancelled = false;
    const PAGE_SIZE = 500;
    const MAX_PAGES = 200;

    (async () => {
      try {
        let page = 1;
        let collected: any[] = [];
        while (page <= MAX_PAGES && !cancelled) {
          try {
            const response = await api.get(buildBillsQuery(page, PAGE_SIZE, 0));
            const payload = response?.data;
            const list: any[] = Array.isArray(payload)
              ? payload
              : Array.isArray(payload?.data)
              ? payload.data
              : [];
            if (list.length === 0) break;
            collected = collected.concat(list);
            if (!cancelled) {
              setStatsBills([...collected]);
              if (typeof payload?.total === "number") {
                setBillsTotalCount(payload.total);
              }
            }
            const hasMore = Boolean(payload?.hasMore);
            if (!hasMore) break;
            page += 1;
          } catch (err) {
            console.error("Failed to load stats page", page, err);
            break;
          }
        }
      } catch (err) {
        console.error("Stats bills loader failed", err);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, billsData != null]);

  const currentProducts = useMemo<Product[]>(() => productsData ?? [], [productsData]);
  const currentCustomers = useMemo<Customer[]>(() => customersData ?? [], [customersData]);
  const productNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    currentProducts.forEach((product) => {
      const id = String(product?.id || "").trim();
      const name = String(product?.name || "").trim();
      if (id && name) map.set(id, name);
    });
    return map;
  }, [currentProducts]);

  const resolveProductNameById = (productId: string): string | undefined => {
    const key = String(productId || "").trim();
    if (!key) return undefined;
    return productNameLookup.get(key) || allProductNameById[key];
  };

  const customerLookup = useMemo(() => {
    const map = new Map<string, Customer>();
    currentCustomers.forEach((customer) => {
      if (customer?.id) map.set(customer.id, customer);
    });
    return map;
  }, [currentCustomers]);

  const parseNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const isLikelyUserId = (value: string): boolean => {
    if (!value) return false;
    const v = value.trim();
    if (!v) return false;
    return /^USR[-_]/i.test(v) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(v);
  };

  const resolveCreatorName = (rawBill: any): string => {
    const explicitName =
      rawBill.createdByName ||
      rawBill.created_by_name ||
      rawBill.billedByName ||
      rawBill.billed_by_name;
    if (explicitName) return String(explicitName);

    const creatorRaw =
      rawBill.createdBy ||
      rawBill.created_by ||
      rawBill.createdby ||
      rawBill.billedBy ||
      rawBill.billed_by ||
      "";
    const creator = String(creatorRaw).trim();
    if (!creator) return "";

    if (creatorNameById[creator]) return creatorNameById[creator];
    if (isLikelyUserId(creator)) return "";
    return creator;
  };

  const getProductSellingPrice = (product: Product): number =>
    parseNumber(
      product.sellingPrice ??
      product.selling_price ??
      product.displayPrice ??
      product.price ??
      0
    );

  const parseItems = (rawItems: unknown): BillItem[] => {
    let items: any[] = [];

    if (typeof rawItems === "string") {
      try {
        const parsed = JSON.parse(rawItems);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        items = [];
      }
    } else if (Array.isArray(rawItems)) {
      items = rawItems;
    }

    return items.map((item: any) => {
      const productId = item.productId || item.product_id || item.productid || "";
      const resolvedProductName =
        item.productName ||
        item.product_name ||
        item.productname ||
        item.name ||
        resolveProductNameById(String(productId)) ||
        "Unknown Product";
      const quantity = parseNumber(item.quantity);
      const sellingPrice = parseNumber(
        item.sellingPrice ?? item.selling_price ?? item.displayPrice ?? item.price
      );
      const price = sellingPrice;
      const total = parseNumber(item.total || quantity * price);

      return {
        productId,
        productName: resolvedProductName,
        quantity,
        price,
        sellingPrice,
        total,
        taxPercentage: parseNumber(item.taxPercentage ?? item.tax_percentage ?? item.tax ?? item.gst),
        hsnCode: item.hsnCode || item.hsn || item.hsn_code || item.hsnCodeId || item.hsn_code_id || "-",
        isReplacementItem: Boolean(item.isReplacementItem ?? item.is_replacement_item),
        replacedProductId:
          item.replacedProductId || item.replaced_product_id || item.replacedproductid || "",
        replacedProductName:
          item.replacedProductName || item.replaced_product_name || item.replacedproductname || "",
      };
    });
  };

  const buildEditableItemsFromBill = (rawItems: unknown): BillItem[] => {
    let items: any[] = [];
    if (typeof rawItems === "string") {
      try {
        const parsed = JSON.parse(rawItems);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        items = [];
      }
    } else if (Array.isArray(rawItems)) {
      items = rawItems;
    }

    return items
      .map((item: any, idx: number) => {
        const quantity = Math.max(1, parseNumber(item.quantity || item.qty || 1));
        const price = parseNumber(
          item.sellingPrice ??
          item.selling_price ??
          item.displayPrice ??
          item.price ??
          item.unit_price ??
          0
        );
        const total = parseNumber(item.total ?? item.finalAmount ?? item.final_amount ?? (price * quantity));
        const productId =
          item.productId ||
          item.product_id ||
          item.productid ||
          item.id ||
          `EDIT-${idx + 1}`;
        const productName =
          item.productName ||
          item.product_name ||
          item.productname ||
          item.name ||
          resolveProductNameById(String(productId)) ||
          "Unknown Product";

        return {
          productId: String(productId),
          productName: String(productName),
          quantity,
          price,
          sellingPrice: price,
          total,
          taxPercentage: parseNumber(item.taxPercentage ?? item.tax_percentage ?? item.tax ?? item.gst),
          hsnCode: item.hsnCode || item.hsn || item.hsn_code || item.hsnCodeId || item.hsn_code_id || "-",
          isReplacementItem: Boolean(item.isReplacementItem ?? item.is_replacement_item),
          replacedProductId: item.replacedProductId || item.replaced_product_id || "",
          replacedProductName: item.replacedProductName || item.replaced_product_name || "",
        } as BillItem;
      })
      .filter((item) => item.quantity > 0);
  };

  const normalizeBillForDisplay = (rawBill: any): Bill => {
    const isReplacement = Boolean(rawBill.isReplacement ?? rawBill.is_replacement);
    const itemsFromBill = parseItems(rawBill.items);
    const replacementRows = Array.isArray(rawBill.replacementItems || rawBill.replacement_items)
      ? (rawBill.replacementItems || rawBill.replacement_items)
      : [];
    const itemsFromReplacement: BillItem[] = replacementRows.map((item: any) => {
      const newProductId = item.new_product_id || item.newProductId || item.productId || "";
      const replacedProductId =
        item.replaced_product_id || item.replacedProductId || item.replacedproductid || "";
      const quantity = parseNumber(item.quantity);
      const sellingPrice = parseNumber(
        item.sellingPrice ?? item.selling_price ?? item.displayPrice ?? item.price
      );
      const price = sellingPrice;
      const total = parseNumber(item.final_amount ?? item.finalAmount ?? quantity * price);
      return {
        productId: newProductId,
        productName:
          item.new_product_name ||
          item.newProductName ||
          item.productName ||
          resolveProductNameById(String(newProductId)) ||
          "Replacement Item",
        quantity,
        price,
        sellingPrice,
        total,
        taxPercentage: parseNumber(item.taxPercentage ?? item.tax_percentage ?? item.tax ?? item.gst),
        hsnCode: item.hsnCode || item.hsn || item.hsn_code || item.hsnCodeId || item.hsn_code_id || "-",
        isReplacementItem: true,
        replacedProductId,
        replacedProductName:
          item.replaced_product_name ||
          item.replacedProductName ||
          resolveProductNameById(String(replacedProductId)) ||
          item.productName ||
          "",
      };
    });
    const items =
      isReplacement && itemsFromReplacement.length > 0
        ? itemsFromReplacement
        : itemsFromBill.length > 0
        ? itemsFromBill
        : itemsFromReplacement;
    const subtotalFromBill = parseNumber(rawBill.subtotal ?? rawBill.sub_total);
    const fallbackSubtotal = items.reduce((sum, item) => sum + parseNumber(item.total), 0);
    const subtotal = subtotalFromBill > 0 ? subtotalFromBill : fallbackSubtotal;

    const discountPercentage = parseNumber(
      rawBill.discountPercentage ?? rawBill.discount_percentage ?? rawBill.discountpercentage
    );
    const discountAmount = parseNumber(
      rawBill.discountAmount ?? rawBill.discount_amount ?? rawBill.discountamount
    );
    const taxPercentage = parseNumber(
      rawBill.taxPercentage ?? rawBill.tax_percentage ?? rawBill.taxpercentage
    );
    const tax = parseNumber(rawBill.tax ?? rawBill.taxAmount ?? rawBill.tax_amount ?? rawBill.taxamount);

    const replacementFinalAmountFromApi = parseNumber(
      rawBill.replacementFinalAmount ?? rawBill.replacement_final_amount
    );
    const replacementAmountFromItems = itemsFromReplacement.reduce(
      (sum, item) => sum + parseNumber(item.total),
      0
    );
    const replacementFinalAmount =
      replacementFinalAmountFromApi > 0 ? replacementFinalAmountFromApi : replacementAmountFromItems;

    const rawTotal = parseNumber(rawBill.total);
    const computedTotal = Math.max(0, subtotal - discountAmount) + tax;
    const total = rawTotal > 0
      ? rawTotal
      : isReplacement && replacementFinalAmount > 0
      ? replacementFinalAmount
      : computedTotal;

    const customerId = rawBill.customerId || rawBill.customer_id || rawBill.customerid || "";
    const matchedCustomer = customerLookup.get(customerId);
    const createdBy = resolveCreatorName(rawBill);

    return {
      ...rawBill,
      id: rawBill.id || "",
      storeId: rawBill.storeId || rawBill.store_id || rawBill.storeid || "",
      customerId,
      customerName:
        rawBill.customerName ||
        rawBill.customer_name ||
        matchedCustomer?.name ||
        WALK_IN_CUSTOMER_NAME,
      customerEmail: rawBill.customerEmail || rawBill.customer_email || matchedCustomer?.email || "",
      customerPhone: rawBill.customerPhone || rawBill.customer_phone || matchedCustomer?.phone || "",
      customerAddress: rawBill.customerAddress || rawBill.customer_address || matchedCustomer?.address || "",
      items,
      subtotal,
      tax,
      taxPercentage,
      discountPercentage,
      discountAmount,
      total,
      date:
        rawBill.date ||
        rawBill.timestamp ||
        rawBill.createdAt ||
        rawBill.created_at ||
        new Date().toISOString(),
      status: rawBill.status || "Paid",
      isReplacement,
      replacementFinalAmount,
      replacementOriginalBillId:
        rawBill.replacementOriginalBillId || rawBill.replacement_original_bill_id || "",
      paymentMethod: rawBill.paymentMethod || rawBill.paymentmethod || "",
      createdBy,
    };
  };

  const currentBills = useMemo<Bill[]>(() => {
    const primary = billsData ?? [];
    const primaryIds = new Set(primary.map((b: any) => b?.id));
    const older = extraBills.filter((b: any) => b?.id && !primaryIds.has(b.id));
    const merged = [...primary, ...older].map((bill) => normalizeBillForDisplay(bill));
    return merged.sort((a, b) => {
      const ta = new Date(a.date || (a as any).timestamp || 0).getTime();
      const tb = new Date(b.date || (b as any).timestamp || 0).getTime();
      return tb - ta;
    });
  }, [billsData, extraBills, customerLookup, creatorNameById, productNameLookup, allProductNameById]);

  const getBillTimestampMs = (bill: Bill): number | null => {
    const rawDate =
      bill.date ||
      bill.timestamp ||
      (bill as any).created_at ||
      (bill as any).createdAt ||
      null;
    if (!rawDate) return null;
    const dt = new Date(rawDate);
    const ts = dt.getTime();
    return Number.isFinite(ts) ? ts : null;
  };

  const canEditBill = (bill: Bill): boolean => {
    const billTs = getBillTimestampMs(bill);
    if (billTs === null) return false;
    return Date.now() - billTs <= BILL_EDIT_WINDOW_MS;
  };

  const getEditWindowRemainingText = (bill: Bill): string => {
    const billTs = getBillTimestampMs(bill);
    if (billTs === null) return "Edit unavailable (missing bill date)";
    const remainingMs = BILL_EDIT_WINDOW_MS - (Date.now() - billTs);
    if (remainingMs <= 0) return "Edit window expired (24h)";
    const hours = Math.floor(remainingMs / (60 * 60 * 1000));
    const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
    return `Editable for ${hours}h ${minutes}m`;
  };

  const resetBillFormForCreate = () => {
    const walkIn =
      customersData?.find(
        (c) =>
          c.id === WALK_IN_CUSTOMER_ID ||
          (c.name || "").toLowerCase() === WALK_IN_CUSTOMER_NAME.toLowerCase(),
      ) || WALK_IN_CUSTOMER_FALLBACK;

    setEditingBillId(null);
    setSelectedCustomerId(walkIn.id || WALK_IN_CUSTOMER_ID);
    setCustomerName(walkIn.name || WALK_IN_CUSTOMER_NAME);
    setCustomerEmail(walkIn.email || "");
    setCustomerPhone(walkIn.phone || "");
    setBillItems([]);
    setQuantity(1);
    setProductSearchTerm("");
    setDiscountMode("percent");
    setDiscountValue(0);
    setLastScanValue("");
  };

  const openEditBillDialog = (bill: Bill) => {
    const normalized = normalizeBillForDisplay(bill);
    if (!canEditBill(normalized)) {
      alert("This bill can only be edited within 24 hours of creation.");
      return;
    }

    const isWalkInBill =
      !normalized.customerId ||
      normalized.customerId === WALK_IN_CUSTOMER_ID ||
      (normalized.customerName || "").trim().toLowerCase() === WALK_IN_CUSTOMER_NAME.toLowerCase();

    setEditingBillId(normalized.id);
    setSelectedCustomerId(isWalkInBill ? WALK_IN_CUSTOMER_ID : (normalized.customerId || null));
    setCustomerName(normalized.customerName || (isWalkInBill ? WALK_IN_CUSTOMER_NAME : ""));
    setCustomerEmail(normalized.customerEmail || "");
    setCustomerPhone(normalized.customerPhone || "");
    const editableItems = buildEditableItemsFromBill(normalized.items);
    setBillItems(editableItems);
    setQuantity(1);
    setProductSearchTerm("");
    setLastScanValue("");

    if (normalized.discountPercentage > 0) {
      setDiscountMode("percent");
      setDiscountValue(Number(normalized.discountPercentage) || 0);
    } else if (normalized.discountAmount > 0) {
      setDiscountMode("amount");
      setDiscountValue(Number(normalized.discountAmount) || 0);
    } else {
      setDiscountMode("percent");
      setDiscountValue(0);
    }

    setIsViewDialogOpen(false);
    setIsCreateDialogOpen(true);
  };

  // Auto-select Walk-in customer from Supabase (or fallback constant)
  useEffect(() => {
    if (!customersData) return;
    if (isCreateDialogOpen) return;
    const match =
      customersData.find(
        (c) =>
          c.id === WALK_IN_CUSTOMER_ID ||
          (c.name || "").toLowerCase() === WALK_IN_CUSTOMER_NAME.toLowerCase(),
      ) || WALK_IN_CUSTOMER_FALLBACK;

    setSelectedCustomerId(match.id || WALK_IN_CUSTOMER_ID);
    setCustomerName(match.name || WALK_IN_CUSTOMER_NAME);
    setCustomerEmail(match.email || "");
    setCustomerPhone(match.phone || "");
  }, [customersData, isCreateDialogOpen]);

  const getProductBarcodes = (product: Product): string[] => {
    const raw = (product as any).barcodes ?? product.barcode ?? "";
    if (Array.isArray(raw)) {
      return raw.map((b) => `${b}`.trim()).filter(Boolean);
    }
    if (typeof raw === "string") {
      return raw
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);
    }
    return [];
  };

  const addItemToBill = (product: Product, qtyOverride?: number) => {
    if (!product) return;

    const desiredQty = Math.max(1, qtyOverride ?? quantity);

    const price = getProductSellingPrice(product);
    const availableStock =
      product.stock !== undefined && product.stock !== null
        ? Math.max(0, Number(product.stock) || 0)
        : 0;

    const existingItemIndex = billItems.findIndex((item) => item.productId === product.id);

    let newQuantity = desiredQty;
    if (existingItemIndex >= 0) {
      newQuantity = billItems[existingItemIndex].quantity + desiredQty;
    }

    if (newQuantity > availableStock) {
      const alreadyAdded = existingItemIndex >= 0 ? billItems[existingItemIndex].quantity : 0;
      const remaining = Math.max(0, availableStock - alreadyAdded);
      alert(`Cannot add ${desiredQty} more units of ${product.name}. Only ${remaining} units available.`);
      return;
    }

    if (existingItemIndex >= 0) {
      const updatedItems = [...billItems];
      updatedItems[existingItemIndex].quantity = newQuantity;
      updatedItems[existingItemIndex].sellingPrice = price;
      updatedItems[existingItemIndex].total = updatedItems[existingItemIndex].quantity * price;
      setBillItems(updatedItems);
    } else {
      const newItem: BillItem = {
        productId: product.id,
        productName: product.name,
        price: price,
        sellingPrice: price,
        quantity: desiredQty,
        total: price * desiredQty,
        taxPercentage: parseNumber((product as any).tax),
        hsnCode:
          (product as any).hsnCode ||
          (product as any).hsn_code ||
          (product as any).hsnCodeId ||
          (product as any).hsn_code_id ||
          "-",
      };
      setBillItems([...billItems, newItem]);
    }

    setQuantity(1);
    setProductSearchTerm("");
  };

  const removeItemFromBill = (productId: string) => {
    setBillItems(billItems.filter((item) => item.productId !== productId));
  };

  const calculateTotals = () => {
    const subtotal = billItems.reduce((sum, item) => sum + item.total, 0);
    const taxRate = Number.isFinite(systemSettings.taxPercentage) ? systemSettings.taxPercentage : 0;

    let discountAmount =
      discountMode === "percent"
        ? (subtotal * discountValue) / 100
        : discountValue;
    // Clamp so totals never go negative
    discountAmount = Math.max(0, Math.min(discountAmount, subtotal));

    const taxableBase = Math.max(0, subtotal - discountAmount);
    const tax = (taxableBase * taxRate) / 100;
    const total = taxableBase + tax;
    const effectiveDiscountPct = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;

    return { subtotal, tax, discountAmount, total, effectiveDiscountPct, taxRate };
  };

  const handleDiscountChange = (value: number) => {
    setDiscountValue(Math.max(0, value));
  };

  const productSearchResults = useMemo(() => {
    if (!productSearchTerm) {
      return currentProducts.slice(0, 12);
    }
    const q = productSearchTerm.toLowerCase();
    return currentProducts
      .filter((p) => {
        const nameMatch = (p.name || "").toLowerCase().includes(q);
        const barcodeMatch = getProductBarcodes(p).some((b) => b.toLowerCase().includes(q));
        return nameMatch || barcodeMatch;
      })
      .slice(0, 20);
  }, [currentProducts, productSearchTerm]);

  const cartSummary = useMemo(() => {
    const totalItems = billItems.length;
    const totalStock = billItems.reduce((sum, item) => sum + item.quantity, 0);
    return { totalItems, totalStock };
  }, [billItems]);

  const handleProductSearchAdd = () => {
    if (!productSearchTerm) return;
    const raw = productSearchTerm.trim();
    const exactBarcodeMatch = currentProducts.find((p) =>
      getProductBarcodes(p).some((b) => b === raw),
    );
    if (exactBarcodeMatch) {
      addItemToBill(exactBarcodeMatch);
      setLastScanValue(raw);
      return;
    }

    const firstResult = productSearchResults[0];
    if (firstResult) {
      addItemToBill(firstResult);
      setLastScanValue(raw);
    }
  };

  const createBill = async () => {
    const isWalkInSelected = selectedCustomerId === WALK_IN_CUSTOMER_ID;
    if (billItems.length === 0) return;

    const { subtotal, tax, discountAmount, total, effectiveDiscountPct, taxRate } = calculateTotals();
    const selectedCustomer =
      customersData?.find((c) => c.id === selectedCustomerId) || WALK_IN_CUSTOMER_FALLBACK;
    const resolvedCustomerId = isWalkInSelected ? WALK_IN_CUSTOMER_ID : (selectedCustomerId || "");
    const resolvedCustomerName = isWalkInSelected
      ? WALK_IN_CUSTOMER_NAME
      : (customerName.trim() || selectedCustomer?.name || "");
    const resolvedCustomerEmail = isWalkInSelected
      ? ""
      : (customerEmail.trim() || selectedCustomer?.email || "");
    const resolvedCustomerPhone = isWalkInSelected
      ? ""
      : (customerPhone.trim() || selectedCustomer?.phone || "");
    let effectiveCustomerId = resolvedCustomerId;
    if (!isWalkInSelected && !resolvedCustomerName) {
      alert("Please enter customer name.");
      return;
    }
    const createdBy =
      adminUser?.id ||
      adminUser?.name ||
      (() => {
        if (typeof window === "undefined") return undefined;
        try {
          const stored = localStorage.getItem("adminUser");
          const parsed = stored ? JSON.parse(stored) : null;
          return parsed?.id || parsed?.name;
        } catch {
          return undefined;
        }
      })();

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = String(now.getFullYear());

    try {
      // Ensure non-walk-in customers are always synced before bill creation
      if (!isWalkInSelected) {
        const existingCustomer = (customersData || []).find((c) => c.id === effectiveCustomerId) as any;
        const customerPayload: any = {
          name: resolvedCustomerName,
          email: resolvedCustomerEmail,
          phone: resolvedCustomerPhone,
        };
        if (existingCustomer?.updatedAt) {
          customerPayload.baseUpdatedAt = existingCustomer.updatedAt;
        } else if (existingCustomer?.updatedat) {
          customerPayload.baseUpdatedAt = existingCustomer.updatedat;
        }
        if (effectiveCustomerId && effectiveCustomerId !== WALK_IN_CUSTOMER_ID) {
          const customerUpdateResp = await api.put(`/api/customers/${effectiveCustomerId}`, customerPayload);
          if (!customerUpdateResp?.status?.toString().startsWith("2")) {
            throw new Error("Failed to update customer");
          }
        } else {
          const customerCreateResp = await api.post("/api/customers", customerPayload);
          const createdCustomerId = customerCreateResp?.data?.id;
          if (!customerCreateResp?.status?.toString().startsWith("2") || !createdCustomerId) {
            throw new Error("Failed to create customer");
          }
          effectiveCustomerId = String(createdCustomerId);
        }
      }

      const newBill: Bill = {
        id: `INV-${dd}${mm}${yyyy}0000`,
        customerId: effectiveCustomerId || WALK_IN_CUSTOMER_ID,
        customerName: resolvedCustomerName,
        customerEmail: resolvedCustomerEmail,
        customerPhone: resolvedCustomerPhone,
        customerAddress: selectedCustomer?.address,
        items: billItems,
        subtotal,
        tax,
        taxPercentage: taxRate,
        discountPercentage: effectiveDiscountPct,
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
        createdBy: createdBy || undefined,
      };

      const response = await api.post("/api/bills", newBill);

      if (!response.status.toString().startsWith("2")) {
        throw new Error("Failed to create bill");
      }

      resetBillFormForCreate();
      setIsCreateDialogOpen(false);

      // Immediate refresh after creating bill
      await Promise.all([refetchBills(), refetchCustomers()]);
    } catch (error: any) {
      console.error("Error creating bill", error);
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        "Failed to create bill.";
      alert(message);
    }
  };

  const updateBill = async () => {
    if (!editingBillId) return;
    const isWalkInSelected = selectedCustomerId === WALK_IN_CUSTOMER_ID;
    if ((!isWalkInSelected && !customerName.trim()) || billItems.length === 0) return;

    const targetBill = currentBills.find((bill) => bill.id === editingBillId);
    if (!targetBill) {
      alert("Bill not found for editing.");
      return;
    }
    if (!canEditBill(targetBill)) {
      alert("This bill can only be edited within 24 hours of creation.");
      return;
    }

    const { subtotal, tax, discountAmount, total, effectiveDiscountPct, taxRate } = calculateTotals();
    const selectedCustomer = customersData?.find((c) => c.id === selectedCustomerId);
    // Keep update behavior consistent with create:
    // - walk-in => walk-in id
    // - selected existing id => update existing customer
    // - custom/new (null id) => create new customer
    let customerId = isWalkInSelected ? WALK_IN_CUSTOMER_ID : (selectedCustomerId || "");
    const resolvedCustomerName = isWalkInSelected
      ? WALK_IN_CUSTOMER_NAME
      : (customerName.trim() || selectedCustomer?.name || targetBill.customerName || "");
    const resolvedCustomerEmail = isWalkInSelected
      ? ""
      : (customerEmail.trim() || selectedCustomer?.email || targetBill.customerEmail || "");
    const resolvedCustomerPhone = isWalkInSelected
      ? ""
      : (customerPhone.trim() || selectedCustomer?.phone || targetBill.customerPhone || "");

    try {
      // Ensure non-walk-in customers are always synced before bill update
      if (!isWalkInSelected) {
        const existingCustomer = (customersData || []).find((c) => c.id === customerId) as any;
        const customerPayload: any = {
          name: resolvedCustomerName,
          email: resolvedCustomerEmail,
          phone: resolvedCustomerPhone,
        };
        if (existingCustomer?.updatedAt) {
          customerPayload.baseUpdatedAt = existingCustomer.updatedAt;
        } else if (existingCustomer?.updatedat) {
          customerPayload.baseUpdatedAt = existingCustomer.updatedat;
        }
        if (customerId && customerId !== WALK_IN_CUSTOMER_ID) {
          const customerUpdateResp = await api.put(`/api/customers/${customerId}`, customerPayload);
          if (!customerUpdateResp?.status?.toString().startsWith("2")) {
            throw new Error("Failed to update customer");
          }
        } else {
          const customerCreateResp = await api.post("/api/customers", customerPayload);
          const createdCustomerId = customerCreateResp?.data?.id;
          if (!customerCreateResp?.status?.toString().startsWith("2") || !createdCustomerId) {
            throw new Error("Failed to create customer");
          }
          customerId = String(createdCustomerId);
        }
      }

      const payload = {
        customerId,
        customerName: resolvedCustomerName,
        customerEmail: resolvedCustomerEmail,
        customerPhone: resolvedCustomerPhone,
        items: billItems,
        subtotal,
        tax,
        taxPercentage: taxRate,
        discountPercentage: effectiveDiscountPct,
        discountAmount,
        total,
        status: targetBill.status || "Paid",
        paymentMethod: targetBill.paymentMethod || "cash",
      };

      const response = await api.put(`/api/bills/${editingBillId}`, payload);
      if (!response.status.toString().startsWith("2")) {
        throw new Error("Failed to update bill");
      }

      resetBillFormForCreate();
      setIsCreateDialogOpen(false);
      await Promise.all([refetchBills(), refetchCustomers()]);
      alert("Bill updated successfully.");
    } catch (error: any) {
      console.error("Error updating bill", error);
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        "Failed to update bill.";
      alert(message);
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

  const reviseBill = async (bill: Bill) => {
    const normalized = normalizeBillForDisplay(bill);
    if (!normalized?.id) return;

    const confirmed = window.confirm(
      `Revise bill ${normalized.id}?\n\nThis will restore stock and remove this bill data. This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const response = await api.post(`/api/bills/${normalized.id}/revise`, {
        storeId: normalized.storeId || undefined,
      });
      if (!response.status.toString().startsWith("2")) {
        throw new Error("Failed to revise bill");
      }
      if (selectedBill?.id === normalized.id) {
        setIsViewDialogOpen(false);
        setSelectedBill(null);
      }
      await Promise.all([refetchBills(), refetchProducts(), refetchCustomers()]);
      alert("Bill revised successfully. Stock restored and bill removed.");
    } catch (error: any) {
      console.error("Error revising bill", error);
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        "Failed to revise bill.";
      alert(message);
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
    setSelectedBill(normalizeBillForDisplay(bill));
    setIsViewDialogOpen(true);
  };

  const viewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsCustomerViewDialogOpen(true);
  };

  const buildPrintableInvoice = (bill: Bill): PrintableInvoiceData => {
    const toNumber = (value: unknown): number => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };
    const settingsAny = systemSettings as any;
    const companyName =
      bill.companyName || bill.storeName || systemSettings.companyName || settingsAny.company_name || settingsAny.companyname || "UNDEFINED";
    const companyAddress =
      bill.companyAddress || bill.storeAddress || systemSettings.companyAddress || settingsAny.company_address || settingsAny.companyaddress || "";
    const companyPhone =
      bill.companyPhone || bill.storePhone || systemSettings.companyPhone || settingsAny.company_phone || settingsAny.companyphone || "";
    const companyEmail =
      bill.companyEmail || systemSettings.companyEmail || settingsAny.company_email || settingsAny.companyemail || "";
    const gstin = bill.gstin || systemSettings.gstin || settingsAny.gstin || "";

    const items = (Array.isArray(bill.items) ? bill.items : []).map((item: any) => {
      const quantity = toNumber(item.quantity);
      const price = toNumber(item.sellingPrice ?? item.selling_price ?? item.displayPrice ?? item.price ?? item.unit_price);
      const total = toNumber(item.total ?? item.item_total ?? quantity * price);
      const taxPercentage = toNumber(item.taxPercentage || item.tax_percentage || item.tax || item.gst || bill.taxPercentage || 0);
      const hsnCode = item.hsnCode || item.hsn || item.hsn_code || item.hsnCodeId || item.hsn_code_id || "-";
      const replacementTag = item.replacementTag || (item.isReplacementItem && item.replacedProductName
        ? `Replaced: ${item.replacedProductName}`
        : "");
      return {
        name: item.productName || item.product_name || item.productname || item.name || "Item",
        quantity,
        price,
        total,
        taxPercentage,
        hsnCode,
        replacementTag,
      };
    });

    const billedBy =
      bill.createdBy ||
      (bill as any).created_by ||
      (bill as any).billedBy ||
      (bill as any).billed_by ||
      adminUser?.name ||
      getStoredAdminName() ||
      "N/A";
    const computedTaxAmount =
      toNumber(bill.taxAmount || bill.tax) ||
      ((Math.max(0, toNumber(bill.subtotal) - toNumber(bill.discountAmount)) * toNumber(bill.taxPercentage)) / 100);

    return {
      id: bill.id,
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      gstin,
      storeAddress: bill.storeAddress || bill.storeAddress,
      customerName: bill.customerName || "Walk-in Customer",
      customerPhone: bill.customerPhone || "",
      billedBy,
      paymentMethod: bill.paymentMethod || (bill as any).paymentmethod || "CASH",
      timestamp: bill.date || bill.timestamp || new Date().toISOString(),
      subtotal: toNumber(bill.subtotal),
      total: toNumber(bill.total),
      discountPercentage: toNumber(bill.discountPercentage),
      discountAmount: toNumber(bill.discountAmount),
      taxAmount: computedTaxAmount,
      items,
      isReplacementBill: Boolean((bill as any).isReplacement ?? (bill as any).is_replacement),
    };
  };

  const generateReceiptHtml = (bill: Bill, format: BillFormat): string => {
    const toNumber = (value: unknown): number => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };
    const formatNumber = (value: unknown): string => toNumber(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const settingsAny = systemSettings as any;
    const companyName =
      bill.companyName || bill.storeName || systemSettings.companyName || settingsAny.company_name || settingsAny.companyname || "UNDEFINED";
    const companyAddress =
      bill.companyAddress || bill.storeAddress || systemSettings.companyAddress || settingsAny.company_address || settingsAny.companyaddress || "";
    const companyPhone =
      bill.companyPhone || bill.storePhone || systemSettings.companyPhone || settingsAny.company_phone || settingsAny.companyphone || "";
    const companyEmail =
      bill.companyEmail || systemSettings.companyEmail || settingsAny.company_email || settingsAny.companyemail || "";
    const gstin = bill.gstin || systemSettings.gstin || settingsAny.gstin || "";
    const taxPercentage = toNumber(bill.taxPercentage || systemSettings.taxPercentage || settingsAny.tax_percentage || 0);
    const isThermal = format.width === 80;
    const pageSize = isThermal
      ? "80mm auto"
      : format.width === 216 && format.height === 279
      ? "letter"
      : format.width === 210 && format.height === 297
      ? "A4"
      : `${format.width}mm ${format.height === "auto" ? "auto" : `${format.height}mm`}`;

    const safeItems = (Array.isArray(bill.items) ? bill.items : []).map((item: any) => {
      const quantity = toNumber(item.quantity);
      const sellingPrice = toNumber(item.sellingPrice ?? item.selling_price ?? item.displayPrice ?? item.price);
      const total = toNumber(item.total || quantity * sellingPrice);
      const taxPercentageItem = toNumber(item.taxPercentage || item.tax_percentage || item.tax || item.gst || taxPercentage);
      const hsnCode = item.hsnCode || item.hsn || item.hsn_code || item.hsnCodeId || item.hsn_code_id || "-";
      return {
        productName: item.productName || item.product_name || item.productname || item.name || "Item",
        quantity,
        sellingPrice,
        total,
        taxPercentageItem,
        hsnCode,
        isReplacementItem: Boolean(item.isReplacementItem ?? item.is_replacement_item),
        replacedProductName: item.replacedProductName || item.replaced_product_name || item.replacedproductname || "",
        finalAmount: toNumber(item.finalAmount || item.final_amount || total),
      };
    });

    const subtotal = toNumber(bill.subtotal);
    const resolvedSubtotal = subtotal > 0 ? subtotal : safeItems.reduce((sum, item) => sum + item.total, 0);
    const discountPercentage = toNumber(bill.discountPercentage);
    const discountAmount = toNumber(bill.discountAmount);
    const taxFallback = toNumber(bill.tax);
    const taxClassificationRows = safeItems.map((item) => {
      const taxableAmount = Math.max(0, item.total - (item.total * discountPercentage) / 100);
      const totalTax = (taxableAmount * item.taxPercentageItem) / 100;
      const cgst = totalTax / 2;
      const sgst = totalTax / 2;
      return { gst: item.taxPercentageItem, hsnCode: item.hsnCode, cgst, sgst, igst: 0, totalTax };
    });
    const totalCGST = taxClassificationRows.reduce((sum, row) => sum + row.cgst, 0);
    const totalSGST = taxClassificationRows.reduce((sum, row) => sum + row.sgst, 0);
    const computedTaxAmount = taxClassificationRows.reduce((sum, row) => sum + row.totalTax, 0);
    const totalTaxAmount = computedTaxAmount > 0 ? computedTaxAmount : taxFallback;
    const replacementAmount = toNumber(
      (bill as any).replacementFinalAmount ?? (bill as any).replacement_final_amount
    );
    const isReplacement = Boolean((bill as any).isReplacement ?? (bill as any).is_replacement);
    const total = toNumber(bill.total) || Math.max(0, resolvedSubtotal - discountAmount) + totalTaxAmount;
    const paymentMethod = ((bill as any).paymentMethod || (bill as any).paymentmethod || "CASH").toUpperCase();
    const dateValue = bill.date ? new Date(bill.date) : new Date();
    const dateString = Number.isNaN(dateValue.getTime()) ? new Date().toLocaleDateString() : dateValue.toLocaleDateString();
    const timeString = Number.isNaN(dateValue.getTime()) ? new Date().toLocaleTimeString() : dateValue.toLocaleTimeString();
    const billNumber = bill.id;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice-${bill.id}</title>
  <style>
    @page {
      size: ${pageSize};
      margin: ${isThermal ? "0" : `${format.margins.top}mm ${format.margins.right}mm ${format.margins.bottom}mm ${format.margins.left}mm`};
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: "Courier New", monospace;
      color: #0b0b0b;
      font-weight: 650;
    }
    .invoice-wrapper {
      width: 100%;
      max-width: ${isThermal ? "80mm" : `${format.width}mm`};
      margin: 0 auto;
      box-sizing: border-box;
      background: #fff;
      padding: 0;
    }
    .invoice-content {
      width: 100%;
      box-sizing: border-box;
      padding: ${isThermal ? "0 3mm" : "8mm"};
      font-size: ${isThermal ? "12px" : "13px"};
      line-height: 1.6;
    }
    .line {
      border-top: 1px dashed #000;
      margin: 5px 0;
    }
    .header {
      text-align: center;
      margin-bottom: 5px;
    }
    .tax-header, .tax-row {
      display: flex;
      justify-content: space-between;
      font-size: 9px;
    }
    .tax-header {
      border-bottom: 1px dashed #000;
      padding-bottom: 2px;
      margin-bottom: 2px;
    }
    .tax-total {
      border-top: 1px dashed #000;
      padding-top: 2px;
      margin-top: 2px;
      font-weight: bold;
    }
    .tax-col-gst { width: 12%; }
    .tax-col-hsn { width: 20%; }
    .tax-col-mid { width: 17%; text-align: right; }
    .tax-col-igst { width: 15%; text-align: right; }
    .tax-col-tax { width: 19%; text-align: right; }
    @media print {
      .invoice-wrapper {
        width: ${isThermal ? "80mm" : "100%"};
        max-width: ${isThermal ? "80mm" : `${format.width}mm`};
      }
      .invoice-content {
        padding: ${isThermal ? "0 3mm" : "8mm"};
      }
    }
  </style>
</head>
<body>
  <div class="invoice-wrapper">
    <div class="invoice-content">
      <div class="header">
        <div style="font-weight:bold;font-size:${isThermal ? "18px" : "20px"};">${companyName}</div>
        ${companyAddress ? `<div style="font-size:12px;">${companyAddress}</div>` : ""}
        ${companyPhone ? `<div style="font-size:12px;">Ph: ${companyPhone}</div>` : ""}
        ${companyEmail ? `<div style="font-size:12px;">Email: ${companyEmail}</div>` : ""}
        ${gstin ? `<div style="font-size:12px;">GSTIN: ${gstin}</div>` : ""}
      </div>

      <div class="line"></div>

      <div style="font-size:12px;margin-bottom:7px;">
        <div style="display:flex;justify-content:space-between;"><span>Invoice #${billNumber || "N/A"}</span><span>${dateString}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Time: ${timeString}</span><span>Payment: ${paymentMethod}</span></div>
        <div>Customer: ${bill.customerName || "Walk-in Customer"}</div>
        ${bill.customerPhone ? `<div>Phone: ${bill.customerPhone}</div>` : ""}
        <div>Type: ${isReplacement ? "REPLACEMENT" : "STANDARD"}</div>
      </div>

      <div class="line"></div>

      <div style="font-size:12px;margin-bottom:7px;">
        ${safeItems
          .map((item) => `
          <div style="margin-bottom:3px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:1px;">
              <span style="flex:1;">${item.productName}</span>
              <span style="margin-left:5px;">${item.quantity}×₹${formatNumber(item.sellingPrice)}</span>
              <span style="margin-left:5px;min-width:64px;text-align:right;">₹${formatNumber(item.total)}</span>
            </div>
            ${item.isReplacementItem && item.replacedProductName ? `<div style="font-size:10px;font-weight:bold;">Replaced: ${item.replacedProductName}</div>` : ""}
            ${item.isReplacementItem ? `<div style="font-size:10px;">Replacement amount: ₹${formatNumber(item.finalAmount)}</div>` : ""}
          </div>
        `)
          .join("")}
      </div>

      <div class="line"></div>

      <div style="font-size:12px;">
        <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>₹${formatNumber(resolvedSubtotal)}</span></div>
      </div>

      <div style="font-size:10px;margin-top:7px;margin-bottom:7px;">
        <div style="font-weight:bold;margin-bottom:3px;font-size:11px;">Tax Classification</div>
        <div class="tax-header">
          <span class="tax-col-gst">GST%</span>
          <span class="tax-col-hsn">HSN</span>
          <span class="tax-col-mid">SGST</span>
          <span class="tax-col-mid">CGST</span>
          <span class="tax-col-igst">IGST</span>
          <span class="tax-col-tax">Tax</span>
        </div>
        ${taxClassificationRows
          .map(
            (row) => `
            <div class="tax-row">
              <span class="tax-col-gst">${toNumber(row.gst)}%</span>
              <span class="tax-col-hsn">${row.hsnCode}</span>
              <span class="tax-col-mid">₹${formatNumber(row.sgst)}</span>
              <span class="tax-col-mid">₹${formatNumber(row.cgst)}</span>
              <span class="tax-col-igst">₹${formatNumber(row.igst)}</span>
              <span class="tax-col-tax">₹${formatNumber(row.totalTax)}</span>
            </div>
          `,
          )
          .join("")}
        <div class="tax-row tax-total">
          <span class="tax-col-gst">Total</span>
          <span class="tax-col-hsn">-</span>
          <span class="tax-col-mid">₹${formatNumber(totalSGST)}</span>
          <span class="tax-col-mid">₹${formatNumber(totalCGST)}</span>
          <span class="tax-col-igst">₹0.00</span>
          <span class="tax-col-tax">₹${formatNumber(totalTaxAmount)}</span>
        </div>
      </div>

      <div style="font-size:12px;margin-top:7px;">
        ${discountAmount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Discount (${discountPercentage.toFixed(2)}%)</span><span>-₹${formatNumber(discountAmount)}</span></div>` : ""}
        <div style="display:flex;justify-content:space-between;"><span>Total Tax (CGST+SGST)</span><span>₹${formatNumber(totalTaxAmount)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;margin-top:5px;font-size:${isThermal ? "17px" : "18px"};">
          <span>TOTAL</span>
          <span>₹${formatNumber(total)}</span>
        </div>
        ${isReplacement && replacementAmount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px;"><span>Replacement Amount</span><span>₹${formatNumber(replacementAmount)}</span></div>` : ""}
      </div>

      <div class="line"></div>

      <div style="text-align:center;font-size:12px;margin-top:7px;">
        <div>This is a computer-generated invoice</div>
        ${discountAmount > 0 ? `<div style="font-weight:bold;margin-top:3px;margin-bottom:3px;">You have saved ₹${formatNumber(discountAmount)} by shopping here!</div>` : ""}
        <div style="margin-top:5px;">
          <div style="font-weight:bold;">Thank You!</div>
          <div>Please visit us again</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  };

  const handlePrintBill = async (billToPrint: Bill) => {

    const printable = buildPrintableInvoice(billToPrint);
    setPrintBill(billToPrint);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const printOuter = printRef.current?.outerHTML || "";
    const receiptHtml = generatePrintHTML(printOuter, printPaperSize, printable.id || "invoice");

    try {
      const existingFrames = document.querySelectorAll("iframe.billing-print-frame");
      existingFrames.forEach((frame) => frame.remove());
      const frame = document.createElement("iframe");
      frame.className = "billing-print-frame";
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
      document.body.appendChild(frame);
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(receiptHtml);
        doc.close();
        await new Promise((resolve) => setTimeout(resolve, 250));
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(() => {
          if (frame.parentNode) frame.parentNode.removeChild(frame);
        }, 2000);
      } else {
        await unifiedPrint({ htmlContent: receiptHtml });
      }
    } catch (printError) {
      console.error("Failed to send print job", printError);
      try {
        await unifiedPrint({ htmlContent: receiptHtml });
      } catch (fallbackError) {
        console.error("Fallback print failed", fallbackError);
        alert("Failed to print bill. Please check console for details.");
      }
    }
  };

  const generatePrintHTML = (printContent: string, paperSize: string, invoiceId: string): string => {
    const getPageStyles = (): string => {
      if (paperSize === "Thermal 58mm") {
        return `
          @page { size: 58mm auto; margin: 0; }
          body { width: 58mm; margin: 0; padding: 2mm; }
        `;
      }
      return `
        @page { size: 80mm auto; margin: 0; }
        body { width: 80mm; margin: 0; padding: 2mm; }
      `;
    };

    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Invoice-${invoiceId}</title>
          <style>
            ${getPageStyles()}
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            html, body {
              font-family: "Courier New", monospace;
              font-size: ${paperSize.includes("Thermal") ? "12px" : "14px"};
              line-height: 1.5;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              background: white;
              color: black;
              height: auto;
            }
            @media print {
              html, body {
                margin: 0 !important;
                overflow: visible !important;
                height: auto !important;
              }
              @page { margin: 0; }
            }
            .print-container {
              width: 100%;
              max-width: 100%;
              padding: 0;
              margin: 0 auto;
            }
            .invoice-wrapper {
              break-after: avoid-page;
              page-break-after: avoid;
            }
          </style>
        </head>
        <body>
          <div class="print-container">
            ${printContent}
          </div>
        </body>
      </html>
    `;
  };

  const filteredBills = useMemo(() => {
    const searchLower = billSearchTerm.toLowerCase();
    const filtered = currentBills.filter((bill: Bill) => {
      const customerName = bill.customerName || "";
      const billId = bill.id || "";
      return customerName.toLowerCase().includes(searchLower) || billId.includes(searchLower);
    });

    const getEffectiveBillAmount = (bill: Bill): number => {
      if (bill.isReplacement && (bill.replacementFinalAmount || 0) > 0) {
        return bill.replacementFinalAmount || 0;
      }
      return bill.total || 0;
    };

    const getComparableValue = (bill: Bill) => {
      switch (billSortKey) {
        case "total":
          return getEffectiveBillAmount(bill);
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

  const getEffectiveBillAmount = (bill: Bill): number => {
    if (bill.isReplacement && (bill.replacementFinalAmount || 0) > 0) {
      return bill.replacementFinalAmount || 0;
    }
    return bill.total || 0;
  };

  const billingStats = useMemo(() => {
    // Prefer the full lightweight summary (statsBills) when loaded, so stats
    // reflect ALL bills even though the table only shows a paginated slice.
    const source: any[] = statsBills ?? currentBills;
    const todayKey = new Date().toISOString().slice(0, 10);
    let todayCount = 0;
    let todayRevenue = 0;
    let totalRevenue = 0;
    source.forEach((bill: any) => {
      const isRepl = Boolean(bill.isReplacement ?? bill.is_replacement);
      const replAmt = Number(bill.replacementFinalAmount ?? bill.replacement_final_amount ?? 0);
      const amount = isRepl && replAmt > 0 ? replAmt : Number(bill.total || 0);
      totalRevenue += amount;
      const rawDate = bill.date || bill.timestamp || bill.created_at || bill.createdAt || "";
      const dateStr = rawDate ? String(rawDate).slice(0, 10) : "";
      if (dateStr === todayKey) {
        todayCount += 1;
        todayRevenue += amount;
      }
    });
    return {
      todayCount,
      todayRevenue,
      totalCount: source.length,
      totalRevenue,
    };
  }, [statsBills, currentBills]);

  // Per-customer aggregation across the FULL dataset (via statsBills when loaded),
  // so the Customers tab shows accurate bill counts / total spent — not just the
  // subset currently visible in the Bills table pagination.
  const customerAggregates = useMemo(() => {
    const source: any[] = statsBills ?? currentBills;
    const map = new Map<string, { count: number; total: number }>();
    source.forEach((bill: any) => {
      const customerId = bill.customerId || bill.customerid || bill.customer_id;
      if (!customerId) return;
      const isRepl = Boolean(bill.isReplacement ?? bill.is_replacement);
      const replAmt = Number(bill.replacementFinalAmount ?? bill.replacement_final_amount ?? 0);
      const amount = isRepl && replAmt > 0 ? replAmt : Number(bill.total || 0);
      const prev = map.get(customerId) || { count: 0, total: 0 };
      map.set(customerId, { count: prev.count + 1, total: prev.total + amount });
    });
    return map;
  }, [statsBills, currentBills]);

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

  const { subtotal, tax, discountAmount, total, effectiveDiscountPct, taxRate } = calculateTotals();

  const discountPresets = [5, 10, 15, 20, 25];

  const handleImportBills = async () => {
    if (!importFile) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedBills = JSON.parse(e.target?.result as string);
        const response = await api.post("/api/bills/import", importedBills);

        if (!response.status.toString().startsWith("2")) {
          throw new Error("Failed to import bills");
        }

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

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
            <p className="text-sm text-muted-foreground">
              Create, search and manage bills
              {(productsLoading || billsLoading || customersLoading) && (
                <span className="ml-2 text-blue-500">· loading…</span>
              )}
              {(productsError || billsError || customersError) && (
                <span className="ml-2 text-red-500">· error loading data</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleManualRefresh} disabled={isRefreshing || !isOnline}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </Button>

            {/* Import Bills Dialog */}
            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={!isOnline}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import
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
            <Dialog
              open={isCreateDialogOpen}
              onOpenChange={(open) => {
                setIsCreateDialogOpen(open);
                if (!open) {
                  setEditingBillId(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  onClick={() => {
                    resetBillFormForCreate();
                    setEditingBillId(null);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Bill
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden p-0 flex flex-col">
                <DialogHeader className="px-6 pt-5 pb-4 border-b">
                  <DialogTitle className="text-base">
                    {editingBillId ? "Edit Bill" : "New Bill"}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    {editingBillId
                      ? `Editing ${editingBillId}`
                      : "Pick a customer, add products, and create a bill."}
                  </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                  {/* Customer */}
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Customer</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="md:col-span-2 space-y-1.5">
                        <Label htmlFor="customerSelect" className="text-xs">Select customer</Label>
                        <Select
                          value={selectedCustomerId || "custom"}
                          onValueChange={(value) => {
                            if (value === "custom") {
                              setSelectedCustomerId(null);
                              return;
                            }
                            const picked =
                              customersData?.find((c) => c.id === value) || WALK_IN_CUSTOMER_FALLBACK;
                            setSelectedCustomerId(value);
                            setCustomerName(picked.name || "");
                            setCustomerEmail(picked.email || "");
                            setCustomerPhone(picked.phone || "");
                          }}
                        >
                          <SelectTrigger id="customerSelect" className="h-9">
                            <SelectValue placeholder="Choose customer (default Walk-in)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={WALK_IN_CUSTOMER_ID}>
                              {WALK_IN_CUSTOMER_NAME} (default)
                            </SelectItem>
                            {(customersData || [])
                              .filter((c) => c.id !== WALK_IN_CUSTOMER_ID)
                              .slice(0, 15)
                              .map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name || "Unnamed"} {c.phone ? `• ${c.phone}` : ""}
                                </SelectItem>
                              ))}
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {selectedCustomerId !== WALK_IN_CUSTOMER_ID && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="customerName" className="text-xs">Name</Label>
                          <Input
                            id="customerName"
                            className="h-9"
                            value={customerName}
                            onChange={(e) => {
                              setCustomerName(e.target.value);
                              setSelectedCustomerId(null);
                            }}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="customerEmail" className="text-xs">Email <span className="text-muted-foreground">(optional)</span></Label>
                          <Input
                            id="customerEmail"
                            type="email"
                            className="h-9"
                            value={customerEmail}
                            onChange={(e) => {
                              setCustomerEmail(e.target.value);
                              setSelectedCustomerId(null);
                            }}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="customerPhone" className="text-xs">Phone <span className="text-muted-foreground">(optional)</span></Label>
                          <Input
                            id="customerPhone"
                            className="h-9"
                            value={customerPhone}
                            onChange={(e) => {
                              setCustomerPhone(e.target.value);
                              setSelectedCustomerId(null);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Products + Cart */}
                  <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-5">
                    {/* Products */}
                    <section className="border rounded-lg overflow-hidden bg-white">
                      <div className="px-4 py-3 border-b flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium">Products</h3>
                          <p className="text-xs text-muted-foreground">Search or scan barcode</p>
                        </div>
                      </div>
                      <div className="p-4 space-y-4">
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex-1 min-w-[200px] space-y-1.5">
                            <Label htmlFor="productSearch" className="text-xs">Search</Label>
                            <Input
                              id="productSearch"
                              className="h-9"
                              placeholder="Name or barcode (Enter to add)"
                              value={productSearchTerm}
                              onChange={(e) => setProductSearchTerm(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleProductSearchAdd();
                                }
                              }}
                            />
                          </div>
                          <div className="space-y-1.5 w-20">
                            <Label htmlFor="quantity" className="text-xs">Qty</Label>
                            <Input
                              id="quantity"
                              type="number"
                              min="1"
                              className="h-9 text-right"
                              value={quantity}
                              onChange={(e) => setQuantity(Number.parseInt(e.target.value) || 1)}
                            />
                          </div>
                          <Button
                            size="sm"
                            className="h-9"
                            onClick={handleProductSearchAdd}
                            disabled={productSearchTerm.trim() === ""}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        </div>
                        {lastScanValue && (
                          <p className="text-xs text-emerald-600">Last scanned: {lastScanValue}</p>
                        )}

                        <div className="grid md:grid-cols-2 gap-2 max-h-[42vh] overflow-y-auto pr-1">
                          {productSearchResults.map((product: Product) => {
                            const productBarcodes = getProductBarcodes(product);
                            const sellingPrice = getProductSellingPrice(product);
                            const stock = Math.max(0, Number(product.stock) || 0);
                            return (
                              <button
                                type="button"
                                key={product.id}
                                onClick={() => addItemToBill(product)}
                                className="text-left border rounded-md p-2.5 hover:bg-muted/40 hover:border-primary/30 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-sm truncate">{product.name}</div>
                                    {productBarcodes.length > 0 && (
                                      <div className="text-[11px] text-muted-foreground truncate font-mono">
                                        {productBarcodes.join(", ")}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="font-semibold text-sm tabular-nums">₹{sellingPrice.toFixed(2)}</div>
                                    <div className={`text-[11px] ${stock > 0 ? "text-muted-foreground" : "text-rose-600"}`}>
                                      {stock > 0 ? `Stock ${stock}` : "Out of stock"}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                          {productSearchResults.length === 0 && (
                            <div className="text-sm text-muted-foreground py-4 col-span-full text-center">
                              No matching products. Try another name or barcode.
                            </div>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* Cart + Totals */}
                    <section className="border rounded-lg overflow-hidden bg-white flex flex-col">
                      <div className="px-4 py-3 border-b flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium">Cart</h3>
                          <p className="text-xs text-muted-foreground">
                            {cartSummary.totalItems} item{cartSummary.totalItems === 1 ? "" : "s"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setBillItems([])}
                          disabled={billItems.length === 0}
                        >
                          Clear
                        </Button>
                      </div>

                      <div className="flex-1 overflow-y-auto max-h-[34vh]">
                        {billItems.length > 0 ? (
                          <ul className="divide-y">
                            {billItems.map((item) => (
                              <li key={item.productId} className="px-4 py-2 flex items-center gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm truncate">{item.productName}</div>
                                  <div className="text-xs text-muted-foreground tabular-nums">
                                    {item.quantity} × ₹{item.price.toFixed(2)}
                                  </div>
                                </div>
                                <div className="font-medium tabular-nums text-sm w-20 text-right">
                                  ₹{item.total.toFixed(2)}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-rose-600"
                                  onClick={() => removeItemFromBill(item.productId)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No items yet. Add products from the left.
                          </div>
                        )}
                      </div>

                      {/* Totals + Discount */}
                      <div className="border-t bg-muted/30 px-4 py-3 space-y-3">
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Subtotal</span>
                          <span className="tabular-nums">₹{subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Tax ({taxRate.toFixed(1)}%)</span>
                          <span className="tabular-nums">₹{tax.toFixed(2)}</span>
                        </div>

                        <div className="border-t pt-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs flex items-center text-muted-foreground">
                              <Percent className="h-3.5 w-3.5 mr-1" />
                              Discount
                            </Label>
                            <div className="flex items-center gap-1">
                              <Select value={discountMode} onValueChange={(val) => setDiscountMode(val as "percent" | "amount")}>
                                <SelectTrigger className="h-8 w-20 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="percent">%</SelectItem>
                                  <SelectItem value="amount">₹</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                min="0"
                                step="0.1"
                                value={discountValue}
                                onChange={(e) => handleDiscountChange(Number.parseFloat(e.target.value) || 0)}
                                className="h-8 w-20 text-right text-sm"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {(discountMode === "percent" ? discountPresets : [50, 100, 200, 500]).map((preset) => (
                              <Button
                                key={preset}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleDiscountChange(preset)}
                                className="text-xs h-7 px-2"
                              >
                                {discountMode === "percent" ? `${preset}%` : `₹${preset}`}
                              </Button>
                            ))}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDiscountChange(0)}
                              className="text-xs h-7 px-2"
                            >
                              Clear
                            </Button>
                          </div>

                          {discountAmount > 0 && (
                            <div className="flex justify-between text-sm text-rose-600">
                              <span>−Discount ({effectiveDiscountPct.toFixed(1)}%)</span>
                              <span className="tabular-nums">−₹{discountAmount.toFixed(2)}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t text-base font-semibold">
                          <span>Total</span>
                          <span className="tabular-nums">₹{total.toFixed(2)}</span>
                        </div>

                        {discountAmount > 0 && (
                          <p className="text-xs text-emerald-600 text-center">
                            Customer saves ₹{discountAmount.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t flex-row sm:justify-between gap-2 bg-white">
                  <div className="text-sm text-muted-foreground">
                    {billItems.length > 0 && (
                      <span>
                        <span className="font-medium text-foreground">{billItems.length}</span> item{billItems.length === 1 ? "" : "s"} · Total{" "}
                        <span className="font-semibold text-foreground tabular-nums">₹{total.toFixed(2)}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={editingBillId ? updateBill : createBill}
                      disabled={
                        billItems.length === 0 ||
                        (selectedCustomerId !== WALK_IN_CUSTOMER_ID && !customerName.trim())
                      }
                    >
                      {editingBillId ? "Update bill" : "Create bill"}
                    </Button>
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border rounded-lg p-3 bg-white">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Today's bills</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{billingStats.todayCount}</div>
          </div>
          <div className="border rounded-lg p-3 bg-white">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Today's revenue</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">₹{billingStats.todayRevenue.toFixed(2)}</div>
          </div>
          <div className="border rounded-lg p-3 bg-white">
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              {activeFilterCount > 0 ? "Filtered bills" : "Total bills"}
              {activeFilterCount > 0 && <span className="text-blue-500">●</span>}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{billingStats.totalCount}</div>
          </div>
          <div className="border rounded-lg p-3 bg-white">
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              {activeFilterCount > 0 ? "Filtered revenue" : "Total revenue"}
              {activeFilterCount > 0 && <span className="text-blue-500">●</span>}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">₹{billingStats.totalRevenue.toFixed(2)}</div>
          </div>
        </div>

        {/* Tabs for Bills and Customers */}
        <Tabs defaultValue="bills" className="w-full">
          <TabsList className="grid w-full sm:w-auto grid-cols-2 sm:inline-grid">
            <TabsTrigger value="bills">Bills</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
          </TabsList>

          {/* Bills Tab */}
          <TabsContent value="bills">
            <Card>
              <CardHeader className="pb-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base">Bills</CardTitle>
                  </div>

                  {selectedBillIds.length > 0 && (
                    <Button variant="destructive" size="sm" onClick={openBulkDeleteDialog}>
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Delete {selectedBillIds.length}
                    </Button>
                  )}
                </div>

                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="h-4 w-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <Input
                      placeholder="Search bills…"
                      value={billSearchTerm}
                      onChange={(e) => setBillSearchTerm(e.target.value)}
                      className="pl-8 h-9"
                    />
                  </div>

                  {/* Filters popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 gap-2">
                        <SlidersHorizontal className="h-4 w-4" />
                        Filters
                        {activeFilterCount > 0 && (
                          <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold h-5 min-w-5 px-1.5">
                            {activeFilterCount}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[340px] p-0" align="end">
                      <div className="p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium">Filter bills</h4>
                          {activeFilterCount > 0 && (
                            <button
                              type="button"
                              onClick={clearAllFilters}
                              className="text-xs text-muted-foreground hover:text-foreground underline"
                            >
                              Clear all
                            </button>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Date range</Label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[
                              { key: "today" as const, label: "Today" },
                              { key: "7d" as const, label: "7 days" },
                              { key: "30d" as const, label: "30 days" },
                              { key: "month" as const, label: "This month" },
                            ].map((p) => (
                              <Button
                                key={p.key}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => applyDatePreset(p.key)}
                              >
                                {p.label}
                              </Button>
                            ))}
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className={`w-full justify-start h-9 text-sm font-normal ${!dateRange ? "text-muted-foreground" : ""}`}
                              >
                                <CalendarIcon className="h-4 w-4 mr-2" />
                                {dateLabel || "Pick custom range"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={setDateRange}
                                numberOfMonths={2}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Store</Label>
                          <Select value={filterStoreId} onValueChange={setFilterStoreId}>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="All stores" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All stores</SelectItem>
                              {storesList.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Sort group — pushed to right */}
                  <div className="ml-auto flex items-center gap-1">
                    <Select value={billSortKey} onValueChange={(value) => setBillSortKey(value as BillSortKey)}>
                      <SelectTrigger className="w-[130px] h-9 text-sm">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="total">Total</SelectItem>
                        <SelectItem value="discount">Discount</SelectItem>
                        <SelectItem value="items">Items</SelectItem>
                        <SelectItem value="customer">Customer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={toggleBillSortDirection}
                      title={billSortDirection === "asc" ? "Ascending" : "Descending"}
                    >
                      <ArrowUpDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Active filter chips */}
                {activeFilterCount > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {dateLabel && (
                      <span className="inline-flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-0.5">
                        <CalendarIcon className="h-3 w-3" />
                        {dateLabel}
                        <button
                          type="button"
                          onClick={() => {
                            setFilterFromDate("");
                            setFilterToDate("");
                          }}
                          className="ml-0.5 text-muted-foreground hover:text-foreground"
                          aria-label="Remove date filter"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                    {activeStoreLabel && (
                      <span className="inline-flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-0.5">
                        <span className="text-muted-foreground">Store:</span>
                        {activeStoreLabel}
                        <button
                          type="button"
                          onClick={() => setFilterStoreId("all")}
                          className="ml-0.5 text-muted-foreground hover:text-foreground"
                          aria-label="Remove store filter"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {filteredBills.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={allFilteredBillsSelected || (someFilteredBillsSelected ? "indeterminate" : false)}
                              onCheckedChange={(checked) => toggleSelectAllFilteredBills(checked === true)}
                              aria-label="Select all bills"
                            />
                          </TableHead>
                          <TableHead>Bill</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Items</TableHead>
                          <TableHead className="text-right">Discount</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right pr-4">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredBills.map((bill: Bill) => {
                          const status = String(bill.status || "completed").toLowerCase();
                          const statusTone =
                            status === "completed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : status === "pending"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : status === "cancelled" || status === "canceled"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-slate-50 text-slate-700 border-slate-200";
                          return (
                            <TableRow key={bill.id} className="hover:bg-muted/30">
                              <TableCell>
                                <Checkbox
                                  checked={selectedBillIds.includes(bill.id)}
                                  onCheckedChange={(checked) => toggleBillSelection(bill.id, checked === true)}
                                  aria-label={`Select bill ${bill.id}`}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                <div>{bill.id}</div>
                                {bill.isReplacement && (
                                  <span className="inline-block mt-0.5 px-1.5 py-0 text-[10px] rounded border bg-purple-50 text-purple-700 border-purple-200">
                                    Replacement
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-sm">{bill.customerName || "Walk-in Customer"}</div>
                                {bill.customerPhone && (
                                  <div className="text-xs text-muted-foreground">{bill.customerPhone}</div>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {new Date(bill.date).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm">{bill.items?.length || 0}</TableCell>
                              <TableCell className="text-right tabular-nums text-sm">
                                {bill.discountAmount > 0 ? (
                                  <span className="text-rose-600">−₹{bill.discountAmount.toFixed(2)}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                ₹{getEffectiveBillAmount(bill).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <span className={`inline-block px-2 py-0.5 text-[11px] rounded border capitalize ${statusTone}`}>
                                  {status}
                                </span>
                              </TableCell>
                              <TableCell className="pr-4">
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => viewBill(bill)} title="View">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => openEditBillDialog(bill)}
                                    disabled={!canEditBill(bill)}
                                    title={getEditWindowRemainingText(bill) || "Edit"}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePrintBill(bill)} title="Print">
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => reviseBill(bill)} title="Revise">
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:text-rose-700" onClick={() => openDeleteDialog(bill.id)} title="Delete">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : billsLoading ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3 text-sm text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                    Loading bills…
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <h3 className="text-sm font-medium">No bills found</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {billSearchTerm
                        ? "Try adjusting your search terms"
                        : filterFromDate || filterToDate || filterStoreId !== "all"
                        ? "No bills match the current filters"
                        : "Create your first bill to get started"}
                    </p>
                  </div>
                )}

                {/* Infinite-scroll sentinel + loading indicator */}
                {filteredBills.length > 0 && !billSearchTerm && hasMoreBillsToLoad && (
                  <div
                    ref={billsSentinelRef}
                    className="px-4 py-4 border-t flex items-center justify-center text-xs text-muted-foreground"
                  >
                    {isLoadingMoreBills ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Loading more bills…
                      </span>
                    ) : (
                      <span className="opacity-60">Scroll to load more</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Customers</CardTitle>
                    <CardDescription className="text-xs">
                      {filteredCustomers.length} of {currentCustomers.length}
                      {customerSearchTerm && ` · "${customerSearchTerm}"`}
                    </CardDescription>
                  </div>
                  <div className="relative">
                    <Search className="h-4 w-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <Input
                      placeholder="Search customers…"
                      value={customerSearchTerm}
                      onChange={(e) => setCustomerSearchTerm(e.target.value)}
                      className="pl-8 h-9 w-64"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredCustomers.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Address</TableHead>
                          <TableHead className="text-right">Bills</TableHead>
                          <TableHead className="text-right">Spent</TableHead>
                          <TableHead className="text-right pr-4">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCustomers.map((customer: Customer) => {
                          const agg = customerAggregates.get(customer.id) || { count: 0, total: 0 };
                          const billsCount = agg.count;
                          const totalSpent = agg.total;
                          return (
                            <TableRow key={customer.id} className="hover:bg-muted/30">
                              <TableCell className="font-medium text-sm">{customer.name || "—"}</TableCell>
                              <TableCell className="text-sm">
                                {customer.phone && <div>{customer.phone}</div>}
                                {customer.email && (
                                  <div className="text-xs text-muted-foreground">{customer.email}</div>
                                )}
                                {!customer.phone && !customer.email && (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                                {customer.address || "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm">{billsCount}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                ₹{totalSpent.toFixed(2)}
                              </TableCell>
                              <TableCell className="pr-4 text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => viewCustomer(customer)}
                                  title="View"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <h3 className="text-sm font-medium">No customers found</h3>
                    <p className="text-xs text-muted-foreground mt-1">
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
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0">
            {selectedBill && (() => {
              const toNumber = (value: unknown): number => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : 0;
              };
              const billTaxPercentage = toNumber(selectedBill.taxPercentage);
              const selectedBillItems = (Array.isArray(selectedBill.items) ? selectedBill.items : []).map((item: any) => {
                const isReplacementItem = Boolean(item.isReplacementItem || item.is_replacement_item);
                const quantity = toNumber(item.quantity);
                const price = toNumber(
                  item.sellingPrice ?? item.selling_price ?? item.displayPrice ?? item.price,
                );
                const baseTotal = toNumber(item.total || quantity * price);
                const finalAmount = toNumber(item.finalAmount || item.final_amount || baseTotal);
                const displayTotal =
                  selectedBill.isReplacement || isReplacementItem
                    ? (finalAmount > 0 ? finalAmount : baseTotal)
                    : baseTotal;
                const itemTaxPercentage = toNumber(
                  item.taxPercentage ?? item.tax_percentage ?? item.tax ?? item.gst ?? billTaxPercentage,
                );
                return {
                  productName: item.productName || item.product_name || item.productname || "Unknown Product",
                  quantity,
                  price,
                  finalAmount,
                  displayTotal,
                  itemTaxPercentage,
                  isReplacementItem,
                  replacedProductName: item.replacedProductName || item.replaced_product_name || "",
                };
              });
              const subtotalValue =
                toNumber(selectedBill.subtotal) > 0
                  ? toNumber(selectedBill.subtotal)
                  : selectedBillItems.reduce((sum: number, item: any) => sum + toNumber(item?.displayTotal), 0);
              const createdByName =
                selectedBill.createdBy ||
                (selectedBill as any).created_by ||
                (selectedBill as any).billedBy ||
                (selectedBill as any).billed_by ||
                "N/A";
              const billDate = selectedBill.date || (selectedBill as any).timestamp;
              const discountPctForTax = toNumber(selectedBill.discountPercentage);
              const computedTaxValue = selectedBillItems.reduce((sum: number, item: any) => {
                const taxable = Math.max(0, item.displayTotal - (item.displayTotal * discountPctForTax) / 100);
                return sum + (taxable * item.itemTaxPercentage) / 100;
              }, 0);
              const savedTaxValue = toNumber((selectedBill as any).taxAmount ?? selectedBill.tax);
              const taxValue = computedTaxValue > 0 ? computedTaxValue : savedTaxValue;
              const taxRatesUsed = Array.from(
                new Set(
                  selectedBillItems
                    .map((item: any) => Number(item.itemTaxPercentage))
                    .filter((rate: number) => rate > 0),
                ),
              ) as number[];
              const taxLabelSuffix =
                taxRatesUsed.length === 1
                  ? `(${taxRatesUsed[0]}%)`
                  : taxRatesUsed.length > 1
                  ? "(mixed)"
                  : "";
              const customerName = selectedBill.customerName || "Walk-in Customer";
              const customerPhone = selectedBill.customerPhone || "";
              const status = String(selectedBill.status || "completed").toLowerCase();
              const statusTone =
                status === "completed"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : status === "pending"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : status === "cancelled" || status === "canceled"
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-slate-50 text-slate-700 border-slate-200";
              const totalValue = getEffectiveBillAmount(selectedBill);
              const discountAmount = toNumber(selectedBill.discountAmount);
              const replacementReason = (() => {
                if (!selectedBill.isReplacement) return "";
                const reason =
                  (selectedBill as any).replacementReason ||
                  (selectedBill as any).replacement_reason ||
                  (Array.isArray(selectedBill.items)
                    ? selectedBill.items.find((i: any) => i.isReplacementItem && (i.damageReason || i.damage_reason))
                    : undefined)?.damageReason ||
                  "";
                return reason || "";
              })();

              return (
                <>
                  <DialogHeader className="px-6 pt-6 pb-4 border-b">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <DialogTitle className="font-mono text-base">{selectedBill.id}</DialogTitle>
                        <DialogDescription className="mt-1 text-xs">
                          {billDate ? new Date(billDate).toLocaleString() : "N/A"}
                        </DialogDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-semibold">₹{totalValue.toFixed(2)}</div>
                        <span className={`inline-block mt-1 px-2 py-0.5 text-[11px] rounded border capitalize ${statusTone}`}>
                          {status}
                        </span>
                      </div>
                    </div>
                  </DialogHeader>

                  <div className="px-6 py-5 space-y-5 text-sm">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                      <dt className="text-muted-foreground">Customer</dt>
                      <dd>
                        {customerName}
                        {customerPhone && <span className="text-muted-foreground"> · {customerPhone}</span>}
                      </dd>

                      <dt className="text-muted-foreground">Created by</dt>
                      <dd>{createdByName}</dd>

                      {selectedBill.isReplacement && (
                        <>
                          <dt className="text-muted-foreground">Type</dt>
                          <dd>
                            Replacement
                            {selectedBill.replacementOriginalBillId && (
                              <span className="text-muted-foreground"> · of {selectedBill.replacementOriginalBillId}</span>
                            )}
                          </dd>
                          {replacementReason && (
                            <>
                              <dt className="text-muted-foreground">Reason</dt>
                              <dd>{replacementReason}</dd>
                            </>
                          )}
                        </>
                      )}
                    </dl>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Items</div>
                      {selectedBillItems.length === 0 ? (
                        <div className="text-muted-foreground py-3">No items</div>
                      ) : (
                        <ul className="divide-y">
                          {selectedBillItems.map((item: any, index: number) => (
                            <li key={index} className="py-2 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate">{item.productName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {item.quantity} × ₹{item.price.toFixed(2)}
                                  {item.isReplacementItem && item.replacedProductName && (
                                    <span> · replaced {item.replacedProductName}</span>
                                  )}
                                </div>
                              </div>
                              <div className="font-medium tabular-nums">₹{item.displayTotal.toFixed(2)}</div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="border-t pt-3 space-y-1 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span>
                        <span className="tabular-nums">₹{subtotalValue.toFixed(2)}</span>
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between text-rose-600">
                          <span>
                            Discount{selectedBill.discountPercentage > 0 ? ` (${selectedBill.discountPercentage.toFixed(1)}%)` : ""}
                          </span>
                          <span className="tabular-nums">−₹{discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      {taxValue > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Tax {taxLabelSuffix}</span>
                          <span className="tabular-nums">₹{taxValue.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 text-base font-semibold">
                        <span>Total</span>
                        <span className="tabular-nums">₹{totalValue.toFixed(2)}</span>
                      </div>
                      {selectedBill.isReplacement && (selectedBill.replacementFinalAmount || 0) > 0 && (
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Replacement amount</span>
                          <span className="tabular-nums">₹{(selectedBill.replacementFinalAmount || 0).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}

            <DialogFooter className="px-6 py-4 border-t flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsViewDialogOpen(false)}>
                Close
              </Button>
              {selectedBill && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditBillDialog(selectedBill)}
                  disabled={!canEditBill(selectedBill)}
                  title={getEditWindowRemainingText(selectedBill)}
                >
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Edit
                </Button>
              )}
              {selectedBill && (
                <Button variant="outline" size="sm" onClick={() => reviseBill(selectedBill)}>
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                  Revise
                </Button>
              )}
              {selectedBill && (
                <Button size="sm" onClick={() => handlePrintBill(selectedBill)} className="bg-blue-600 hover:bg-blue-700">
                  <Printer className="h-4 w-4 mr-1.5" />
                  Print
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
                        const agg = customerAggregates.get(selectedCustomer.id) || { count: 0, total: 0 };
                        return (
                          <>
                            <div>Total Bills: {agg.count}</div>
                            <div>Total Spent: ₹{agg.total.toFixed(2)}</div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div>
  {(() => {
    const loadedCount = currentBills.filter((bill: Bill) => {
      const billCustomerId = (bill as any).customerId || (bill as any).customerid;
      return billCustomerId === selectedCustomer.id;
    }).length;
    const totalCount = customerAggregates.get(selectedCustomer.id)?.count ?? loadedCount;
    return (
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium">Bills by {selectedCustomer.name}</h4>
        {loadedCount < totalCount && (
          <span className="text-xs text-muted-foreground">
            Showing {loadedCount} of {totalCount} (scroll the main list to load older bills)
          </span>
        )}
      </div>
    );
  })()}

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
                <div className="space-y-1">
                  <div>{bill.id}</div>
                  {bill.isReplacement && (
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                      Replacement
                    </Badge>
                  )}
                </div>
              </TableCell>

              <TableCell>
                {new Date(bill.date).toLocaleDateString()}
              </TableCell>

              <TableCell>
                ₹{getEffectiveBillAmount(bill).toFixed(2)}
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
      <div style={{ display: "none" }}>
        {printBill && (
          <PrintableInvoice
            ref={printRef}
            invoice={buildPrintableInvoice(printBill)}
            paperSize={printPaperSize}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
