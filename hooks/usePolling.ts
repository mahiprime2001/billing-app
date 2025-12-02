import { useState, useEffect, useRef } from 'react';

interface UsePollingOptions {
  interval?: number; // Polling interval in milliseconds
  enabled?: boolean; // Whether polling is enabled
}

const usePolling = <T>(
  fetcher: () => Promise<T>,
  options?: UsePollingOptions
) => {
  const { interval = 5000, enabled = true } = options || {};
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await fetcherRef.current();
        setData(result);
        setError(undefined);
      } catch (err: any) {
        setError(err);
        setData(undefined);
      } finally {
        setLoading(false);
      }
    };

    fetchData(); // Initial fetch

    const intervalId = setInterval(() => {
      fetchData();
    }, interval);

    return () => clearInterval(intervalId); // Cleanup on unmount or dependency change
  }, [interval, enabled]);

  const refetch = () => {
    // Manually trigger a fetch
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await fetcherRef.current();
        setData(result);
        setError(undefined);
      } catch (err: any) {
        setError(err);
        setData(undefined);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  };

  return { data, loading, error, refetch };
};

export default usePolling;
