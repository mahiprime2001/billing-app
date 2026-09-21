"use client"

import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"
import { API_BASE } from "@/lib/api-base"

const PING_INTERVAL_MS = 10_000

/**
 * Small, non-blocking "offline" indicator -- same for Android and desktop.
 *
 * Used to be an Android-only FULL-SCREEN block: written back when desktop
 * fell back to a local Flask sidecar while offline (so it didn't need this
 * gate) and Android had no offline story at all (so blocking outright was
 * the only safe option). Neither is true anymore -- the sidecar is gone
 * (both platforms talk to siri-api directly), and every page now has its
 * own read-only offline fallback (local SQLite mirror / cached response,
 * see lib/resilient-client.ts and lib/api-cache.ts). A full-screen block
 * would now just hide that work instead of protecting anything, so this is
 * a quiet corner badge instead -- lets the user know why data might be a
 * minute stale without stopping them from using the app.
 */
export default function OfflineGate() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let cancelled = false

    const ping = async () => {
      try {
        // Must be an /api/* path — the Flask backend only sets CORS headers
        // on /api/* routes, and a CORS-blocked response looks like "offline".
        const res = await fetch(`${API_BASE}/api/sync/status`, { cache: "no-store" })
        if (!cancelled) setOffline(!res.ok)
      } catch {
        if (!cancelled) setOffline(true)
      }
    }

    const onOffline = () => setOffline(true)
    const onOnline = () => ping()

    window.addEventListener("offline", onOffline)
    window.addEventListener("online", onOnline)

    ping()
    const interval = setInterval(() => {
      // Re-check periodically so the screen clears on its own once the
      // server is reachable again (navigator events miss server outages).
      if (!navigator.onLine) setOffline(true)
      else ping()
    }, PING_INTERVAL_MS)

    return () => {
      cancelled = true
      window.removeEventListener("offline", onOffline)
      window.removeEventListener("online", onOnline)
      clearInterval(interval)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800 shadow-sm"
      aria-live="polite"
    >
      <WifiOff className="h-3.5 w-3.5" />
      Offline — showing last synced data. Reconnecting automatically.
    </div>
  )
}
