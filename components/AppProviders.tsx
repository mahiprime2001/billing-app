"use client";

import React, { useEffect, useState, useRef } from "react";
import IdleTimeoutHandler from "@/components/idle-timeout-handler";
import OfflineBanner from "@/components/OfflineBanner";
import ServerErrorHandler from "@/components/server-error-handler";
import Updater from "@/components/Updater";
import { API_BASE } from "@/lib/api-base";
import { LOGIN_SUCCESS_EVENT } from "@/lib/auth-events";
import { runInitialSync } from "@/lib/initial-sync";

// Module-level guard (not a ref) so window.fetch only ever gets patched
// once, even if this component remounts -- double-patching would stack
// interceptors and re-send the header/redirect logic multiple times per
// request.
let fetchPatched = false;

// Guards runInitialSync() so it only fires once per login, whether that's
// "app restarted while already logged in" or "just logged in this session"
// -- both are checked in the effect below and could otherwise race/double-fire.
// Reset on a 401-triggered logout (see installAuthenticatedFetch) so a
// re-login later in the same process re-syncs rather than staying dormant.
// KNOWN GAP: explicit "Logout" buttons elsewhere (dashboard-layout.tsx,
// billing-layout.tsx) don't reset this -- low practical impact, since the
// already-running sync loops keep working fine once a fresh token exists,
// they just won't force an immediate full re-pull on that specific relogin.
let initialSyncStarted = false;

function runInitialSyncOnce(reason: "mount" | "login-event") {
  if (initialSyncStarted) return;
  initialSyncStarted = true;
  runInitialSync(reason).catch((err) => console.error("[initial sync] failed:", err));
}

function installAuthenticatedFetch() {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;

  const originalFetch = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isBackendRequest = url.startsWith(API_BASE);

    let finalInit = init;
    let token: string | null = null;
    if (isBackendRequest) {
      token = localStorage.getItem("adminToken");
      if (token) {
        finalInit = {
          ...init,
          headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` },
        };
      }
    }

    const response = await originalFetch(input, finalInit);

    // Only treat a 401 as "session expired" if a token was actually sent --
    // an anonymous 401 (e.g. heartbeat polling before login) is expected,
    // not a session failure, and must not trigger a redirect loop on the
    // login page itself.
    if (isBackendRequest && response.status === 401 && token) {
      localStorage.removeItem("adminLoggedIn");
      localStorage.removeItem("adminUser");
      localStorage.removeItem("adminToken");
      initialSyncStarted = false;
      window.location.href = "/";
    }

    return response;
  };
}

export default function AppProviders({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Runs during render, before any effect (including the heartbeat one
  // below) can fire a fetch -- installAuthenticatedFetch's own guard makes
  // this safe to call on every render.
  installAuthenticatedFetch();

  const [backendStatus, setBackendStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [retryCount, setRetryCount] = useState(0);

  // TEMPORARY Phase-2 diagnostic: proves the local SQLite plugin actually
  // works end-to-end (desktop only). Logs to console, touches nothing else.
  // Safe to delete once real domains start using lib/local-db.ts for real.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (typeof window === "undefined" || !("__TAURI__" in window)) return;
    import("@/lib/local-db").then(({ runSqlProof }) =>
      runSqlProof()
        .then((rows) => console.log("✅ [Phase 2 SQL proof] local SQLite works:", rows))
        .catch((err) => console.error("❌ [Phase 2 SQL proof] failed:", err))
    );
  }, []);

  // Kick off the local Products/Stores/tax sync as soon as we know someone
  // is logged in -- covers both "app restarted while already logged in"
  // (mount-time localStorage check) and "just logged in this session"
  // (the login-success event dispatched from app/page.tsx's saveLoginSession).
  // AppProviders wraps app/page.tsx itself (see app/layout.tsx), so this
  // effect is guaranteed to be mounted and listening before handleLogin can
  // ever run.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("adminLoggedIn") === "true") {
      runInitialSyncOnce("mount");
    }
    const onLogin = () => runInitialSyncOnce("login-event");
    window.addEventListener(LOGIN_SUCCESS_EVENT, onLogin);
    return () => window.removeEventListener(LOGIN_SUCCESS_EVENT, onLogin);
  }, []);

  // Guards the heartbeat interval so it's only ever set up once.
  const backendInitialized = useRef(false);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousBackendStatusRef = useRef<'online' | 'offline' | 'checking'>('checking');
  const reconnectSyncInFlightRef = useRef(false);

  const BACKEND_URL = API_BASE;

  useEffect(() => {
    const pollInterval = 5000; // Poll every 5 seconds
    // Internet round-trips (Android -> VPS) need more headroom than localhost,
    // especially while large responses are downloading in parallel.
    const requestTimeout = 15000;

    const triggerReconnectSync = async () => {
      if (reconnectSyncInFlightRef.current) return;
      reconnectSyncInFlightRef.current = true;
      try {
        const response = await fetch(`${BACKEND_URL}/api/sync/reconnect`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          console.warn(`Reconnect sync failed: ${response.status} ${response.statusText}`);
          return;
        }
        const payload = await response.json();
        console.log("✅ Reconnect sync result:", payload);
      } catch (error) {
        console.warn("Reconnect sync request failed:", error);
      } finally {
        reconnectSyncInFlightRef.current = false;
      }
    };

    const sendHeartbeat = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

      try {
        const response = await fetch(`${BACKEND_URL}/api/sync/status`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.error(`Heartbeat failed: ${response.status} ${response.statusText}`);
          setBackendStatus('offline');
          previousBackendStatusRef.current = 'offline';
          setRetryCount(prev => prev + 1);
        } else {
          const data = await response.json();
          console.log("✅ Backend heartbeat:", data);
          setBackendStatus('online');
          if (previousBackendStatusRef.current !== 'online') {
            previousBackendStatusRef.current = 'online';
            void triggerReconnectSync();
          }
          setRetryCount(0);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            console.error("⏱️ Heartbeat timeout - Backend not responding");
          } else {
            console.error("❌ Backend connection error:", error.message);
          }
        } else {
          console.error("❌ Unknown heartbeat error:", error);
        }

        setBackendStatus('offline');
        previousBackendStatusRef.current = 'offline';
        setRetryCount(prev => prev + 1);
      }
    };

    // Only set up the heartbeat loop once. This flag used to also gate a
    // "try to restart the local backend" recovery action (removed along
    // with the sidecar) -- siri-api being unreachable isn't something this
    // app can fix by spawning a local process, so the heartbeat's own
    // interval retrying every pollInterval is the whole recovery story now.
    if (!backendInitialized.current) {
      backendInitialized.current = true;
      console.log("🚀 Starting backend heartbeat monitoring...");
      sendHeartbeat();

      // Set up interval for continuous heartbeats
      heartbeatIntervalRef.current = setInterval(sendHeartbeat, pollInterval);
    }

    // Clean up interval on component unmount
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [retryCount]); // Keep retryCount dependency for retry logic

  return (
    <>
      <Updater />
      <IdleTimeoutHandler />
      <ServerErrorHandler>
        {backendStatus === 'offline' && <OfflineBanner />}
        {children}
      </ServerErrorHandler>
    </>
  );
}
