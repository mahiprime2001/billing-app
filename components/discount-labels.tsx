"use client"

// Discount labels: build a PRINT LIST of products (scan or search, one after another), give each a discount
// (% off, rupees off, or the new price itself), choose how many labels of each, and print them all in one go.
// Every label shows the ORIGINAL price struck through with the DISCOUNTED price beside it. Printing goes
// straight to the label printer (TSPL), like the Products page. The preview is drawn from the very TSPL
// commands that get printed.

import { useEffect, useMemo, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Minus, Plus, Printer, Search, Tag, Trash2 } from "lucide-react"

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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
const MAX_QTY = 200            // labels of one product
const MAX_TOTAL = 1000         // labels in one print job
const STORAGE_KEY = "discount-label-list-v1"

type Row = { product: ProductType; name: string; barcodes: string[]; batch: string; price: number; stock: number }

/** One product on the print list. The selling price is read live; `original` is only a fallback. */
type Entry = {
  id: string
  name: string
  barcode: string
  batch: string
  original: number
  mode: DiscountMode
  valueText: string
  qty: number
}

const MODE_LABEL: Record<DiscountMode, string> = { percent: "%", amount: "₹ off", final: "New price" }

const sellingPriceOf = (p: ProductType): number => {
  const raw = (p as any).sellingPrice ?? (p as any).selling_price ?? (p as any).displayPrice ?? 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

const isTauri = () => typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
const clampQty = (n: number) => Math.min(MAX_QTY, Math.max(1, Math.trunc(n) || 1))

function loadList(): Entry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((e) => e && typeof e.id === "string" && typeof e.name === "string")
      .map((e) => ({
        id: e.id, name: e.name, barcode: String(e.barcode ?? ""), batch: String(e.batch ?? ""),
        original: Number(e.original) || 0,
        mode: (["percent", "amount", "final"].includes(e.mode) ? e.mode : "percent") as DiscountMode,
        valueText: String(e.valueText ?? ""), qty: clampQty(Number(e.qty)),
      }))
  } catch {
    return []
  }
}

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
        const width = (s.code.length + 2) * 11 + 13 + 20
        for (let x = 0; x < width; x += 2) {
          const on = (s.code.charCodeAt(x % Math.max(1, s.code.length)) + x * 7) % 5 < 2
          if (on) bars.push(<rect key={x} x={s.x + x} y={s.y} width={2} height={s.h} fill="#000" />)
        }
        return <g key={i}>{bars}</g>
      })}
    </svg>
  )
}

