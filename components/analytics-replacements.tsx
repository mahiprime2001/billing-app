'use client'

import { Fragment, useMemo, useState } from 'react'
import { addDays, addMonths, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import * as XLSX from 'xlsx'
import {
  Ban,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  IndianRupee,
  Percent,
  Repeat2,
  Search,
  ShoppingBag,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { AXIS_PROPS, GRID_STROKE, LEGEND_PROPS, MetricCard, TabSkeleton } from '@/components/analytics-ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

// Cancelled bills and replacement bills, from the bills the Analytics page already
// loads (GET /api/bills). A replacement bill is the NEW bill that replaced an item
// from an earlier bill (replacementOriginalBillId points at that original).

type Kind = 'cancelled' | 'replacement'

const KIND_META: Record<Kind, { label: string; badge: string; color: string }> = {
  cancelled: { label: 'Cancelled', badge: 'border-rose-200 bg-rose-50 text-rose-800', color: '#ef4444' },
  replacement: { label: 'Replacement', badge: 'border-indigo-200 bg-indigo-50 text-indigo-800', color: '#4f46e5' },
}

const PANEL_CARD_CLASS = 'rounded-2xl border-slate-200/70 bg-white shadow-sm'
const PAGE_SIZE = 10

interface ItemRow {
  name: string
  quantity: number
  price: number
  total: number
}

interface ReplacementItemRow {
  replacedName: string
  replacedBarcode: string
  newName: string
  newBarcode: string
  quantity: number
  credit: number
  newAmount: number
  difference: number
  reason: string
}

interface BillRow {
  id: string
  storeId: string
  storeName: string
  kind: Kind
  createdAt: Date
  amount: number
  difference: number
  replacedQuantity: number
  items: ItemRow[]
  replacementItems: ReplacementItemRow[]
  originalBillId: string
  originalCreatedAt: Date | null
  originalTotal: number | null
  productNames: string[]
}

interface StoreOption {
  id: string
  name: string
}

export interface AnalyticsReplacementsProps {
  bills: any[]
  cancelledBills: any[]
  stores: StoreOption[]
  selectedStore: string
  rangeFrom: string
  rangeTo: string
  loading: boolean
}

const num = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const inr = (value: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)
const integer = (value: number): string => new Intl.NumberFormat('en-IN').format(value || 0)
const pct = (part: number, whole: number): string => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '0%')

const parseDate = (value: unknown): Date | null => {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function buildRows(bills: any[], cancelledBills: any[], stores: StoreOption[]) {
  const storeNames = new Map(stores.map((store) => [store.id, store.name]))
  const everyBill = [...bills, ...cancelledBills]
  const byId = new Map<string, any>(everyBill.map((bill) => [String(bill?.id ?? ''), bill]))
  const rows: BillRow[] = []

  const toRow = (bill: any, kind: Kind): BillRow | null => {
    const id = String(bill?.id ?? '').trim()
    const createdAt = parseDate(bill?.createdAt ?? bill?.created_at ?? bill?.timestamp)
    if (!id || !createdAt) return null
    const storeId = String(bill?.storeId ?? bill?.storeid ?? '').trim()
    const originalBillId = String(bill?.replacementOriginalBillId ?? '').trim()
    const original = originalBillId ? byId.get(originalBillId) : undefined
    const items: ItemRow[] = (Array.isArray(bill?.items) ? bill.items : [])
      .filter((item: any) => !item?.isReplacementItem && !item?.is_replacement_item)
      .map((item: any) => ({
        name: String(item?.productName ?? item?.product_name ?? 'Unknown product'),
        quantity: num(item?.quantity),
        price: num(item?.price),
        total: num(item?.total ?? num(item?.price) * num(item?.quantity)),
      }))
    const replacementItems: ReplacementItemRow[] = (Array.isArray(bill?.replacementItems) ? bill.replacementItems : []).map((item: any) => ({
      replacedName: String(item?.replacedProductName ?? 'Unknown product'),
      replacedBarcode: String(item?.replacedProductBarcode ?? ''),
      newName: String(item?.newProductName ?? 'Unknown product'),
      newBarcode: String(item?.newProductBarcode ?? ''),
      quantity: num(item?.quantity),
      credit: num(item?.creditAmount),
      newAmount: num(item?.newAmount),
      difference: num(item?.finalAmount ?? item?.storedFinalAmount),
      reason: String(item?.damageReason ?? '').trim(),
    }))
    return {
      id,
      storeId,
      storeName: String(bill?.storeName ?? storeNames.get(storeId) ?? 'Unknown store'),
      kind,
      createdAt,
      amount: num(bill?.total),
      difference: num(bill?.replacementFinalAmount),
      replacedQuantity: num(bill?.replacementQuantity) || replacementItems.reduce((sum, item) => sum + item.quantity, 0),
      items,
      replacementItems,
      originalBillId,
      originalCreatedAt: original ? parseDate(original?.createdAt ?? original?.created_at ?? original?.timestamp) : null,
      originalTotal: original ? num(original?.total) : null,
      productNames: Array.from(new Set([...replacementItems.map((item) => item.newName), ...items.map((item) => item.name)])),
    }
  }

  for (const bill of cancelledBills) {
    const row = toRow(bill, 'cancelled')
    if (row) rows.push(row)
  }
  for (const bill of bills) {
    if (!bill?.isReplacement) continue
    const row = toRow(bill, 'replacement')
    if (row) rows.push(row)
  }
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const everyBillMeta = everyBill
    .map((bill) => ({ createdAt: parseDate(bill?.createdAt ?? bill?.created_at ?? bill?.timestamp), storeId: String(bill?.storeId ?? bill?.storeid ?? '').trim() }))
    .filter((bill): bill is { createdAt: Date; storeId: string } => bill.createdAt !== null)

  return { rows, everyBillMeta }
}

type Granularity = 'day' | 'week' | 'month'
const pickGranularity = (from: Date, to: Date): Granularity => {
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
  return days <= 35 ? 'day' : days <= 140 ? 'week' : 'month'
}
const bucketStart = (date: Date, granularity: Granularity): Date =>
  granularity === 'week'
    ? startOfWeek(date, { weekStartsOn: 1 })
    : granularity === 'month'
      ? startOfMonth(date)
      : new Date(date.getFullYear(), date.getMonth(), date.getDate())

function ChartTip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-slate-900">{row.fullLabel}</p>
      <p className="text-rose-700">Cancelled: {integer(row.cancelled)} ({inr(row.cancelledAmount)})</p>
      <p className="text-indigo-700">Replacements: {integer(row.replacements)}</p>
    </div>
  )
}

