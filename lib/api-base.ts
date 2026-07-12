// Single place that decides which backend the app talks to, at runtime:
// - Desktop (Tauri on Windows/macOS/Linux): the local Flask sidecar exe
// - Android: the VPS server (baked in from NEXT_PUBLIC_BACKEND_API_URL at build time)
//
// This lets ONE static export (`out/`) serve both platforms — no separate builds.

const LOCAL_URL = "http://127.0.0.1:8080"

const VPS_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL?.trim() || LOCAL_URL

export const isAndroid =
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)

export const API_BASE = isAndroid ? VPS_URL : LOCAL_URL
