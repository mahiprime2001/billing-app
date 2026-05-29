"use client"
import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

// Helper function to normalize store IDs
const normalizeStoreId = (id: string | undefined | null): string | undefined | null => {
  if (id === undefined || id === null) return id;
  if (id === 'store_1') return 'STR-1722255700000';
  if (id.startsWith('STR-')) return id;
  return id;
};

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Plus,
  Edit,
  Trash2,
  Search,
  MapPin,
  Phone,
  User,
  TrendingUp,
  Receipt,
  Building,
  Info,
  RefreshCw,
} from "lucide-react"

const API = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://127.0.0.1:8080"

interface StoreType {
  id: string
  name: string
  address: string
  phone: string
  manager: string
  storecode?: string
  status: "active" | "inactive"
  createdAt: string
  totalRevenue: number
  totalBills: number
  lastBillDate: string
  productCount?: number;
  totalStock?: number;
  gstRegistrationId?: string
  gstin?: string
  gstState?: string
}

interface GstRegistration {
  id: string
  gst_number: string
  state: string
}

type StoreLiveInventoryRow = {
  id?: string
  quantity?: number
  products?: {
    name?: string
    barcode?: string
    price?: number
    sellingPrice?: number
    selling_price?: number
  }
  name?: string
  barcode?: string
  price?: number
  sellingPrice?: number
  selling_price?: number
}


