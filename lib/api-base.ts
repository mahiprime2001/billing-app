// Single place that decides which backend the app talks to, at runtime.
//
// The local Flask sidecar is fully retired now (its Rust spawn/kill code is
// deleted, not just disabled): desktop and Android both talk to siri-api
// directly. This used to be a "testing only" override behind
// NEXT_PUBLIC_FORCE_BACKEND_URL; that env var is gone now that pointing at
// siri-api is the real, permanent behavior rather than a temporary escape
// hatch -- there's nothing left to "force" past.
//
// No fallback to the old sidecar address on purpose: NEXT_PUBLIC_* vars are
// baked in at build time, so a missing one is a build misconfiguration --
// silently falling back to a port nothing listens on anymore would just
// turn that into a confusing runtime failure instead of a loud, immediate one.
const rawBackendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL?.trim()
if (!rawBackendUrl) {
  throw new Error(
    "NEXT_PUBLIC_BACKEND_API_URL is not set -- this must be configured in .env before building."
  )
}

export const isAndroid =
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)

export const API_BASE = rawBackendUrl
