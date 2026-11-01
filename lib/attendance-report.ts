// Attendance rows for the analytics Excel export: one summary row per employee and a
// register row per employee per day. Pure functions (no Supabase, no DOM) so they can be
// checked on their own; the page fetches the rows and hands them in.
//
// The rules mirror components/attendance-employees.tsx so the sheet matches the Employees
// tab: a day counts by the date part of the record's `ts`, leaves only count from the day
// the employee joined and never into the future, and a roaming employee seen away from
// their home store only counts the days they actually scanned in.

import { format, parseISO } from "date-fns"

export interface AttendanceEmployee {
  id: string
  store_id: string
  name: string
  status: string // active | disabled
  created_at: string | null
  is_roaming: boolean
}

export interface AttendanceRecord {
  employee_id: string
  type: string // in | out
  ts: string
}

// `type` (not `interface`) so the rows can be passed straight to the sheet builder, which
// takes Record<string, unknown>.
export type AttendanceSummaryRow = {
  employee: string
  store: string
  status: string
  days_present: number
  working_days: number
  leaves: number
  total_hours: string
  avg_in: string
  avg_out: string
}

export type AttendanceRegisterRow = {
  date: string
  day: string
  employee: string
  store: string
  status: string
  in_time: string
  out_time: string
  hours: string
}

interface Session {
  inTs: string | null
  outTs: string | null
}

const DASH = "—"

const fmtTime = (ts: string | null | undefined): string => {
  if (!ts) return DASH
  try {
    return format(parseISO(ts), "hh:mm a")
  } catch {
    return DASH
  }
}

const fmtMs = (ms: number): string => {
  if (ms <= 0) return DASH
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return h ? `${h}h ${m}m` : `${m}m`
}

const minutesToLabel = (mins: number | null): string => {
  if (mins == null) return DASH
  const d = new Date()
  d.setHours(Math.floor(mins / 60), Math.round(mins % 60), 0, 0)
  return format(d, "hh:mm a")
}

const tsToMinutes = (ts: string): number => {
  const d = parseISO(ts)
  return d.getHours() * 60 + d.getMinutes()
}

const daysBetween = (fromKey: string, toKey: string): number =>
  Math.round((new Date(`${toKey}T00:00:00`).getTime() - new Date(`${fromKey}T00:00:00`).getTime()) / 86_400_000)

/** Every date from `fromKey` to `toKey` (yyyy-MM-dd), inclusive. */
export function listDates(fromKey: string, toKey: string): string[] {
  const out: string[] = []
  if (fromKey > toKey) return out
  const total = daysBetween(fromKey, toKey)
  const start = new Date(`${fromKey}T00:00:00`)
  for (let i = 0; i <= total; i += 1) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    out.push(format(d, "yyyy-MM-dd"))
  }
  return out
}

interface DayInfo {
  sessions: Session[]
  ms: number
}

