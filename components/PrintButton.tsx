"use client";

import { useEffect, useState } from "react";

export default function PrintButton() {
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    // Detect Tauri only in the browser
    if (typeof window !== "undefined" && (window as any).__TAURI__) {
      setIsTauri(true);

      // Lazy-load event API to avoid SSR issues
      import("@tauri-apps/api/event")
        .then(({ listen }) => {
          // Listen for a backend event to trigger native print of the webview
          const setup = async () => {
            const unlisten = await listen("trigger-print", () => {
              // For web fallback, still allow browser print if frontend decides to use it
              window.print();
            });
            // Optionally store unlisten somewhere if teardown is needed
          };
          setup().catch((err) =>
            console.error("Failed to set up Tauri event listener", err)
          );
        })
        .catch((err) => {
          console.error("Failed to load Tauri event API", err);
        });
    }
  }, []);

  const handlePrint = async () => {
    // Only attempt Tauri invoke when running inside Tauri
    if (typeof window !== "undefined" && (window as any).__TAURI__) {
      try {
        // Tauri v2: invoke is in @tauri-apps/api/core
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("print_current_window");
      } catch (error) {
        console.error("Failed to invoke print:", error);
      }
    } else {
      // Non-Tauri environment (e.g., web dev server): fallback to browser print or log
      // window.print();
      console.log("Not running inside Tauri");
    }
  };

  return (
    <button onClick={handlePrint} aria-disabled={!isTauri} title={isTauri ? "Print" : "Tauri not detected"}>
      Print
    </button>
  );
}
