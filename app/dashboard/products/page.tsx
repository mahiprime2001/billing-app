"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
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
} from "@/components/ui/dialog"
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
} from "@/components/ui/alert-dialog"
import { Slider } from "@/components/ui/slider"
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
  Settings,
} from "lucide-react"

interface Product {
  id: string
  name: string
  price: number
  barcodes: string[]
  stock: number
  category?: string
  description?: string
  createdAt: string
  updatedAt: string
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

interface BarcodeSize {
  width: number
  height: number
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
}

interface PaperSize {
  name: string
  width: number
  height: number
  orientation: "portrait" | "landscape"
}

export default function ProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null)
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
  const [printLayout, setPrintLayout] = useState<"individual" | "sheet">("individual")
  const [barcodeType, setBarcodeType] = useState<"CODE128" | "CODE39" | "EAN13" | "UPC">("CODE128")
  const [currentPrintProducts, setCurrentPrintProducts] = useState<string[]>([])
  const [selectedPaperSize, setSelectedPaperSize] = useState("A4")

  // Paper size configurations
  const paperSizes: Record<string, PaperSize> = {
    A4: { name: "A4", width: 210, height: 297, orientation: "portrait" },
    A5: { name: "A5", width: 148, height: 210, orientation: "portrait" },
    Letter: { name: "Letter", width: 216, height: 279, orientation: "portrait" },
    Legal: { name: "Legal", width: 216, height: 356, orientation: "portrait" },
    "4x6": { name: "4×6 inch", width: 102, height: 152, orientation: "portrait" },
    "3x5": { name: "3×5 inch", width: 76, height: 127, orientation: "portrait" },
    "2x4": { name: "2×4 inch", width: 51, height: 102, orientation: "portrait" },
    Custom: { name: "Custom Size", width: 100, height: 150, orientation: "portrait" },
  }

  const [customPaperSize, setCustomPaperSize] = useState({ width: 100, height: 150 })

  // Barcode size configurations (updated to use UPC instead of UPCA)
  const [barcodeSizes, setBarcodeSizes] = useState<Record<string, BarcodeSize>>({
    EAN13: { width: 37, height: 25, minWidth: 25, maxWidth: 60, minHeight: 15, maxHeight: 40 },
    CODE128: { width: 60, height: 18, minWidth: 40, maxWidth: 100, minHeight: 12, maxHeight: 35 },
    CODE39: { width: 65, height: 20, minWidth: 45, maxWidth: 110, minHeight: 15, maxHeight: 40 },
    UPC: { width: 37, height: 25, minWidth: 25, maxWidth: 60, minHeight: 15, maxHeight: 40 },
  })

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    stock: "",
    category: "",
    description: "",
    barcodes: [""],
  })

  const categories = ["Electronics", "Clothing", "Books", "Home & Garden", "Sports", "Toys", "Other"]

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    const userData = localStorage.getItem("adminUser")

    if (isLoggedIn !== "true" || !userData) {
      router.push("/")
      return
    }

    const user = JSON.parse(userData)
    setCurrentUser(user)

    // Load assigned stores for billing users
    if (user.role === "billing_user" && user.assignedStores) {
      const savedStores = localStorage.getItem("stores")
      if (savedStores) {
        const allStores = JSON.parse(savedStores)
        const userStores = allStores.filter(
          (store: SystemStore) => user.assignedStores?.includes(store.id) && store.status === "active",
        )
        setAssignedStores(userStores)
      }
    }

    loadProducts()
  }, [router])

  const loadProducts = () => {
    const savedProducts = localStorage.getItem("products")
    if (savedProducts) {
      const parsedProducts = JSON.parse(savedProducts)
      // Ensure all products have a barcodes array
      const safeProducts = parsedProducts.map((product: Product) => ({
        ...product,
        barcodes: product.barcodes || [],
      }))
      setProducts(safeProducts)
    }
  }

  const saveProducts = (updatedProducts: Product[]) => {
    setProducts(updatedProducts)
    localStorage.setItem("products", JSON.stringify(updatedProducts))
  }

  const resetForm = () => {
    setFormData({
      name: "",
      price: "",
      stock: "",
      category: "",
      description: "",
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

  const generateBarcode = (type?: string) => {
    const barcodeType = type || "CODE128"

    switch (barcodeType) {
      case "EAN13":
        // Generate 12 digits, EAN-13 will calculate the 13th check digit
        const ean12 = Math.floor(Math.random() * 999999999999)
          .toString()
          .padStart(12, "0")
        return ean12
      case "UPC":
        // Generate 11 digits, UPC will calculate the 12th check digit
        const upc11 = Math.floor(Math.random() * 99999999999)
          .toString()
          .padStart(11, "0")
        return upc11
      case "CODE39":
        // CODE39 supports alphanumeric, but let's keep it simple with numbers
        const code39Length = 8 + Math.floor(Math.random() * 5) // 8-12 characters
        return Math.floor(Math.random() * Math.pow(10, code39Length))
          .toString()
          .padStart(code39Length, "0")
      case "CODE128":
      default:
        // CODE128 can handle any ASCII character, so our original method works
        const timestamp = Date.now().toString()
        const randomNum = Math.floor(Math.random() * 1000)
          .toString()
          .padStart(3, "0")
        return `${timestamp}${randomNum}`
    }
  }

  const validateBarcode = (barcode: string, type: string): boolean => {
    if (!barcode || barcode.trim() === "") return false

    switch (type) {
      case "EAN13":
        return /^\d{12,13}$/.test(barcode)
      case "UPC":
        return /^\d{11,12}$/.test(barcode)
      case "CODE39":
        return /^[0-9A-Z\-. $/+%]+$/.test(barcode) && barcode.length >= 1
      case "CODE128":
        return barcode.length >= 1 && barcode.length <= 80
      default:
        return true
    }
  }

  const handleAddProduct = () => {
    if (!formData.name || !formData.price || !formData.stock) {
      alert("Please fill in all required fields")
      return
    }

    const validBarcodes = formData.barcodes.filter((barcode) => barcode.trim() !== "")

    if (validBarcodes.length === 0) {
      alert("Please add at least one barcode")
      return
    }

    // Check for duplicate barcodes
    const existingBarcodes = products.flatMap((p) => p.barcodes || [])
    const duplicates = validBarcodes.filter((barcode) => existingBarcodes.includes(barcode))

    if (duplicates.length > 0) {
      alert(`Barcode(s) already exist: ${duplicates.join(", ")}`)
      return
    }

    const newProduct: Product = {
      id: Date.now().toString(),
      name: formData.name,
      price: Number.parseFloat(formData.price),
      stock: Number.parseInt(formData.stock),
      category: formData.category || "Other",
      description: formData.description,
      barcodes: validBarcodes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    saveProducts([...products, newProduct])
    resetForm()
    setIsAddDialogOpen(false)
  }

  const handleEditProduct = () => {
    if (!editingProduct || !formData.name || !formData.price || !formData.stock) {
      alert("Please fill in all required fields")
      return
    }

    const validBarcodes = formData.barcodes.filter((barcode) => barcode.trim() !== "")

    if (validBarcodes.length === 0) {
      alert("Please add at least one barcode")
      return
    }

    // Check for duplicate barcodes (excluding current product's barcodes)
    const otherProducts = products.filter((p) => p.id !== editingProduct.id)
    const existingBarcodes = otherProducts.flatMap((p) => p.barcodes || [])
    const duplicates = validBarcodes.filter((barcode) => existingBarcodes.includes(barcode))

    if (duplicates.length > 0) {
      alert(`Barcode(s) already exist: ${duplicates.join(", ")}`)
      return
    }

    const updatedProduct: Product = {
      ...editingProduct,
      name: formData.name,
      price: Number.parseFloat(formData.price),
      stock: Number.parseInt(formData.stock),
      category: formData.category || "Other",
      description: formData.description,
      barcodes: validBarcodes,
      updatedAt: new Date().toISOString(),
    }

    const updatedProducts = products.map((p) => (p.id === editingProduct.id ? updatedProduct : p))
    saveProducts(updatedProducts)
    resetForm()
    setEditingProduct(null)
    setIsEditDialogOpen(false)
  }

  const handleDeleteProduct = (productId: string) => {
    const updatedProducts = products.filter((p) => p.id !== productId)
    saveProducts(updatedProducts)
  }

  const openEditDialog = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      price: product.price.toString(),
      stock: product.stock.toString(),
      category: product.category || "",
      description: product.description || "",
      barcodes: product.barcodes.length > 0 ? product.barcodes : [""],
    })
    setIsEditDialogOpen(true)
  }

  const openPrintDialog = (productIds: string[]) => {
    setCurrentPrintProducts(productIds)
    setIsPrintDialogOpen(true)
  }

  const updateBarcodeSize = (dimension: "width" | "height", value: number) => {
    setBarcodeSizes((prev) => ({
      ...prev,
      [barcodeType]: {
        ...prev[barcodeType],
        [dimension]: value,
      },
    }))
  }

  const getCurrentPaperSize = (): PaperSize => {
    if (selectedPaperSize === "Custom") {
      return {
        name: "Custom",
        width: customPaperSize.width,
        height: customPaperSize.height,
        orientation: "portrait",
      }
    }
    return paperSizes[selectedPaperSize]
  }

  const calculateOptimalLabelSize = (paperSize: PaperSize, barcodeSpec: BarcodeSize) => {
    const margin = 10
    const availableWidth = paperSize.width - 2 * margin
    const availableHeight = paperSize.height - 2 * margin

    // For individual printing, optimize for single label per page or minimal labels
    if (printLayout === "individual") {
      // Calculate optimal size for single label centered on page
      const optimalWidth = Math.min(availableWidth * 0.8, Math.max(barcodeSpec.width + 40, 80))
      const optimalHeight = Math.min(availableHeight * 0.6, Math.max(barcodeSpec.height + 50, 70))

      return {
        labelWidth: optimalWidth,
        labelHeight: optimalHeight,
        labelsPerRow: 1,
        labelsPerColumn: 1,
        marginX: (paperSize.width - optimalWidth) / 2,
        marginY: (paperSize.height - optimalHeight) / 2,
      }
    } else {
      // Sheet layout - fit multiple labels
      const minLabelWidth = Math.max(barcodeSpec.width + 15, 50)
      const minLabelHeight = Math.max(barcodeSpec.height + 20, 35)

      const labelsPerRow = Math.max(1, Math.floor(availableWidth / (minLabelWidth + 5)))
      const labelsPerColumn = Math.max(1, Math.floor(availableHeight / (minLabelHeight + 5)))

      const labelWidth = (availableWidth - (labelsPerRow - 1) * 5) / labelsPerRow
      const labelHeight = (availableHeight - (labelsPerColumn - 1) * 5) / labelsPerColumn

      return {
        labelWidth: Math.max(labelWidth, minLabelWidth),
        labelHeight: Math.max(labelHeight, minLabelHeight),
        labelsPerRow,
        labelsPerColumn,
        marginX: margin,
        marginY: margin,
      }
    }
  }

  const createBarcodeImage = async (barcodeValue: string, format: string): Promise<string | null> => {
    try {
      const JsBarcode = (await import("jsbarcode")).default
      const canvas = document.createElement("canvas")

      // Set canvas size
      canvas.width = 400
      canvas.height = 200

      const options = {
        format: format,
        width: 2,
        height: 100,
        displayValue: false,
        margin: 10,
        background: "#ffffff",
        lineColor: "#000000",
      }

      JsBarcode(canvas, barcodeValue, options)
      return canvas.toDataURL("image/png")
    } catch (error) {
      console.error(`Failed to create barcode with format ${format}:`, error)
      return null
    }
  }

  const printBarcodes = async () => {
    try {
      const selectedProductsList = products.filter((p) => currentPrintProducts.includes(p.id))
      if (selectedProductsList.length === 0) {
        alert("No products selected for printing")
        return
      }

      // Get store name for the label
      let storeName = "SIRI ART JEWELLERY"
      if (currentUser?.role === "billing_user" && assignedStores.length > 0) {
        storeName = assignedStores[0].name
      }

      const jsPDF = (await import("jspdf")).default
      const currentBarcodeSpec = barcodeSizes[barcodeType]
      const currentPaper = getCurrentPaperSize()

      const doc = new jsPDF({
        orientation: currentPaper.orientation,
        unit: "mm",
        format: [currentPaper.width, currentPaper.height],
      })

      const layout = calculateOptimalLabelSize(currentPaper, currentBarcodeSpec)
      const labelsPerPage = layout.labelsPerRow * layout.labelsPerColumn

      let labelCount = 0
      let currentPage = 1

      // Generate all labels for all products and quantities
      for (const product of selectedProductsList) {
        for (let qty = 0; qty < printQuantity; qty++) {
          // Check if we need a new page
          if (labelCount > 0 && labelCount % labelsPerPage === 0) {
            doc.addPage()
            currentPage++
          }

          const labelIndex = labelCount % labelsPerPage
          const row = Math.floor(labelIndex / layout.labelsPerRow)
          const col = labelIndex % layout.labelsPerRow

          const x = layout.marginX + col * (layout.labelWidth + 5)
          const y = layout.marginY + row * (layout.labelHeight + 5)

          // Get barcode value
          let barcodeValue = (product.barcodes || [])[0] || product.id

          // Validate and potentially fix the barcode
          if (!validateBarcode(barcodeValue, barcodeType)) {
            console.warn(`Invalid barcode ${barcodeValue} for type ${barcodeType}, generating new one`)
            barcodeValue = generateBarcode(barcodeType)
          }

          // Create barcode image
          const barcodeDataUrl = await createBarcodeImage(barcodeValue, barcodeType)

          if (!barcodeDataUrl) {
            // If barcode creation failed, try with CODE128 as fallback
            console.warn(`Failed to create ${barcodeType} barcode, trying CODE128 fallback`)
            const fallbackValue = generateBarcode("CODE128")
            const fallbackDataUrl = await createBarcodeImage(fallbackValue, "CODE128")

            if (!fallbackDataUrl) {
              console.error("Even fallback barcode creation failed, skipping this label")
              labelCount++
              continue
            }

            barcodeValue = fallbackValue
          }

          // Adjust font sizes based on layout
          const storeFontSize = printLayout === "individual" ? 12 : 6
          const productFontSize = printLayout === "individual" ? 10 : 5
          const codeFontSize = printLayout === "individual" ? 8 : 4
          const priceFontSize = printLayout === "individual" ? 14 : 7

          // Store name
          doc.setFontSize(storeFontSize)
          doc.setFont("helvetica", "bold")
          const maxStoreChars = printLayout === "individual" ? 30 : 15
          const storeNameTruncated =
            storeName.length > maxStoreChars ? storeName.substring(0, maxStoreChars) + "..." : storeName
          doc.text(storeNameTruncated, x + layout.labelWidth / 2, y + (printLayout === "individual" ? 12 : 4), {
            align: "center",
          })

          // Product name
          doc.setFontSize(productFontSize)
          doc.setFont("helvetica", "normal")
          const maxProductChars = printLayout === "individual" ? 35 : 18
          const productNameTruncated =
            product.name.length > maxProductChars ? product.name.substring(0, maxProductChars) + "..." : product.name
          doc.text(productNameTruncated, x + layout.labelWidth / 2, y + (printLayout === "individual" ? 22 : 8), {
            align: "center",
          })

          // Barcode positioning
          const barcodeY = y + (printLayout === "individual" ? 28 : 12)
          const barcodeX = x + (layout.labelWidth - currentBarcodeSpec.width) / 2

          // Add barcode image
          if (barcodeDataUrl) {
            doc.addImage(barcodeDataUrl, "PNG", barcodeX, barcodeY, currentBarcodeSpec.width, currentBarcodeSpec.height)
          }

          // Barcode number
          doc.setFontSize(codeFontSize)
          doc.text(
            barcodeValue,
            x + layout.labelWidth / 2,
            barcodeY + currentBarcodeSpec.height + (printLayout === "individual" ? 8 : 4),
            { align: "center" },
          )

          // Price
          doc.setFontSize(priceFontSize)
          doc.setFont("helvetica", "bold")
          doc.text(
            `₹${product.price.toFixed(2)}`,
            x + layout.labelWidth / 2,
            y + layout.labelHeight - (printLayout === "individual" ? 8 : 3),
            { align: "center" },
          )

          // Add border with rounded corners
          doc.setDrawColor(0, 0, 0)
          doc.setLineWidth(printLayout === "individual" ? 0.8 : 0.4)
          const borderRadius = printLayout === "individual" ? 4 : 2
          const borderPadding = printLayout === "individual" ? 3 : 1

          doc.roundedRect(
            x + borderPadding,
            y + borderPadding,
            layout.labelWidth - 2 * borderPadding,
            layout.labelHeight - 2 * borderPadding,
            borderRadius,
            borderRadius,
            "S",
          )

          labelCount++
        }
      }

      // Open PDF for preview/print
      const pdfBlob = doc.output("blob")
      const pdfUrl = URL.createObjectURL(pdfBlob)
      window.open(pdfUrl, "_blank")

      const totalLabels = selectedProductsList.length * printQuantity
      const paperInfo =
        selectedPaperSize === "Custom" ? `${customPaperSize.width}×${customPaperSize.height}mm` : currentPaper.name

      alert(
        `Barcode labels generated successfully!\n\nPaper Size: ${paperInfo}\nBarcode Type: ${barcodeType}\nBarcode Size: ${barcodeSizes[barcodeType].width}×${barcodeSizes[barcodeType].height}mm\nLayout: ${printLayout === "individual" ? "Individual optimized" : "Multi-label sheet"}\nTotal Labels: ${totalLabels}\nPages: ${Math.ceil(totalLabels / labelsPerPage)}`,
      )
      setIsPrintDialogOpen(false)
      setSelectedProducts([])
      setCurrentPrintProducts([])
    } catch (error) {
      console.error("Error generating barcodes:", error)
      alert("Error generating barcode labels. Please try again.")
    }
  }

  const exportProducts = () => {
    const dataStr = JSON.stringify(products, null, 2)
    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr)
    const exportFileDefaultName = `products_${new Date().toISOString().split("T")[0]}.json`

    const linkElement = document.createElement("a")
    linkElement.setAttribute("href", dataUri)
    linkElement.setAttribute("download", exportFileDefaultName)
    linkElement.click()
  }

  const importProducts = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const importedProducts = JSON.parse(e.target?.result as string)
        if (Array.isArray(importedProducts)) {
          saveProducts([...products, ...importedProducts])
          alert(`Successfully imported ${importedProducts.length} products`)
        } else {
          alert("Invalid file format")
        }
      } catch (error) {
        alert("Error reading file")
      }
    }
    reader.readAsText(file)
  }

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.barcodes || []).some((barcode) => barcode.includes(searchTerm))
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter
    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "low" && product.stock <= 5) ||
      (stockFilter === "out" && product.stock === 0) ||
      (stockFilter === "available" && product.stock > 5)

    return matchesSearch && matchesCategory && matchesStock
  })

  const getStockStatus = (stock: number) => {
    if (stock === 0) return { label: "Out of Stock", variant: "destructive" as const, icon: XCircle }
    if (stock <= 5) return { label: "Low Stock", variant: "secondary" as const, icon: AlertCircle }
    return { label: "In Stock", variant: "default" as const, icon: CheckCircle }
  }

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
    )
  }

  const selectAllProducts = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([])
    } else {
      setSelectedProducts(filteredProducts.map((p) => p.id))
    }
  }

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
                      <Label htmlFor="category">Category</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Enter product description"
                      rows={3}
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
                            onClick={() => updateBarcodeField(index, generateBarcode(barcodeType))}
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
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
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
                    <th className="text-left p-4 font-medium">Category</th>
                    <th className="text-left p-4 font-medium">Price</th>
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
                            {product.description && (
                              <div className="text-sm text-gray-500 mt-1">
                                {product.description.length > 50
                                  ? `${product.description.substring(0, 50)}...`
                                  : product.description}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline">{product.category}</Badge>
                        </td>
                        <td className="p-4">
                          <span className="font-medium">₹{product.price.toFixed(2)}</span>
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

        {/* Print Customization Dialog */}
        <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Print Barcode Labels
              </DialogTitle>
              <DialogDescription>
                Customize barcode label printing for {currentPrintProducts.length} selected product(s)
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              {/* Print Layout Selection */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Print Layout</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      printLayout === "individual"
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setPrintLayout("individual")}
                  >
                    <div className="flex items-center space-x-2 mb-2">
                      <input
                        type="radio"
                        checked={printLayout === "individual"}
                        onChange={() => setPrintLayout("individual")}
                        className="text-blue-600"
                      />
                      <span className="font-medium">Individual Labels</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Optimized for any paper size. Single large label per page with maximum readability.
                    </p>
                  </div>
                  <div
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      printLayout === "sheet" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setPrintLayout("sheet")}
                  >
                    <div className="flex items-center space-x-2 mb-2">
                      <input
                        type="radio"
                        checked={printLayout === "sheet"}
                        onChange={() => setPrintLayout("sheet")}
                        className="text-blue-600"
                      />
                      <span className="font-medium">Multi-Label Sheet</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Multiple compact labels arranged efficiently on sheets for bulk printing.
                    </p>
                  </div>
                </div>
              </div>

              {/* Paper Size Selection */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Paper Size</Label>
                <Select value={selectedPaperSize} onValueChange={setSelectedPaperSize}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(paperSizes).map(([key, paper]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex flex-col">
                          <span>{paper.name}</span>
                          <span className="text-xs text-gray-500">
                            {paper.width} × {paper.height} mm
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Custom Paper Size Inputs */}
                {selectedPaperSize === "Custom" && (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div className="space-y-2">
                      <Label className="text-sm">Width (mm)</Label>
                      <Input
                        type="number"
                        min="50"
                        max="500"
                        value={customPaperSize.width}
                        onChange={(e) =>
                          setCustomPaperSize((prev) => ({ ...prev, width: Number(e.target.value) || 100 }))
                        }
                        placeholder="100"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Height (mm)</Label>
                      <Input
                        type="number"
                        min="50"
                        max="500"
                        value={customPaperSize.height}
                        onChange={(e) =>
                          setCustomPaperSize((prev) => ({ ...prev, height: Number(e.target.value) || 150 }))
                        }
                        placeholder="150"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Barcode Type Selection */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Barcode Type</Label>
                <Select
                  value={barcodeType}
                  onValueChange={(value: "CODE128" | "CODE39" | "EAN13" | "UPC") => setBarcodeType(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EAN13">
                      <div className="flex flex-col">
                        <span>EAN-13 Barcode</span>
                        <span className="text-xs text-gray-500">European standard, retail products</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="CODE128">
                      <div className="flex flex-col">
                        <span>Code 128 Barcode</span>
                        <span className="text-xs text-gray-500">High density, alphanumeric</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="CODE39">
                      <div className="flex flex-col">
                        <span>Code 39 Barcode</span>
                        <span className="text-xs text-gray-500">Alphanumeric, widely supported</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="UPC">
                      <div className="flex flex-col">
                        <span>UPC Barcode</span>
                        <span className="text-xs text-gray-500">North American standard</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Barcode Size Customization */}
              <div className="space-y-4">
                <Label className="text-base font-medium">Barcode Size (mm)</Label>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm">Width</Label>
                      <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                        {barcodeSizes[barcodeType].width}mm
                      </span>
                    </div>
                    <Slider
                      value={[barcodeSizes[barcodeType].width]}
                      onValueChange={(value) => updateBarcodeSize("width", value[0])}
                      min={barcodeSizes[barcodeType].minWidth}
                      max={barcodeSizes[barcodeType].maxWidth}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{barcodeSizes[barcodeType].minWidth}mm</span>
                      <span>{barcodeSizes[barcodeType].maxWidth}mm</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm">Height</Label>
                      <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                        {barcodeSizes[barcodeType].height}mm
                      </span>
                    </div>
                    <Slider
                      value={[barcodeSizes[barcodeType].height]}
                      onValueChange={(value) => updateBarcodeSize("height", value[0])}
                      min={barcodeSizes[barcodeType].minHeight}
                      max={barcodeSizes[barcodeType].maxHeight}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{barcodeSizes[barcodeType].minHeight}mm</span>
                      <span>{barcodeSizes[barcodeType].maxHeight}mm</span>
                    </div>
                  </div>
                </div>
              </div>

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

              {/* Print Preview Summary */}
              <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                <h4 className="font-medium text-sm">Print Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Paper Size:</span>
                    <span className="ml-2 font-medium">
                      {selectedPaperSize === "Custom"
                        ? `${customPaperSize.width}×${customPaperSize.height}mm`
                        : paperSizes[selectedPaperSize].name}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Layout:</span>
                    <span className="ml-2 font-medium">
                      {printLayout === "individual" ? "Individual Optimized" : "Multi-Label Sheet"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Barcode Type:</span>
                    <span className="ml-2 font-medium">{barcodeType}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Barcode Size:</span>
                    <span className="ml-2 font-medium">
                      {barcodeSizes[barcodeType].width}×{barcodeSizes[barcodeType].height}mm
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Total Labels:</span>
                    <span className="ml-2 font-medium">{currentPrintProducts.length * printQuantity}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Estimated Pages:</span>
                    <span className="ml-2 font-medium">
                      {(() => {
                        const currentPaper = getCurrentPaperSize()
                        const layout = calculateOptimalLabelSize(currentPaper, barcodeSizes[barcodeType])
                        const labelsPerPage = layout.labelsPerRow * layout.labelsPerColumn
                        return Math.ceil((currentPrintProducts.length * printQuantity) / labelsPerPage)
                      })()}
                    </span>
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
                <div className="space-y-2">
                  <Label htmlFor="edit-category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter product description"
                  rows={3}
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
                        onClick={() => updateBarcodeField(index, generateBarcode(barcodeType))}
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
