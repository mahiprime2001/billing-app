"use client"

// Discount labels: find a product (scan or type a barcode, name, price, batch...), enter a discount as a
// percentage or a rupee amount, and print a barcode label that shows the ORIGINAL price struck through with the
// DISCOUNTED price beside it. Printing goes straight to the label printer (TSPL), like the Products page.
// The preview below the form is drawn from the very TSPL commands that get printed.

import { useEffect, useMemo, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Barcode, Printer, Search, Tag } from "lucide-react"

import { API_BASE } from "@/lib/api-base"
import { useIncrementalProducts } from "@/hooks/useIncrementalProducts"
import type { Batch, Product as ProductType } from "@/lib/types"
import {
  computeDiscount,
  formatMoney,
  generateDiscountTspl,
  parseNumber,
  type DiscountLabelItem,
  type DiscountMode,
} from "@/lib/discount-label-tspl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// The same label stock the Products page prints on.
const LABEL_SIZES = [
  { id: "default-80x12", name: "80 x 12 mm (default)", widthMm: 80, heightMm: 12, profile: undefined },
  { id: "dummy-small-label", name: "60 x 20 mm", widthMm: 60, heightMm: 20, profile: undefined },
  {
    id: "25x25-1x4",
    name: "25 x 25 mm (4 across)",
    widthMm: 25,
    heightMm: 25,
    profile: { type: "25x25_4up", paper_width_mm: 103, paper_height_mm: 25, gap_horizontal_mm: 0.5, gap_vertical_mm: 2,
      label_width_mm: 25, margin_left_mm: 1.5 },
  },
] as const

const PREFERRED_PRINTER = "SNBC TVSE LP46 Dlite BPLE" // same default as the Products page

type Row = {
  product: ProductType
  name: string
  barcodes: string[]
  batch: string
  price: number
  stock: number
}

const sellingPriceOf = (p: ProductType): number => {
  const raw = (p as any).sellingPrice ?? (p as any).selling_price ?? (p as any).displayPrice ?? 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

const isTauri = () => typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)

// ---------------------------------------------------------------- preview (drawn from the TSPL itself)

type Shape =
  | { kind: "text"; x: number; y: number; font: string; text: string }
  | { kind: "bar"; x: number; y: number; w: number; h: number }
  | { kind: "barcode"; x: number; y: number; h: number; code: string }

const CHAR_W: Record<string, number> = { "1": 8, "2": 12, "3": 16, "4": 24 }
const CHAR_H: Record<string, number> = { "1": 12, "2": 20, "3": 24, "4": 32 }

function parseShapes(tspl: string): Shape[] {
  const out: Shape[] = []
  let inLabel = false
  for (const line of tspl.split(/\r?\n/)) {
    if (line === "CLS") { inLabel = true; continue }
    if (line.startsWith("PRINT")) break
    if (!inLabel) continue
    let m = line.match(/^TEXT (\d+),(\d+),"(\d)",\d+,\d+,\d+,"(.*)"$/)
    if (m) { out.push({ kind: "text", x: +m[1], y: +m[2], font: m[3], text: m[4] }); continue }
    m = line.match(/^BAR (\d+),(\d+),(\d+),(\d+)$/)
    if (m) { out.push({ kind: "bar", x: +m[1], y: +m[2], w: +m[3], h: +m[4] }); continue }
    m = line.match(/^BARCODE (\d+),(\d+),"128",(\d+),.*,"(.*)"$/)
    if (m) out.push({ kind: "barcode", x: +m[1], y: +m[2], h: +m[3], code: m[4] })
  }
  return out
}

function LabelPreview({ tspl, sizeId }: { tspl: string; sizeId: string }) {
  const size = LABEL_SIZES.find((s) => s.id === sizeId) ?? LABEL_SIZES[0]
  const is25 = size.id === "25x25-1x4"
  const view = is25 ? { x: 12, w: 210, h: 200 } : { x: 0, w: size.widthMm * 8, h: size.heightMm * 8 }
  const shapes = useMemo(() => parseShapes(tspl), [tspl])
  return (
    <svg
      viewBox={`${view.x} 0 ${view.w} ${view.h}`}
      className="w-full rounded border bg-white shadow-sm"
      style={{ maxWidth: is25 ? 260 : 560 }}
      role="img"
      aria-label="Label preview"
    >
      {shapes.map((s, i) => {
        if (s.kind === "bar") return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill="#000" />
        if (s.kind === "text") {
          const cw = CHAR_W[s.font] ?? 8
          const ch = CHAR_H[s.font] ?? 12
          return (
            <text key={i} x={s.x} y={s.y + ch * 0.82} fontSize={cw / 0.6} fontFamily="monospace" fill="#000"
              textLength={s.text.length * cw} lengthAdjust="spacingAndGlyphs">
              {s.text}
            </text>
          )
        }
        // a stand-in barcode: the real one is drawn by the printer
        const bars: React.ReactElement[] = []
        const width = ((s.code.length + 2) * 11 + 13 + 20)
        for (let x = 0; x < width; x += 2) {
          const on = (s.code.charCodeAt(x % Math.max(1, s.code.length)) + x * 7) % 5 < 2
          if (on) bars.push(<rect key={x} x={s.x + x} y={s.y} width={2} height={s.h} fill="#000" />)
        }
        return <g key={i}>{bars}</g>
      })}
    </svg>
  )
}

