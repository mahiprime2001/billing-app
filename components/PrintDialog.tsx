"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Printer } from "lucide-react";
import JsBarcode from "jsbarcode";

interface Product {
  id: string;
  name: string;
  price: number;
  barcodes: string[];
  stock: number; // Added stock property
}

interface PrintDialogProps {
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  onPrintSuccess: () => void;
  storeName: string;
}

function getBackendBase(): string {
  const envBase = (process.env.NEXT_PUBLIC_BACKEND_API_URL || "").trim();
  const base = envBase || "";
  return base.replace(/\/+$/, "");
}

export default function PrintDialog({
  products,
  isOpen,
  onClose,
  onPrintSuccess,
  storeName
}: PrintDialogProps) {
  const [copies, setCopies] = useState(1); // Default to 1, will be updated in useEffect
  const [loading, setLoading] = useState(false);
  const [barcodePreviews, setBarcodePreviews] = useState<{ [productId: string]: string | null }>({});
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");

  // Editable dimensions states
  const [labelWidth, setLabelWidth] = useState(81); // mm
  const [labelHeight, setLabelHeight] = useState(12); // mm
  const [barcodeWidthOption, setBarcodeWidthOption] = useState(2); // JsBarcode width
  const [barcodeHeightOption, setBarcodeHeightOption] = useState(35); // JsBarcode height
  const [barcodeDisplayValue, setBarcodeDisplayValue] = useState(false); // displayValue

  // Load printers when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    const backendBase = getBackendBase();
    const printersUrl = `${backendBase}/api/printers`;

    const fetchPrinters = async () => {
      try {
        const res = await fetch(printersUrl, { method: "GET" });
        const data = await res.json();
        if (res.ok && data.status === "success" && Array.isArray(data.printers)) {
          setAvailablePrinters(data.printers);
          if (data.printers.length > 0) {
            const preferred = "SNBC TVSE LP46 Dlite BPLE";
            setSelectedPrinter(
              data.printers.includes(preferred) ? preferred : data.printers[0]
            );
          } else {
            setSelectedPrinter("");
          }
        } else {
          console.error("Failed to fetch printers:", data?.message || "Unknown error");
        }
      } catch (err) {
        console.error("Error fetching printers:", err);
      }
    };

    fetchPrinters();
  }, [isOpen]);

  // Set initial copies based on the first product's stock when dialog opens
  useEffect(() => {
    if (isOpen && products.length > 0 && products[0].stock !== undefined) {
      setCopies(products[0].stock);
    } else if (!isOpen) {
      setCopies(1); // Reset copies when dialog closes
    }
  }, [isOpen, products]);

  const createBarcodeImage = (barcodeValue: string): string | null => {
    try {
      const canvas = document.createElement("canvas");
      // Canvas dimensions are in pixels, scale from mm for preview
      canvas.width = labelWidth * 3.779528; // 1mm = 3.779528px
      canvas.height = labelHeight * 3.779528;

      const options = {
        format: "CODE128",
        width: barcodeWidthOption,
        height: barcodeHeightOption,
        displayValue: barcodeDisplayValue,
        margin: 1,
        background: "#ffffff",
        lineColor: "#000000"
      };

      JsBarcode(canvas, barcodeValue, options);
      return canvas.toDataURL("image/png");
    } catch (error) {
      console.error(`Failed to create barcode for ${barcodeValue}:`, error);
      return null;
    }
  };

  useEffect(() => {
    const generatePreviews = () => {
      const newPreviews: { [productId: string]: string | null } = {};
      for (const product of products) {
        const barcodeValue =
          product.barcodes && product.barcodes.length > 0 ? product.barcodes[0] : product.id;
        newPreviews[product.id] = createBarcodeImage(barcodeValue);
      }
      setBarcodePreviews(newPreviews);
    };

    if (isOpen && products.length > 0) {
      generatePreviews();
    } else if (!isOpen) {
      setBarcodePreviews({});
    }
  }, [
    isOpen,
    products,
    labelWidth,
    labelHeight,
    barcodeWidthOption,
    barcodeHeightOption,
    barcodeDisplayValue
  ]);

  const handlePrint = async () => {
    if (products.length === 0) {
      alert("No products selected");
      return;
    }
    if (!selectedPrinter) {
      alert("No printer selected");
      return;
    }

    setLoading(true);
    try {
      const productIds = products.map((p) => p.id);
      const backendBase = getBackendBase();
      const apiUrl = `${backendBase}/api/print-label`;
      console.log("Attempting to POST:", apiUrl);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds,
          copies,
          printerName: selectedPrinter,
          storeName: storeName || "Company Name"
        })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.status === "success") {
        alert("Print job sent successfully.");
        onPrintSuccess();
        onClose();
      } else {
        const msg = data?.message || `${response.status} ${response.statusText}`;
        alert("Print failed: " + msg);
      }
    } catch (error) {
      alert("Error sending print request.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Printer className="h-5 w-5 mr-2" />
            Print Labels
          </DialogTitle>
          <DialogDescription>
            Configure and preview labels for the selected products.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          {/* Print Settings Column */}
          <div className="space-y-6">
            {/* Copies per Product */}
            <div className="space-y-2">
              <Label htmlFor="copies" className="text-base font-medium">
                Copies per Product
              </Label>
              <Input
                id="copies"
                type="number"
                min="1"
                max="100"
                value={copies}
                onChange={(e) => setCopies(Number.parseInt(e.target.value) || 1)}
                className="w-32"
              />
              <p className="text-sm text-gray-600">
                Number of labels to print for each selected product.
              </p>
            </div>

            {/* Label Dimensions */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Label Dimensions (mm)</Label>
              <div className="flex space-x-2">
                <div className="flex-1">
                  <Label htmlFor="label-width" className="sr-only">
                    Width
                  </Label>
                  <Input
                    id="label-width"
                    type="number"
                    min="1"
                    value={labelWidth}
                    onChange={(e) => setLabelWidth(Number.parseInt(e.target.value) || 1)}
                    placeholder="Width"
                  />
                  <p className="text-xs text-gray-500 mt-1">Width (mm)</p>
                </div>
                <div className="flex-1">
                  <Label htmlFor="label-height" className="sr-only">
                    Height
                  </Label>
                  <Input
                    id="label-height"
                    type="number"
                    min="1"
                    value={labelHeight}
                    onChange={(e) => setLabelHeight(Number.parseInt(e.target.value) || 1)}
                    placeholder="Height"
                  />
                  <p className="text-xs text-gray-500 mt-1">Height (mm)</p>
                </div>
              </div>
            </div>

            {/* Printer Selection */}
            <div className="space-y-2">
              <Label htmlFor="printer-select" className="text-base font-medium">
                Select Printer
              </Label>
              <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
                <SelectTrigger id="printer-select" className="w-full">
                  <SelectValue placeholder="Select a printer" />
                </SelectTrigger>
                <SelectContent>
                  {availablePrinters.map((printer) => (
                    <SelectItem key={printer} value={printer}>
                      {printer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availablePrinters.length === 0 && (
                <p className="text-sm text-red-500">
                  No printers found. Ensure backend is running and printers are installed.
                </p>
              )}
            </div>

            {/* Barcode Options */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Barcode Options</Label>
              <div className="flex space-x-2">
                <div className="flex-1">
                  <Label htmlFor="barcode-width" className="sr-only">
                    Barcode Bar Width
                  </Label>
                  <Input
                    id="barcode-width"
                    type="number"
                    min="1"
                    max="10"
                    value={barcodeWidthOption}
                    onChange={(e) => setBarcodeWidthOption(Number.parseInt(e.target.value) || 1)}
                    placeholder="Bar Width"
                  />
                  <p className="text-xs text-gray-500 mt-1">Bar Width (px)</p>
                </div>
                <div className="flex-1">
                  <Label htmlFor="barcode-height" className="sr-only">
                    Barcode Height
                  </Label>
                  <Input
                    id="barcode-height"
                    type="number"
                    min="10"
                    max="100"
                    value={barcodeHeightOption}
                    onChange={(e) => setBarcodeHeightOption(Number.parseInt(e.target.value) || 10)}
                    placeholder="Height"
                  />
                  <p className="text-xs text-gray-500 mt-1">Barcode Height (px)</p>
                </div>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <input
                  id="display-value"
                  type="checkbox"
                  checked={barcodeDisplayValue}
                  onChange={(e) => setBarcodeDisplayValue(e.target.checked)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <Label htmlFor="display-value" className="text-sm font-medium">
                  Display Barcode Value
                </Label>
              </div>
            </div>

            {/* Static Label Specifications */}
            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <h4 className="font-medium text-sm">Printer Specifications (TVS LP 46 DLite)</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
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
                  <span className="ml-2 font-medium">{products.length * copies}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Column */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Label Preview</Label>
            <div className="max-h-[500px] overflow-y-auto border rounded-lg p-3 bg-gray-50">
              {products.length === 0 ? (
                <p className="text-gray-500 text-sm">No products selected for preview.</p>
              ) : (
                products.map((product) => (
                  <div
                    key={product.id}
                    className="mb-4 p-2 border rounded-md bg-white shadow-sm"
                    style={{ width: `${labelWidth}mm`, height: `${labelHeight}mm`, overflow: "hidden" }}
                  >
                    <div
                      className="label-container"
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        justifyContent: "flex-start",
                        alignItems: "center",
                        boxSizing: "border-box",
                        fontSize: "6px",
                        lineHeight: "1",
                        height: "100%",
                        width: "100%"
                      }}
                    >
                      {/* Barcode section on left */}
                      <div
                        className="barcode-section"
                        style={{
                          width: "50%",
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          paddingTop: "2mm"
                        }}
                      >
                        {barcodePreviews[product.id] && (
                          <img
                            src={barcodePreviews[product.id] || ""}
                            alt={`Barcode for ${product.name}`}
                            className="barcode-image"
                            style={{
                              height: `${barcodeHeightOption / 3.779528}mm`,
                              maxWidth: "90%",
                              marginBottom: "0.5mm"
                            }}
                          />
                        )}
                        {barcodeDisplayValue && (
                          <div
                            className="barcode-number"
                            style={{
                              fontSize: "7px",
                              fontWeight: "bold",
                              textAlign: "center",
                              letterSpacing: "0.2px"
                            }}
                          >
                            {product.barcodes && product.barcodes.length > 0
                              ? product.barcodes[0]
                              : product.id}
                          </div>
                        )}
                      </div>

                      {/* Product info section on right */}
                      <div
                        className="left-section"
                        style={{
                          width: "50%",
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          alignItems: "flex-start",
                          paddingLeft: "2mm"
                        }}
                      >
                        <div
                          className="company-name"
                          style={{
                            fontSize: "6px",
                            fontWeight: "bold",
                            marginBottom: "0.5mm",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}
                        >
                          {storeName}
                        </div>
                        <div
                          className="product-name"
                          style={{
                            fontSize: "7px",
                            fontWeight: "bold",
                            marginBottom: "0.5mm",
                            lineHeight: "1.1",
                            maxHeight: "6mm",
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            wordBreak: "break-word"
                          }}
                        >
                          Product Name: {product.name}
                        </div>
                        <div
                          className="price"
                          style={{
                            fontSize: "7px",
                            fontWeight: "bold",
                            whiteSpace: "nowrap"
                          }}
                        >
                          Price: ₹{product.price.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={handlePrint}
            disabled={loading}
          >
            {loading ? "Printing..." : "Print"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
