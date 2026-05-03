import { useState, useEffect, useCallback } from 'react';

// Fetches /api/401k once on mount. Mirrors useBrokerageLink's contract:
// returns { data, loading, error, emptyState, refetch }. emptyState is set
// when the server reports no profile / no spreadsheet, so the caller can
// route to the onboarding screen instead of rendering an error.
export default function useFour01k() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [emptyState, setEmptyState] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEmptyState(null);
    try {
      const res = await fetch('/api/401k');
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