/** A small segmented switch: % / ₹ off / New price */
function ModeSwitch({ value, onChange, modes }: { value: DiscountMode; onChange: (m: DiscountMode) => void; modes: DiscountMode[] }) {
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-md border text-xs">
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={value === m}
          className={`px-2.5 py-1.5 font-medium ${value === m ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
        >
          {MODE_LABEL[m]}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- the tool

export default function DiscountLabels() {
  const { data: products = [], isLoading, isStreaming, totalCount } = useIncrementalProducts(200)
  const [batches, setBatches] = useState<Batch[]>([])
  const [query, setQuery] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [listQuery, setListQuery] = useState("")
  const [bulkMode, setBulkMode] = useState<"percent" | "amount">("percent")
  const [bulkValue, setBulkValue] = useState("")
  const [pickFilter, setPickFilter] = useState<"all" | "in" | "not">("all")
  const [shown, setShown] = useState(40)

  // the print list, and what new items start with
  const [entries, setEntries] = useState<Entry[]>([])
  const [loadedList, setLoadedList] = useState(false)
  const [defMode, setDefMode] = useState<"percent" | "amount">("percent")
  const [defValue, setDefValue] = useState("")
  const [roundWhole, setRoundWhole] = useState(true)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [sizeId, setSizeId] = useState<string>(LABEL_SIZES[0].id)
  const [printers, setPrinters] = useState<string[]>([])
  const [printer, setPrinter] = useState("")
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [printing, setPrinting] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // the list survives a reload (this browser only)
  useEffect(() => {
    setEntries(loadList())
    setLoadedList(true)
  }, [])
  useEffect(() => {
    if (!loadedList) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch { /* private mode: the list just won't persist */ }
  }, [entries, loadedList])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2500)
    return () => clearTimeout(t)
  }, [notice])

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
  const rowById = useMemo(() => new Map(rows.map((r) => [String(r.product.id), r])), [rows])

  // With nothing typed the list shows the products, newest first. Typing narrows it: every word must match
  // the name, a barcode, the batch or the selling price.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inIds = new Set(entries.map((e) => e.id))
    const keep = (r: Row) => pickFilter === "all" || (pickFilter === "in") === inIds.has(String(r.product.id))
    if (!q) {
      return rows.filter(keep).sort((a, b) => String((b.product as any).createdAt ?? "").localeCompare(String((a.product as any).createdAt ?? "")))
    }
    const words = q.split(/\s+/)
    const hits = rows.filter(keep).filter((r) =>
      words.every((w) =>
        r.name.toLowerCase().includes(w) ||
        r.batch.toLowerCase().includes(w) ||
        r.barcodes.some((b) => b.toLowerCase().includes(w)) ||
        (/^\d+(\.\d+)?$/.test(w) && formatMoney(r.price).startsWith(w)),
      ),
    )
    const rank = (r: Row) => (r.barcodes.includes(query.trim()) ? 0 : r.name.toLowerCase().startsWith(q) ? 1 : 2)
    return hits.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  }, [rows, query, pickFilter, entries])
  useEffect(() => setShown(40), [query, pickFilter])
  const results = useMemo(() => matches.slice(0, shown), [matches, shown])

  // what a product would cost with the discount typed in the dialog (shown on each row before it is added)
  const newPriceHint = (price: number) => {
    if (!defValue.trim()) return "+ Add"
    const c = computeDiscount(price, defMode, parseNumber(defValue), roundWhole)
    return c.ok ? `+ Add · ₹${formatMoney(c.final)} (${formatMoney(c.percentOff)}% off)` : "+ Add"
  }

  // ---------- the print list
  const addProduct = (row: Row) => {
    setEntries((prev) => {
      const at = prev.findIndex((e) => e.id === String(row.product.id))
      if (at >= 0) return prev.map((e, i) => (i === at ? { ...e, qty: clampQty(e.qty + 1) } : e))   // same product again: one more label
      return [...prev, {
        id: String(row.product.id), name: row.name, barcode: row.barcodes[0] || String(row.product.id), batch: row.batch,
        original: row.price, mode: defMode, valueText: defValue, qty: 1,
      }]
    })
    setPreviewId(String(row.product.id))
    setNotice(`Added: ${row.name}`)
    setStatus(null)
  }
  const patchEntry = (id: string, patch: Partial<Entry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id))
  const clearList = () => {
    if (entries.length === 0) return
    if (window.confirm(`Remove all ${entries.length} products from the print list?`)) setEntries([])
  }
  const applyToAll = () => setEntries((prev) => prev.map((e) => ({ ...e, mode: bulkMode, valueText: bulkValue })))

  // Enter after a scan: an exact barcode, or the only match, is added and the box is cleared for the next scan
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return
    e.preventDefault()
    const typed = query.trim()
    if (!typed) return
    const exact = rows.filter((r) => r.barcodes.includes(typed))
    const pick = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null
    if (pick) {
      addProduct(pick)
      setQuery("")
      searchRef.current?.focus()
    }
  }

  // ---------- each row's price, worked out live
  const computed = useMemo(
    () =>
      entries.map((e) => {
        const live = rowById.get(e.id)
        const original = live ? live.price : e.original
        return { entry: e, original, calc: computeDiscount(original, e.mode, parseNumber(e.valueText), roundWhole) }
      }),
    [entries, rowById, roundWhole],
  )
  const totalLabels = entries.reduce((n, e) => n + e.qty, 0)
  const problemCount = computed.filter((c) => !c.calc.ok).length
  const visibleRows = useMemo(() => {
    const q = listQuery.trim().toLowerCase()
    if (!q) return computed
    return computed.filter((c) => `${c.entry.name} ${c.entry.barcode} ${c.entry.batch}`.toLowerCase().includes(q))
  }, [computed, listQuery])
  const okRows = computed.filter((c) => c.calc.ok)
  const avgPercent = okRows.length ? okRows.reduce((n, c) => n + c.calc.percentOff, 0) / okRows.length : 0
  const size = LABEL_SIZES.find((s) => s.id === sizeId) ?? LABEL_SIZES[0]

  const toItem = (c: (typeof computed)[number]): DiscountLabelItem => ({
    barcode: c.entry.barcode, name: c.entry.name, original: c.calc.original, final: c.calc.final,
    percentOff: c.calc.percentOff, batch: c.entry.batch || undefined,
  })

  const previewEntry = computed.find((c) => c.entry.id === previewId && c.calc.ok) ?? computed.find((c) => c.calc.ok) ?? null
  const previewTspl = useMemo(
    () => (previewEntry ? generateDiscountTspl([toItem(previewEntry)], 1, { widthMm: size.widthMm, heightMm: size.heightMm }, size.profile as any) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewEntry, size],
  )

  const print = async () => {
    if (!isTauri()) return setStatus({ ok: false, text: "Printing works in the desktop app only." })
    if (!printer) return setStatus({ ok: false, text: "Choose a printer first." })
    if (entries.length === 0) return setStatus({ ok: false, text: "The print list is empty." })
    if (problemCount > 0) return setStatus({ ok: false, text: `Fix the ${problemCount} product${problemCount === 1 ? "" : "s"} marked in red first.` })
    if (totalLabels > MAX_TOTAL) return setStatus({ ok: false, text: `That is ${totalLabels} labels - the most for one print is ${MAX_TOTAL}.` })
    if (totalLabels > 300 && !window.confirm(`Print ${totalLabels} labels?`)) return
    setPrinting(true)
    setStatus(null)
    try {
      const items = computed.flatMap((c) => Array.from({ length: c.entry.qty }, () => toItem(c)))
      const commands = generateDiscountTspl(items, 1, { widthMm: size.widthMm, heightMm: size.heightMm }, size.profile as any)
      const result = await invoke<{ status: string; message: string }>("send_tspl_to_printer", { printerName: printer, tsplCommands: commands })
      if (result.status !== "success") throw new Error(result.message || "The printer did not accept the job")
      setStatus({ ok: true, text: `Sent ${totalLabels} label${totalLabels === 1 ? "" : "s"} (${entries.length} product${entries.length === 1 ? "" : "s"}) to ${printer}.` })
    } catch (e: any) {
      setStatus({ ok: false, text: `Could not print: ${e?.message ?? e}` })
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => setAddOpen(true)}>
        <Plus className="mr-2 h-4 w-4" /> Add products with a discount
      </Button>
      <Button variant="outline" onClick={() => { setStatus(null); setPrintOpen(true) }} disabled={entries.length === 0}>
        <Printer className="mr-2 h-4 w-4" /> Print labels{entries.length > 0 ? ` (${totalLabels})` : ""}
      </Button>
      <span className="text-sm text-muted-foreground">
        {entries.length} product{entries.length === 1 ? "" : "s"} with a discount below. Change a discount, label count or remove a product right in the list.
      </span>
    </div>

    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add products and set their discount</DialogTitle>
          <DialogDescription>
            Choose the discount, then scan or click products. Each one is added to the list behind this window with that discount.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-3">
              <ModeSwitch value={defMode} onChange={(m) => setDefMode(m as "percent" | "amount")} modes={["percent", "amount"]} />
              <Input
                className="w-32"
                inputMode="decimal"
                value={defValue}
                onChange={(e) => setDefValue(e.target.value)}
                placeholder={defMode === "percent" ? "e.g. 20" : "e.g. 100"}
                aria-label="Discount for products you add next"
              />
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={roundWhole} onChange={(e) => setRoundWhole(e.target.checked)} />
                Round new price to whole rupees
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Every product you add starts with this discount. You can change any product's discount afterwards in the list.
            </p>
        </div>
        <div className="space-y-3">
          <Input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Scan a barcode, or type a name, price or batch..."
          />
          <div className="flex flex-wrap items-center gap-2">
            {([["all", "All products"], ["in", "With a discount"], ["not", "Without a discount"]] as const).map(([k, label]) => (
              <Button key={k} type="button" size="sm" variant={pickFilter === k ? "default" : "outline"} onClick={() => setPickFilter(k)}>
                {label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {isLoading || isStreaming
              ? `Loading products... ${products.length}${totalCount ? ` of ${totalCount}` : ""}`
              : query.trim()
                ? `${matches.length} match${matches.length === 1 ? "" : "es"}. Scan + Enter adds it; click a row to add it.`
                : `${products.length} products, newest first. Scan or type to find one, click a row to add it.`}
          </p>
          <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
            {query.trim() && results.length === 0 && !isLoading && !isStreaming && (
              <p className="py-6 text-center text-sm text-muted-foreground">No product matches “{query.trim()}”.</p>
            )}
            {results.map((r) => {
              const inList = entries.find((e) => e.id === String(r.product.id))
              return (
                <button
                  key={r.product.id}
                  type="button"
                  onClick={() => addProduct(r)}
                  className={`w-full rounded-md border p-2 text-left transition hover:bg-accent ${inList ? "border-primary/60 bg-accent/60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium leading-tight">{r.name}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">₹{formatMoney(r.price)}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono">{r.barcodes[0] ?? "no barcode"}</span>
                    {r.batch && <span>Batch {r.batch}</span>}
                    <span>Stock {r.stock}</span>
                    {inList ? <Badge variant="secondary">Discount set · {inList.valueText ? (inList.mode === "percent" ? `${inList.valueText}%` : inList.mode === "amount" ? `₹${inList.valueText} off` : `₹${inList.valueText}`) : "no value yet"}</Badge> : <span className="ml-auto font-medium text-primary">{newPriceHint(r.price)}</span>}
                  </div>
                </button>
              )
            })}
            {matches.length > results.length && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setShown((n) => n + 100)}>
                Show 100 more ({matches.length - results.length} left)
              </Button>
            )}
          </div>
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {entries.length} product{entries.length === 1 ? "" : "s"} in the discount list{notice ? ` · ${notice}` : ""}
          </span>
          <Button onClick={() => setAddOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { label: "Products with a discount", value: String(entries.length), warn: false },
        { label: "Labels to print", value: String(totalLabels), warn: false },
        { label: "Average discount", value: okRows.length ? `${formatMoney(avgPercent)}%` : "–", warn: false },
        { label: "Need attention", value: String(problemCount), warn: problemCount > 0 },
      ].map((t) => (
        <div key={t.label} className="rounded-lg border bg-card px-4 py-3">
          <div className="text-xs text-muted-foreground">{t.label}</div>
          <div className={`text-2xl font-semibold tabular-nums ${t.warn ? "text-red-600" : ""}`}>{t.value}</div>
        </div>
      ))}
    </div>

    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">
          Products with a discount{" "}
          <span className="font-normal text-muted-foreground">
            · {entries.length} product{entries.length === 1 ? "" : "s"} · {totalLabels} label{totalLabels === 1 ? "" : "s"}
          </span>
        </CardTitle>
        <div className="flex items-center gap-3">
          {entries.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="h-9 w-56 pl-8" value={listQuery} onChange={(e) => setListQuery(e.target.value)} placeholder="Search this list..." />
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={clearList} disabled={entries.length === 0} className="text-red-600 hover:text-red-700">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear list
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t bg-muted/20 px-4 py-2.5">
            <span className="text-sm font-medium">Same discount for every product:</span>
            <ModeSwitch value={bulkMode} onChange={(m) => setBulkMode(m as "percent" | "amount")} modes={["percent", "amount"]} />
            <Input className="h-8 w-24" inputMode="decimal" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
              placeholder={bulkMode === "percent" ? "20" : "100"} aria-label="One discount for every product in the list" />
            <Button variant="outline" size="sm" onClick={applyToAll} disabled={!bulkValue.trim()}>
              Apply to all {entries.length}
            </Button>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={roundWhole} onChange={(e) => setRoundWhole(e.target.checked)} />
              Round new price to whole rupees
            </label>
          </div>
        )}
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <Tag className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No products have a discount yet</p>
              <p className="text-sm text-muted-foreground">Pick the products and the discount, and they show up here ready to print.</p>
            </div>
            <Button onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add products with a discount</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 font-medium">Discount</th>
                  <th className="px-2 py-2 font-medium">New price</th>
                  <th className="px-2 py-2 text-center font-medium">Labels</th>
                  <th className="w-10 px-2 py-2" aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No product in the list matches this search.</td></tr>
                )}
                {visibleRows.map(({ entry: e, original, calc }) => (
                  <tr
                    key={e.id}
                    onClick={() => setPreviewId(e.id)}
                    className={`cursor-pointer border-b align-top ${previewEntry?.entry.id === e.id ? "bg-accent/50" : "hover:bg-muted/30"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium leading-tight">{e.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {e.barcode} {e.batch && <span className="font-sans">· Batch {e.batch}</span>}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">Selling price ₹{formatMoney(original)}</div>
                    </td>
                    <td className="px-2 py-3" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex flex-wrap items-center gap-2">
                        <ModeSwitch value={e.mode} onChange={(m) => patchEntry(e.id, { mode: m })} modes={["percent", "amount", "final"]} />
                        <Input
                          className={`h-8 w-24 ${!calc.ok && e.valueText.trim() ? "border-red-400" : ""}`}
                          inputMode="decimal"
                          value={e.valueText}
                          onChange={(ev) => patchEntry(e.id, { valueText: ev.target.value })}
                          placeholder={e.mode === "percent" ? "20" : e.mode === "amount" ? "100" : "349"}
                          aria-label={`Discount for ${e.name}`}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      {calc.ok ? (
                        <>
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs text-muted-foreground line-through tabular-nums">₹{formatMoney(calc.original)}</span>
                            <span className="font-bold text-green-700 tabular-nums">₹{formatMoney(calc.final)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">{formatMoney(calc.percentOff)}% off · ₹{formatMoney(calc.amountOff)} less</div>
                        </>
                      ) : (
                        <span className="text-xs text-red-600">{calc.error}</span>
                      )}
                    </td>
                    <td className="px-2 py-3" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="One fewer label"
                          onClick={() => patchEntry(e.id, { qty: clampQty(e.qty - 1) })} disabled={e.qty <= 1}>
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <Input
                          className="h-8 w-14 text-center"
                          inputMode="numeric"
                          value={e.qty}
                          onChange={(ev) => patchEntry(e.id, { qty: clampQty(Number(ev.target.value.replace(/\D/g, ""))) })}
                          aria-label={`Number of labels for ${e.name}`}
                        />
                        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="One more label"
                          onClick={() => patchEntry(e.id, { qty: clampQty(e.qty + 1) })} disabled={e.qty >= MAX_QTY}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-2 py-3" onClick={(ev) => ev.stopPropagation()}>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700"
                        onClick={() => removeEntry(e.id)} aria-label={`Remove ${e.name}`} title="Remove from the list">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>

    <Dialog open={printOpen} onOpenChange={setPrintOpen}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Print discount labels</DialogTitle>
          <DialogDescription>
            {entries.length} product{entries.length === 1 ? "" : "s"} · {totalLabels} label{totalLabels === 1 ? "" : "s"}. Choose the label size and printer, check the preview, then print.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        <div className="space-y-2">
          <Label>Label preview {previewEntry && <span className="font-normal text-muted-foreground">· {previewEntry.entry.name}</span>}</Label>
          {previewEntry ? (
            <LabelPreview tspl={previewTspl} sizeId={sizeId} />
          ) : (
            <div className="flex h-24 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
              The label appears here once a product has a valid discount.
            </div>
          )}
        </div>

        {problemCount > 0 && (
          <p className="text-sm text-red-600">{problemCount} product{problemCount === 1 ? "" : "s"} in the list need a valid discount first.</p>
        )}
        {status && <p className={`text-sm ${status.ok ? "text-green-700" : "text-red-600"}`}>{status.text}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => setPrintOpen(false)}>Close</Button>
          <Button onClick={print} disabled={printing || entries.length === 0 || problemCount > 0}>
            <Printer className="mr-2 h-4 w-4" />
            {printing ? "Printing..." : `Print ${totalLabels} label${totalLabels === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
  )
}
