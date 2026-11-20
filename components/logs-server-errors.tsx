"use client"

// Technical errors from siri-api itself (GET /api/server-errors): every ERROR log line and every 5xx answer,
// grouped so a problem that repeats shows as ONE row with a count. Secrets are removed on the server.

import { useEffect, useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"

import { fetchWithBackgroundRefresh } from "@/lib/api-cache"
import { useBackgroundPoll } from "@/hooks/useBackgroundPoll"
import { formatDisplayDateTime } from "@/app/utils/formatDate"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ErrorGroup {
  fingerprint: string
  kind: "log" | "http"
  method: string | null
  route: string | null
  status: number | null
  exc_type: string | null
  message: string | null
  trace: string | null
  store_id: string | null
  count: number
  first_seen: string
  last_seen: string
}

interface ErrorsResponse {
  hours: number
  groups: ErrorGroup[]
  totalOccurrences: number
}

const RANGES = [
  { value: "1", label: "Last hour" },
  { value: "6", label: "Last 6 hours" },
  { value: "24", label: "Last 24 hours" },
  { value: "72", label: "Last 3 days" },
  { value: "168", label: "Last 7 days" },
]

export default function LogsServerErrors() {
  const [groups, setGroups] = useState<ErrorGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [hours, setHours] = useState("24")
  const [kind, setKind] = useState<"all" | "log" | "http">("all")
  const [open, setOpen] = useState<string | null>(null)

  const load = async (background = false) => {
    if (!background) setLoading(true)
    setError(null)
    const query = `hours=${hours}${kind === "all" ? "" : `&kind=${kind}`}`
    try {
      await fetchWithBackgroundRefresh<ErrorsResponse>(
        `/api/server-errors?${query}`,
        (r) => {
          setGroups(Array.isArray(r.data?.groups) ? r.data.groups : [])
          setOffline(r.source === "cache")
        },
        () => setOffline(true),
      )
    } catch (e) {
      console.error("Failed to load server errors:", e)
      if (!background) setError("Could not load the server errors.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, kind])
  useBackgroundPoll(() => load(true))

  const total = useMemo(() => groups.reduce((n, g) => n + g.count, 0), [groups])
  const worst = useMemo(() => [...groups].sort((a, b) => b.count - a.count)[0], [groups])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={hours} onValueChange={setHours}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everything</SelectItem>
            <SelectItem value="log">Errors the server logged</SelectItem>
            <SelectItem value="http">Failed answers (5xx)</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="ml-auto">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {offline && (
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">Showing the last saved copy — no connection right now.</div>
      )}
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <div className="text-xs text-muted-foreground">Different problems</div>
          <div className="text-2xl font-semibold tabular-nums">{groups.length}</div>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <div className="text-xs text-muted-foreground">Times they happened</div>
          <div className="text-2xl font-semibold tabular-nums">{total}</div>
        </div>
        <div className="col-span-2 rounded-lg border bg-card px-4 py-3 lg:col-span-1">
          <div className="text-xs text-muted-foreground">Most frequent</div>
          <div className="truncate text-sm font-medium">{worst ? `${worst.method ?? ""} ${worst.route ?? "-"} · ${worst.count}×` : "–"}</div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {groups.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No server errors in this time. Good news."}
            </div>
          ) : (
            <div className="divide-y">
              {groups.map((g) => (
                <div key={g.fingerprint} className="px-4 py-3">
                  <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === g.fingerprint ? null : g.fingerprint)}>
                    <Badge variant="outline" className={`mt-0.5 shrink-0 ${g.kind === "http" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}>
                      {g.kind === "http" ? `HTTP ${g.status}` : g.exc_type || "error"}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {g.method} {g.route || "(background task)"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={g.message ?? ""}>{g.message}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        First {formatDisplayDateTime(g.first_seen)} · last {formatDisplayDateTime(g.last_seen)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 tabular-nums">{g.count}×</Badge>
                  </button>
                  {open === g.fingerprint && (
                    <div className="mt-2 space-y-1">
                      {g.exc_type && <p className="text-xs"><span className="text-muted-foreground">Exception:</span> {g.exc_type}</p>}
                      <p className="whitespace-pre-wrap break-words text-xs">{g.message}</p>
                      {g.trace && (
                        <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] leading-snug">{g.trace}</pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
