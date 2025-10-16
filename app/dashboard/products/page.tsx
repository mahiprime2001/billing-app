"use client"

import React, { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { Product, Batch } from "@/lib/types";
import DashboardLayout from "@/components/dashboard-layout"
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"; // NEW
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
  Calendar, // NEW
} from "lucide-react";
import PrintDialog from "@/components/PrintDialog";
import { ScrollToBottomButton } from "@/components/ScrollToBottomButton";
import { BatchInput } from "@/components/BatchInput"; // NEW

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

const fetcher = (url: string) => fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}${url}`).then((res) => res.json());

export default function ProductsPage() {
  const router = useRouter();
  const { data: products = [], mutate } = useSWR<Product[]>("/api/products", fetcher);
  const { data: batches = [], mutate: mutateBatches } = useSWR<Batch[]>("/api/batches", fetcher); // NEW: Fetch batches
  const scrollableDivRef = useRef<HTMLDivElement>(null); // Ref for the scrollable div
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [assignedStores, setAssignedStores] = useState<SystemStore[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [stockFilter, setStockFilter] = useState("all")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [productsToPrint, setProductsToPrint] = useState<Product[]>([]);

  // NEW: Calendar and modal state
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isByDateDialogOpen, setIsByDateDialogOpen] = useState(false);
  const [isBatchInputOpen, setIsBatchInputOpen] = useState(false); // NEW
  // const [batches, setBatches] = useState<{ id: string; batchNumber: string; place: string }[]>([ // REMOVED
  //   { id: "1", batchNumber: "BATCH-A", place: "Warehouse 1" },
  //   { id: "2", batchNumber: "BATCH-B", place: "Store Room 2" },
  // ]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null); // NEW

  useEffect(() => {
    if (calendarOpen) {
      setCalendarMonth(new Date()); // ensure opening shows today’s month
      // Optionally clear any previous selection:
      // setSelectedDate(null);
    }
  }, [calendarOpen]);

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    stock: "",
    tax: "",
    barcodes: [""],
    batchId: "", // NEW
  });
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);

  // NEW: Handle saving a new batch - REMOVED, BatchInput handles it directly
  // const handleSaveNewBatch = (batchNumber: string, place: string) => {
  //   const newBatch = {
  //     id: (batches.length + 1).toString(), // Simple ID generation
  //     batchNumber,
  //     place,
  //   };
  //   setBatches((prev) => [...prev, newBatch]);
  //   setSelectedBatchId(newBatch.id); // Select the newly added batch
  //   setFormData((prev) => ({ ...prev, batchId: newBatch.id }));
  // };

  useEffect(() => {
    const userData = localStorage.getItem("adminUser");
    if (userData) {
      const user = JSON.parse(userData);
      setCurrentUser(user);

      // Load assigned stores for billing users
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
      tax: "",
      barcodes: [""],
      batchId: "", // NEW
    })
  }

  const addBarcodeField = () => {
    setFormData({
      ...formData,
      barcodes: [...formData.barcodes, ""],
    })
  }

  const removeBarcodeField = (index: number) => {
    if (formData.barcodes.length > 1) {
      const newBarcodes = formData.barcodes.filter((_, i) => i !== index)
      setFormData({
        ...formData,
        barcodes: newBarcodes,
      })
    }
  }

  const updateBarcodeField = (index: number, value: string) => {
    const newBarcodes = [...formData.barcodes]
    newBarcodes[index] = value
    setFormData({
      ...formData,
      barcodes: newBarcodes,
    })
  }

  const generateBarcode = () => {
    // Generate CODE128 compatible barcode
    const timestamp = Date.now().toString()
    const randomNum = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")
    return `${timestamp}${randomNum}`
  }

  const validateBarcode = (barcode: string): boolean => {
    if (!barcode || barcode.trim() === "") return false
    // CODE128 can handle any ASCII character and length between 1-80
    return barcode.length >= 1 && barcode.length <= 80
  }

  const handleAddProduct = async () => {
    if (!formData.name || !formData.price || !formData.stock) {
      alert("Please fill in all required fields");
      return;
    }

    if (!formData.batchId) { // NEW
      alert("Please select a batch.");
      return;
    }

    const validBarcodes = formData.barcodes.filter((barcode) => barcode.trim() !== "");

    if (validBarcodes.length === 0) {
      alert("Please add at least one barcode");
      return;
    }

    // Check for duplicate barcodes
    const existingBarcodes = products.flatMap((p) => p.barcodes || []);
    const duplicates = validBarcodes.filter((barcode) => existingBarcodes.includes(barcode));

    if (duplicates.length > 0) {
      alert(`Barcode(s) already exist: ${duplicates.join(", ")}`);
      return;
    }

    const newProduct: Omit<Product, "id" | "createdAt" | "updatedAt"> = {
      name: formData.name,
      price: Number.parseFloat(formData.price),
      stock: Number.parseInt(formData.stock),
      tax: Number.parseFloat(formData.tax),
      barcodes: validBarcodes,
      batchId: formData.batchId, // NEW
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

      mutate(); // Re-fetch the products list
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

    const validBarcodes = formData.barcodes.filter((barcode) => barcode.trim() !== "");

    if (validBarcodes.length === 0) {
      alert("Please add at least one barcode");
      return;
    }

    // Check for duplicate barcodes (excluding current product's barcodes)
    const otherProducts = products.filter((p) => p.id !== editingProduct.id);
    const existingBarcodes = otherProducts.flatMap((p) => p.barcodes || []);
    const duplicates = validBarcodes.filter((barcode) => existingBarcodes.includes(barcode));

    if (duplicates.length > 0) {
      alert(`Barcode(s) already exist: ${duplicates.join(", ")}`);
      return;
    }

    const updatedProduct: Partial<Product> = {
      name: formData.name,
      price: Number.parseFloat(formData.price),
      stock: Number.parseInt(formData.stock),
      tax: Number.parseFloat(formData.tax),
      barcodes: validBarcodes,
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

      mutate(); // Re-fetch the products list
      resetForm();
      setEditingProduct(null);
      setIsEditDialogOpen(false);
    } catch (error) {
      console.error("Error updating product:", error);
      alert("Failed to update product.");
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/products/${productId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete product");
      }

      mutate(); // Re-fetch the products list
    } catch (error) {
      console.error("Error deleting product:", error);
      alert("Failed to delete product.");
    }
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      price: product.price.toString(),
      stock: product.stock.toString(),
      tax: product.tax != null ? product.tax.toString() : "", // Handle null tax
      barcodes: product.barcodes.length > 0 ? product.barcodes : [""],
      batchId: product.batchId || "", // NEW
    })
    setIsEditDialogOpen(true)
  }

  const openPrintDialog = (productIds: string[]) => {
    const productsToPrint = products.filter(p => productIds.includes(p.id));
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
          // Here you might want to call a bulk-add API endpoint
          // For simplicity, we'll add them one by one.
          for (const product of importedProducts) {
            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/products`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(product),
            });
          }
          mutate(); // Re-fetch the products list
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

  const filteredProducts = products.filter((product) => {
    const matchesSearch = searchTerm === "" || 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.barcodes.some(barcode => barcode.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "low" && product.stock <= 5) ||
      (stockFilter === "out" && product.stock === 0) ||
      (stockFilter === "available" && product.stock > 5);

    // NEW: Category filter logic
    const matchesCategory =
      categoryFilter === "all" ||
      (product as any).category?.toLowerCase() === categoryFilter.toLowerCase();

    return matchesSearch && matchesStock && matchesCategory;
  });

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

  // ---------- NEW: Calendar helpers and derived data ----------
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

  // Safely read createdAt without changing the imported Product type
  const productsAny = products as Array<Product & { createdAt?: string }>;

  const productsByDate = useMemo(() => {
    const map: Record<string, (Product & { createdAt?: string })[]> = {};
    for (const p of productsAny) {
      if (!p?.createdAt) continue;
      const d = new Date(p.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 10);
      (map[key] ||= []).push(p);
    }
    return map;
  }, [productsAny]);

  const dateCounts = useMemo(() => {    const counts: Record<string, number> = {};
    for (const k in productsByDate) counts[k] = productsByDate[k].length;
    return counts;
  }, [productsByDate]);

  const selectedKey = selectedDate ? toKey(selectedDate) : "";

  function printProductsListForDate(list: Product[], titleDate: Date) {
    let totalStock = 0;
    let totalValue = 0;

    const rows = list
      .map((p) => {
        const productBatch = batches.find(batch => batch.id === p.batchId);
        const stock = (p as any).stock ?? 0;
        const price = Number((p as any).price ?? 0);
        const value = stock * price;

        totalStock += stock;
        totalValue += value;

        return `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;">${(p.barcodes && p.barcodes.length > 0) ? p.barcodes[0] : "N/A"}</td>
          <td style="padding:6px;border:1px solid #ddd;">${p.name}</td>
          <td style="padding:6px;border:1px solid #ddd;">${productBatch?.batchNumber || "N/A"} (${productBatch?.place || "N/A"})</td>
          <td style="padding:6px;border:1px solid #ddd; text-align:right;">${stock}</td>
          <td style="padding:6px;border:1px solid #ddd; text-align:right;">₹${price.toFixed(2)}</td>
          <td style="padding:6px;border:1px solid #ddd; text-align:right;">₹${value.toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Products on ${titleDate.toDateString()}</title>
          <style>
            @media print {
              @page { margin: 12mm; }
              body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; }
              h1 { font-size: 18px; margin-bottom: 12px; }
              table { width: 100%; border-collapse: collapse; }
              th { background:#f3f4f6; }
              tfoot { font-weight: bold; }
              /* Hide tfoot on all pages by default */
              tfoot { display: table-footer-group; }
              @page {
                @bottom-right {
                  content: "Page " counter(page) " of " counter(pages);
                }
              }
            }
            /* Show tfoot only on the last page */
            @media print {
              tfoot {
                display: table-row-group; /* Ensure it's displayed as a table row group */
              }
            }
          </style>
        </head>
        <body>
          <h1>Products on ${titleDate.toDateString()}</h1>
          <table>
            <thead>
              <tr>
                <th style="padding:6px;border:1px solid #ddd; text-align:left;">Product Barcode Number</th>
                <th style="padding:6px;border:1px solid #ddd; text-align:left;">Product Name</th>
                <th style="padding:6px;border:1px solid #ddd; text-align:left;">Product Batch</th>
                <th style="padding:6px;border:1px solid #ddd; text-align:right;">Stock</th>
                <th style="padding:6px;border:1px solid #ddd; text-align:right;">Price</th>
                <th style="padding:6px;border:1px solid #ddd; text-align:right;">Value (Total Value)</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="padding:6px;border:1px solid #ddd; text-align:right;">Total:</td>
                <td style="padding:6px;border:1px solid #ddd; text-align:right;">${totalStock}</td>
                <td style="padding:6px;border:1px solid #ddd; text-align:right;"></td>
                <td style="padding:6px;border:1px solid #ddd; text-align:right;">₹${totalValue.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function(){ window.close(); }, 300);
            };
          </script>
        </body>
      </html>
    `;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }
  // ---------- END calendar helpers ----------

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Product Management</h1>
            <p className="text-gray-600 mt-2">Manage your inventory and product catalog</p>
          </div>
          <div className="flex items-center space-x-3">
            {/* NEW: Calendar popover placed to the LEFT of Import */}
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
                          // Red circle for today
                          cls += "border-2 border-red-500 text-red-600 ";
                        } else if (count > 0) {
                          // Light blue for days with products
                          cls += "bg-blue-100 text-blue-700 ";
                        } else {
                          // Grey for no products
                          cls += "text-gray-400 ";
                        }

                        cells.push(
                          <div key={key} className="flex items-center justify-center">
                            <div
                              className={cls}
                              title={count > 0 ? `${count} products` : "No products"}
                              onClick={() => setSelectedDate(d)}
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
                      <div className="flex items-center justify-between">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsByDateDialogOpen(true)}
                        >
                          View all products
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            printProductsListForDate(
                              (productsByDate[selectedKey] as Product[]) ?? [],
                              selectedDate
                            )
                          }
                        >
                          <Printer className="h-4 w-4 mr-2" />
                          Print all products
                        </Button>
                      </div>
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

            {/* Add Product */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
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
                            .slice(0, 5); // Limit to 5 suggestions
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
                    <div className="space-y-2">
                      <Label htmlFor="tax">Tax (%)</Label>
                      <Input
                        id="tax"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.tax}
                        onChange={(e) => setFormData({ ...formData, tax: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  {/* NEW: Batch Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="batch">Batch *</Label>
                    <Select
                      value={selectedBatchId || ""}
                      onValueChange={(value) => {
                        setSelectedBatchId(value);
                        setFormData({ ...formData, batchId: value });
                      }}
                    >
                      <SelectTrigger id="batch">
                        <SelectValue placeholder="Select a batch" />
                      </SelectTrigger>
                      <SelectContent>
                        {batches.map((batch) => (
                          <SelectItem key={batch.id} value={batch.id}>
                            <div className="flex flex-col">
                              <span>{batch.place}</span>
                              <span className="text-xs text-muted-foreground">{batch.batchNumber}</span>
                            </div>
                          </SelectItem>
                        ))}
                        <Separator className="my-2" /> {/* Replaced DropdownMenuSeparator with Separator */}
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
            {/* NEW: Batch Input Dialog */}
            <BatchInput
              isOpen={isBatchInputOpen}
              onOpenChange={setIsBatchInputOpen}
              // onSave={handleSaveNewBatch} // REMOVED
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
                  <p className="text-2xl font-bold text-gray-900">{products.length}</p>
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
                    {products.reduce((sum, p) => sum + p.stock, 0)}
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
                  <p className="text-sm font-medium text-gray-600">Total Value of Inventory</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ₹{products.reduce((sum, p) => sum + p.stock * p.price, 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <XCircle className="h-8 w-8 text-red-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Out of Stock</p>
                  <p className="text-2xl font-bold text-gray-900">{products.filter((p) => p.stock === 0).length}</p>
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
              {/* NEW: Category Filter */}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {/* You would dynamically load categories here, e.g., from a product.category field */}
                  <SelectItem value="electronics">Electronics</SelectItem>
                  <SelectItem value="clothing">Clothing</SelectItem>
                  <SelectItem value="books">Books</SelectItem>
                  <SelectItem value="home">Home & Kitchen</SelectItem>
                </SelectContent>
              </Select>
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
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto relative" ref={scrollableDivRef}>
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4">
                      <input
                        type="checkbox"
                        checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                        onChange={selectAllProducts}
                        className="rounded"
                      />
                    </th><th className="text-left p-4 font-medium">Product</th><th className="text-left p-4 font-medium">Batch</th> {/* NEW */}<th className="text-left p-4 font-medium">Price</th><th className="text-left p-4 font-medium">Tax</th><th className="text-left p-4 font-medium">Stock</th><th className="text-left p-4 font-medium">Barcodes</th><th className="text-left p-4 font-medium">Status</th><th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const stockStatus = getStockStatus(product.stock)
                    const StatusIcon = stockStatus.icon
                    const productBatch = batches.find(batch => batch.id === product.batchId); // NEW
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
                          </div>
                        </td>
                        <td className="p-4"> {/* NEW */}
                          <div>
                            <div className="font-medium">{productBatch?.batchNumber || "N/A"}</div>
                            <div className="text-xs text-muted-foreground">{productBatch?.place || ""}</div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="font-medium">₹{product.price.toFixed(2)}</span>
                        </td>
                        <td className="p-4">
                          <span className="font-medium">{(product.tax || 0).toFixed(2)}%</span>
                        </td>
                        <td className="p-4">
                          <span className="font-medium">{product.stock}</span>
                        </td>
                        <td className="p-4">
                          <div className="space-y-1">
                            {(product.barcodes || []).slice(0, 2).map((barcode, index) => (
                              <code key={index} className="text-xs bg-gray-100 px-2 py-1 rounded block">
                                {barcode}
                              </code>
                            ))}
                            {(product.barcodes || []).length > 2 && (
                              <span className="text-xs text-gray-500">+{(product.barcodes || []).length - 2} more</span>
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
                    {searchTerm || categoryFilter !== "all" || stockFilter !== "all"
                      ? "Try adjusting your search or filters"
                      : "Get started by adding your first product"}
                  </p>
                  {!searchTerm && categoryFilter === "all" && stockFilter === "all" && (
                    <Button onClick={() => setIsAddDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Product
                    </Button>
                  )}
                </div>
              )}
            </div>
            <ScrollToBottomButton onClick={() => scrollableDivRef.current?.scrollTo({ top: scrollableDivRef.current.scrollHeight, behavior: 'smooth' })} />
          </CardContent>
        </Card>

        {/* NEW: View-all-products dialog for the selected day */}
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
                  {(() => {
                    let totalStock = 0;
                    let totalValue = 0;
                    const productsForDate = (productsByDate[selectedKey] as Product[]) ?? [];

                    const rows = productsForDate.map((p) => {
                      const productBatch = batches.find(batch => batch.id === p.batchId);
                      const stock = (p as any).stock ?? 0;
                      const price = Number((p as any).price ?? 0);
                      const value = stock * price;

                      totalStock += stock;
                      totalValue += value;

                      return (
                        <tr key={(p as any).id} className="border-b hover:bg-gray-50">
                          <td className="p-2">{(p.barcodes && p.barcodes.length > 0) ? p.barcodes[0] : "N/A"}</td>
                          <td className="p-2">{(p as any).name}</td>
                          <td className="p-2">{productBatch?.batchNumber || "N/A"} ({productBatch?.place || "N/A"})</td>
                          <td className="p-2 text-right">{stock}</td>
                          <td className="p-2 text-right">₹{price.toFixed(2)}</td>
                          <td className="p-2 text-right">₹{value.toFixed(2)}</td>
                        </tr>
                      );
                    });

                    return (
                      <>
                        {rows}
                        <tr className="font-bold border-t">
                          <td colSpan={3} className="p-2 text-right">Total:</td>
                          <td className="p-2 text-right">{totalStock}</td>
                          <td className="p-2 text-right"></td>
                          <td className="p-2 text-right">₹{totalValue.toFixed(2)}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
            <div className="relative mt-4">
              <ScrollToBottomButton onClick={() => scrollableDivRef.current?.scrollTo({ top: scrollableDivRef.current.scrollHeight, behavior: 'smooth' })} />
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setIsByDateDialogOpen(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  if (!selectedDate) return;
                  printProductsListForDate(
                    ((productsByDate[selectedKey] as Product[]) ?? []),
                    selectedDate
                  );
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
        />

        {/* Edit Product Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
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
                        .slice(0, 5); // Limit to 5 suggestions
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
              <div className="space-y-2">
                <Label htmlFor="edit-tax">Tax (%)</Label>
                <Input
                  id="edit-tax"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.tax}
                  onChange={(e) => setFormData({ ...formData, tax: e.target.value })}
                  placeholder="0.00"
                />
              </div>
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
      </div>
    </DashboardLayout>
  )
}
