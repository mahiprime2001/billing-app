import { useEffect, useRef } from "react"

// Re-runs `fn` on an interval for as long as the calling page is mounted --
// paired with fetchWithBackgroundRefresh's cache-first paint, this is what
// makes a page's data "just stay current" while it's open, instead of only
// refreshing on the next full visit. Matches siri-api's own 60s cache TTL
// by default, so a poll here usually lands right as the server-side cache
// would've expired anyway.
export function useBackgroundPoll(fn: () => void | Promise<void>, intervalMs = 60_000, enabled = true) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let inFlight = false
    const tick = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      try {
        await fnRef.current()
      } finally {
        inFlight = false
      }
    }
    const id = setInterval(tick, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [intervalMs, enabled])
}