function KindBadge({ kind }: { kind: Kind }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${KIND_META[kind].badge}`}>
      {KIND_META[kind].label}
    </span>
  )
}

export default function AnalyticsReplacements({ bills, cancelledBills, stores, selectedStore, rangeFrom, rangeTo, loading }: AnalyticsReplacementsProps) {
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | Kind>('all')
  const [page, setPage] = useState(0)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const isSingleStore = selectedStore !== 'all'
  const { rows: allRows, everyBillMeta } = useMemo(() => buildRows(bills, cancelledBills, stores), [bills, cancelledBills, stores])

  const inScope = (createdAt: Date, storeId: string) => {
    const key = format(createdAt, 'yyyy-MM-dd')
    if (key < rangeFrom || key > rangeTo) return false
    return !isSingleStore || storeId === selectedStore
  }

  const rows = useMemo(() => allRows.filter((row) => inScope(row.createdAt, row.storeId)), [allRows, rangeFrom, rangeTo, isSingleStore, selectedStore])
  const totalBills = useMemo(() => everyBillMeta.filter((bill) => inScope(bill.createdAt, bill.storeId)).length, [everyBillMeta, rangeFrom, rangeTo, isSingleStore, selectedStore])

  const totals = useMemo(() => {
    const acc = { cancelled: 0, cancelledAmount: 0, replacements: 0, replacedQty: 0, replacementItems: 0, difference: 0 }
    for (const row of rows) {
      if (row.kind === 'cancelled') {
        acc.cancelled += 1
        acc.cancelledAmount += row.amount
      } else {
        acc.replacements += 1
        acc.replacedQty += row.replacedQuantity
        acc.replacementItems += row.replacementItems.length
        acc.difference += row.difference
      }
    }
    return acc
  }, [rows])

  const series = useMemo(() => {
    const from = parseISO(rangeFrom)
    const to = parseISO(rangeTo)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return []
    const granularity = pickGranularity(from, to)
    const buckets = new Map<string, { label: string; fullLabel: string; cancelled: number; cancelledAmount: number; replacements: number }>()
    let cursor = bucketStart(from, granularity)
    for (let step = 0; cursor <= to && step < 400; step += 1) {
      buckets.set(format(cursor, 'yyyy-MM-dd'), {
        label: granularity === 'month' ? format(cursor, 'MMM yy') : format(cursor, 'dd MMM'),
        fullLabel: granularity === 'day' ? format(cursor, 'EEE, dd MMM yyyy') : granularity === 'week' ? `Week of ${format(cursor, 'dd MMM yyyy')}` : format(cursor, 'MMMM yyyy'),
        cancelled: 0,
        cancelledAmount: 0,
        replacements: 0,
      })
      cursor = granularity === 'day' ? addDays(cursor, 1) : granularity === 'week' ? addDays(cursor, 7) : addMonths(cursor, 1)
    }
    for (const row of rows) {
      const bucket = buckets.get(format(bucketStart(row.createdAt, granularity), 'yyyy-MM-dd'))
      if (!bucket) continue
      if (row.kind === 'cancelled') {
        bucket.cancelled += 1
        bucket.cancelledAmount += row.amount
      } else {
        bucket.replacements += 1
      }
    }
    return Array.from(buckets.values())
  }, [rows, rangeFrom, rangeTo])

  const topReplaced = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; bills: Set<string>; credit: number }>()
    for (const row of rows) {
      for (const item of row.replacementItems) {
        const entry = map.get(item.replacedName) || { name: item.replacedName, quantity: 0, bills: new Set<string>(), credit: 0 }
        entry.quantity += item.quantity
        entry.credit += item.credit
        entry.bills.add(row.id)
        map.set(item.replacedName, entry)
      }
    }
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 8)
  }, [rows])

  const storeData = useMemo(() => {
    const map = new Map<string, { id: string; name: string; cancelled: number; cancelledAmount: number; replacements: number; replacedQty: number }>()
    for (const row of rows) {
      const entry = map.get(row.storeId) || { id: row.storeId, name: row.storeName, cancelled: 0, cancelledAmount: 0, replacements: 0, replacedQty: 0 }
      if (row.kind === 'cancelled') {
        entry.cancelled += 1
        entry.cancelledAmount += row.amount
      } else {
        entry.replacements += 1
        entry.replacedQty += row.replacedQuantity
      }
      map.set(row.storeId, entry)
    }
    const billsByStore = new Map<string, number>()
    for (const bill of everyBillMeta) if (inScope(bill.createdAt, bill.storeId)) billsByStore.set(bill.storeId, (billsByStore.get(bill.storeId) || 0) + 1)
    return Array.from(map.values())
      .map((entry) => ({ ...entry, bills: billsByStore.get(entry.id) || 0 }))
      .sort((a, b) => b.cancelled + b.replacements - (a.cancelled + a.replacements))
  }, [rows, everyBillMeta, rangeFrom, rangeTo, isSingleStore, selectedStore])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (kindFilter !== 'all' && row.kind !== kindFilter) return false
      if (!query) return true
      return (
        row.id.toLowerCase().includes(query) ||
        row.storeName.toLowerCase().includes(query) ||
        row.originalBillId.toLowerCase().includes(query) ||
        row.productNames.some((name) => name.toLowerCase().includes(query)) ||
        row.replacementItems.some((item) => item.replacedName.toLowerCase().includes(query))
      )
    })
  }, [rows, search, kindFilter])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = filteredRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const exportRows = () => {
    const sheet = XLSX.utils.json_to_sheet(
      filteredRows.flatMap((row): Record<string, string | number>[] => {
        const base = { Date: format(row.createdAt, 'dd MMM yyyy hh:mm a'), Bill: row.id, Store: row.storeName, Type: KIND_META[row.kind].label, 'Bill total': row.amount }
        if (row.kind === 'cancelled' || row.replacementItems.length === 0) {
          return [{ ...base, 'Replaces bill': '', 'Replaced product': '', 'New product': '', Quantity: row.items.reduce((sum, item) => sum + item.quantity, 0), Credit: '', Difference: '' }]
        }
        return row.replacementItems.map((item) => ({
          ...base,
          'Replaces bill': row.originalBillId,
          'Replaced product': item.replacedName,
          'New product': item.newName,
          Quantity: item.quantity,
          Credit: item.credit,
          Difference: item.difference,
        }))
      }),
    )
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Cancelled and replacements')
    XLSX.writeFile(book, `cancelled-replacements_${rangeFrom}_to_${rangeTo}.xlsx`)
  }

  if (loading && allRows.length === 0) return <TabSkeleton cards={6} label="Loading bills..." />

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard title="Cancelled bills" value={integer(totals.cancelled)} subtitle={`${pct(totals.cancelled, totalBills)} of all bills`} icon={<Ban className="h-4 w-4" />} accent="rose" />
        <MetricCard title="Cancelled amount" value={inr(totals.cancelledAmount)} subtitle={`${inr(totals.cancelled > 0 ? totals.cancelledAmount / totals.cancelled : 0)} per bill`} icon={<IndianRupee className="h-4 w-4" />} accent="amber" />
        <MetricCard title="Replacement bills" value={integer(totals.replacements)} subtitle={`${pct(totals.replacements, totalBills)} of all bills`} icon={<Repeat2 className="h-4 w-4" />} accent="blue" />
        <MetricCard title="Items replaced" value={integer(totals.replacedQty)} subtitle={`${integer(totals.replacementItems)} replacement lines`} icon={<ShoppingBag className="h-4 w-4" />} accent="violet" />
        <MetricCard title="Replacement difference" value={inr(totals.difference)} subtitle="net paid on replacement bills" icon={<IndianRupee className="h-4 w-4" />} accent="emerald" />
        <MetricCard title="Affected bills" value={pct(totals.cancelled + totals.replacements, totalBills)} subtitle={`${integer(totals.cancelled + totals.replacements)} of ${integer(totalBills)} bills`} icon={<Percent className="h-4 w-4" />} accent="sky" />
      </div>
      <p className="text-xs text-slate-500">
        Cancelled bills, and bills where a replacement was done. A replacement bill shows the original bill it replaced. Dates follow the range picked above.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={`${PANEL_CARD_CLASS} lg:col-span-2`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold text-slate-900">Cancelled and replacement bills over time</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-500">No cancelled or replacement bills in this period.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
                    <XAxis {...AXIS_PROPS} dataKey="label" interval="preserveStartEnd" />
                    <YAxis {...AXIS_PROPS} width={36} allowDecimals={false} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: '#f1f5f9' }} />
                    <Legend {...LEGEND_PROPS} />
                    <Bar dataKey="cancelled" name="Cancelled" fill={KIND_META.cancelled.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="replacements" name="Replacement" fill={KIND_META.replacement.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={PANEL_CARD_CLASS}>
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold text-slate-900">Most replaced products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topReplaced.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No replacements in this period.</p>
            ) : (
              topReplaced.map((product) => (
                <div key={product.name}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-700" title={product.name}>{product.name}</span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {integer(product.quantity)} <span className="text-xs font-normal text-slate-500">units</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(product.quantity / topReplaced[0].quantity) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {!isSingleStore && storeData.length > 0 && (
        <Card className={PANEL_CARD_CLASS}>
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold text-slate-900">By store</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store</TableHead>
                    <TableHead className="text-right">All bills</TableHead>
                    <TableHead className="text-right">Cancelled</TableHead>
                    <TableHead className="text-right">Cancelled amount</TableHead>
                    <TableHead className="text-right">Replacement bills</TableHead>
                    <TableHead className="text-right">Items replaced</TableHead>
                    <TableHead className="text-right">Affected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storeData.map((store) => (
                    <TableRow key={store.id || store.name}>
                      <TableCell className="font-medium">{store.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{integer(store.bills)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${store.cancelled > 0 ? 'font-medium text-rose-700' : ''}`}>{integer(store.cancelled)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(store.cancelledAmount)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${store.replacements > 0 ? 'font-medium text-indigo-700' : ''}`}>{integer(store.replacements)}</TableCell>
                      <TableCell className="text-right tabular-nums">{integer(store.replacedQty)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(store.cancelled + store.replacements, store.bills)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className={PANEL_CARD_CLASS}>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-[15px] font-semibold text-slate-900">
              Cancelled and replacement bills{' '}
              <span className="font-normal text-slate-500">
                ({integer(filteredRows.length)}
                {filteredRows.length !== rows.length ? ` of ${integer(rows.length)}` : ''})
              </span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(0)
                  }}
                  placeholder="Search bill #, store or product"
                  className="h-9 w-64 pl-8"
                />
              </div>
              <Select
                value={kindFilter}
                onValueChange={(value) => {
                  setKindFilter(value as 'all' | Kind)
                  setPage(0)
                }}
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="replacement">Replacement</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-9" onClick={exportRows} disabled={filteredRows.length === 0}>
                <Download className="mr-1.5 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Date</TableHead>
                  <TableHead>Bill #</TableHead>
                  {!isSingleStore && <TableHead>Store</TableHead>}
                  <TableHead>Type</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Bill total</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isSingleStore ? 7 : 8} className="py-10 text-center text-sm text-slate-500">
                      {rows.length === 0 ? 'No cancelled or replacement bills in this period.' : 'No bills match your search.'}
                    </TableCell>
                  </TableRow>
                )}
                {pageRows.map((row) => {
                  const key = `${row.kind}-${row.id}`
                  const isOpen = expandedKey === key
                  const extra = Math.max(0, row.productNames.length - 2)
                  return (
                    <Fragment key={key}>
                      <TableRow className="cursor-pointer" onClick={() => setExpandedKey(isOpen ? null : key)} aria-expanded={isOpen}>
                        <TableCell className="pr-0">
                          <button
                            type="button"
                            aria-label={isOpen ? 'Hide bill details' : 'Show bill details'}
                            className="rounded p-0.5 text-slate-500 hover:bg-slate-100"
                            onClick={(event) => {
                              event.stopPropagation()
                              setExpandedKey(isOpen ? null : key)
                            }}
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(row.createdAt, 'dd MMM yyyy')}
                          <span className="block text-xs text-slate-500">{format(row.createdAt, 'hh:mm a')}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.id}
                          {row.kind === 'replacement' && row.originalBillId && <span className="block text-slate-500">replaces {row.originalBillId}</span>}
                        </TableCell>
                        {!isSingleStore && <TableCell className="text-sm">{row.storeName}</TableCell>}
                        <TableCell>
                          <KindBadge kind={row.kind} />
                        </TableCell>
                        <TableCell className="max-w-[260px] text-sm">
                          <span className="block truncate" title={row.productNames.join(', ')}>
                            {row.productNames.slice(0, 2).join(', ') || '—'}
                          </span>
                          {extra > 0 && <span className="text-xs text-slate-500">+{extra} more</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{inr(row.amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.kind === 'replacement' ? inr(row.difference) : '—'}</TableCell>
                      </TableRow>

                      {isOpen && (
                        <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                          <TableCell />
                          <TableCell colSpan={isSingleStore ? 6 : 7} className="py-3">
                            {row.kind === 'replacement' ? (
                              <div className="space-y-2">
                                {row.originalBillId && (
                                  <p className="text-xs text-slate-600">
                                    Replaces bill <span className="font-mono font-medium text-slate-800">{row.originalBillId}</span>
                                    {row.originalCreatedAt && <> from {format(row.originalCreatedAt, 'dd MMM yyyy')}</>}
                                    {row.originalTotal !== null && <> (total {inr(row.originalTotal)})</>}
                                  </p>
                                )}
                                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Replaced product</TableHead>
                                        <TableHead>New product</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Credit</TableHead>
                                        <TableHead className="text-right">New price</TableHead>
                                        <TableHead className="text-right">Difference</TableHead>
                                        <TableHead>Reason</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {row.replacementItems.length === 0 && (
                                        <TableRow>
                                          <TableCell colSpan={7} className="py-4 text-center text-sm text-slate-500">
                                            No replacement line details on this bill.
                                          </TableCell>
                                        </TableRow>
                                      )}
                                      {row.replacementItems.map((item, index) => (
                                        <TableRow key={index}>
                                          <TableCell className="text-sm">
                                            <span className="font-medium">{item.replacedName}</span>
                                            {item.replacedBarcode && <span className="block font-mono text-xs text-slate-500">{item.replacedBarcode}</span>}
                                          </TableCell>
                                          <TableCell className="text-sm">
                                            <span className="font-medium">{item.newName}</span>
                                            {item.newBarcode && <span className="block font-mono text-xs text-slate-500">{item.newBarcode}</span>}
                                          </TableCell>
                                          <TableCell className="text-right tabular-nums">{integer(item.quantity)}</TableCell>
                                          <TableCell className="text-right tabular-nums">{inr(item.credit)}</TableCell>
                                          <TableCell className="text-right tabular-nums">{inr(item.newAmount)}</TableCell>
                                          <TableCell className="text-right font-medium tabular-nums">{inr(item.difference)}</TableCell>
                                          <TableCell className="text-xs text-slate-600">{item.reason || '—'}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Product</TableHead>
                                      <TableHead className="text-right">Qty</TableHead>
                                      <TableHead className="text-right">Price</TableHead>
                                      <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {row.items.length === 0 && (
                                      <TableRow>
                                        <TableCell colSpan={4} className="py-4 text-center text-sm text-slate-500">
                                          No item details on this cancelled bill.
                                        </TableCell>
                                      </TableRow>
                                    )}
                                    {row.items.map((item, index) => (
                                      <TableRow key={index}>
                                        <TableCell className="text-sm font-medium">{item.name}</TableCell>
                                        <TableCell className="text-right tabular-nums">{integer(item.quantity)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{inr(item.price)}</TableCell>
                                        <TableCell className="text-right font-medium tabular-nums">{inr(item.total)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {filteredRows.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
              <span className="text-slate-600">
                Page {safePage + 1} of {pageCount}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <Button variant="outline" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
