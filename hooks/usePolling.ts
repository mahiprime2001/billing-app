import { useState, useEffect, useRef } from 'react';

interface UsePollingOptions<T> {
  interval?: number; // Polling interval in milliseconds
  enabled?: boolean; // Whether polling is enabled
  initialData?: () => T | undefined; // Synchronous hydrator (e.g. read from localStorage)
  // Delay before the FIRST fetch only (subsequent interval ticks are
  // unaffected). Lets a page with several polling hooks stagger their
  // startup requests instead of all firing in the same instant -- see
  // billing/page.tsx, where 3 of these plus 3 one-off mount fetches used to
  // fire together and pile up against the backend's limited worker slots.
  initialDelayMs?: number;
}

const usePolling = <T>(
  fetcher: () => Promise<T>,
  options?: UsePollingOptions<T>
) => {
  const { interval = 5000, enabled = true, initialData, initialDelayMs = 0 } = options || {};
  const [data, setData] = useState<T | undefined>(() => initialData?.());
  // If we hydrated from cache, the UI already has something to show — don't
  // gate it behind a loading spinner while we refresh in the background.
  const [loading, setLoading] = useState<boolean>(() => initialData?.() === undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const dataRef = useRef<T | undefined>(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      // Only flip the loading flag when we have nothing to show. Background
      // refreshes shouldn't make a populated table flash a spinner.
      if (dataRef.current === undefined) setLoading(true);
      try {
        const result = await fetcherRef.current();
        setData(result);
        setError(undefined);
      } catch (err: any) {
        setError(err);
        // Keep previously fetched (or cached) data visible on transient errors.
      } finally {
        setLoading(false);
      }
    };

    const initialTimeoutId = setTimeout(fetchData, initialDelayMs);

    const intervalId = setInterval(() => {
      fetchData();
    }, interval);

    return () => {
      clearTimeout(initialTimeoutId);
      clearInterval(intervalId);
    }; // Cleanup on unmount or dependency change
  }, [interval, enabled]);

  const refetch = () => {
    // Manually trigger a fetch
    const fetchData = async () => {
      if (dataRef.current === undefined) setLoading(true);
      try {
        const result = await fetcherRef.current();
        setData(result);
        setError(undefined);
      } catch (err: any) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  };

  return { data, loading, error, refetch };
};

export default usePolling;
