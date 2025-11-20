"use client";
// components/OfflineBanner.tsx
import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast"; // Import the toast function

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [initialCheckDone, setInitialCheckDone] = useState(false); // To prevent toast on initial load

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (initialCheckDone) {
        toast({
          title: "You are back online!",
          description: "All features are now available.",
          variant: "default",
        });
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (initialCheckDone) {
        toast({
          title: "You are currently offline.",
          description: "Some features may not be available.",
          variant: "destructive",
        });
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check
    if (typeof navigator.onLine !== "undefined") {
      setIsOnline(navigator.onLine);
    }
    setInitialCheckDone(true);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [initialCheckDone]); // Depend on initialCheckDone

  if (isOnline) {
    return null; // The banner is not shown if online, only toasts
  }

  // The banner itself is still rendered when offline, but toasts are now also used
  // The original banner content is preserved here.

  return (
    <div className="bg-yellow-500 text-white text-center p-2">
      You are currently offline. Some features may not be available.
    </div>
  );
}
