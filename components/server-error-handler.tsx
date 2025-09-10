"use client"

import { useEffect, useState } from 'react';

export default function ServerErrorHandler({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      if (typeof window !== 'undefined' && window.__TAURI__) {
        const { listen } = await import('@tauri-apps/api/event');
        const unlistenPromise = listen<string>('server-error', event => {
          setError(event.payload);
        });
        unlisten = await unlistenPromise;
      }
    };

    setupListener();

    return () => {
      unlisten?.();
    };
  }, []);

  if (error) {
    return <div style={{ color: 'red', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Error: {error}</div>;
  }

  return <>{children}</>;
}
