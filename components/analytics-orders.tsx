'use client'

import { Fragment, useMemo, useState } from 'react'
import { addDays, addMonths, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import * as XLSX from 'xlsx'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  IndianRupee,
  Loader2,
  PackageCheck,
  Search,
  Send,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { API_BASE } from '@/lib/api-base'
import { AXIS_PROPS, GRID_STROKE, MetricCard, TOOLTIP_PROPS, TabSkeleton } from '@/components/analytics-ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type OrderStatus = 'pending' | 'in_progress' | 'completed' | 'closed_with_issues' | 'other'

const STATUS_META: Record<OrderStatus, { label: string; color: string; badge: string }> = {
  pending: {
    label: 'Pending',
    color: '#f59e0b',
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  in_progress: {
    label: 'In progress',
    color: '#4f46e5',
    badge: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  },
  completed: {
    label: 'Completed',
    color: '#10b981',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  closed_with_issues: {
    label: 'Closed with issues',
    color: '#ef4444',
    badge: 'border-rose-200 bg-rose-50 text-rose-800',
  },
  other: {
    label: 'Other',
    color: '#94a3b8',
    badge: 'border-slate-200 bg-slate-50 text-slate-700',
  },
}

const PANEL_CARD_CLASS = 'border-slate-200/80 shadow-sm bg-white/90 backdrop-blur'
const PAGE_SIZE = 10

interface OrderRow {
  id: string
  storeId: string
  storeName: string
  status: OrderStatus
  createdAt: Date
  units: number
  verified: number
  damaged: number
  wrongStore: number
  missing: number
  itemCount: number
  value: number
  products: string[]
}

interface DetailItem {
  id: string
  name: string
  barcode: string
  batch: string
  sent: number
  received: number
  damaged: number
  wrongStore: number
  missing: number
  unitPrice: number
}

interface DetailState {
  loading: boolean
  error: boolean
  items: DetailItem[]
}

interface StoreOption {
  id: string
  name: string
}

export interface AnalyticsOrdersProps {
  orders: any[]
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
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)

const inrCompact = (value: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0)

const integer = (value: number): string => new Intl.NumberFormat('en-IN').format(value || 0)

const percent = (part: number, whole: number): number =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0

const shortId = (id: string): string => `#${id.replace(/-/g, '').slice(-6).toUpperCase()}`

function normalizeOrders(raw: any[], stores: StoreOption[]): OrderRow[] {
  const storeNames = new Map(stores.map((store) => [store.id, store.name]))
  const rows: OrderRow[] = []

  for (const order of raw) {
    const id = String(order?.id ?? '').trim()
    if (!id) continue

    const created = order?.createdAt ?? order?.created_at
    const createdAt = created ? new Date(created) : null
    if (!createdAt || Number.isNaN(createdAt.getTime())) continue

    const storeId = String(order?.storeId ?? order?.store_id ?? '').trim()
    const rawStatus = String(order?.status ?? 'pending').trim().toLowerCase()
    const status: OrderStatus =
      rawStatus === 'pending' ||
      rawStatus === 'in_progress' ||
      rawStatus === 'completed' ||
      rawStatus === 'closed_with_issues'
        ? rawStatus
        : 'other'

    const productList: any[] = Array.isArray(order?.productList)
      ? order.productList
      : Array.isArray(order?.product_list)
        ? order.product_list
        : []

    rows.push({
      id,
      storeId,
      storeName: storeNames.get(storeId) || 'Unknown store',
      status,
      createdAt,
      units: num(order?.assignedQtyTotal ?? order?.assigned_qty_total),
      verified: num(order?.verifiedQtyTotal ?? order?.verified_qty_total),
      damaged: num(order?.damagedQtyTotal ?? order?.damaged_qty_total),
      wrongStore: num(order?.wrongStoreQtyTotal ?? order?.wrong_store_qty_total),
      missing: num(order?.missingQtyTotal ?? order?.missing_qty_total),
      itemCount: num(order?.itemCount ?? order?.item_count),
      value: num(order?.totalValue ?? order?.total_value),
      products: productList
        .map((product) => String(product?.name ?? '').trim())
        .filter(Boolean),
    })
  }

  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

type Granularity = 'day' | 'week' | 'month'

const pickGranularity = (from: Date, to: Date): Granularity => {
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
  if (days <= 35) return 'day'
  if (days <= 140) return 'week'
  return 'month'
}

const bucketStart = (date: Date, granularity: Granularity): Date => {
  if (granularity === 'week') return startOfWeek(date, { weekStartsOn: 1 })
  if (granularity === 'month') return startOfMonth(date)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

const bucketLabel = (date: Date, granularity: Granularity): string =>
  granularity === 'month' ? format(date, 'MMM yy') : format(date, 'dd MMM')

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-slate-900">{row.fullLabel || label}</p>
      <p className="text-slate-700">Value: {inr(row.value)}</p>
      <p className="text-slate-700">Orders: {integer(row.orders)}</p>
      <p className="text-slate-700">Units: {integer(row.units)}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${meta.badge}`}
    >
      {meta.label}
    </span>
  )
}

function ProgressBar({ part, whole }: { part: number; whole: number }) {
  const pct = percent(part, whole)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-600 tabular-nums">
        {integer(part)}/{integer(whole)}
      </span>
    </div>
  )
}

export default function AnalyticsOrders({
  orders,
  stores,
  selectedStore,
  rangeFrom,
  rangeTo,
  loading,
}: AnalyticsOrdersProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, DetailState>>({})

  const isSingleStore = selectedStore !== 'all'

  const allRows = useMemo(() => normalizeOrders(orders, stores), [orders, stores])

  const rows = useMemo(
    () =>
      allRows.filter((row) => {
        const key = format(row.createdAt, 'yyyy-MM-dd')
        if (key < rangeFrom || key > rangeTo) return false
        if (isSingleStore && row.storeId !== selectedStore) return false
        return true
      }),
    [allRows, rangeFrom, rangeTo, isSingleStore, selectedStore],
  )

  const totals = useMemo(() => {
    const acc = {
      orders: rows.length,
      completed: 0,
      open: 0,
      units: 0,
      items: 0,
      value: 0,
      verified: 0,
      missing: 0,
      missingValue: 0,
      damaged: 0,
      wrongStore: 0,
    }
    for (const row of rows) {
      acc.units += row.units
      acc.items += row.itemCount
      acc.value += row.value
      acc.verified += row.verified
      acc.missing += row.missing
      acc.damaged += row.damaged
      acc.wrongStore += row.wrongStore
      // Estimated: assumes the order's units are priced evenly, since the
      // list endpoint only gives a per-order total, not per-line prices.
      if (row.units > 0) acc.missingValue += (row.value / row.units) * row.missing
      if (row.status === 'completed' || row.status === 'closed_with_issues') acc.completed += 1
      if (row.status === 'pending' || row.status === 'in_progress') acc.open += 1
    }
    return acc
  }, [rows])

  const series = useMemo(() => {
    const from = parseISO(rangeFrom)
    const to = parseISO(rangeTo)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return []

    const granularity = pickGranularity(from, to)
    const buckets = new Map<
      string,
      { label: string; fullLabel: string; value: number; orders: number; units: number }
    >()

    let cursor = bucketStart(from, granularity)
    for (let step = 0; cursor <= to && step < 400; step += 1) {
      const key = format(cursor, 'yyyy-MM-dd')
      buckets.set(key, {
        label: bucketLabel(cursor, granularity),
        fullLabel:
          granularity === 'day'
            ? format(cursor, 'EEE, dd MMM yyyy')
            : granularity === 'week'
              ? `Week of ${format(cursor, 'dd MMM yyyy')}`
              : format(cursor, 'MMMM yyyy'),
        value: 0,
        orders: 0,
        units: 0,
      })
      cursor =
        granularity === 'day'
          ? addDays(cursor, 1)
          : granularity === 'week'
            ? addDays(cursor, 7)
            : addMonths(cursor, 1)
    }

    for (const row of rows) {
      const bucket = buckets.get(format(bucketStart(row.createdAt, granularity), 'yyyy-MM-dd'))
      if (!bucket) continue
      bucket.value += row.value
      bucket.orders += 1
      bucket.units += row.units
    }

    return Array.from(buckets.values())
  }, [rows, rangeFrom, rangeTo])

  const statusData = useMemo(() => {
    const counts = new Map<OrderStatus, number>()
    for (const row of rows) counts.set(row.status, (counts.get(row.status) || 0) + 1)
    return (Object.keys(STATUS_META) as OrderStatus[])
      .filter((status) => counts.has(status))
      .map((status) => ({
        status,
        name: STATUS_META[status].label,
        value: counts.get(status) || 0,
        color: STATUS_META[status].color,
      }))
  }, [rows])

  const storeData = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string
        name: string
        orders: number
        units: number
        value: number
        verified: number
        missing: number
        last: Date
      }
    >()
    for (const row of rows) {
      const entry = map.get(row.storeId) || {
        id: row.storeId,
        name: row.storeName,
        orders: 0,
        units: 0,
        value: 0,
        verified: 0,
        missing: 0,
        last: row.createdAt,
      }
      entry.orders += 1
      entry.units += row.units
      entry.value += row.value
      entry.verified += row.verified
      entry.missing += row.missing
      if (row.createdAt > entry.last) entry.last = row.createdAt
      map.set(row.storeId, entry)
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value)
  }, [rows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!query) return true
      return (
        row.id.toLowerCase().includes(query) ||
        shortId(row.id).toLowerCase().includes(query) ||
        row.storeName.toLowerCase().includes(query) ||
        row.products.some((name) => name.toLowerCase().includes(query))
      )
    })
  }, [rows, search, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = filteredRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const toggleOrder = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (details[id] && !details[id].error) return

    setDetails((prev) => ({ ...prev, [id]: { loading: true, error: false, items: [] } }))
    try {
      let response: Response | null = null
      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(id)}`)
        if (response.ok) break
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)))
      }
      if (!response || !response.ok) throw new Error('detail request failed')

      const payload = await response.json()
      const items: DetailItem[] = (Array.isArray(payload?.items) ? payload.items : []).map(
        (item: any, index: number) => {
          const product = item?.products || {}
          return {
            id: String(item?.id ?? index),
            name: String(product?.name ?? 'Unknown product'),
            barcode: String(product?.barcode ?? ''),
            batch: String(product?.batchNumber ?? product?.batch_number ?? ''),
            sent: num(item?.assignedQty ?? item?.assigned_qty),
            received: num(item?.verifiedQty ?? item?.verified_qty),
            damaged: num(item?.damagedQty ?? item?.damaged_qty),
            wrongStore: num(item?.wrongStoreQty ?? item?.wrong_store_qty),
            missing: num(item?.missingQty ?? item?.missing_qty),
            unitPrice: num(product?.sellingPrice ?? product?.selling_price),
          }
        },
      )
      setDetails((prev) => ({ ...prev, [id]: { loading: false, error: false, items } }))
    } catch {
      setDetails((prev) => ({ ...prev, [id]: { loading: false, error: true, items: [] } }))
    }
  }

  const exportOrders = () => {
    const sheet = XLSX.utils.json_to_sheet(
      filteredRows.map((row) => ({
        Date: format(row.createdAt, 'dd MMM yyyy hh:mm a'),
        Order: shortId(row.id),
        'Order ID': row.id,
        Store: row.storeName,
        Status: STATUS_META[row.status].label,
        'Line items': row.itemCount,
        'Units sent': row.units,
        'Units received': row.verified,
        'Units damaged': row.damaged,
        'Units wrong store': row.wrongStore,
        'Units missing': row.missing,
        'Value (selling price)': Math.round(row.value * 100) / 100,
        Products: row.products.join(', '),
      })),
    )
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Orders sent')
    XLSX.writeFile(book, `orders-sent_${rangeFrom}_to_${rangeTo}.xlsx`)
  }

  if (loading && allRows.length === 0) {
    return <TabSkeleton cards={6} label="Loading orders..." />
  }

  const receivedPct = percent(totals.verified, totals.units)
  const issueUnits = totals.damaged + totals.wrongStore

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          title="Orders sent"
          value={integer(totals.orders)}
          subtitle={`${integer(totals.completed)} done · ${integer(totals.open)} open`}
          icon={<Send className="h-4 w-4" />}
          accent="blue"
        />
        <MetricCard
          title="Units sent"
          value={integer(totals.units)}
          subtitle={`${integer(totals.items)} line items`}
          icon={<Boxes className="h-4 w-4" />}
          accent="violet"
        />
        <MetricCard
          title="Value sent"
          value={inr(totals.value)}
          subtitle={`${inr(totals.orders > 0 ? totals.value / totals.orders : 0)} per order`}
          icon={<IndianRupee className="h-4 w-4" />}
          accent="emerald"
        />
        <MetricCard
          title="Received"
          value={`${receivedPct}%`}
          subtitle={`${integer(totals.verified)} of ${integer(totals.units)} units verified`}
          icon={<PackageCheck className="h-4 w-4" />}
          accent="sky"
        />
        <MetricCard
          title="Awaiting"
          value={integer(totals.missing)}
          subtitle={`units pending · ≈ ${inrCompact(totals.missingValue)}`}
          icon={<Clock className="h-4 w-4" />}
          accent="amber"
        />
        <MetricCard
          title="Issues"
          value={integer(issueUnits)}
          subtitle={`${integer(totals.damaged)} damaged · ${integer(totals.wrongStore)} wrong store`}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent="rose"
        />
      </div>
      <p className="text-xs text-slate-500">
        Values use each product&apos;s current selling price. Dates follow the range picked above.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={`${PANEL_CARD_CLASS} lg:col-span-2`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold text-slate-900">Value sent over time</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-500">
                No orders were sent in this period.
              </p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
                    <XAxis
                      dataKey="label"
                      {...AXIS_PROPS}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      {...AXIS_PROPS}
                      width={56}
                      tickFormatter={(value) => inrCompact(Number(value))}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={PANEL_CARD_CLASS}>
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold text-slate-900">Order status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-500">Nothing to show yet.</p>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={42}
                        outerRadius={68}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {statusData.map((entry) => (
                          <Cell key={entry.status} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip {...TOOLTIP_PROPS} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full space-y-1.5 text-sm">
                  {statusData.map((entry) => (
                    <div key={entry.status} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-700">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: entry.color }}
                        />
                        {entry.name}
                      </span>
                      <span className="font-medium tabular-nums">
                        {integer(entry.value)}{' '}
                        <span className="text-xs font-normal text-slate-500">
                          ({percent(entry.value, rows.length)}%)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!isSingleStore && storeData.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className={PANEL_CARD_CLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px] font-semibold text-slate-900">Value sent by store</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ height: Math.max(180, Math.min(storeData.length, 8) * 36) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={storeData.slice(0, 8)}
                    layout="vertical"
                    margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_STROKE} />
                    <XAxis
                      type="number"
                      {...AXIS_PROPS}
                      tickFormatter={(value) => inrCompact(Number(value))}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={150}
                      {...AXIS_PROPS}
                      tickFormatter={(value: string) =>
                        value.length > 24 ? `${value.slice(0, 23)}…` : value
                      }
                    />
                    <Tooltip
                      {...TOOLTIP_PROPS}
                      formatter={(value) => [inr(Number(value)), 'Value']}
                      cursor={{ fill: '#f1f5f9' }}
                    />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className={`${PANEL_CARD_CLASS} lg:col-span-2`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px] font-semibold text-slate-900">Store breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-80 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Store</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead className="text-right">Last sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storeData.map((store) => (
                      <TableRow key={store.id || store.name}>
                        <TableCell className="font-medium">{store.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {integer(store.orders)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {integer(store.units)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{inr(store.value)}</TableCell>
                        <TableCell>
                          <ProgressBar part={store.verified} whole={store.units} />
                        </TableCell>
                        <TableCell className="text-right text-xs text-slate-600">
                          {format(store.last, 'dd MMM yyyy')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className={PANEL_CARD_CLASS}>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-[15px] font-semibold text-slate-900">
              Orders sent{' '}
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
                  placeholder="Search order, store or product"
                  className="h-9 w-64 pl-8"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as 'all' | OrderStatus)
                  setPage(0)
                }}
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="closed_with_issues">Closed with issues</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={exportOrders}
                disabled={filteredRows.length === 0}
              >
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
                  <TableHead>Order</TableHead>
                  {!isSingleStore && <TableHead>Store</TableHead>}
                  <TableHead>Products</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={isSingleStore ? 8 : 9}
                      className="py-10 text-center text-sm text-slate-500"
                    >
                      {rows.length === 0
                        ? 'No orders were sent in this period.'
                        : 'No orders match your search.'}
                    </TableCell>
                  </TableRow>
                )}
                {pageRows.map((row) => {
                  const isOpen = expandedId === row.id
                  const detail = details[row.id]
                  const extra = Math.max(0, row.products.length - 2)
                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => toggleOrder(row.id)}
                        aria-expanded={isOpen}
                      >
                        <TableCell className="pr-0">
                          <button
                            type="button"
                            aria-label={isOpen ? 'Hide items sent' : 'Show items sent'}
                            className="rounded p-0.5 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                            onClick={(event) => {
                              event.stopPropagation()
                              void toggleOrder(row.id)
                            }}
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(row.createdAt, 'dd MMM yyyy')}
                          <span className="block text-xs text-slate-500">
                            {format(row.createdAt, 'hh:mm a')}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs" title={row.id}>
                          {shortId(row.id)}
                        </TableCell>
                        {!isSingleStore && (
                          <TableCell className="text-sm">{row.storeName}</TableCell>
                        )}
                        <TableCell className="max-w-[260px] text-sm">
                          <span className="block truncate" title={row.products.join(', ')}>
                            {row.products.slice(0, 2).join(', ') || '—'}
                          </span>
                          {extra > 0 && (
                            <span className="text-xs text-slate-500">+{extra} more</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{integer(row.units)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {inr(row.value)}
                        </TableCell>
                        <TableCell>
                          <ProgressBar part={row.verified} whole={row.units} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                      </TableRow>

                      {isOpen && (
                        <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                          <TableCell />
                          <TableCell colSpan={isSingleStore ? 7 : 8} className="py-3">
                            {(!detail || detail.loading) && (
                              <div className="flex items-center gap-2 text-sm text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading what was sent...
                              </div>
                            )}
                            {detail?.error && (
                              <div className="flex items-center gap-3 text-sm text-rose-700">
                                Couldn&apos;t load this order&apos;s items.
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setExpandedId(null)
                                    void toggleOrder(row.id)
                                  }}
                                >
                                  Retry
                                </Button>
                              </div>
                            )}
                            {detail && !detail.loading && !detail.error && (
                              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Product</TableHead>
                                      <TableHead>Batch</TableHead>
                                      <TableHead className="text-right">Sent</TableHead>
                                      <TableHead className="text-right">Received</TableHead>
                                      <TableHead className="text-right">Damaged</TableHead>
                                      <TableHead className="text-right">Wrong store</TableHead>
                                      <TableHead className="text-right">Missing</TableHead>
                                      <TableHead className="text-right">Price</TableHead>
                                      <TableHead className="text-right">Value</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {detail.items.length === 0 && (
                                      <TableRow>
                                        <TableCell
                                          colSpan={9}
                                          className="py-4 text-center text-sm text-slate-500"
                                        >
                                          This order has no items.
                                        </TableCell>
                                      </TableRow>
                                    )}
                                    {detail.items.map((item) => (
                                      <TableRow key={item.id}>
                                        <TableCell className="text-sm">
                                          <span className="font-medium">{item.name}</span>
                                          {item.barcode && (
                                            <span className="block font-mono text-xs text-slate-500">
                                              {item.barcode}
                                            </span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-600">
                                          {item.batch || '—'}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          {integer(item.sent)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          {integer(item.received)}
                                        </TableCell>
                                        <TableCell
                                          className={`text-right tabular-nums ${item.damaged > 0 ? 'font-medium text-rose-700' : ''}`}
                                        >
                                          {integer(item.damaged)}
                                        </TableCell>
                                        <TableCell
                                          className={`text-right tabular-nums ${item.wrongStore > 0 ? 'font-medium text-rose-700' : ''}`}
                                        >
                                          {integer(item.wrongStore)}
                                        </TableCell>
                                        <TableCell
                                          className={`text-right tabular-nums ${item.missing > 0 ? 'font-medium text-amber-700' : ''}`}
                                        >
                                          {integer(item.missing)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          {inr(item.unitPrice)}
                                        </TableCell>
                                        <TableCell className="text-right font-medium tabular-nums">
                                          {inr(item.sent * item.unitPrice)}
                                        </TableCell>
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
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {totals.completed > 0 && totals.open === 0 && rows.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Every order in this period has been fully processed.
        </p>
      )}
    </div>
  )
}
