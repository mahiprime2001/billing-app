"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  addMonths,
  endOfMonth,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  subDays,
} from "date-fns"
import type { DateRange } from "react-day-picker"
import { supabase } from "@/lib/supabase-browser"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DatePickerWithRange } from "@/components/ui/date-range-picker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  LogIn,
  LogOut,
  MoreVertical,
  Plus,
  RefreshCcw,
  ScanFace,
  Search,
  Smartphone,
  Store as StoreIcon,
  Timer,
  Trash2,
  UserCheck,
  Users,
  UserX,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts"

interface AttendanceStore {
  id: string
  name: string | null
  status: string | null
}

interface AttendanceEmployeeRow {
  id: string
  store_id: string
  name: string
  status: string // active | disabled
  enroll_status: string // pending | enrolled
  photo_url: string | null
  created_at: string | null
}

interface AttendanceRecord {
  id: string
  employee_id: string
  type: string // in | out
  ts: string
  match_score: number | null
  photo_url: string | null
}

interface AttendanceDevice {
  id: string
  store_id: string
  name: string | null
  activation_code: string | null
  status: string // unclaimed | active | disabled
  device_info: string | null
  last_seen: string | null
  app_version: string | null
}

interface Session {
  inRec: AttendanceRecord | null
  outRec: AttendanceRecord | null
}

interface EmpDay {
  date: string
  sessions: Session[]
  ms: number
}

interface EmpSummary {
  emp: AttendanceEmployeeRow
  days: EmpDay[] // newest first
  daysPresent: number
  totalDays: number
  leaves: number
  totalMs: number
  avgInLabel: string
  avgOutLabel: string
  stripDay: EmpDay | null
  stillIn: boolean
}

type FilterMode = "today" | "yesterday" | "month" | "custom"

const dateKey = (d: Date): string => format(d, "yyyy-MM-dd")
const todayKey = (): string => dateKey(new Date())

const fmtTime = (ts: string | null | undefined): string => {
  if (!ts) return "—"
  try {
    return format(parseISO(ts), "hh:mm a")
  } catch {
    return "—"
  }
}

const fmtDay = (date: string): string => {
  try {
    return format(parseISO(date), "EEE, dd MMM yyyy")
  } catch {
    return date
  }
}

const fmtMs = (ms: number): string => {
  if (ms <= 0) return "—"
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return h ? `${h}h ${m}m` : `${m}m`
}

const minutesToLabel = (mins: number | null): string => {
  if (mins == null) return "—"
  const d = new Date()
  d.setHours(Math.floor(mins / 60), Math.round(mins % 60), 0, 0)
  return format(d, "hh:mm a")
}

const tsToMinutes = (ts: string): number => {
  const d = parseISO(ts)
  return d.getHours() * 60 + d.getMinutes()
}