// ---------------------------------------------------------------- the tool

export default function DiscountLabels() {
  const { data: products = [], isLoading, isStreaming, totalCount } = useIncrementalProducts(200)
  const [batches, setBatches] = useState<Batch[]>([])
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<DiscountMode>("percent")
  const [valueText, setValueText] = useState("")
  const [copiesText, setCopiesText] = useState("1")
  const [sizeId, setSizeId] = useState<string>(LABEL_SIZES[0].id)
  const [printers, setPrinters] = useState<string[]>([])
  const [printer, setPrinter] = useState("")
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [printing, setPrinting] = useState(false)
  const valueRef = useRef<HTMLInputElement>(null)

  // batch numbers (so a batch can be searched and printed on the label)
  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/batches`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled && Array.isArray(data)) setBatches(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // printers (desktop app only)
  useEffect(() => {
    if (!isTauri()) return
    invoke<string[]>("get_available_printers")
      .then((list) => {
        if (!Array.isArray(list)) return
        setPrinters(list)
        setPrinter(list.includes(PREFERRED_PRINTER) ? PREFERRED_PRINTER : list[0] ?? "")
      })
      .catch((e) => console.error("Could not list printers:", e))
  }, [])

  const rows: Row[] = useMemo(() => {
    const batchNo = new Map(batches.map((b) => [String(b.id), String(b.batchNumber ?? "")]))
    return products.map((p) => ({
      product: p,
      name: String(p.name ?? ""),
      barcodes: String(p.barcode ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      batch: p.batchid ? batchNo.get(String(p.batchid)) ?? "" : "",
      price: sellingPriceOf(p),
      stock: Number((p as any).availableStock ?? p.stock ?? 0) + Number((p as any).inStoresStock ?? (p as any).allocatedStock ?? 0),
    }))
  }, [products, batches])

  // With nothing typed the list shows the products, newest first. Typing narrows it: every word must match
  // the name, a barcode, the batch or the selling price.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return [...rows].sort((a, b) => String((b.product as any).createdAt ?? "").localeCompare(String((a.product as any).createdAt ?? "")))
    }
    const words = q.split(/\s+/)
    const hits = rows.filter((r) =>
      words.every((w) =>
        r.name.toLowerCase().includes(w) ||
        r.batch.toLowerCase().includes(w) ||
        r.barcodes.some((b) => b.toLowerCase().includes(w)) ||
        (/^\d+(\.\d+)?$/.test(w) && formatMoney(r.price).startsWith(w)),
      ),
    )
    const rank = (r: Row) => (r.barcodes.includes(query.trim()) ? 0 : r.name.toLowerCase().startsWith(q) ? 1 : 2)
    return hits.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  }, [rows, query])

  const [shown, setShown] = useState(40)
  useEffect(() => setShown(40), [query])          // a new search starts at the top again
  const results = useMemo(() => matches.slice(0, shown), [matches, shown])

  const selected = useMemo(() => rows.find((r) => r.product.id === selectedId) ?? null, [rows, selectedId])

  const choose = (row: Row) => {
    setSelectedId(row.product.id)
    setStatus(null)
    setTimeout(() => valueRef.current?.focus(), 0)
  }

  // Enter after a scan: an exact barcode, or the only match, picks the product
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return
    e.preventDefault()
    const typed = query.trim()
    const exact = rows.filter((r) => r.barcodes.includes(typed))
    if (exact.length === 1) return choose(exact[0])
    if (typed && matches.length === 1) return choose(matches[0])
  }

  const discount = useMemo(
    () => (selected ? computeDiscount(selected.price, mode, parseNumber(valueText)) : null),
    [selected, mode, valueText],
  )
  const copies = Math.min(200, Math.max(1, Math.trunc(Number(copiesText)) || 1))
  const size = LABEL_SIZES.find((s) => s.id === sizeId) ?? LABEL_SIZES[0]

  const item: DiscountLabelItem | null = useMemo(() => {
    if (!selected || !discount?.ok) return null
    return {
      barcode: selected.barcodes[0] || String(selected.product.id),
      name: selected.name,
      original: discount.original,
      final: discount.final,
      percentOff: discount.percentOff,
      batch: selected.batch || undefined,
    }
  }, [selected, discount])

  const tspl = useMemo(
    () => (item ? generateDiscountTspl([item], 1, { widthMm: size.widthMm, heightMm: size.heightMm }, size.profile as any) : ""),
    [item, size],
  )

  const print = async () => {
    if (!item) return
    if (!isTauri()) return setStatus({ ok: false, text: "Printing works in the desktop app only." })
    if (!printer) return setStatus({ ok: false, text: "Choose a printer first." })
    setPrinting(true)
    setStatus(null)
    try {
      const commands = generateDiscountTspl([item], copies, { widthMm: size.widthMm, heightMm: size.heightMm }, size.profile as any)
      const result = await invoke<{ status: string; message: string }>("send_tspl_to_printer", { printerName: printer, tsplCommands: commands })
      if (result.status !== "success") throw new Error(result.message || "The printer did not accept the job")
      setStatus({ ok: true, text: `Sent ${copies} label${copies === 1 ? "" : "s"} to ${printer}.` })
    } catch (e: any) {
      setStatus({ ok: false, text: `Could not print: ${e?.message ?? e}` })
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* ---------- find the product */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" /> Find the product
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Scan a barcode, or type a name, price or batch..."
          />
          <p className="text-xs text-muted-foreground">
            {isLoading || isStreaming
              ? `Loading products... ${products.length}${totalCount ? ` of ${totalCount}` : ""}`
              : query.trim()
                ? `${matches.length} match${matches.length === 1 ? "" : "es"}. Press Enter after a scan to pick it.`
                : `${products.length} products, newest first. Scan or type to find one.`}
          </p>
          <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
            {query.trim() && results.length === 0 && !isLoading && !isStreaming && (
              <p className="py-6 text-center text-sm text-muted-foreground">No product matches “{query.trim()}”.</p>
            )}
            {results.map((r) => (
              <button
                key={r.product.id}
                type="button"
                onClick={() => choose(r)}
                className={`w-full rounded-md border p-2 text-left transition hover:bg-accent ${r.product.id === selectedId ? "border-primary bg-accent" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium leading-tight">{r.name}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">₹{formatMoney(r.price)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span className="font-mono">{r.barcodes[0] ?? "no barcode"}</span>
                  {r.batch && <span>Batch {r.batch}</span>}
                  <span>Stock {r.stock}</span>
                </div>
              </button>
            ))}
            {matches.length > results.length && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setShown((n) => n + 100)}>
                Show 100 more ({matches.length - results.length} left)
              </Button>
            )}
            {!query.trim() && results.length === 0 && (isLoading || isStreaming) && (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading products...</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---------- discount + print */}
      <Card className="lg:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4" /> Discount label
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!selected ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Pick a product on the left to start.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-md bg-muted/50 p-3">
                <div>
                  <div className="font-medium leading-tight">{selected.name}</div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <Barcode className="h-3.5 w-3.5" /> {selected.barcodes[0] ?? "no barcode"}
                    {selected.batch && <Badge variant="outline">Batch {selected.batch}</Badge>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Selling price</div>
                  <div className="text-2xl font-bold tabular-nums">₹{formatMoney(selected.price)}</div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Discount</Label>
                  <div className="flex gap-2">
                    <div className="inline-flex shrink-0 overflow-hidden rounded-md border">
                      {([["percent", "%"], ["amount", "₹"]] as const).map(([m, label]) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMode(m)}
                          className={`px-3 py-2 text-sm font-medium ${mode === m ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
                          aria-pressed={mode === m}
                          title={m === "percent" ? "Discount as a percentage" : "Discount as a rupee amount"}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <Input
                      ref={valueRef}
                      inputMode="decimal"
                      value={valueText}
                      onChange={(e) => setValueText(e.target.value)}
                      placeholder={mode === "percent" ? "e.g. 20" : "e.g. 100"}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {mode === "percent" ? "Percent off the selling price" : "Rupees off the selling price"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>New price</Label>
                  <div className="rounded-md border p-3">
                    {discount?.ok ? (
                      <>
                        <div className="flex items-baseline gap-3">
                          <span className="text-lg text-muted-foreground line-through tabular-nums">₹{formatMoney(discount.original)}</span>
                          <span className="text-2xl font-bold text-green-700 tabular-nums">₹{formatMoney(discount.final)}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatMoney(discount.percentOff)}% off · ₹{formatMoney(discount.amountOff)} less
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">{valueText.trim() ? discount?.error : "Enter a discount"}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="dl-size">Label size</Label>
                  <Select value={sizeId} onValueChange={setSizeId}>
                    <SelectTrigger id="dl-size"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LABEL_SIZES.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dl-printer">Printer</Label>
                  <Select value={printer} onValueChange={setPrinter} disabled={printers.length === 0}>
                    <SelectTrigger id="dl-printer"><SelectValue placeholder={isTauri() ? "No printer found" : "Desktop app only"} /></SelectTrigger>
                    <SelectContent>
                      {printers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dl-copies">Copies</Label>
                  <Input id="dl-copies" inputMode="numeric" value={copiesText} onChange={(e) => setCopiesText(e.target.value.replace(/\D/g, ""))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Label preview</Label>
                {item ? (
                  <LabelPreview tspl={tspl} sizeId={sizeId} />
                ) : (
                  <div className="flex h-24 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
                    The label appears here once the discount is valid.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={print} disabled={!item || printing}>
                  <Printer className="mr-2 h-4 w-4" />
                  {printing ? "Printing..." : `Print ${copies} label${copies === 1 ? "" : "s"}`}
                </Button>
                {status && <span className={`text-sm ${status.ok ? "text-green-700" : "text-red-600"}`}>{status.text}</span>}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
