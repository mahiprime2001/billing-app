"use client"

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Search, Package, Plus, Minus, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const API = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8080'

export type AssignedProduct = {
  id: string // Changed to be a required string to match backend Product type
  barcode: string
  name: string
  price: number
  stock?: number
}

type Props = {
  storeId: string
  storeName?: string
  trigger: React.ReactNode
  onAssign: (storeId: string, products: AssignedProduct[]) => Promise<void> | void
}

export default function ProductAssignmentDialog({ storeId, storeName, trigger, onAssign }: Props) {
  const [open, setOpen] = useState(false)
  const [products, setProducts] = useState<AssignedProduct[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [quantityMap, setQuantityMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (open) {
      fetchProducts()
    } else {
      setSelected({})
      setQuantityMap({})
      setSearch('')
    }
  }, [open])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/products`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data)
      }
    } catch (e) {
      console.error('Failed to fetch products:', e)
    } finally {
      setLoading(false)
    }
  }

  const toggleProduct = (id: string) => {
    setSelected(prev => {
      const newSelected = { ...prev, [id]: !prev[id] }
      
      // Initialize quantity to 1 when selecting
      if (newSelected[id] && !quantityMap[id]) {
        const product = products.find(p => (p.id || p.barcode) === id)
        if (product && (product.stock || 0) > 0) {
          setQuantityMap(prevQty => ({ ...prevQty, [id]: 1 }))
        }
      }
      
      return newSelected
    })
  }

  const getProductStock = (productId: string): number => {
    const product = products.find(p => (p.id || p.barcode) === productId)
    return product?.stock || 0
  }

  const updateQuantity = (id: string, delta: number) => {
    const availableStock = getProductStock(id)
    setQuantityMap(prev => {
      const current = prev[id] || 0
      const newVal = Math.max(0, Math.min(availableStock, current + delta))
      console.log(`Updating ${id}: ${current} → ${newVal}`)
      return { ...prev, [id]: newVal }
    })
  }

  const setQuantity = (id: string, val: number) => {
    const availableStock = getProductStock(id)
    const clampedVal = Math.max(0, Math.min(availableStock, val))
    console.log(`Setting ${id}: Input=${val}, Clamped=${clampedVal}, Available=${availableStock}`)
    setQuantityMap(prev => ({ ...prev, [id]: clampedVal }))
    
    if (val > availableStock) {
      setTimeout(() => {
        alert(`⚠️ Cannot exceed available stock (${availableStock} units)`)
      }, 100)
    }
  }

  const handleAssign = async () => {
const selectedProducts = products.filter(p => selected[p.id || p.barcode]);

    if (selectedProducts.length === 0) {
      alert('Please select at least one product');
      return;
    }

    const assignments: { productId: string; quantity: number }[] = [];
    selectedProducts.forEach(p => {
      const key = p.id || p.barcode;
      const qty = quantityMap[key] || 0;
      assignments.push({
        productId: p.id,
        quantity: Number(qty)
      });
    });

    const hasZeroQuantity = assignments.some(a => a.quantity === 0);

    if (hasZeroQuantity) {
      if (!confirm('⚠️ Some products have 0 quantity. Continue anyway?')) {
        return;
      }
    }

    setAssigning(true);
    const successfulAssignments: AssignedProduct[] = [];
    const failedAssignments: { productId: string; error: string }[] = [];

    try {
      // Use the new dedicated assignment API
      const res = await fetch(`${API}/api/stores/${storeId}/assign-products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: assignments // Send all assignments in one go
        }),
      });

      if (!res.ok) {
        let errorMsg = res.statusText;
        try {
          const err = await res.json();
          errorMsg = err.message || err.error || errorMsg;
        } catch {}
        alert(`❌ Failed to assign products: ${errorMsg}`);
        // Log individual failures if the backend provided them in a structured way
        // For simplicity, we assume the backend will return a general error or specific if implemented.
      } else {
        alert(`✅ Successfully assigned ${assignments.length} product(s) to ${storeName || storeId}`);
        // Assuming all sent assignments were successful if the overall API call was OK.
        // In a real-world scenario, the backend might return which ones succeeded/failed.
        successfulAssignments.push(...selectedProducts);
      }
      
      if (onAssign) {
        await Promise.resolve(onAssign(storeId, successfulAssignments));
      }
      
      setOpen(false);
      setSelected({});
      setQuantityMap({});
      setSearch('');
      
      setTimeout(() => fetchProducts(), 500);
      
    } catch (e) {
      console.error('❌ Assign error (general):', e);
      alert('❌ An error occurred during the assignment process');
    } finally {
      setAssigning(false);
    }
  }

  const filteredProducts = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(search.toLowerCase())
  )

  const selectedCount = Object.values(selected).filter(Boolean).length
  const selectedProductsList = products.filter(p => selected[p.id || p.barcode])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Package className="h-5 w-5" />
            Assign Products to {storeName || storeId}
          </DialogTitle>
          <DialogDescription>
            Select products and set quantities to assign to this store
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex gap-6">
          {/* Left Side - Product List */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or barcode..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex-1 border rounded-xl overflow-hidden bg-muted/10">
              <div className="overflow-auto h-full">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-center">Available</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                          No products found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProducts.map((p) => {
                        const key = p.id || p.barcode
                        const isSelected = selected[key]
                        const hasStock = (p.stock || 0) > 0
                        
                        return (
                          <TableRow
                            key={key}
                            onClick={() => hasStock && toggleProduct(key)}
                            className={cn(
                              "transition-colors",
                              hasStock && "cursor-pointer",
                              !hasStock && "opacity-50 cursor-not-allowed",
                              isSelected && "bg-primary/5 hover:bg-primary/10"
                            )}
                          >
                            <TableCell>
                              <div className={cn(
                                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                                isSelected 
                                  ? "bg-primary border-primary scale-110" 
                                  : hasStock 
                                    ? "border-muted-foreground/30 hover:border-primary/50"
                                    : "border-muted-foreground/10"
                              )}>
                                {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{p.barcode}</TableCell>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="text-right font-semibold">₹{p.price?.toFixed(2)}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={p.stock === 0 ? "destructive" : "outline"}>
                                {p.stock || 0}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>{filteredProducts.length} product(s) available</span>
              <span className="font-medium">{selectedCount} selected</span>
            </div>
          </div>

          {/* Right Side - Selected Products */}
          <div className="w-96 border rounded-xl p-5 flex flex-col gap-4 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Selected Products</div>
              <Badge variant="secondary" className="text-sm">{selectedCount}</Badge>
            </div>

            {selectedProductsList.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
                <div className="space-y-3">
                  <Package className="h-16 w-16 mx-auto opacity-10" />
                  <div>
                    <p className="font-medium">No products selected</p>
                    <p className="text-xs mt-1">Click on products to select them</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-auto space-y-3 pr-1">
                {selectedProductsList.map(p => {
                  const key = p.id || p.barcode
                  const qty = quantityMap[key] || 0
                  const availableStock = p.stock || 0
                  const isOverStock = qty > availableStock
                  
                  return (
                    <div key={key} className="bg-background border rounded-xl p-4 space-y-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">{p.barcode}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Stock: <span className="font-semibold">{availableStock}</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 hover:bg-destructive/10 hover:text-destructive"
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation()
                            toggleProduct(key)
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-lg"
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation()
                            updateQuantity(key, -1)
                          }}
                          disabled={qty === 0}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <div className="flex-1 relative">
                          <Input
                            type="number"
                            min="0"
                            max={availableStock}
                            value={qty}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              e.stopPropagation()
                              const val = parseInt(e.target.value) || 0
                              setQuantity(key, val)
                            }}
                            onBlur={() => {
                              console.log(`Current quantity for ${key}:`, quantityMap[key])
                            }}
                            className={cn(
                              "h-9 text-center font-bold text-lg rounded-lg",
                              isOverStock && "border-destructive focus-visible:ring-destructive"
                            )}
                            onClick={(e: React.MouseEvent<HTMLInputElement>) => e.stopPropagation()}
                          />
                          {isOverStock && (
                            <AlertTriangle className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-lg"
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation()
                            updateQuantity(key, 1)
                          }}
                          disabled={qty >= availableStock}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      {isOverStock && (
                        <div className="text-xs text-destructive flex items-center gap-1 bg-destructive/5 p-2 rounded-lg">
                          <AlertTriangle className="h-3 w-3" />
                          Exceeds available stock
                        </div>
                      )}
                      
                      <div className="text-xs text-muted-foreground">
                        Assigning: <span className="font-bold text-foreground">{qty}</span> units
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={assigning} className="min-w-24">
            Cancel
          </Button>
          <Button 
            onClick={handleAssign} 
            disabled={selectedCount === 0 || assigning}
            className="min-w-32"
          >
            {assigning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              <>Assign {selectedCount > 0 && `(${selectedCount})`}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
