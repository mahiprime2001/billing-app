"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { PauseCircle } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { getOpenSession, setBillingPause, type SessionSummary } from "@/lib/audit-session"

const POLL_MS = 8000

const timeOf = (iso?: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

/**
 * "Pause billing at this store" -- shown in the store's audit header, on every tab.
 *
 * It belongs to the live audit: the store's billing app asks siri-api every ~30 seconds and,
 * while this is on, shows a blocking dialog and refuses new bills. It switches itself off when
 * the audit is finished or cancelled. With no audit running there is nothing to pause, so the
 * switch is disabled and says why.
 */
export default function BillingPauseSwitch({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [session, setSession] = useState<SessionSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    const s = await getOpenSession(storeId)
    if (alive.current && s !== undefined) setSession(s) // undefined = server unreachable: keep what we know
  }, [storeId])

  useEffect(() => {
    alive.current = true
    void refresh()
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => {
      alive.current = false
      clearInterval(timer)
    }
  }, [refresh])

  const paused = !!session?.billingPaused

  const change = async (next: boolean) => {
    if (!session || busy) return
    if (next && !window.confirm(
      `Stop all new sales at ${storeName || "this store"}?\n\n` +
        "Its billing app will show a 'billing paused' screen within about 30 seconds. " +
        "Billing comes back when this audit is finished or cancelled, or when you switch this off.",
    )) return
    setBusy(true)
    setError(null)
    const result = await setBillingPause(session.id, next)
    if (!alive.current) return
    if (result.session) setSession(result.session)
    else {
      setError(result.error || "Couldn't change it.")
      void refresh()
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <label
        className={cn(
          "flex items-center gap-3 rounded-lg border px-3 py-2",
          paused ? "border-amber-400 bg-amber-50" : "bg-muted/30",
          !session && "opacity-60",
        )}
        title={session ? undefined : "Billing can be paused once an audit has started for this store"}
      >
        <PauseCircle className={cn("h-5 w-5", paused ? "text-amber-600" : "text-muted-foreground")} />
        <span className="text-sm font-medium">Pause billing at this store</span>
        <Switch
          checked={paused}
          disabled={!session || busy}
          onCheckedChange={(v) => void change(v)}
          aria-label="Pause billing at this store"
        />
      </label>

      {paused && (
        <p className="max-w-sm text-right text-xs text-amber-800">
          Billing is paused
          {session?.billingPausedAt ? ` since ${timeOf(session.billingPausedAt)}` : ""}
          {session?.billingPausedBy ? ` (by ${session.billingPausedBy})` : ""}. It ends when the audit is
          finished or cancelled.
        </p>
      )}
      {!session && <p className="text-xs text-muted-foreground">Available while an audit is running.</p>}
      {error && <p className="max-w-sm text-right text-xs text-red-600">{error}</p>}
    </div>
  )
}
