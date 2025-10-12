// components/product-assignment-dialog.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Minus, X } from "lucide-react";

export interface Product {
  id: string;
  name: string;
  barcode: string;
  stock: number;
}

export interface AssignedProduct extends Product {
  assignedQuantity: number;
}

interface ProductAssignmentDialogProps {
  storeId: string;
  storeName: string;
  trigger: React.ReactNode;
  onAssign: (storeId: string, products: AssignedProduct[]) => void;
}

export default function ProductAssignmentDialog({
  storeId,
  storeName,
  trigger,
  onAssign,
}: ProductAssignmentDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [assignedProducts, setAssignedProducts] = useState<AssignedProduct[]>(
    []
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadProducts();
    }
  }, [isOpen]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/products`
      );
      if (response.ok) {
        const productsData = await response.json();
        setProducts(productsData);
      } else {
        console.error("Failed to fetch products");
      }
    } catch (error) {
      console.error("Error loading products:", error);
    }
    setLoading(false);
  };

  const filteredProducts = products.filter((product) => {
    if (!product) return false;
    const q = searchTerm.toLowerCase();
    return (
      product.name?.toLowerCase().includes(q) ||
      product.barcode?.toLowerCase().includes(q)
    );
  });

  const addProduct = (product: Product) => {
    const existing = assignedProducts.find((p) => p.id === product.id);
    if (existing) {
      setAssignedProducts((prev) =>
        prev.map((p) =>
          p.id === product.id
            ? {
                ...p,
                assignedQuantity: Math.min(p.assignedQuantity + 1, p.stock),
              }
            : p
        )
      );
    } else {
      setAssignedProducts((prev) => [
        ...prev,
        { ...product, assignedQuantity: 1 },
      ]);
    }
  };

  const removeProduct = (productId: string) => {
    setAssignedProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const updateQuantity = (productId: string, change: number) => {
    setAssignedProducts((prev) =>
      prev
        .map((p) => {
          if (p.id === productId) {
            const next = Math.max(0, Math.min(p.stock, p.assignedQuantity + change));
            return { ...p, assignedQuantity: next };
          }
          return p;
        })
        .filter((p) => p.assignedQuantity > 0)
    );
  };

  const handleAssign = () => {
    if (assignedProducts.length === 0) {
      alert("Please select at least one product to assign.");
      return;
    }
    onAssign(storeId, assignedProducts);
    handleReset();
    setIsOpen(false);
  };

  const handleReset = () => {
    setAssignedProducts([]);
    setSearchTerm("");
  };

  const handleCancel = () => {
    handleReset();
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center">
            <Plus className="h-6 w-6 mr-2 text-blue-600" />
            Assign Products to {storeName}
          </DialogTitle>
          <DialogDescription>
            Select products to assign to this store and set their quantities.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-6 h-[70vh]">
          {/* Right side - Product selection */}
          <div className="flex-1 flex flex-col">
            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by product name or barcode..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Products */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="text-center py-8">Loading products...</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProducts.map((product) => (
                    <Card
                      key={product.id}
                      className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-blue-200"
                      onClick={() => addProduct(product)}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-1">
                              {product.name}
                            </h3>
                            <p className="text-sm text-gray-500 mb-2">
                              #{product.barcode}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              Stock: {product.stock}
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              addProduct(product);
                            }}
                            className="ml-2"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {!loading && filteredProducts.length === 0 && (
                <div className="text-center py-16">
                  <div className="text-gray-500">
                    {searchTerm
                      ? "No products found matching your search."
                      : "No products available."}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Left side - Selected products */}
          <div className="w-80 border-l pl-6 flex flex-col">
            <h3 className="text-lg font-semibold mb-4">
              Selected Products ({assignedProducts.length})
            </h3>

            <div className="flex-1 overflow-y-auto">
              {assignedProducts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No products selected yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {assignedProducts.map((product) => (
                    <Card key={product.id} className="border">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium">{product.name}</h4>
                            <p className="text-xs text-gray-500">
                              #{product.barcode}
                            </p>
                            <Badge variant="outline" className="text-xs mt-1">
                              Available: {product.stock}
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeProduct(product.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Quantity controls */}
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-sm font-medium">Quantity:</span>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateQuantity(product.id, -1)}
                              disabled={product.assignedQuantity <= 1}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="min-w-[2rem] text-center font-medium">
                              {product.assignedQuantity}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateQuantity(product.id, 1)}
                              disabled={product.assignedQuantity >= product.stock}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <div className="flex space-x-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleReset}>
              Reset
            </Button>
          </div>
          <Button
            onClick={handleAssign}
            disabled={assignedProducts.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Assign Products
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