export function buildAttendanceReport(input: {
  employees: AttendanceEmployee[]
  records: AttendanceRecord[]
  // yyyy-MM-dd, inclusive
  from: string
  to: string
  // yyyy-MM-dd; days after this are not reported (no leaves in the future)
  today: string
  // a store id, or "all"
  storeId: string
  storeNames: Record<string, string>
}): {
  summary: AttendanceSummaryRow[]
  register: AttendanceRegisterRow[]
  // One row per employee, one column per day ("P" present, "A" absent, "—" not applicable),
  // then Present / Absent / Total Hours; the last row counts who was present each day.
  matrix: Array<Record<string, string | number>>
} {
  const { employees, records, from, to, today, storeId, storeNames } = input
  const allStores = storeId === "all"
  const end = to < today ? to : today
  const dates = listDates(from, end)
  // "01 Nov (Sat)"; the year is added only when the range crosses years, so labels stay unique.
  const crossesYears = from.slice(0, 4) !== end.slice(0, 4)
  const dateLabel = (date: string) => format(parseISO(date), crossesYears ? "dd MMM yy (EEE)" : "dd MMM (EEE)")
  const matrix: Array<Record<string, string | number>> = []

  const byEmp = new Map<string, AttendanceRecord[]>()
  for (const r of [...records].sort((a, b) => a.ts.localeCompare(b.ts))) {
    const list = byEmp.get(r.employee_id)
    if (list) list.push(r)
    else byEmp.set(r.employee_id, [r])
  }

  const summary: AttendanceSummaryRow[] = []
  const register: AttendanceRegisterRow[] = []

  const sorted = [...employees].sort((a, b) => a.name.localeCompare(b.name))
  for (const emp of sorted) {
    const recs = byEmp.get(emp.id) ?? []
    const awayFromHome = !allStores && emp.is_roaming && emp.store_id !== storeId
    // A roaming employee only appears at another store once they have scanned there.
    if (awayFromHome && recs.length === 0) continue

    const dayMap = new Map<string, DayInfo>()
    for (const r of recs) {
      const date = r.ts.slice(0, 10)
      let day = dayMap.get(date)
      if (!day) {
        day = { sessions: [], ms: 0 }
        dayMap.set(date, day)
      }
      const open = day.sessions.find((s) => s.inTs && !s.outTs)
      if (r.type === "in") day.sessions.push({ inTs: r.ts, outTs: null })
      else if (open) open.outTs = r.ts
      else day.sessions.push({ inTs: null, outTs: r.ts })
    }

    let totalMs = 0
    const inMinutes: number[] = []
    const outMinutes: number[] = []
    for (const day of dayMap.values()) {
      for (const s of day.sessions) {
        if (s.inTs && s.outTs) day.ms += new Date(s.outTs).getTime() - new Date(s.inTs).getTime()
      }
      totalMs += day.ms
      const firstIn = day.sessions.find((s) => s.inTs)?.inTs
      if (firstIn) inMinutes.push(tsToMinutes(firstIn))
      const outs = day.sessions.filter((s) => s.outTs)
      if (outs.length) outMinutes.push(tsToMinutes(outs[outs.length - 1].outTs as string))
    }

    const created = (emp.created_at ?? "").slice(0, 10)
    const start = created && created > from ? created : from
    let workingDays = start <= end ? daysBetween(start, end) + 1 : 0
    if (awayFromHome) workingDays = dayMap.size
    const leaves = Math.max(0, workingDays - dayMap.size)

    const avg = (arr: number[]): number | null => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
    const storeName = storeNames[emp.store_id] ?? ""

    summary.push({
      employee: emp.name,
      store: storeName,
      status: emp.status === "active" ? "Active" : "Disabled",
      days_present: dayMap.size,
      working_days: workingDays,
      leaves,
      total_hours: fmtMs(totalMs),
      avg_in: minutesToLabel(avg(inMinutes)),
      avg_out: minutesToLabel(avg(outMinutes)),
    })

    const matrixRow: Record<string, string | number> = { Employee: emp.name, Store: storeName }
    for (const date of dates) {
      const day = dayMap.get(date)
      const notApplicable = !day && ((created && date < created) || awayFromHome)
      matrixRow[dateLabel(date)] = day ? "P" : notApplicable ? DASH : "A"
    }
    matrixRow["Present"] = dayMap.size
    matrixRow["Absent"] = leaves
    matrixRow["Total Hours"] = fmtMs(totalMs)
    matrix.push(matrixRow)

    for (const date of dates) {
      const day = dayMap.get(date)
      // Before they joined, or a store they are only visiting: nothing to say on a day they weren't there.
      if (!day && ((created && date < created) || awayFromHome)) continue
      const dayName = format(parseISO(date), "EEE")
      if (!day) {
        register.push({ date, day: dayName, employee: emp.name, store: storeName, status: "Absent", in_time: "", out_time: "", hours: "" })
        continue
      }
      const firstIn = day.sessions.find((s) => s.inTs)?.inTs
      const outs = day.sessions.filter((s) => s.outTs)
      const lastOut = outs.length ? outs[outs.length - 1].outTs : null
      register.push({
        date,
        day: dayName,
        employee: emp.name,
        store: storeName,
        status: "Present",
        in_time: fmtTime(firstIn),
        out_time: lastOut ? fmtTime(lastOut) : date === today ? "still in" : DASH,
        hours: fmtMs(day.ms),
      })
    }
  }

  register.sort((a, b) => a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee))

  if (matrix.length > 0) {
    const totals: Record<string, string | number> = { Employee: "Total present", Store: "" }
    for (const date of dates) {
      const label = dateLabel(date)
      totals[label] = matrix.filter((row) => row[label] === "P").length
    }
    totals["Present"] = matrix.reduce((s, row) => s + Number(row["Present"]), 0)
    totals["Absent"] = matrix.reduce((s, row) => s + Number(row["Absent"]), 0)
    totals["Total Hours"] = ""
    matrix.push(totals)
  }
  return { summary, register, matrix }
}