export default function AttendanceEmployees({
  showCharts = false,
}: {
  showCharts?: boolean
}) {
  const [stores, setStores] = useState<AttendanceStore[]>([])
  const [storeId, setStoreId] = useState<string>("")
  const [employees, setEmployees] = useState<AttendanceEmployeeRow[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // management state
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState("")
  const [adding, setAdding] = useState(false)
  const [devicesOpen, setDevicesOpen] = useState(false)
  const [devices, setDevices] = useState<AttendanceDevice[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [creatingDevice, setCreatingDevice] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // ---- date filtering ----
  const [mode, setMode] = useState<FilterMode>("today")
  const [monthAnchor, setMonthAnchor] = useState<Date>(startOfMonth(new Date()))
  const [from, setFrom] = useState<Date>(new Date())
  const [to, setTo] = useState<Date>(new Date())
  const [pickerRange, setPickerRange] = useState<DateRange | undefined>()

  const applyToday = () => {
    const now = new Date()
    setMode("today")
    setFrom(now)
    setTo(now)
  }
  const applyYesterday = () => {
    const y = subDays(new Date(), 1)
    setMode("yesterday")
    setFrom(y)
    setTo(y)
  }
  const applyMonth = (anchor: Date) => {
    setMode("month")
    setMonthAnchor(anchor)
    setFrom(startOfMonth(anchor))
    setTo(endOfMonth(anchor))
  }
  const applyPicker = (r: DateRange | undefined) => {
    setPickerRange(r)
    if (r?.from) {
      setMode("custom")
      setFrom(r.from)
      setTo(r.to ?? r.from)
    }
  }

  const fromKey = dateKey(from)
  const toKey = dateKey(to)
  const singleDay = fromKey === toKey
  const rangeIncludesToday = fromKey <= todayKey() && todayKey() <= toKey

  // ---- data ----
  useEffect(() => {
    const loadStores = async () => {
      const { data, error: err } = await supabase
        .from("stores")
        .select("id, name, status")
        .order("name", { ascending: true })
      if (err) {
        setError(err.message)
        return
      }
      const list = (data ?? []) as AttendanceStore[]
      setStores(list)
      if (list.length) setStoreId((prev) => prev || list[0].id)
    }
    loadStores()
  }, [])

  const loadData = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    setError(null)
    try {
      const [empRes, recRes] = await Promise.all([
        supabase
          .from("attendance_employees")
          .select("id, store_id, name, status, enroll_status, photo_url, created_at")
          .eq("store_id", storeId)
          .order("name", { ascending: true }),
        supabase
          .from("attendance_records")
          .select("id, employee_id, type, ts, match_score, photo_url")
          .eq("store_id", storeId)
          .gte("ts", `${fromKey}T00:00:00`)
          .lte("ts", `${toKey}T23:59:59`)
          .order("ts", { ascending: true }),
      ])
      if (empRes.error) throw empRes.error
      if (recRes.error) throw recRes.error
      setEmployees((empRes.data ?? []) as AttendanceEmployeeRow[])
      setRecords((recRes.data ?? []) as AttendanceRecord[])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attendance data")
    } finally {
      setLoading(false)
    }
  }, [storeId, fromKey, toKey])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ---- live updates (Supabase Realtime, no polling) ----
  // The subscription only needs to resubscribe when the store changes, but
  // it must always call the *current* loadData (bound to the current date
  // filters) — a ref keeps that current without retriggering the effect.
  const loadDataRef = useRef(loadData)
  useEffect(() => {
    loadDataRef.current = loadData
  }, [loadData])

  useEffect(() => {
    if (!storeId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    // Collapses a burst of rapid-fire events (e.g. a phone that was offline
    // dumping many queued records at once) into a single reload.
    const debouncedReload = () => {
      clearTimeout(timer)
      timer = setTimeout(() => loadDataRef.current(), 600)
    }
    const channel = supabase
      .channel(`attendance-store-${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_records",
          filter: `store_id=eq.${storeId}`,
        },
        debouncedReload
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_employees",
          filter: `store_id=eq.${storeId}`,
        },
        debouncedReload
      )
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [storeId])

  // ---- employee management ----

  const addEmployee = async () => {
    const name = addName.trim()
    if (!name || !storeId) return
    setAdding(true)
    setError(null)
    try {
      const { error: err } = await supabase.from("attendance_employees").insert({
        store_id: storeId,
        name,
        status: "active",
        enroll_status: "pending",
      })
      if (err) throw err
      setAddName("")
      setAddOpen(false)
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add employee")
    } finally {
      setAdding(false)
    }
  }

  const reEnroll = async (emp: AttendanceEmployeeRow) => {
    if (
      !confirm(
        `Re-enroll ${emp.name}? Their current face data will be replaced at the next capture on the shop phone.`
      )
    )
      return
    const { error: err } = await supabase
      .from("attendance_employees")
      .update({ enroll_status: "pending", face_embeddings: null })
      .eq("id", emp.id)
    if (err) setError(err.message)
    await loadData()
  }

  const toggleEmployee = async (emp: AttendanceEmployeeRow) => {
    const next = emp.status === "active" ? "disabled" : "active"
    if (
      next === "disabled" &&
      !confirm(`Disable ${emp.name}? Their face will stop marking attendance.`)
    )
      return
    const { error: err } = await supabase
      .from("attendance_employees")
      .update({ status: next })
      .eq("id", emp.id)
    if (err) setError(err.message)
    await loadData()
  }

  const deleteEmployee = async (emp: AttendanceEmployeeRow) => {
    if (
      !confirm(
        `Delete ${emp.name} completely? Their face data AND all attendance history will be deleted. Use Disable instead if you only want to stop their scans.`
      )
    )
      return
    try {
      const { error: e1 } = await supabase
        .from("attendance_records")
        .delete()
        .eq("employee_id", emp.id)
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from("attendance_employees")
        .delete()
        .eq("id", emp.id)
      if (e2) throw e2
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete employee")
    }
    setSelectedId(null)
    await loadData()
  }

  // ---- device management ----

  const loadDevices = useCallback(async () => {
    if (!storeId) return
    setLoadingDevices(true)
    try {
      const { data, error: err } = await supabase
        .from("attendance_devices")
        .select("id, store_id, name, activation_code, status, device_info, last_seen, app_version")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
      if (err) throw err
      setDevices((data ?? []) as AttendanceDevice[])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load devices")
    } finally {
      setLoadingDevices(false)
    }
  }, [storeId])

  useEffect(() => {
    if (devicesOpen) loadDevices()
  }, [devicesOpen, loadDevices])

  const loadDevicesRef = useRef(loadDevices)
  useEffect(() => {
    loadDevicesRef.current = loadDevices
  }, [loadDevices])

  useEffect(() => {
    if (!devicesOpen || !storeId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const debouncedReload = () => {
      clearTimeout(timer)
      timer = setTimeout(() => loadDevicesRef.current(), 600)
    }
    const channel = supabase
      .channel(`attendance-devices-${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_devices",
          filter: `store_id=eq.${storeId}`,
        },
        debouncedReload
      )
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [devicesOpen, storeId])

  const genCode = (): string => {
    // Simple 6-digit code — quick to type on a phone's numpad.
    return String(Math.floor(100000 + Math.random() * 900000))
  }

  const createDevice = async () => {
    if (!storeId) return
    setCreatingDevice(true)
    try {
      const storeName = stores.find((s) => s.id === storeId)?.name ?? "Shop"
      const { error: err } = await supabase.from("attendance_devices").insert({
        store_id: storeId,
        name: `${storeName} phone`,
        activation_code: genCode(),
        status: "unclaimed",
      })
      if (err) throw err
      await loadDevices()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create device")
    } finally {
      setCreatingDevice(false)
    }
  }

  const removeDevice = async (d: AttendanceDevice) => {
    const msg =
      d.status === "unclaimed"
        ? "Remove this unused activation code?"
        : "Remove this phone? The app on it resets and can be added again with a new code. Attendance history stays."
    if (!confirm(msg)) return
    try {
      const { error: e1 } = await supabase
        .from("attendance_records")
        .update({ device_id: null })
        .eq("device_id", d.id)
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from("attendance_devices")
        .delete()
        .eq("id", d.id)
      if (e2) throw e2
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove device")
    }
    await loadDevices()
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const isOnline = (d: AttendanceDevice): boolean => {
    if (!d.last_seen) return false
    return Date.now() - new Date(d.last_seen).getTime() < 2 * 60 * 1000
  }

  // ---- export ----

  const [exporting, setExporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportTarget, setExportTarget] = useState<string>("store") // "store" | employee id

  /** Every date in the selected period (never past today). */
  const listReportDates = (): string[] => {
    const today = todayKey()
    const end = toKey < today ? toKey : today
    const out: string[] = []
    let d = new Date(`${fromKey}T00:00:00`)
    const endDate = new Date(`${end}T00:00:00`)
    while (d <= endDate) {
      out.push(format(d, "yyyy-MM-dd"))
      d = new Date(d.getTime() + 86_400_000)
    }
    return out
  }

  /** Register row for one employee on one date: Present with times, or Absent. */
  const registerRow = (s: EmpSummary, date: string) => {
    const created = (s.emp.created_at ?? "").slice(0, 10)
    if (created && date < created) {
      return { Status: "—", IN: "", OUT: "", Hours: "" } // not joined yet
    }
    const day = s.days.find((d) => d.date === date)
    if (!day) {
      return { Status: "Absent", IN: "", OUT: "", Hours: "" }
    }
    const firstIn = day.sessions.find((x) => x.inRec)?.inRec
    const outs = day.sessions.filter((x) => x.outRec)
    const lastOut = outs.length ? outs[outs.length - 1].outRec : null
    return {
      Status: "Present",
      IN: fmtTime(firstIn?.ts),
      OUT: lastOut
        ? fmtTime(lastOut.ts)
        : date === todayKey()
          ? "still in"
          : "—",
      Hours: fmtMs(day.ms),
    }
  }

  const exportExcel = async () => {
    if (exporting || !summaries.length) return
    setExporting(true)
    try {
      const XLSX = await import("xlsx")
      const storeName = stores.find((s) => s.id === storeId)?.name ?? "store"
      const dates = listReportDates()
      const wb = XLSX.utils.book_new()
      const safe = (v: string) =>
        v.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-")

      if (exportTarget === "store") {
        // Sheet 1 — store summary
        const summaryRows = summaries.map((s) => ({
          Employee: s.emp.name,
          Status: s.emp.status === "active" ? "Active" : "Disabled",
          "Days Present": s.daysPresent,
          "Working Days": s.totalDays,
          Leaves: s.leaves,
          "Total Hours": fmtMs(s.totalMs),
          "Avg IN": s.avgInLabel,
          "Avg OUT": s.avgOutLabel,
        }))
        const ws1 = XLSX.utils.json_to_sheet(summaryRows)
        ws1["!cols"] = [
          { wch: 22 }, { wch: 10 }, { wch: 13 }, { wch: 13 },
          { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
        ]
        XLSX.utils.book_append_sheet(wb, ws1, "Summary")

        // Sheet 2 — full register: every employee, every day
        const registerRows = dates.flatMap((date) =>
          summaries.map((s) => ({
            Date: date,
            Day: format(parseISO(date), "EEE"),
            Employee: s.emp.name,
            ...registerRow(s, date),
          }))
        )
        const ws2 = XLSX.utils.json_to_sheet(registerRows)
        ws2["!cols"] = [
          { wch: 12 }, { wch: 6 }, { wch: 22 },
          { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
        ]
        XLSX.utils.book_append_sheet(wb, ws2, "Register")

        XLSX.writeFile(
          wb,
          `attendance-${safe(storeName)}-${fromKey}_to_${toKey}.xlsx`
        )
      } else {
        // Individual employee report: one row per day of the period
        const s = summaries.find((x) => x.emp.id === exportTarget)
        if (!s) return
        const rows = dates.map((date) => ({
          Date: date,
          Day: format(parseISO(date), "EEE"),
          ...registerRow(s, date),
        }))
        // Totals footer
        rows.push({
          Date: "TOTAL",
          Day: "",
          Status: `${s.daysPresent} present · ${s.leaves} absent`,
          IN: "",
          OUT: "",
          Hours: fmtMs(s.totalMs),
        })
        const ws = XLSX.utils.json_to_sheet(rows)
        ws["!cols"] = [
          { wch: 12 }, { wch: 6 }, { wch: 22 },
          { wch: 10 }, { wch: 10 }, { wch: 10 },
        ]
        XLSX.utils.book_append_sheet(
          wb,
          ws,
          safe(s.emp.name).slice(0, 31) || "Employee"
        )
        XLSX.writeFile(
          wb,
          `attendance-${safe(s.emp.name)}-${fromKey}_to_${toKey}.xlsx`
        )
      }
      setExportOpen(false)
    } finally {
      setExporting(false)
    }
  }

  // ---- per-employee summaries ----
  const summaries = useMemo<EmpSummary[]>(() => {
    const byEmp = new Map<string, AttendanceRecord[]>()
    for (const r of records) {
      const list = byEmp.get(r.employee_id)
      if (list) list.push(r)
      else byEmp.set(r.employee_id, [r])
    }
    const today = todayKey()
    const stripDate = singleDay ? fromKey : today

    return employees.map((emp) => {
      const recs = byEmp.get(emp.id) ?? []
      const dayMap = new Map<string, EmpDay>()
      for (const r of recs) {
        const date = r.ts.slice(0, 10)
        let day = dayMap.get(date)
        if (!day) {
          day = { date, sessions: [], ms: 0 }
          dayMap.set(date, day)
        }
        const open = day.sessions.find((s) => s.inRec && !s.outRec)
        if (r.type === "in") {
          day.sessions.push({ inRec: r, outRec: null })
        } else if (open) {
          open.outRec = r
        } else {
          day.sessions.push({ inRec: null, outRec: r })
        }
      }
      let totalMs = 0
      const inMinutes: number[] = []
      const outMinutes: number[] = []
      for (const day of dayMap.values()) {
        let ms = 0
        for (const s of day.sessions) {
          if (s.inRec && s.outRec) {
            ms += new Date(s.outRec.ts).getTime() - new Date(s.inRec.ts).getTime()
          }
        }
        day.ms = ms
        totalMs += ms
        const firstIn = day.sessions.find((s) => s.inRec)?.inRec
        if (firstIn) inMinutes.push(tsToMinutes(firstIn.ts))
        const outs = day.sessions.filter((s) => s.outRec)
        if (outs.length) outMinutes.push(tsToMinutes(outs[outs.length - 1].outRec!.ts))
      }
      const days = [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date))

      // leaves: only from when they joined, never into the future
      const created = (emp.created_at ?? "").slice(0, 10)
      const start = created && created > fromKey ? created : fromKey
      const end = toKey < today ? toKey : today
      let totalDays = 0
      if (start <= end) {
        totalDays =
          Math.round(
            (new Date(`${end}T00:00:00`).getTime() -
              new Date(`${start}T00:00:00`).getTime()) /
              86_400_000
          ) + 1
      }
      const leaves = Math.max(0, totalDays - days.length)

      const stripDay = days.find((d) => d.date === stripDate) ?? null
      const stillIn =
        (days.find((d) => d.date === today)?.sessions ?? []).some(
          (s) => s.inRec && !s.outRec
        )

      const avg = (arr: number[]): number | null =>
        arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

      return {
        emp,
        days,
        daysPresent: days.length,
        totalDays,
        leaves,
        totalMs,
        avgInLabel: minutesToLabel(avg(inMinutes)),
        avgOutLabel: minutesToLabel(avg(outMinutes)),
        stripDay,
        stillIn,
      }
    })
  }, [employees, records, fromKey, toKey, singleDay])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return summaries
    return summaries.filter((s) => s.emp.name.toLowerCase().includes(q))
  }, [summaries, search])

  const selected = useMemo(
    () => summaries.find((s) => s.emp.id === selectedId) ?? null,
    [summaries, selectedId]
  )
  const selectedStore = stores.find((s) => s.id === storeId)

  const presentCount = summaries.filter((s) => s.daysPresent > 0).length
  const activeCount = employees.filter((e) => e.status === "active").length
  const stillInCount = rangeIncludesToday
    ? summaries.filter((s) => s.stillIn).length
    : 0
  const totalLeaves = summaries
    .filter((s) => s.emp.status === "active")
    .reduce((sum, s) => sum + s.leaves, 0)

  const periodLabel = singleDay
    ? fmtDay(fromKey)
    : `${format(from, "dd MMM")} – ${format(to, "dd MMM yyyy")}`

  // ---- chart data (analytics view) ----
  const presencePerDay = useMemo(() => {
    if (!showCharts) return []
    const byDate = new Map<string, Set<string>>()
    for (const r of records) {
      const date = r.ts.slice(0, 10)
      const set = byDate.get(date) ?? new Set<string>()
      set.add(r.employee_id)
      byDate.set(date, set)
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, set]) => ({
        date: format(parseISO(date), "dd MMM"),
        present: set.size,
      }))
  }, [records, showCharts])

  const hoursPerEmployee = useMemo(() => {
    if (!showCharts) return []
    return summaries
      .filter((s) => s.totalMs > 0)
      .map((s) => ({
        name: s.emp.name,
        hours: Math.round((s.totalMs / 3_600_000) * 10) / 10,
      }))
      .sort((a, b) => b.hours - a.hours)
  }, [summaries, showCharts])

  return (
    <div className="space-y-4">
      {/* row 1: store + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <StoreIcon className="h-4 w-4 text-muted-foreground" />
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select store" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name || s.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="w-56 pl-9"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Employee
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDevicesOpen(true)}>
            <Smartphone className="mr-1.5 h-4 w-4" />
            Devices
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || !summaries.length}
            onClick={() => setExportOpen(true)}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* row 2: date filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={mode === "today" ? "default" : "outline"}
          onClick={applyToday}
        >
          Today
        </Button>
        <Button
          size="sm"
          variant={mode === "yesterday" ? "default" : "outline"}
          onClick={applyYesterday}
        >
          Yesterday
        </Button>

        {/* month stepper */}
        <div
          className={`flex items-center rounded-md border ${
            mode === "month" ? "border-primary bg-primary/5" : ""
          }`}
        >
          <Button
            size="sm"
            variant="ghost"
            className="px-2"
            onClick={() => applyMonth(addMonths(monthAnchor, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            className="min-w-[7.5rem] px-1 text-center text-sm font-medium"
            onClick={() => applyMonth(monthAnchor)}
          >
            {format(monthAnchor, "MMMM yyyy")}
          </button>
          <Button
            size="sm"
            variant="ghost"
            className="px-2"
            disabled={isSameMonth(monthAnchor, new Date())}
            onClick={() => applyMonth(addMonths(monthAnchor, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* specific range calendar */}
        <DatePickerWithRange date={pickerRange} setDate={applyPicker} />

        <Badge variant="secondary" className="ml-auto gap-1.5 font-normal">
          <CalendarDays className="h-3 w-3" />
          {periodLabel}
        </Badge>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="flex items-center gap-2 p-3 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Employees
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <UserCheck className="h-3.5 w-3.5" />
              Present
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums text-green-600">
              {presentCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              Leaves
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">
              {totalLeaves}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Still in
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums text-sky-600">
              {stillInCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* charts (analytics view) */}
      {showCharts && !loading && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <p className="mb-3 text-sm font-semibold">Present per day</p>
              {!presencePerDay.length ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No scans in this period.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={presencePerDay}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} />
                    <YAxis allowDecimals={false} fontSize={11} tickLine={false} width={28} />
                    <ChartTooltip />
                    <Bar dataKey="present" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="mb-3 text-sm font-semibold">Hours worked per employee</p>
              {!hoursPerEmployee.length ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No completed IN/OUT pairs in this period.
                </p>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(240, hoursPerEmployee.length * 34)}
                >
                  <BarChart data={hoursPerEmployee} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" fontSize={11} tickLine={false} unit="h" />
                    <YAxis
                      type="category"
                      dataKey="name"
                      fontSize={11}
                      tickLine={false}
                      width={90}
                    />
                    <ChartTooltip />
                    <Bar dataKey="hours" fill="#0284c7" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* employee cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : !filtered.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-muted-foreground">
            <Users className="h-8 w-8 opacity-50" />
            <p className="text-sm">
              {employees.length
                ? "No employee matches the search."
                : "No employees at this store yet — add them from siri-website."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <Card
              key={s.emp.id}
              className={`cursor-pointer transition-shadow hover:shadow-md ${
                s.emp.status !== "active" ? "opacity-60" : ""
              }`}
              onClick={() => setSelectedId(s.emp.id)}
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <Avatar
                    className="h-12 w-12 border"
                    onClick={(e) => {
                      if (s.emp.photo_url) {
                        e.stopPropagation()
                        setPhotoPreview(s.emp.photo_url)
                      }
                    }}
                  >
                    {s.emp.photo_url ? <AvatarImage src={s.emp.photo_url} /> : null}
                    <AvatarFallback>
                      {s.emp.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.emp.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge
                        variant={s.emp.status === "active" ? "default" : "destructive"}
                        className="text-[10px]"
                      >
                        {s.emp.status === "active" ? "Active" : "Disabled"}
                      </Badge>
                      <Badge
                        variant={
                          s.emp.enroll_status === "enrolled" ? "secondary" : "outline"
                        }
                        className="gap-1 text-[10px]"
                      >
                        <ScanFace className="h-3 w-3" />
                        {s.emp.enroll_status === "enrolled" ? "Enrolled" : "No face yet"}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="-mr-1 -mt-1 h-8 w-8 shrink-0"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.emp.enroll_status === "enrolled" && (
                        <DropdownMenuItem onClick={() => reEnroll(s.emp)}>
                          <ScanFace className="mr-2 h-4 w-4" />
                          Re-enroll face
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => toggleEmployee(s.emp)}>
                        {s.emp.status === "active" ? (
                          <>
                            <UserX className="mr-2 h-4 w-4" />
                            Disable
                          </>
                        ) : (
                          <>
                            <UserCheck className="mr-2 h-4 w-4" />
                            Enable
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => deleteEmployee(s.emp)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete permanently
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* day strip: the selected day, or today when a range is chosen */}
                {(singleDay || rangeIncludesToday) && (
                  <div className="rounded-lg border bg-muted/40 p-2.5">
                    <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {singleDay ? fmtDay(fromKey) : "Today"}
                    </p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5">
                        <LogIn className="h-3.5 w-3.5 text-green-600" />
                        <span className="tabular-nums">
                          {fmtTime(
                            s.stripDay?.sessions.find((x) => x.inRec)?.inRec?.ts
                          )}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <LogOut className="h-3.5 w-3.5 text-amber-600" />
                        {s.stillIn && (singleDay ? fromKey === todayKey() : true) ? (
                          <Badge
                            variant="secondary"
                            className="gap-1 text-[10px] text-green-700"
                          >
                            <Clock className="h-3 w-3" />
                            Still in
                          </Badge>
                        ) : (
                          <span className="tabular-nums">
                            {fmtTime(
                              s.stripDay?.sessions
                                .filter((x) => x.outRec)
                                .slice(-1)[0]?.outRec?.ts
                            )}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {s.stripDay ? fmtMs(s.stripDay.ms) : "—"}
                      </span>
                    </div>
                  </div>
                )}

                {/* period summary */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    <span className="font-medium text-green-600">
                      {s.daysPresent}
                    </span>
                    {!singleDay && (
                      <span className="text-muted-foreground">/{s.totalDays}</span>
                    )}{" "}
                    present · <span className="font-medium text-amber-600">{s.leaves}</span>{" "}
                    leaves
                  </span>
                  <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                    <Timer className="h-3 w-3" />
                    {fmtMs(s.totalMs)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ---------- employee detail dialog ---------- */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-3xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle asChild>
                  <div className="flex items-center gap-4">
                    <Avatar
                      className="h-16 w-16 border-2 cursor-pointer"
                      onClick={() =>
                        selected.emp.photo_url &&
                        setPhotoPreview(selected.emp.photo_url)
                      }
                    >
                      {selected.emp.photo_url ? (
                        <AvatarImage src={selected.emp.photo_url} />
                      ) : null}
                      <AvatarFallback className="text-xl">
                        {selected.emp.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-lg font-semibold">{selected.emp.name}</p>
                      <p className="text-sm font-normal text-muted-foreground">
                        {selectedStore?.name}
                        {selected.emp.created_at
                          ? ` · joined ${format(
                              parseISO(selected.emp.created_at),
                              "dd MMM yyyy"
                            )}`
                          : ""}
                      </p>
                      <div className="mt-1 flex gap-1">
                        <Badge
                          variant={
                            selected.emp.status === "active"
                              ? "default"
                              : "destructive"
                          }
                          className="text-[10px]"
                        >
                          {selected.emp.status === "active" ? "Active" : "Disabled"}
                        </Badge>
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <ScanFace className="h-3 w-3" />
                          {selected.emp.enroll_status === "enrolled"
                            ? "Face enrolled"
                            : "Waiting for face scan"}
                        </Badge>
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-auto shrink-0 font-normal">
                      {periodLabel}
                    </Badge>
                  </div>
                </DialogTitle>
              </DialogHeader>

              {/* stat tiles */}
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Present
                  </p>
                  <p className="text-lg font-bold tabular-nums text-green-600">
                    {selected.daysPresent}
                    {!singleDay && (
                      <span className="text-sm font-normal text-muted-foreground">
                        /{selected.totalDays}
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Leaves
                  </p>
                  <p className="text-lg font-bold tabular-nums text-amber-600">
                    {selected.leaves}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Total hours
                  </p>
                  <p className="text-lg font-bold tabular-nums">
                    {fmtMs(selected.totalMs)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Avg IN
                  </p>
                  <p className="text-lg font-bold tabular-nums">
                    {selected.avgInLabel}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Avg OUT
                  </p>
                  <p className="text-lg font-bold tabular-nums">
                    {selected.avgOutLabel}
                  </p>
                </div>
              </div>

              {/* day-wise history */}
              <ScrollArea className="max-h-[48vh]">
                {!selected.days.length ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No attendance in this period.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>IN</TableHead>
                        <TableHead>OUT</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.days.flatMap((d) =>
                        d.sessions.map((sess, i) => (
                          <TableRow key={`${d.date}-${i}`}>
                            <TableCell className="whitespace-nowrap font-medium">
                              {i === 0 ? fmtDay(d.date) : ""}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {sess.inRec?.photo_url && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={sess.inRec.photo_url}
                                    alt="in"
                                    className="h-9 w-9 cursor-pointer rounded border object-cover"
                                    onClick={() =>
                                      setPhotoPreview(sess.inRec!.photo_url)
                                    }
                                  />
                                )}
                                <span className="tabular-nums text-green-600">
                                  {fmtTime(sess.inRec?.ts)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {sess.outRec ? (
                                <div className="flex items-center gap-2">
                                  {sess.outRec.photo_url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={sess.outRec.photo_url}
                                      alt="out"
                                      className="h-9 w-9 cursor-pointer rounded border object-cover"
                                      onClick={() =>
                                        setPhotoPreview(sess.outRec!.photo_url)
                                      }
                                    />
                                  )}
                                  <span className="tabular-nums text-amber-600">
                                    {fmtTime(sess.outRec.ts)}
                                  </span>
                                </div>
                              ) : d.date === todayKey() ? (
                                <Badge
                                  variant="secondary"
                                  className="gap-1 text-[10px] text-green-700"
                                >
                                  <Clock className="h-3 w-3" />
                                  Still in
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">no out</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {i === d.sessions.length - 1 ? fmtMs(d.ms) : ""}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- export dialog ---------- */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export report
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Report for
              </p>
              <Select value={exportTarget} onValueChange={setExportTarget}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store">
                    Entire store — {stores.find((s) => s.id === storeId)?.name}
                  </SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              <p>
                Period: <span className="font-medium text-foreground">{periodLabel}</span>
              </p>
              <p className="mt-1">
                Table format — one row per day with IN time, OUT time, hours,
                and Present / Absent status.
                {exportTarget === "store"
                  ? " Store export includes a per-employee summary sheet plus the full register."
                  : ""}
              </p>
            </div>
            <Button className="w-full" disabled={exporting} onClick={exportExcel}>
              <Download className="mr-1.5 h-4 w-4" />
              {exporting ? "Exporting…" : "Download Excel"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- add employee dialog ---------- */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Employee name"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && addEmployee()}
            />
            <p className="text-xs text-muted-foreground">
              Added to <span className="font-medium">{selectedStore?.name}</span>. The
              shop phone then shows an ADD popup for this person to scan their face —
              attendance starts working after that.
            </p>
            <Button
              className="w-full"
              disabled={adding || !addName.trim()}
              onClick={addEmployee}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {adding ? "Adding…" : "Add employee"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- devices dialog ---------- */}
      <Dialog open={devicesOpen} onOpenChange={setDevicesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Devices · {selectedStore?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              className="w-full"
              disabled={creatingDevice}
              onClick={createDevice}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {creatingDevice ? "Generating…" : "New activation code"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Enter the code once in the app on this shop's phone. One code = one phone.
            </p>

            {loadingDevices ? (
              <div className="space-y-2">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </div>
            ) : !devices.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No phone for this shop yet — generate a code above.
              </p>
            ) : (
              <ScrollArea className="max-h-[45vh]">
                <div className="space-y-2 pr-3">
                  {devices.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                          isOnline(d)
                            ? "bg-green-100 text-green-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Smartphone className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {d.name || "Shop phone"}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {d.device_info || "Not activated yet"}
                          {d.app_version ? ` · v${d.app_version}` : ""}
                        </p>
                        {d.status === "unclaimed" && d.activation_code && (
                          <button
                            className="mt-1 inline-flex items-center gap-1.5 rounded-md border bg-muted px-2 py-0.5 font-mono text-xs hover:border-primary"
                            onClick={() => copyCode(d.activation_code!)}
                          >
                            {d.activation_code}
                            {copiedCode === d.activation_code ? (
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Badge
                          variant={
                            d.status === "unclaimed"
                              ? "outline"
                              : isOnline(d)
                                ? "default"
                                : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {d.status === "unclaimed"
                            ? "Waiting"
                            : isOnline(d)
                              ? "Online"
                              : "Offline"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-red-600 hover:text-red-600"
                          onClick={() => removeDevice(d)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* photo dialog (stacks above the employee dialog) */}
      <Dialog
        open={!!photoPreview}
        onOpenChange={(open) => !open && setPhotoPreview(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium text-muted-foreground">
              Attendance photo
            </DialogTitle>
          </DialogHeader>
          {photoPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreview}
              alt="attendance"
              className="max-h-[70vh] w-full rounded-lg border object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
