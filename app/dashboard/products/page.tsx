"use client"

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { Product } from "@/lib/types";
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
} from "lucide-react";
import PrintButton from "@/components/PrintButton";
import { printHtml } from "@/lib/printUtils";

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
  const [printQuantity, setPrintQuantity] = useState(1)
  const [currentPrintProducts, setCurrentPrintProducts] = useState<string[]>([])

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    stock: "",
    tax: "",
    barcodes: [""],
  })

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
    })
    setIsEditDialogOpen(true)
  }

  const openPrintDialog = (productIds: string[]) => {
    setCurrentPrintProducts(productIds)
    setIsPrintDialogOpen(true)
  }

  const createBarcodeImage = async (barcodeValue: string): Promise<string | null> => {
    try {
      const JsBarcode = (await import("jsbarcode")).default
      const canvas = document.createElement("canvas")

      // Optimized canvas size for 81mm x 12mm horizontal layout
      canvas.width = 180  // Reduced width for horizontal fit
      canvas.height = 40  // Reduced height to fit in 12mm label

      const options = {
        format: "CODE128",
        width: 2,      // Thinner bars for horizontal layout
        height: 35,    // Lower height to fit in 12mm label
        displayValue: false,
        margin: 1,     // Minimal margin
        background: "#ffffff",
        lineColor: "#000000",
      }

      JsBarcode(canvas, barcodeValue, options)
      return canvas.toDataURL("image/png")
    } catch (error) {
      console.error(`Failed to create barcode:`, error)
      return null
    }
  }

  const printBarcodes = async () => {
    try {
      const selectedProductsList = products.filter((p) =>
        currentPrintProducts.includes(p.id)
      );
      if (selectedProductsList.length === 0) {
        alert("No products selected for printing");
        return;
      }

      const storeName = assignedStores?.[0]?.name || "Siri Art Jewellers";

      for (const product of selectedProductsList) {
        for (let qty = 0; qty < printQuantity; qty++) {
          let barcodeValue = (product.barcodes || [])[0] || product.id;

          if (!validateBarcode(barcodeValue)) {
            barcodeValue = generateBarcode();
          }

          const barcodeDataUrl = await createBarcodeImage(barcodeValue);
          if (!barcodeDataUrl) continue;

          // Horizontal layout for 81mm x 12mm label to fit in single page
          const labelHTML = `
           <!DOCTYPE html>
<html>
  <head>
    <title>Print Label</title>
    <style>
      @page {
        size: 80mm 16mm;
        margin: 0;
      }

      html, body {
        margin: 0;
        padding: 0;
        font-family: 'Arial', sans-serif;
        width: 80mm;
        height: 16mm;
        background: #fff;
        color: #000;
        overflow: hidden;
      }

      .label-container {
      padding-top: 4mm;
        display: flex;
        flex-direction: row;
        justify-content: flex-start;
        align-items: center;
        box-sizing: border-box;
        font-size: 6px;
        line-height: 1;
        height: 100%;
        width: 55mm; /* total width of the content container */
        margin-left: 0; /* start from left edge */
      }

      .left-section,
      .barcode-section {
      padding-top: 2mm;
        width: 25mm; /* each takes half of the 55mm */
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center; /* center vertically */
      }

      /* Barcode on left - center horizontally the barcode image and number */
      .barcode-section {
      padding-top: 2mm;
        align-items: center;
        justify-content: flex-end;

      }

      /* Product info on right - align text to left */
      .left-section {
        align-items: flex-start;
        padding-left: 2mm;
      }

      .company-name {
        font-size: 6px;
        font-weight: bold;
        margin-bottom: 0.5mm;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .product-name {
        font-size: 7px;
        font-weight: bold;
        margin-bottom: 0.5mm;
        line-height: 1.1;
        max-height: 6mm;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        word-break: break-word;
      }

      .price {
        font-size: 7px;
        font-weight: bold;
        white-space: nowrap;
      }

      .barcode-image {
      padding-top: 0.5mm;
        height: 8mm;
        max-width: 27.5mm;
        margin-bottom: 0.5mm;
      }

      .barcode-number {
        height: 3mm;
        font-size: 7px;
        font-weight: bold;
        text-align: center;
        letter-spacing: 0.2px;
      }
    </style>
  </head>
  <body>
    <div class="label-container">
      <!-- Barcode section on left -->
      <div class="barcode-section">
        <img src="${barcodeDataUrl}" class="barcode-image" alt="Barcode" />
        <div class="barcode-number">${barcodeValue}</div>
      </div>

      <!-- Product info section on right -->
      <div class="left-section">
        <div class="company-name">${storeName}</div>
        <div class="product-name">Product Name: ${product.name}</div>
        <div class="price">Price: ₹${product.price.toFixed(2)}</div>
      </div>
    </div>
  </body>
</html>

          `;

          await printHtml(labelHTML);
        }
      }

      alert("Generated 81mm x 12mm barcode labels successfully for TVS LP 46 DLite printer.");
      setIsPrintDialogOpen(false);
      setSelectedProducts([]);
      setCurrentPrintProducts([]);
    } catch (error) {
      console.error("Error printing barcodes:", error);
      alert("Failed to print barcodes.");
    }
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

    return matchesSearch && matchesStock;
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

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Product Management</h1>
            <p className="text-gray-600 mt-2">Manage your inventory and product catalog</p>
          </div>
          <div className="flex items-center space-x-3">
            <input type="file" accept=".json" onChange={importProducts} className="hidden" id="import-products" />
            <Button variant="outline" onClick={() => document.getElementById("import-products")?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            <Button variant="outline" onClick={exportProducts}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
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
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter product name"
                      />
                    </div>
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
                  <p className="text-sm font-medium text-gray-600">In Stock</p>
                  <p className="text-2xl font-bold text-gray-900">{products.filter((p) => p.stock > 5).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <AlertCircle className="h-8 w-8 text-yellow-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Low Stock</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {products.filter((p) => p.stock > 0 && p.stock <= 5).length}
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
            <div className="overflow-x-auto">
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
                    </th>
                    <th className="text-left p-4 font-medium">Product</th>
                    <th className="text-left p-4 font-medium">Price</th>
                    <th className="text-left p-4 font-medium">Tax</th>
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
          </CardContent>
        </Card>

        {/* Print Dialog - Optimized for 81mm x 12mm labels */}
        <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
          <DialogContent className="sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Printer className="h-5 w-5 mr-2" />
                Print 81mm x 12mm Labels for TVS LP 46 DLite
              </DialogTitle>
              <DialogDescription>
                Generate horizontal layout labels (81×12mm) for {currentPrintProducts.length} selected product(s)
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              {/* Print Quantity */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Quantity per Product</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={printQuantity}
                  onChange={(e) => setPrintQuantity(Number.parseInt(e.target.value) || 1)}
                  className="w-32"
                />
                <p className="text-sm text-gray-600">Number of labels to print for each selected product</p>
              </div>

              {/* Label Specifications for 81mm x 12mm */}
              <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                <h4 className="font-medium text-sm">Label Specifications (TVS LP 46 DLite)</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Label Size:</span>
                    <span className="ml-2 font-medium">81×12mm</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Layout:</span>
                    <span className="ml-2 font-medium">Horizontal</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Barcode Type:</span>
                    <span className="ml-2 font-medium">Code 128</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Total Labels:</span>
                    <span className="ml-2 font-medium">{currentPrintProducts.length * printQuantity}</span>
                  </div>
                </div>
              </div>

              {/* Selected Products Preview */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Selected Products</Label>
                <div className="max-h-32 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                  {products
                    .filter((p) => currentPrintProducts.includes(p.id))
                    .map((product) => (
                      <div key={product.id} className="flex justify-between items-center py-1 text-sm">
                        <span className="font-medium">{product.name}</span>
                        <div className="text-gray-600">
                          <span>₹{product.price.toFixed(2)}</span>
                          <span className="ml-2">({printQuantity} labels)</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Horizontal Layout Info */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Optimized Horizontal Layout</Label>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>• Left section: Company name, product name, price</p>
                  <p>• Center section: CODE128 barcode with number</p>
                  <p>• Right section: Product ID for reference</p>
                  <p>• All content fits within 12mm height</p>
                  <p>• Perfect single-page printing for TVS LP 46 DLite</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={printBarcodes} className="bg-blue-600 hover:bg-blue-700">
                <Printer className="h-4 w-4 mr-2" />
                Print Labels
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter product name"
                  />
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
