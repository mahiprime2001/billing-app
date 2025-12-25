"use client";

import packageJson from "../package.json";

export function VersionBadge() {
  return (
    <div className="fixed bottom-2 right-2 z-[100] pointer-events-none select-none opacity-50 hover:opacity-100 transition-opacity">
      <span className="text-[15px] font-mono text-muted-foreground">v{packageJson.version}</span>
    </div>
  );
}