// Store Insight Modal Component
function StoreInsightModal({
  open,
  onClose,
  store,
}: {
  open: boolean;
  onClose: () => void;
  store: StoreType | null;
}) {
  const [hasLoadedLiveFeed, setHasLoadedLiveFeed] = useState(false);
  const [inventoryRows, setInventoryRows] = useState<StoreLiveInventoryRow[]>([]);
  const [liveBills, setLiveBills] = useState<any[]>([]);
  const [liveProductSearch, setLiveProductSearch] = useState("");
  const [selectedLiveBillTab, setSelectedLiveBillTab] = useState("");
  const [isLoadingLiveFeed, setIsLoadingLiveFeed] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [selectedBill, setSelectedBill] = useState<any | null>(null);
  const [creatorNameById, setCreatorNameById] = useState<Record<string, string>>({});

  const getDateKey = (value?: string) => {
    if (!value) return "";
    const text = String(value);
    return text.length >= 10 ? text.slice(0, 10) : "";
  };
  const getBillStoreId = (bill: any) =>
    normalizeStoreId(bill?.storeId || bill?.storeid || bill?.store_id);
  const getBillDate = (bill: any) => bill?.timestamp || bill?.date || bill?.createdAt || bill?.created_at || "";

  const formatDateTime = (value?: string) => {
    if (!value) return "-";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };


  const BILLS_PAGE_SIZE = 200;
  const [isLoadingMoreBills, setIsLoadingMoreBills] = useState(false);
  const [billsLoadProgress, setBillsLoadProgress] = useState<{ loaded: number; total: number } | null>(null);

  const fetchInventory = async () => {
    if (!store) return;
    const normalizedStoreId = normalizeStoreId(store.id) || store.id;
    try {
      const res = await fetch(`${API}/api/stores/${normalizedStoreId}/assigned-products`);
      if (!res.ok) return;
      const invData = await res.json();
      const rows = Array.isArray(invData) ? invData : [];
      setInventoryRows(rows.filter((row: StoreLiveInventoryRow) => Number(row?.quantity || 0) > 0));
    } catch (error) {
      console.error("Error loading store inventory:", error);
    }
  };

  const fetchBillsPage = async (page: number) => {
    if (!store) return null;
    const normalizedStoreId = normalizeStoreId(store.id) || store.id;
    const url = `${API}/api/bills?storeId=${encodeURIComponent(normalizedStoreId)}&page=${page}&pageSize=${BILLS_PAGE_SIZE}&paginate=1&details=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Bills page ${page} failed: ${res.status}`);
    const payload = await res.json();
    const list = Array.isArray(payload) ? payload : payload?.data || [];
    const items = (Array.isArray(list) ? list : []).filter(
      (bill) => getBillStoreId(bill) === normalizeStoreId(store.id),
    );
    return {
      items,
      hasMore: Boolean(payload?.hasMore),
      total: typeof payload?.total === "number" ? payload.total : null,
    };
  };

  const sortBillsDesc = (rows: any[]) =>
    [...rows].sort((a, b) => new Date(getBillDate(b)).getTime() - new Date(getBillDate(a)).getTime());

  const loadAllBills = async (showLoader = false) => {
    if (!store) return;
    if (showLoader) setIsLoadingLiveFeed(true);
    try {
      const first = await fetchBillsPage(1);
      if (!first) return;
      setLiveBills(sortBillsDesc(first.items));
      setBillsLoadProgress(
        first.total != null ? { loaded: first.items.length, total: first.total } : null,
      );

      if (!first.hasMore) {
        setBillsLoadProgress(null);
        return;
      }

      setIsLoadingMoreBills(true);
      let page = 2;
      let collected = [...first.items];
      // Hard safety cap to avoid infinite loops if backend misreports hasMore.
      const MAX_PAGES = 50;
      while (page <= MAX_PAGES) {
        try {
          const next = await fetchBillsPage(page);
          if (!next) break;
          collected = collected.concat(next.items);
          setLiveBills(sortBillsDesc(collected));
          setBillsLoadProgress(
            next.total != null ? { loaded: collected.length, total: next.total } : null,
          );
          if (!next.hasMore) break;
          page += 1;
        } catch (err) {
          console.error("Failed to load additional bills page", page, err);
          break;
        }
      }
    } catch (error) {
      console.error("Error loading store bills:", error);
    } finally {
      setLastUpdated(new Date().toLocaleTimeString());
      setIsLoadingMoreBills(false);
      setBillsLoadProgress(null);
      if (showLoader) setIsLoadingLiveFeed(false);
    }
  };

  const refreshFirstBillsPage = async () => {
    try {
      const first = await fetchBillsPage(1);
      if (!first) return;
      setLiveBills((prev) => {
        const seen = new Set(first.items.map((b: any) => b.id));
        const older = prev.filter((b: any) => !seen.has(b.id));
        return sortBillsDesc([...first.items, ...older]);
      });
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      console.error("Error refreshing latest bills:", error);
    }
  };

  useEffect(() => {
    if (!open || !store) return;
    if (!hasLoadedLiveFeed) {
      fetchInventory();
      loadAllBills(true);
      setHasLoadedLiveFeed(true);
    }
    const timer = setInterval(() => {
      fetchInventory();
      refreshFirstBillsPage();
    }, 30000);
    return () => clearInterval(timer);
  }, [open, store?.id, hasLoadedLiveFeed]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/users`);
        if (!res.ok) return;
        const payload = await res.json();
        const rows = Array.isArray(payload) ? payload : payload?.data || [];
        const map = rows.reduce((acc: Record<string, string>, row: any) => {
          const id = String(row?.id || row?.userId || row?.user_id || "").trim();
          const name = String(row?.name || row?.fullName || row?.full_name || "").trim();
          if (id && name) acc[id] = name;
          return acc;
        }, {});
        if (!cancelled) setCreatorNameById(map);
      } catch (error) {
        console.warn("Failed to load users for bill creator mapping", error);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open || !store) return;
    setHasLoadedLiveFeed(false);
    setInventoryRows([]);
    setLiveBills([]);
    setLiveProductSearch("");
    setSelectedLiveBillTab("");
    setLastUpdated("");
    setSelectedBill(null);
    setIsLoadingMoreBills(false);
    setBillsLoadProgress(null);
  }, [open, store?.id]);

  const filteredInventoryRows = useMemo(() => {
    const search = liveProductSearch.trim().toLowerCase();
    if (!search) return inventoryRows;
    return inventoryRows.filter((row) => {
      const productObj = row.products || {};
      const barcode = String(productObj.barcode || row.barcode || "").toLowerCase();
      const name = String(productObj.name || row.name || "").toLowerCase();
      return barcode.includes(search) || name.includes(search);
    });
  }, [inventoryRows, liveProductSearch]);

  const liveBillTabs = useMemo(() => {
    if (liveBills.length === 0) return [] as Array<{ key: string; label: string; bills: any[] }>;

    const monthGroups = new Map<string, any[]>();
    liveBills.forEach((bill: any) => {
      const dateText = getBillDate(bill);
      const dt = dateText ? new Date(dateText) : null;
      if (!dt || Number.isNaN(dt.getTime())) return;
      const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      monthGroups.set(monthKey, [...(monthGroups.get(monthKey) || []), bill]);
    });

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const tabs: Array<{ key: string; label: string; bills: any[] }> = [];

    Array.from(monthGroups.keys())
      .sort((a, b) => b.localeCompare(a))
      .forEach((monthKey) => {
        const monthBills = [...(monthGroups.get(monthKey) || [])].sort(
          (a, b) => new Date(getBillDate(b)).getTime() - new Date(getBillDate(a)).getTime(),
        );

        if (monthKey < currentMonthKey) {
          const monthDate = new Date(`${monthKey}-01T00:00:00`);
          tabs.push({
            key: `month:${monthKey}`,
            label: monthDate.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
            bills: monthBills,
          });
          return;
        }

        const dayGroups = new Map<string, any[]>();
        monthBills.forEach((bill: any) => {
          const dayKey = getDateKey(getBillDate(bill));
          if (!dayKey) return;
          dayGroups.set(dayKey, [...(dayGroups.get(dayKey) || []), bill]);
        });

        Array.from(dayGroups.keys())
          .sort((a, b) => b.localeCompare(a))
          .forEach((dayKey) => {
            const dayDate = new Date(`${dayKey}T00:00:00`);
            tabs.push({
              key: `day:${dayKey}`,
              label: dayDate.toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
              bills: [...(dayGroups.get(dayKey) || [])].sort(
                (a, b) => new Date(getBillDate(b)).getTime() - new Date(getBillDate(a)).getTime(),
              ),
            });
          });
      });

    return tabs;
  }, [liveBills]);

  useEffect(() => {
    if (liveBillTabs.length === 0) {
      setSelectedLiveBillTab("");
      return;
    }
    if (!liveBillTabs.some((tab) => tab.key === selectedLiveBillTab)) {
      setSelectedLiveBillTab(liveBillTabs[0].key);
    }
  }, [liveBillTabs, selectedLiveBillTab]);

  const activeLiveBills = useMemo(() => {
    const activeTab = liveBillTabs.find((tab) => tab.key === selectedLiveBillTab);
    return activeTab?.bills || [];
  }, [liveBillTabs, selectedLiveBillTab]);

  if (!open || !store) return null;

  const totalStock = inventoryRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalBillAmount = liveBills.reduce((sum, bill) => sum + Number(bill?.total || 0), 0);
  const activeTabBillAmount = activeLiveBills.reduce((sum, bill) => sum + Number(bill?.total || 0), 0);

  const storeStatus = String(store.status || "active").toLowerCase();
  const statusTone =
    storeStatus === "active"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[94vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="border-b px-6 py-4 bg-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <Building className="h-5 w-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-lg font-semibold truncate">{store.name}</DialogTitle>
                  <span className={`inline-block px-2 py-0.5 text-[11px] rounded border capitalize ${statusTone}`}>
                    {storeStatus}
                  </span>
                  {store.storecode && (
                    <span className="text-xs text-muted-foreground font-mono">{store.storecode}</span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                  {store.address && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate max-w-[280px]">{store.address}</span>
                    </span>
                  )}
                  {store.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {store.phone}
                    </span>
                  )}
                  {store.manager && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {store.manager}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {lastUpdated && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Updated {lastUpdated}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchInventory();
                  loadAllBills(true);
                }}
                disabled={isLoadingLiveFeed}
                className="h-8 gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLiveFeed ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Stats strip */}
        <div className="border-b px-6 py-3 bg-muted/30 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Products</div>
            <div className="text-lg font-semibold tabular-nums">{inventoryRows.length}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total stock</div>
            <div className="text-lg font-semibold tabular-nums">{totalStock}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Bills (period)</div>
            <div className="text-lg font-semibold tabular-nums">{activeLiveBills.length}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Revenue (period)</div>
            <div className="text-lg font-semibold tabular-nums">₹{activeTabBillAmount.toFixed(2)}</div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-6 min-h-0">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-full">
            {/* Products Section */}
            <Card className="border shadow-none flex flex-col h-full min-h-0 overflow-hidden">
              <CardHeader className="pb-3 space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium">Products in store</CardTitle>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {filteredInventoryRows.length}/{inventoryRows.length}
                  </span>
                </div>
                <div className="relative">
                  <Search className="h-4 w-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Search barcode or name…"
                    value={liveProductSearch}
                    onChange={(e) => setLiveProductSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
                <div className="h-full overflow-y-auto overflow-x-hidden [&>div]:overflow-visible pb-2">
                  <Table className="table-fixed w-full">
                    <TableHeader className="bg-muted/40 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="h-10 w-[25%] text-sm">Barcode</TableHead>
                        <TableHead className="h-10 w-[35%] text-sm">Product</TableHead>
                        <TableHead className="h-10 w-[15%] text-sm text-right">Qty</TableHead>
                        <TableHead className="h-10 w-[25%] text-sm text-right">Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInventoryRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-10 text-muted-foreground text-sm">
                            {liveProductSearch ? "No products match your search" : "No assigned products"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredInventoryRows.map((row, idx) => {
                          const p = row.products || {};
                          const qty = Number(row.quantity || 0);
                          return (
                            <TableRow key={idx} className="hover:bg-muted/30">
                              <TableCell className="font-mono text-sm py-2 truncate" title={p.barcode || row.barcode || ""}>{p.barcode || row.barcode || "—"}</TableCell>
                              <TableCell className="text-base font-medium py-2 truncate" title={p.name || row.name || ""}>{p.name || row.name || "Unknown"}</TableCell>
                              <TableCell className={`text-right tabular-nums text-base py-2 ${qty === 0 ? "text-rose-600" : ""}`}>
                                {qty}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-base py-2">
                                ₹{Number(p.sellingPrice ?? p.selling_price ?? row.sellingPrice ?? row.selling_price ?? p.price ?? row.price ?? 0).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Bills Section */}
            <Card className="border shadow-none flex flex-col h-full min-h-0 overflow-hidden">
              <CardHeader className="pb-3 space-y-3 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium">Recent bills</CardTitle>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Total ₹{totalBillAmount.toFixed(2)}
                  </span>
                </div>

                {liveBillTabs.length > 0 && (
                  <div className="overflow-x-auto -mx-1">
                    <div className="flex gap-1 min-w-max px-1 pb-0.5">
                      {liveBillTabs.map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setSelectedLiveBillTab(tab.key)}
                          className={`shrink-0 px-2.5 py-1 rounded-md text-xs transition-colors ${
                            selectedLiveBillTab === tab.key
                              ? "bg-blue-600 text-white"
                              : "bg-muted text-muted-foreground hover:bg-muted/70"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isLoadingMoreBills && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-600">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Loading more bills
                    {billsLoadProgress && ` (${billsLoadProgress.loaded}/${billsLoadProgress.total})`}
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
                <div className="h-full overflow-y-auto overflow-x-hidden [&>div]:overflow-visible pb-2">
                  <Table className="table-fixed w-full">
                    <TableHeader className="bg-muted/40 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="h-9 w-[34%]">Bill</TableHead>
                        <TableHead className="h-9 w-[28%]">Date</TableHead>
                        <TableHead className="h-9 w-[18%] text-right">Amount</TableHead>
                        <TableHead className="h-9 w-[20%]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeLiveBills.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-10 text-center text-muted-foreground text-sm">
                            No bills in selected period
                          </TableCell>
                        </TableRow>
                      ) : (
                        activeLiveBills.map((bill) => {
                          const status = String(bill.status || "completed").toLowerCase();
                          const statusToneBill =
                            status === "completed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : status === "pending"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : status === "cancelled" || status === "canceled"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-slate-50 text-slate-700 border-slate-200";
                          return (
                            <TableRow
                              key={bill.id}
                              className="hover:bg-muted/30 cursor-pointer"
                              onClick={() => setSelectedBill(bill)}
                            >
                              <TableCell className="font-mono text-xs py-1.5 truncate" title={bill.id}>{bill.id}</TableCell>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap py-1.5 truncate">
                                {formatDateTime(getBillDate(bill))}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums text-sm py-1.5">
                                ₹{Number(bill.total || 0).toFixed(2)}
                              </TableCell>
                              <TableCell className="py-1.5">
                                <span className={`inline-block px-2 py-0.5 text-[11px] rounded border capitalize ${statusToneBill}`}>
                                  {status}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-3 bg-white shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>

        <BillDetailsDialog
          bill={selectedBill}
          onClose={() => setSelectedBill(null)}
          creatorNameById={creatorNameById}
        />
      </DialogContent>
    </Dialog>
  );
}

function BillDetailsDialog({
  bill,
  onClose,
  creatorNameById = {},
}: {
  bill: any | null;
  onClose: () => void;
  creatorNameById?: Record<string, string>;
}) {
  const isLikelyUserId = (value: string): boolean => {
    if (!value) return false;
    const v = value.trim();
    if (!v) return false;
    return /^USR[-_]/i.test(v) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(v);
  };
  const resolveCreator = (b: any): string => {
    const explicitName =
      b?.createdByName || b?.created_by_name || b?.billedByName || b?.billed_by_name;
    if (explicitName) return String(explicitName);
    const raw = String(
      b?.createdBy || b?.created_by || b?.createdby || b?.billedBy || b?.billed_by || b?.userid || b?.user_id || "",
    ).trim();
    if (!raw) return "N/A";
    if (creatorNameById[raw]) return creatorNameById[raw];
    if (isLikelyUserId(raw)) return "N/A";
    return raw;
  };
  const toNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatDateTime = (value?: string) => {
    if (!value) return "N/A";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString();
  };

  const billTaxPercentage = toNumber(bill?.taxPercentage ?? bill?.tax_percentage);
  const items = useMemo(() => {
    if (!bill) return [] as any[];
    const raw = Array.isArray(bill.items) ? bill.items : [];
    return raw.map((item: any) => {
      const isReplacementItem = Boolean(item.isReplacementItem || item.is_replacement_item);
      const quantity = toNumber(item.quantity);
      const price = toNumber(
        item.sellingPrice ?? item.selling_price ?? item.displayPrice ?? item.price,
      );
      const baseTotal = toNumber(item.total || quantity * price);
      const finalAmount = toNumber(item.finalAmount || item.final_amount || baseTotal);
      const displayTotal =
        bill.isReplacement || isReplacementItem
          ? finalAmount > 0
            ? finalAmount
            : baseTotal
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
  }, [bill, billTaxPercentage]);

  if (!bill) return null;

  const subtotalValue =
    toNumber(bill.subtotal) > 0
      ? toNumber(bill.subtotal)
      : items.reduce((sum: number, item: any) => sum + toNumber(item?.displayTotal), 0);
  const discountAmount = toNumber(bill.discountAmount ?? bill.discount_amount);
  const discountPercentage = toNumber(bill.discountPercentage ?? bill.discount_percentage);
  const computedTaxValue = items.reduce((sum: number, item: any) => {
    const taxable = Math.max(0, item.displayTotal - (item.displayTotal * discountPercentage) / 100);
    return sum + (taxable * item.itemTaxPercentage) / 100;
  }, 0);
  const savedTaxValue = toNumber(bill.taxAmount ?? bill.tax_amount ?? bill.tax);
  const taxValue = computedTaxValue > 0 ? computedTaxValue : savedTaxValue;
  const taxRatesUsed = Array.from(
    new Set(items.map((item: any) => Number(item.itemTaxPercentage)).filter((rate: number) => rate > 0)),
  ) as number[];
  const taxLabelSuffix =
    taxRatesUsed.length === 1 ? `(${taxRatesUsed[0]}%)` : taxRatesUsed.length > 1 ? "(mixed)" : "";
  const totalValue = toNumber(bill.total) || Math.max(0, subtotalValue - discountAmount) + taxValue;
  const billDate = bill.date || bill.timestamp || bill.createdAt || bill.created_at;
  const createdByName = resolveCreator(bill);

  const customerName = bill.customerName || bill.customer_name || "Walk-in Customer";
  const customerPhone = bill.customerPhone || bill.customer_phone || "";
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
    <Dialog open={!!bill} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="font-mono text-base">{bill.id}</DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {formatDateTime(billDate)}
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
          {/* Compact key/value summary */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Customer</dt>
            <dd>{customerName}{customerPhone && <span className="text-muted-foreground"> · {customerPhone}</span>}</dd>

            <dt className="text-muted-foreground">Created by</dt>
            <dd>{createdByName}</dd>

            {bill.isReplacement && (
              <>
                <dt className="text-muted-foreground">Type</dt>
                <dd>
                  Replacement
                  {bill.replacementOriginalBillId && (
                    <span className="text-muted-foreground"> · of {bill.replacementOriginalBillId}</span>
                  )}
                </dd>
              </>
            )}
          </dl>

          {/* Items — clean, no table chrome */}
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Items</div>
            {items.length === 0 ? (
              <div className="text-muted-foreground py-3">No items</div>
            ) : (
              <ul className="divide-y">
                {items.map((item: any, index: number) => (
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

          {/* Totals — minimal, only show non-zero rows */}
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">₹{subtotalValue.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Discount{discountPercentage > 0 ? ` (${discountPercentage.toFixed(1)}%)` : ""}</span>
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
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StoresPage() {
  const router = useRouter()
  const [stores, setStores] = useState<StoreType[]>([])
  const [bills, setBills] = useState<any[]>([])
  const [gstRegistrations, setGstRegistrations] = useState<GstRegistration[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<StoreType | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    manager: "",
    storecode: "",
    status: "active" as "active" | "inactive",
    gstRegistrationId: "",
  })

  // Store insight modal state
  const [insightOpen, setInsightOpen] = useState(false)
  const [selectedStore, setSelectedStore] = useState<StoreType | null>(null)

  
  useEffect(() => {
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    const userData = localStorage.getItem("adminUser")

    if (isLoggedIn !== "true" || !userData) {
      router.push("/")
      return
    }

    const user = JSON.parse(userData)
    let assignedStoreId: string | undefined | null;

    if (user.role === "admin") {
      assignedStoreId = normalizeStoreId(user.assignedStoreId);
    } else if (user.role !== "super_admin") {
      router.push("/")
      return
    }

    loadData(assignedStoreId)
  }, [router])

  const loadData = async (assignedStoreId?: string | null) => {
    // Fetch stores immediately — don't block on bills
    fetch(`${API}/api/stores`)
      .then(async (storesResponse) => {
        if (!storesResponse.ok) return;
        const storesData: any[] = await storesResponse.json();
        const seenIds = new Set<string>();
        const uniqueStores = storesData.map((store: any) => {
          let uniqueId = store.id || store.ID || store._id;
          if (!uniqueId || seenIds.has(uniqueId)) {
            uniqueId = crypto.randomUUID();
          }
          seenIds.add(uniqueId);
          return { ...store, id: uniqueId } as StoreType;
        });

        if (assignedStoreId) {
          const filtered = uniqueStores.filter(store => normalizeStoreId(store.id) === assignedStoreId);
          setStores(filtered);
        } else {
          setStores(uniqueStores);
        }
      })
      .catch((error) => console.error("Error loading stores:", error));

    // Fetch bills separately — slow Supabase retries won't block the stores list
    fetch(`${API}/api/bills`)
      .then(async (billsResponse) => {
        if (!billsResponse.ok) return;
        const billsData = await billsResponse.json();
        setBills(billsData);
      })
      .catch((error) => console.error("Error loading bills:", error));

    // GST registrations populate the dropdown in the store form.
    fetch(`${API}/api/gst-registrations`)
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        setGstRegistrations(Array.isArray(data) ? data : []);
      })
      .catch((error) => console.error("Error loading GST registrations:", error));
  }

  
  const calculateStoreAnalytics = (storeId: string) => {
    const storeBills = bills.filter((bill) => normalizeStoreId(bill.storeId) === normalizeStoreId(storeId))
    const totalRevenue = storeBills.reduce((sum, bill) => sum + (bill.total || 0), 0)
    const totalBills = storeBills.length
    const lastBillDate = storeBills.length > 0
      ? storeBills.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
      : ""

    return { totalRevenue, totalBills, lastBillDate }
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.address) {
      alert("Please fill in all required fields")
      return
    }
    if (!formData.gstRegistrationId) {
      alert("Please select a GST registration for this store")
      return
    }

    const storeData = {
      name: formData.name,
      address: formData.address,
      phone: formData.phone,
      manager: formData.manager,
      storecode: formData.storecode.trim().toUpperCase(),
      status: formData.status,
      gstRegistrationId: formData.gstRegistrationId,
    }

    try {
      let response
      if (editingStore) {
        response = await fetch(`${API}/api/stores/${editingStore.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(storeData),
        })
      } else {
        response = await fetch(`${API}/api/stores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(storeData),
        })
      }

      if (response.ok) {
        await loadData()
        resetForm()
        setIsDialogOpen(false)
      } else {
        const errorData = await response.json()
        alert(`Failed to save store: ${errorData.error || errorData.message || "Unknown error"}`)
      }
    } catch (error) {
      console.error("Error saving store:", error)
      alert("An error occurred while saving the store.")
    }
  }

  const handleEdit = (store: StoreType) => {
    setEditingStore(store)
    setFormData({
      name: store.name,
      address: store.address,
      phone: store.phone,
      manager: store.manager,
      storecode: store.storecode || "",
      status: store.status,
      gstRegistrationId: store.gstRegistrationId || "",
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    const normalizedId = normalizeStoreId(id);
    const storeBills = bills.filter((bill) => normalizeStoreId(bill.storeId) === normalizedId)
    if (storeBills.length > 0) {
      alert(`Cannot delete store. It has ${storeBills.length} associated bills. Please deactivate instead.`)
      return
    }

    if (confirm("Are you sure you want to delete this store? This action cannot be undone.")) {
      try {
        const response = await fetch(`${API}/api/stores/${id}`, { method: "DELETE" })
        if (response.ok) {
          await loadData()
        } else {
          const errorData = await response.json()
          alert(`Failed to delete store: ${errorData.error || errorData.message || "Unknown error"}`)
        }
      } catch (error) {
        console.error("Error deleting store:", error)
        alert("An error occurred while deleting the store.")
      }
    }
  }

  const toggleStoreStatus = async (id: string) => {
    const store = stores.find((s) => s.id === id)
    if (!store) return

    const newStatus = store.status === "active" ? "inactive" : "active"
    try {
      const response = await fetch(`${API}/api/stores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        await loadData()
      } else {
        const errorData = await response.json()
        alert(`Failed to update status: ${errorData.error || errorData.message || "Unknown error"}`)
      }
    } catch (error) {
      console.error("Error updating status:", error)
      alert("An error occurred while updating the store status.")
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      address: "",
      phone: "",
      manager: "",
      storecode: "",
      status: "active",
      gstRegistrationId: "",
    })
    setEditingStore(null)
  }

  const getStatusBadge = (status: string) => {
    return status === "active" ? (
      <Badge className="bg-green-100 text-green-800">Active</Badge>
    ) : (
      <Badge variant="secondary">Inactive</Badge>
    )
  }

  const openStoreModal = (store: StoreType) => {
    setSelectedStore(store)
    setInsightOpen(true)
  }

  const filteredStores = stores.filter((store) => {
    const searchTermLower = searchTerm.toLowerCase();
    return (
      store.name?.toLowerCase().includes(searchTermLower) ||
      store.address?.toLowerCase().includes(searchTermLower) ||
      store.manager?.toLowerCase().includes(searchTermLower)
    );
  })

  const totalRevenue = bills.reduce((sum, bill) => sum + (bill.total || 0), 0);
  const totalBills = bills.length;
  const activeStores = stores.filter((store) => store.status === "active").length;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Store Management</h1>
            <p className="text-gray-600 mt-2">Manage your store locations and track performance</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} className="bg-blue-600 hover:bg-blue-700 shadow-lg">
                <Plus className="h-4 w-4 mr-2" />
                Add New Store
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl flex items-center">
                  <Building className="h-6 w-6 mr-2 text-blue-600" />
                  {editingStore ? "Edit Store" : "Add New Store"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="grid gap-6 py-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Store Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter store name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Store Address *</Label>
                      <Textarea
                        id="address"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="Enter complete store address"
                        rows={3}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="Enter phone number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="storecode">Store Code *</Label>
                      <Input
                        id="storecode"
                        value={formData.storecode}
                        onChange={(e) => setFormData({ ...formData, storecode: e.target.value.toUpperCase() })}
                        placeholder="e.g. NLR, MPD, KNL"
                        maxLength={10}
                        required
                      />
                      <p className="text-xs text-muted-foreground">Short code used in invoice numbers (e.g. INV-NLR-190420260001)</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gstRegistration">GST Registration *</Label>
                    <Select
                      value={formData.gstRegistrationId}
                      onValueChange={(value) =>
                        setFormData({ ...formData, gstRegistrationId: value })
                      }
                    >
                      <SelectTrigger id="gstRegistration">
                        <SelectValue
                          placeholder={
                            gstRegistrations.length === 0
                              ? "No GST registrations — add one in Settings first"
                              : "Select a GST registration"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {gstRegistrations.map((reg) => (
                          <SelectItem key={reg.id} value={reg.id}>
                            {reg.gst_number} — {reg.state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      The GST printed on this store&apos;s invoices.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="manager">Store Manager</Label>
                      <Input
                        id="manager"
                        value={formData.manager}
                        onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                        placeholder="Enter manager name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Store Status</Label>
                      <div className="flex items-center space-x-2 pt-2">
                        <Switch
                          id="status"
                          checked={formData.status === "active"}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, status: checked ? "active" : "inactive" })
                          }
                        />
                        <Label htmlFor="status">Store is active</Label>
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter className="flex space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                    {editingStore ? "Update Store" : "Create Store"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Analytics Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Stores</CardTitle>
              <Building className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stores.length}</div>
              <p className="text-xs text-muted-foreground">{activeStores} active stores</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{totalRevenue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Across all stores</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bills</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalBills}</div>
              <p className="text-xs text-muted-foreground">Bills generated</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average per Store</CardTitle>
              <Building className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₹{activeStores > 0 ? (totalRevenue / activeStores).toFixed(2) : "0.00"}
              </div>
              <p className="text-xs text-muted-foreground">Revenue per active store</p>
            </CardContent>
          </Card>
        </div>

        {/* Stores List */}
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-2xl">Store Locations</CardTitle>
                <CardDescription>
                  {stores.length} total stores • {activeStores} active • {stores.length - activeStores} inactive
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search stores..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredStores.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>Store Details</TableHead>
                      <TableHead>Store Info</TableHead>
                      <TableHead>Store Inventory</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStores.map((store) => (
                      <TableRow key={store.id} className="hover:bg-gray-50">
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium flex items-center">
                              <Building className="h-4 w-4 mr-2 text-blue-600" />
                              {store.name}
                            </div>
                            <div className="text-sm text-gray-500 flex items-start">
                              <MapPin className="h-3 w-3 mr-1 mt-0.5 text-gray-400" />
                              <span className="line-clamp-2">{store.address}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {store.phone && (
                              <div className="text-sm flex items-center">
                                <Phone className="h-3 w-3 mr-1 text-gray-400" />
                                {store.phone}
                              </div>
                            )}
                            {store.manager && (
                              <div className="text-sm flex items-center">
                                <User className="h-3 w-3 mr-1 text-gray-400" />
                                {store.manager}
                              </div>
                            )}
                            {store.storecode && (
                              <div className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded w-fit">
                                {store.storecode}
                              </div>
                            )}
                            {store.gstin && (
                              <div className="text-xs font-mono text-gray-700">
                                GST: {store.gstin}
                                {store.gstState ? ` (${store.gstState})` : ""}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-2xl font-bold text-black-600">
                              {store.productCount || 0}
                            </div>
                            <div className="text-xs text-gray-500">
                              {store.totalStock || 0} total stock
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-sm font-medium">
                              ₹{(store.totalRevenue || 0).toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {store.totalBills || 0} bills
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={store.status === "active"}
                              onCheckedChange={() => toggleStoreStatus(store.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            {getStatusBadge(store.status)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEdit(store)
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                openStoreModal(store)
                              }}
                              className="bg-blue-50 hover:bg-blue-100 border-blue-200"
                              title="Store insights"
                            >
                              <Info className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(store.id)
                              }}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-16">
                <Building className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-900 mb-2">No stores found</h3>
                <p className="text-gray-500 mb-6">
                  {searchTerm ? "Try adjusting your search criteria" : "Create your first store to get started"}
                </p>
                {!searchTerm && (
                  <Button onClick={() => setIsDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Store
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Store Insight Modal */}
        <StoreInsightModal
          open={insightOpen}
          onClose={() => setInsightOpen(false)}
          store={selectedStore}
        />
      </div>
    </DashboardLayout>
  )
}
