"use client"

import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

export default function ServerErrorHandler({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlisten = listen('server-error', event => {
      if (typeof event.payload === 'string') {
        setError(event.payload);
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  if (error) {
    return <div style={{ color: 'red', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Error: {error}</div>;
  }

  return <>{children}</>;
}
