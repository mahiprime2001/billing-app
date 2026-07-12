"use client"

import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"
import { API_BASE, isAndroid } from "@/lib/api-base"

const PING_INTERVAL_MS = 10_000

/**
 * Android-only full-screen blocker shown while the device cannot reach the
 * backend server. Desktop is unaffected (it talks to the local sidecar).
 */
export default function OfflineGate() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    if (!isAndroid) return

    let cancelled = false

    const ping = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`, { cache: "no-store" })
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
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <WifiOff className="h-16 w-16 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-muted-foreground">
        This app needs an internet connection to reach the server. Please
        check your connection — it will reconnect automatically.
      </p>
    </div>
  )
}
