"use client";

import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    const backendApiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://127.0.0.1:8080";
    const pollInterval = 5000; // Poll every 5 seconds
    const requestTimeout = 5000; // 5 second timeout for requests

    const sendHeartbeat = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

      try {
        const response = await fetch(`${backendApiUrl}/api/sync/status`, {
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
          setRetryCount(prev => prev + 1);
          
          // Try to restart backend if in Tauri and max retries reached
          if (retryCount >= MAX_RETRIES) {
            await ensureBackend();
            setRetryCount(0);
          }
        } else {
          const data = await response.json();
          console.log("✅ Backend heartbeat:", data);
          setBackendStatus('online');
          setRetryCount(0); // Reset retry count on success
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
        setRetryCount(prev => prev + 1);
        
        // Try to restart backend if in Tauri and max retries reached
        if (retryCount >= MAX_RETRIES) {
          await ensureBackend();
          setRetryCount(0);
        }
      }
    };

    // Ensure backend is running on app load (Tauri only)
    const ensureBackend = async () => {
      if (typeof window !== 'undefined' && '__TAURI__' in window) {
        try {
          console.log("🔄 Attempting to start backend...");
          const result = await invoke('ensure_backend_running');
          console.log('✅ Backend check:', result);
          
          // Wait a moment for backend to start, then retry heartbeat
          setTimeout(() => {
            sendHeartbeat();
          }, 2000);
        } catch (error) {
          console.error('❌ Failed to ensure backend is running:', error);
        }
      }
    };

    // Send initial heartbeat and ensure backend immediately
    sendHeartbeat();
    ensureBackend();

    // Set up interval for continuous heartbeats
    const intervalId = setInterval(sendHeartbeat, pollInterval);

    // Clean up interval on component unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [retryCount]); // Add retryCount to dependencies

  return (
    <>
      {/* Updater component - checks for updates on app load */}
      {/* ✅ FIXED: Removed currentVersion prop */}
      <Updater />

      {/* Offline banner - shows when no internet connection */}
      <OfflineBanner />

      {/* Backend status indicator */}
      {backendStatus === 'offline' && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2 z-50">
          ⚠️ Backend server is offline. Retrying... ({retryCount}/{MAX_RETRIES})
        </div>
      )}

      {/* Server error handler - catches API errors */}
      {/* ✅ FIXED: Added children prop */}
      <ServerErrorHandler>
        {/* Idle timeout handler - logs out inactive users */}
        <IdleTimeoutHandler />

        {/* Main app content */}
        {children}
      </ServerErrorHandler>
    </>
  );
}
