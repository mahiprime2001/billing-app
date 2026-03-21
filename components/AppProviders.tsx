"use client";

import React, { useEffect, useState, useRef } from "react";
import IdleTimeoutHandler from "@/components/idle-timeout-handler";
import OfflineBanner from "@/components/OfflineBanner";
import ServerErrorHandler from "@/components/server-error-handler";
import Updater from "@/components/Updater";
import { invoke } from "@tauri-apps/api/core";

export default function AppProviders({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  
  // ✅ FIX: Use refs to track backend initialization state
  const backendInitialized = useRef(false);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousBackendStatusRef = useRef<'online' | 'offline' | 'checking'>('checking');
  const reconnectSyncInFlightRef = useRef(false);

  // ✅ HARDCODED: Backend URL
  const BACKEND_URL = "http://127.0.0.1:8080";

  useEffect(() => {
    const pollInterval = 5000; // Poll every 5 seconds
    const requestTimeout = 5000; // 5 second timeout for requests

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
          
          // ✅ FIX: Try to restart backend only once per failure cycle
          if (retryCount >= MAX_RETRIES && !backendInitialized.current) {
            await ensureBackend();
            setRetryCount(0);
          }
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
        
        // ✅ FIX: Try to restart backend only once per failure cycle
        if (retryCount >= MAX_RETRIES && !backendInitialized.current) {
          await ensureBackend();
          setRetryCount(0);
        }
      }
    };

    // ✅ FIX: Ensure backend is running only ONCE
    const ensureBackend = async () => {
      if (backendInitialized.current) {
        console.log("⚠️ Backend already initialized, skipping...");
        return;
      }

      if (typeof window !== 'undefined' && '__TAURI__' in window) {
        try {
          console.log("🔄 Attempting to start backend...");
          backendInitialized.current = true; // ✅ Mark as initialized BEFORE calling
          
          const result = await invoke('ensure_backend_running');
          console.log('✅ Backend check:', result);

          // Wait a moment for backend to start, then retry heartbeat
          setTimeout(() => {
            sendHeartbeat();
          }, 2000);
        } catch (error) {
          console.error('❌ Failed to ensure backend is running:', error);
          backendInitialized.current = false; // ✅ Reset on failure
        }
      }
    };

    // ✅ FIX: Only initialize once
    if (!backendInitialized.current) {
      console.log("🚀 Initializing backend for the first time...");
      ensureBackend();
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
