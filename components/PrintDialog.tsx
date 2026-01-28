"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer } from "lucide-react";
import JsBarcode from "jsbarcode";
import { getBarcode } from "@/app/utils/getBarcode";
import { unifiedPrint } from "@/app/utils/printUtils";
import type { Product } from "@/lib/types";

interface PrintDialogProps {
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  onPrintSuccess: () => void;
  storeName: string;
  forceBackendPrint?: boolean;
}

function getBackendBase(): string {
  const envBase = (process.env.NEXT_PUBLIC_BACKEND_API_URL || "").trim();
  return envBase.replace(/\/+$/, "");
}

export default function PrintDialog({
  products,
  isOpen,
  onClose,
  onPrintSuccess,
  storeName,
  forceBackendPrint = false,
}: PrintDialogProps) {
  const [copies, setCopies] = useState(1);
  const [loading, setLoading] = useState(false);
  const [barcodePreviews, setBarcodePreviews] = useState<
    Record<string, string | null>
  >({});
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [directPrint, setDirectPrint] = useState(false);

  const [labelWidth, setLabelWidth] = useState(81);
  const [labelHeight, setLabelHeight] = useState(12);
  const [barcodeWidthOption, setBarcodeWidthOption] = useState(2);
  const [barcodeHeightOption, setBarcodeHeightOption] = useState(35);
  const [barcodeDisplayValue, setBarcodeDisplayValue] = useState(false);

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
          }
        }
      } catch (err) {
        console.error("Error fetching printers:", err);
      }
    };

    fetchPrinters();
  }, [isOpen]);

  const createBarcodeImage = (barcodeValue: string): string | null => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = labelWidth * 3.779528;
      canvas.height = labelHeight * 3.779528;

      const options = {
        format: "CODE128" as const,
        width: barcodeWidthOption,
        height: barcodeHeightOption,
        displayValue: barcodeDisplayValue,
        margin: 1,
        background: "#ffffff",
        lineColor: "#000000",
      };

      JsBarcode(canvas, barcodeValue, options);
      return canvas.toDataURL("image/png");
    } catch (error) {
      console.error(`Failed to create barcode for ${barcodeValue}:`, error);
      return null;
    }
  };

  // Generate barcode previews
  useEffect(() => {
    const generatePreviews = () => {
      const newPreviews: Record<string, string | null> = {};
      for (const product of products) {
        const barcodeValue = getBarcode(product) ?? "NO-BARCODE";
        newPreviews[product.id] = createBarcodeImage(barcodeValue);
      }
      setBarcodePreviews(newPreviews);
    };

    if (isOpen && products.length > 0) {
      generatePreviews();
    } else if (!isOpen) {
      setBarcodePreviews({});
    }
  }, [isOpen, products, labelWidth, labelHeight, barcodeWidthOption, barcodeHeightOption, barcodeDisplayValue]);

  const handlePrint = async () => {
    if (products.length === 0) {
      alert("No products selected");
      return;
    }

    setLoading(true);
    try {
      const shouldUseBackend = forceBackendPrint || directPrint;

      if (shouldUseBackend) {
        // ✅ FIXED: Send selling_price instead of price for labels
        const labelData = products.map((product) => ({
          id: product.id,
          name: product.name,
          selling_price: product.sellingPrice ?? 0,
          barcode: getBarcode(product) ?? "NO-BARCODE", // ✅ Guaranteed string
        }));

        await unifiedPrint({
          useBackendPrint: true,
          labelData,
          copies,
          printerName: selectedPrinter || undefined,
          storeName,
        });

        alert("Print job sent to backend.");
        onPrintSuccess();
        onClose();
        return;
      }

      // Browser print path
      let labelBlocks: string[] = [];
      for (const product of products) {
        const barcodeValue = getBarcode(product) ?? "NO-BARCODE";
        const imgSrc = barcodePreviews[product.id];

        for (let c = 0; c < Math.max(1, copies); c++) {
          labelBlocks.push(`
            <div class="label" style="
              display: inline-block;
              vertical-align: top;
              width: ${labelWidth}mm;
              height: ${labelHeight}mm;
              box-sizing: border-box;
              padding: 4px;
              margin: 4px;
              border: 0;
            ">
              <div style="
                display: flex;
                flex-direction: row;
                height: 100%;
                font-family: Arial, Helvetica, sans-serif;
              ">
                <div style="
                  width: 50%;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  padding-top: 2mm;
                ">
                  ${imgSrc ? `<img src="${imgSrc}" style="max-width: 90%; height: auto; display: block; margin-bottom: 2px;" />` : ''}
                  ${barcodeDisplayValue ? `<div style="font-size: 7px; font-weight: bold; text-align: center;">${escapeHtml(barcodeValue)}</div>` : ''}
                </div>
                <div style="
                  width: 50%;
                  padding-left: 2mm;
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                  align-items: flex-start;
                ">
                  <div style="
                    font-size: 6px;
                    font-weight: bold;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                  ">${escapeHtml(storeName)}</div>
                  <div style="
                    font-size: 7px;
                    font-weight: bold;
                    margin-top: 2px;
                    line-height: 1.1;
                    max-height: 6mm;
                    overflow: hidden;
                  ">Product Name: ${escapeHtml(product.name)}</div>
                  <div style="
                    font-size: 7px;
                    font-weight: bold;
                    white-space: nowrap;
                    margin-top: 2px;
                  ">Price: ${(product.price ?? 0).toFixed(2)}</div>
                </div>
              </div>
            </div>
          `);
        }
      }

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Labels</title>
  <style>
    body { margin: 8mm; font-family: Arial, Helvetica, sans-serif; }
    @media print {
      page-size: auto;
      margin: 0;
      body { margin: 0; }
      .label { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${labelBlocks.join("")}
  <script>
    window.onload = function() {
      window.print();
      setTimeout(window.close, 300);
    }
  </script>
</body>
</html>`;

      await unifiedPrint({ htmlContent: html });
      alert("Print dialog opened.");
      onPrintSuccess();
      onClose();
    } catch (error) {
      alert("Error printing labels.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  function escapeHtml(s: string): string {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

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
          {/* Print Settings */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="copies" className="text-base font-medium">
                Copies per Product
              </Label>
              <Input
                id="copies"
                type="number"
                min={1}
                max={100}
                value={copies}
                onChange={(e) => setCopies(Number.parseInt(e.target.value) || 1)}
                className="w-32"
              />
            </div>

            <div>
              <Label className="text-base font-medium">Label Dimensions (mm)</Label>
              <div className="flex space-x-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    min={1}
                    value={labelWidth}
                    onChange={(e) => setLabelWidth(Number.parseInt(e.target.value) || 1)}
                    placeholder="Width"
                  />
                  <p className="text-xs text-gray-500 mt-1">Width</p>
                </div>
                <div className="flex-1">
                  <Input
                    type="number"
                    min={1}
                    value={labelHeight}
                    onChange={(e) => setLabelHeight(Number.parseInt(e.target.value) || 1)}
                    placeholder="Height"
                  />
                  <p className="text-xs text-gray-500 mt-1">Height</p>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="printer-select" className="text-base font-medium">
                Select Printer
              </Label>
              <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
                <SelectTrigger id="printer-select">
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
              <div className="flex items-center space-x-2 mt-2">
                <input
                  id="direct-print"
                  type="checkbox"
                  checked={directPrint}
                  onChange={(e) => setDirectPrint(e.target.checked)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <Label htmlFor="direct-print" className="text-sm font-medium">
                  Direct print (no browser dialog)
                </Label>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <h4 className="font-medium text-sm">Total Labels</h4>
              <div className="text-2xl font-bold">{products.length * copies}</div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <Label className="text-base font-medium mb-2">Label Preview</Label>
            <div className="max-h-[500px] overflow-y-auto border rounded-lg p-3 bg-gray-50">
              {products.length === 0 ? (
                <p className="text-gray-500 text-sm">No products selected.</p>
              ) : (
                products.map((product) => (
                  <div
                    key={product.id}
                    className="mb-4 p-2 border rounded-md bg-white shadow-sm"
                    style={{
                      width: `${labelWidth}mm`,
                      height: `${labelHeight}mm`,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        height: "100%",
                        fontSize: "6px",
                        lineHeight: 1,
                      }}
                    >
                      {/* Barcode */}
                      <div
                        style={{
                          width: "50%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          paddingTop: "2mm",
                        }}
                      >
                        {barcodePreviews[product.id] && (
                          <img
                            src={barcodePreviews[product.id]!}
                            alt={`Barcode for ${product.name}`}
                            style={{
                              maxWidth: "90%",
                              height: "auto",
                              marginBottom: "2px",
                            }}
                          />
                        )}
                        {barcodeDisplayValue && (
                          <div
                            style={{
                              fontSize: "7px",
                              fontWeight: "bold",
                              textAlign: "center",
                            }}
                          >
                            {getBarcode(product) ?? "NO-BARCODE"}
                          </div>
                        )}
                      </div>

                      {/* Product Info */}
                      <div
                        style={{
                          width: "50%",
                          paddingLeft: "2mm",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ fontSize: "6px", fontWeight: "bold" }}>
                          {storeName}
                        </div>
                        <div
                          style={{
                            fontSize: "7px",
                            fontWeight: "bold",
                            marginTop: "2px",
                            lineHeight: 1.1,
                            maxHeight: "6mm",
                            overflow: "hidden",
                          }}
                        >
                          Product Name: {product.name}
                        </div>
                        <div style={{ fontSize: "7px", fontWeight: "bold", marginTop: "2px" }}>
                          Price: {(product.price ?? 0).toFixed(2)}
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
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handlePrint}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? "Printing..." : "Print"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
