"use client"

// How each store's billing app did on one day (GET /api/client-logs/health?day=YYYY-MM-DD): how many calls
// siri-api answered, how many fell back to the old path (and why), errors, and anything quarantined.

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"

import { fetchWithBackgroundRefresh } from "@/lib/api-cache"
import { formatDisplayDateTime } from "@/app/utils/formatDate"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Verdict = "ok" | "watch" | "bad" | "silent"

interface Device {
  store_id: string
  device_id: string
  store_name: string | null
  app_version: string | null
  last_seen: string | null
  verdict: Verdict
  lines_for_day: number
  siri_answered: number
  siri_fell_back: number
  fallback_rate: number
  errors: number
  quarantined: number
  unconfirmed_writes: number
  refused_logins: number
  log_gaps: number
  groups: Record<string, { answered: number; fell_back: number; p95_ms: number | null }>
  top_fallback_reasons: Array<[string, number]>
}

interface HealthResponse {
  day: string
  overall: Verdict
  devices: Device[]
}

const BADGE: Record<Verdict, string> = {
  ok: "border-green-200 bg-green-50 text-green-700",
  watch: "border-amber-200 bg-amber-50 text-amber-800",
  bad: "border-red-200 bg-red-50 text-red-700",
  silent: "border-slate-200 bg-slate-50 text-slate-600",
}

const VERDICT_TEXT: Record<Verdict, string> = {
  ok: "Healthy",
  watch: "Keep an eye",
  bad: "Problem",
  silent: "No logs this day",
}

const todayUtc = () => new Date().toISOString().slice(0, 10)

export default function LogsStoreHealth() {
  const [day, setDay] = useState(todayUtc())
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      await fetchWithBackgroundRefresh<HealthResponse>(
        `/api/client-logs/health?day=${day}`,
        (r) => {
          setDevices(Array.isArray(r.data?.devices) ? r.data.devices : [])
          setOffline(r.source === "cache")
        },
        () => setOffline(true),
      )
    } catch (e) {
      console.error("Failed to load store health:", e)
      setError("Could not load the store app summary.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input type="date" className="w-44" value={day} max={todayUtc()} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Day" />
        <span className="text-xs text-muted-foreground">Days are in UTC, like the logs the store apps send.</span>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="ml-auto">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {offline && (
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">Showing the last saved copy — no connection right now.</div>
      )}
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}

      <Card>
        <CardContent className="p-0">
          {devices.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{loading ? "Loading..." : "No store app has sent logs yet."}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Store</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 text-right font-medium">Answered by siri-api</th>
                    <th className="px-2 py-2 text-right font-medium">Fell back</th>
                    <th className="px-2 py-2 text-right font-medium">Errors</th>
                    <th className="px-2 py-2 text-right font-medium">Quarantined</th>
                    <th className="px-2 py-2 font-medium">Slowest 5%</th>
                    <th className="px-2 py-2 font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={`${d.store_id}/${d.device_id}`} className="border-b align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium">{d.store_name || d.store_id.slice(0, 8)}</div>
                        <div className="text-xs text-muted-foreground">{d.device_id}{d.app_version ? ` · v${d.app_version}` : ""}</div>
                      </td>
                      <td className="px-2 py-3"><Badge variant="outline" className={BADGE[d.verdict]}>{VERDICT_TEXT[d.verdict]}</Badge></td>
                      <td className="px-2 py-3 text-right tabular-nums">{d.siri_answered}</td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {d.siri_fell_back}
                        {d.top_fallback_reasons.length > 0 && (
                          <div className="text-xs text-muted-foreground">{d.top_fallback_reasons.map(([why, n]) => `${why === "None" ? "siri-api answered with an error" : why.replace(/:$/, "")} ×${n}`).join(", ")}</div>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">{d.errors}</td>
                      <td className={`px-2 py-3 text-right tabular-nums ${d.quarantined ? "font-semibold text-red-600" : ""}`}>{d.quarantined}</td>
                      <td className="px-2 py-3 text-xs text-muted-foreground">
                        {Object.entries(d.groups).map(([g, v]) => (
                          <div key={g}>{g}: {v.p95_ms ?? "-"} ms</div>
                        ))}
                      </td>
                      <td className="px-2 py-3 text-xs text-muted-foreground">{d.last_seen ? formatDisplayDateTime(d.last_seen) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
