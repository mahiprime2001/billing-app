"use client";

import { useEffect } from "react";

export default function TauriCloseHandler({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).__TAURI__) {
      const setupCloseListener = async () => {
        const { appWindow } = await eval(`import('@tauri-apps/api/window')`);
        const { confirm } = await eval(`import('@tauri-apps/api/dialog')`);

        appWindow.onCloseRequested(async (event: any) => {
          const confirmed = await confirm(
            "Are you sure you want to close the application?",
            {
              title: "Confirm Close",
              type: "warning",
            }
          );
          if (!confirmed) {
            event.preventDefault();
          }
        });
      };
      setupCloseListener();
    }
  }, []);

  return <>{children}</>;
}
