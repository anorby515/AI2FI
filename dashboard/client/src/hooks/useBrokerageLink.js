import { useState, useEffect, useCallback } from 'react';

// Fetches /api/brokerage-link once on mount. Returns the parsed payload from
// the route plus the standard loading/error/emptyState shape used by the rest
// of the dashboard hooks.
//
// emptyState mirrors usePortfolio: { noProfile, noSpreadsheet, profileName, hint }
// when the server signals there's nothing to render yet.
export default function useBrokerageLink() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [emptyState, setEmptyState] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEmptyState(null);
    try {
      const res = await fetch('/api/brokerage-link');
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (body && (body.noProfile || body.noSpreadsheet)) {
          setEmptyState(body);
          setData(null);
          return;
        }
        throw new Error(body?.error || `Server error ${res.status}`);
      }
      setData(body);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, emptyState, refetch: fetchData };
}
