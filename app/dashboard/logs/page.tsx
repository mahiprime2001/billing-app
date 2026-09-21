"use client"

import { fetchWithBackgroundRefresh } from "@/lib/api-cache"
import { useBackgroundPoll } from "@/hooks/useBackgroundPoll"
import { useEffect, useMemo, useState, type ComponentType } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, Info, XCircle, RefreshCw } from "lucide-react"
import { formatDisplayDateTime } from "@/app/utils/formatDate"

interface ServerEvent {
  id: string
  severity: "info" | "warning" | "error"
  event_type: string
  message: string
  store_id: string | null
  ref_id: string | null
  detail: string | null
  created_at: string
}

interface ServerEventsResponse {
  events: ServerEvent[]
  nextBefore: string | null
}

const SEVERITY_BADGE: Record<ServerEvent["severity"], string> = {
  info: "bg-blue-50 text-blue-700 border-blue-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  error: "bg-red-50 text-red-700 border-red-200",
}

const SEVERITY_ICON: Record<ServerEvent["severity"], ComponentType<{ className?: string }>> = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
}

export default function LogsPage() {
  const router = useRouter()
  const [events, setEvents] = useState<ServerEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOfflineFallback, setIsOfflineFallback] = useState(false)
  const [severityFilter, setSeverityFilter] = useState<"all" | ServerEvent["severity"]>("all")

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    const userData = localStorage.getItem("adminUser")
    if (isLoggedIn !== "true" || !userData) {
      router.push("/")
      return
    }
    const user = JSON.parse(userData)
    if (user.role !== "super_admin" && user.role !== "admin") {
      router.push("/")
      return
    }
  }, [router])

  const loadEvents = async (isBackground = false) => {
    if (!isBackground) setLoading(true)
    setError(null)
    const path = severityFilter === "all" ? "/api/server-events" : `/api/server-events?severity=${severityFilter}`
    try {
      await fetchWithBackgroundRefresh<ServerEventsResponse>(
        path,
        (r) => {
          setEvents(Array.isArray(r.data?.events) ? r.data.events : [])
          setIsOfflineFallback(r.source === "cache")
        },
        () => setIsOfflineFallback(true)
      )
    } catch (err) {
      console.error("Failed to load server events:", err)
      if (!isBackground) setError("Failed to load logs.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severityFilter])
  useBackgroundPoll(() => loadEvents(true))

  const counts = useMemo(() => {
    const c = { info: 0, warning: 0, error: 0 }
    for (const e of events) c[e.severity] += 1
    return c
  }, [events])

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Logs</h1>
            <p className="text-sm text-muted-foreground">
              What&apos;s happening on the server, in plain English — bills created, and anything that went wrong.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadEvents()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {isOfflineFallback && (
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800" aria-live="polite">
            Showing logs from the last sync — no connection right now.
          </div>
        )}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        )}

        <div className="flex items-center gap-3">
          <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as typeof severityFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="info">Info ({counts.info})</SelectItem>
              <SelectItem value="warning">Warning ({counts.warning})</SelectItem>
              <SelectItem value="error">Error ({counts.error})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {events.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {loading ? "Loading..." : "No events yet."}
              </div>
            ) : (
              <div className="divide-y">
                {events.map((event) => {
                  const Icon = SEVERITY_ICON[event.severity]
                  return (
                    <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                      <Badge variant="outline" className={`mt-0.5 shrink-0 gap-1 ${SEVERITY_BADGE[event.severity]}`}>
                        <Icon className="h-3 w-3" />
                        {event.severity}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{event.message}</p>
                        {event.detail && (
                          <p className="mt-1 truncate text-xs text-muted-foreground" title={event.detail}>
                            {event.detail}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                        {formatDisplayDateTime(event.created_at)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
