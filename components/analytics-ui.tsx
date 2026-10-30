'use client'

import { useId } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'

// ---- Chart theme ---------------------------------------------------------
// Shared by every chart on the Analytics page so axes, tooltips and legends
// look the same everywhere. Spread onto the Recharts components.

export const CHART_PALETTE = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9']

export const AXIS_PROPS = {
  tick: { fontSize: 11, fill: '#64748b' },
  tickLine: false,
  axisLine: { stroke: '#e2e8f0' },
} as const

export const GRID_STROKE = '#e8edf4'

export const TOOLTIP_PROPS = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
    fontSize: 12,
    padding: '8px 12px',
  },
  labelStyle: { fontWeight: 600, color: '#0f172a', marginBottom: 4 },
  cursor: { fill: 'rgba(148, 163, 184, 0.12)' },
} as const

export const LEGEND_PROPS = {
  iconType: 'circle' as const,
  iconSize: 8,
  wrapperStyle: { fontSize: 12, paddingTop: 8 },
  formatter: (value: string) => <span style={{ color: '#475569' }}>{value}</span>,
}

// ---- Sparkline -----------------------------------------------------------

export function Sparkline({
  values,
  color = '#4f46e5',
  className = '',
}: {
  values: number[]
  color?: string
  className?: string
}) {
  const gradientId = useId().replace(/:/g, '')
  if (values.length < 2) return null

  const width = 120
  const height = 36
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const points = values.map((value, index) => [
    index * step,
    height - 3 - ((value - min) / span) * (height - 8),
  ])
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ---- Metric card ---------------------------------------------------------

export type AccentColor = 'blue' | 'emerald' | 'amber' | 'violet' | 'rose' | 'sky'

const ACCENTS: Record<AccentColor, { chip: string; bar: string; spark: string }> = {
  blue: { chip: 'bg-indigo-50 text-indigo-600', bar: 'bg-indigo-500', spark: '#4f46e5' },
  emerald: { chip: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500', spark: '#10b981' },
  amber: { chip: 'bg-amber-50 text-amber-600', bar: 'bg-amber-500', spark: '#f59e0b' },
  violet: { chip: 'bg-violet-50 text-violet-600', bar: 'bg-violet-500', spark: '#8b5cf6' },
  rose: { chip: 'bg-rose-50 text-rose-600', bar: 'bg-rose-500', spark: '#ef4444' },
  sky: { chip: 'bg-sky-50 text-sky-600', bar: 'bg-sky-500', spark: '#0ea5e9' },
}

export interface MetricCardProps {
  title: string
  value: string
  icon: React.ReactNode
  change?: number | null
  subtitle?: string
  accent?: AccentColor
  progress?: number
  spark?: number[]
  // For costs and losses, where an increase is bad news.
  invertDelta?: boolean
  // True while the data behind this card is still being fetched.
  loading?: boolean
}

function DeltaPill({ change, invert }: { change: number | null; invert: boolean }) {
  if (change === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
        New
      </span>
    )
  }
  if (change === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
        0%
      </span>
    )
  }
  const good = invert ? change < 0 : change > 0
  const Icon = change > 0 ? TrendingUp : TrendingDown
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        good ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
      }`}
    >
      <Icon className="h-3 w-3" />
      {change > 0 ? '+' : ''}
      {change}%
    </span>
  )
}

export function MetricCard({
  title,
  value,
  icon,
  change,
  subtitle,
  accent = 'blue',
  progress,
  spark,
  invertDelta = false,
  loading = false,
}: MetricCardProps) {
  const styles = ACCENTS[accent]

  if (loading) {
    return (
      <div
        className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm"
        aria-busy="true"
        aria-label={`${title} is loading`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <Skeleton className="h-8 w-8 rounded-xl" />
        </div>
        <Skeleton className="mt-2 h-[26px] w-32 rounded-md bg-slate-200/80" />
        <div className="mt-3 flex min-h-[20px] items-center gap-2">
          <Skeleton className="h-5 w-14 rounded-full bg-slate-100" />
          <Skeleton className="h-3.5 w-24 rounded bg-slate-100" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${styles.chip}`}>
          {icon}
        </span>
      </div>
      <p
        className={`relative mt-2 break-all font-semibold leading-none tracking-tight text-slate-900 tabular-nums ${
          value.length > 12 ? 'text-xl' : 'text-[26px]'
        }`}
      >
        {value}
      </p>
      <div className="relative mt-3 flex min-h-[20px] flex-wrap items-center gap-x-2 gap-y-1">
        {change !== undefined && (
          <span title="Compared with the previous period">
            <DeltaPill change={change} invert={invertDelta} />
          </span>
        )}
        {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
      </div>
      {spark && spark.length > 1 && (
        <Sparkline values={spark} color={styles.spark} className="relative mt-3 h-8 w-full" />
      )}
      {typeof progress === 'number' && (
        <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${styles.bar}`}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  )
}

// ---- Loading placeholder -------------------------------------------------
// Shown in place of a tab's charts and tables while their data is still being
// fetched, so the page appears immediately instead of sitting behind a spinner
// (or showing misleading zeros).

export function TabSkeleton({ cards = 4, label = 'Loading data...' }: { cards?: number; label?: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className={`grid gap-3 grid-cols-2 ${cards >= 6 ? 'xl:grid-cols-6' : 'xl:grid-cols-4'}`}>
        {Array.from({ length: cards }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <Skeleton className="h-3 w-24 rounded bg-slate-100" />
            <Skeleton className="mt-3 h-6 w-28 rounded-md bg-slate-200/80" />
            <Skeleton className="mt-3 h-3.5 w-20 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm lg:col-span-2">
          <Skeleton className="h-4 w-40 rounded bg-slate-200/80" />
          <div className="mt-5 flex h-56 items-end gap-2">
            {[40, 65, 50, 80, 55, 90, 60, 75, 45, 70, 85, 58].map((height, index) => (
              <Skeleton
                key={index}
                className="flex-1 rounded-t-md bg-slate-100"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <Skeleton className="h-4 w-28 rounded bg-slate-200/80" />
          <Skeleton className="mx-auto mt-6 h-36 w-36 rounded-full bg-slate-100" />
          <div className="mt-5 space-y-2">
            <Skeleton className="h-3.5 w-full rounded bg-slate-100" />
            <Skeleton className="h-3.5 w-5/6 rounded bg-slate-100" />
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
        <Skeleton className="h-4 w-36 rounded bg-slate-200/80" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-6 w-full rounded bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  )
}
