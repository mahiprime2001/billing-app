"use client";

import React, { useEffect } from "react";
import IdleTimeoutHandler from "@/components/idle-timeout-handler";
import OfflineBanner from "@/components/OfflineBanner";
import ServerErrorHandler from "@/components/server-error-handler";
import Updater from "@/components/Updater";
import packageJson from "../package.json"; // Assuming package.json is one level up from components
import { invoke } from "@tauri-apps/api/core";

export default function AppProviders({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    const backendApiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://127.0.0.1:8080";
    const pollInterval = 5000; // Poll every 5 seconds

    const sendHeartbeat = async () => {
      try {
        const response = await fetch(`${backendApiUrl}/api/sync/status`);
        if (!response.ok) {
          console.error(`Heartbeat failed: ${response.status} ${response.statusText}`);
        } else {
          const data = await response.json();
          console.log("Heartbeat successful:", data);
        }
      } catch (error) {
        console.error("Error sending heartbeat:", error);
      }
    };

    // Ensure backend is running on app load
    const ensureBackend = async () => {
      if (typeof window !== 'undefined' && '__TAURI__' in window) {
        try {
          const result = await invoke('ensure_backend_running');
          console.log('Backend check:', result);
        } catch (error) {
          console.error('Failed to ensure backend is running:', error);
        }
      }
    };

    // Send initial heartbeat and ensure backend immediately
    sendHeartbeat();
    ensureBackend();

    // Set up interval for continuous heartbeats
    const intervalId = setInterval(sendHeartbeat, pollInterval);

    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

  return (
    <>
      {/* Updater component - checks for updates on app load */}
      <Updater />
      
      {/* Other global components */}
      <OfflineBanner />
      <IdleTimeoutHandler />
      
      {/* Main content */}
      <ServerErrorHandler>{children}</ServerErrorHandler>
      
      {/* Version display in footer (optional) */}
      <div className="fixed bottom-2 left-2 text-xs text-gray-400 pointer-events-none z-50">
        v{packageJson.version}
      </div>
    </>
  );
}
