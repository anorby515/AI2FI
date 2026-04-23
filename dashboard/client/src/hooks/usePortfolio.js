import { useState, useEffect, useCallback, useMemo } from 'react';
import { aggregateOpenBySymbol, aggregateAllBySymbol } from '../utils/calculations';

export function usePortfolio() {
  const [lots, setLots] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // emptyState carries { noProfile | noSpreadsheet, profileName?, hint } when the server
  // signals that the dashboard has nothing to render yet — used by the UI to show
  // an onboarding screen instead of a red error.
  const [emptyState, setEmptyState] = useState(null);

  const fetchPortfolio = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEmptyState(null);
    try {
      const res = await fetch('/api/portfolio');
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (body && (body.noProfile || body.noSpreadsheet)) {
          setEmptyState(body);
          setLots([]);
          return;
        }
        throw new Error(`Server error ${res.status}`);
      }
      setLots(Array.isArray(body) ? body : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load cached quotes from server (no FMP calls — server reads from disk cache only)
  const loadCachedQuotes = useCallback(async (symbols) => {
    if (!symbols || symbols.length === 0) return;
    try {
      const res = await fetch('/api/prices/batch-current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: symbols }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setQuotes(prev => ({ ...prev, ...data }));
    } catch {}
  }, []);

  useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

  // Load cached quotes once lots are available
  useEffect(() => {
    if (lots.length === 0) return;
    const openSymbols = [...new Set(lots.filter(l => l.transaction === 'Open').map(l => l.symbol))];
    loadCachedQuotes(openSymbols);
  }, [lots, loadCachedQuotes]);

  const openLots = lots.filter(l => l.transaction === 'Open');
  const closedLots = lots.filter(l => l.transaction !== 'Open');
  const positions = aggregateOpenBySymbol(lots);
  const allPositions = aggregateAllBySymbol(lots);

  return { lots, openLots, closedLots, positions, allPositions, quotes, loading, error, emptyState, refetch: fetchPortfolio };
}

export function useBenchmark(ticker = 'SPY') {
  const [lookup, setLookup] = useState(null);

  useEffect(() => {
    // Reads from server cache only — no FMP call
    fetch(`/api/benchmark/${ticker}`)
      .then(r => r.json())
      .then(d => {
        if (!Array.isArray(d)) return;
        // Sort oldest first for forward-scanning lookup
        const sorted = [...d].sort((a, b) => a.date.localeCompare(b.date));
        const map = new Map(sorted.map(e => [e.date, e.close]));
        setLookup({ sorted, map });
      })
      .catch(() => {});
  }, [ticker]);

  return { lookup };
}

export function benchmarkPriceOnDate(lookup, dateStr) {
  if (!lookup || !dateStr) return null;
  const exact = lookup.map.get(dateStr);
  if (exact != null) return exact;
  const arr = lookup.sorted;
  // Scan forward for first date >= target
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].date >= dateStr) return arr[i].close;
  }
  // Target is beyond the data (e.g. today before market close) — use last available
  if (arr.length > 0) return arr[arr.length - 1].close;
  return null;
}

// Fetch current quotes for any set of tickers (including closed-position symbols).
// Checks server cache first (15-min TTL); fetches live from Yahoo Finance for misses.
// Returns { quotes: { [ticker]: { price, ... } | null }, loading, fetch: fn }
export function useCurrentQuotes(symbols) {
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(false);

  const key = useMemo(() => [...symbols].sort().join(','), [symbols]);

  const fetchQuotes = useCallback(async () => {
    if (!symbols || symbols.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/quotes/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: symbols }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setQuotes(prev => ({ ...prev, ...data }));
    } catch {} finally {
      setLoading(false);
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { quotes, loading, fetch: fetchQuotes };
}

export function useMoat(symbol) {
  const [moat, setMoat] = useState(null);

  useEffect(() => {
    if (!symbol) return;
    fetch(`/api/moat/${symbol}`)
      .then(r => { if (r.ok) return r.json(); return null; })
      .then(data => setMoat(data))
      .catch(() => {});
  }, [symbol]);

  return moat;
}

// On-demand: fetched when user clicks into a position (1 call, cached forever)
export function useDividends(symbol) {
  const [dividends, setDividends] = useState([]);

  useEffect(() => {
    if (!symbol) return;
    fetch(`/api/dividends/${symbol}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setDividends(data); })
      .catch(() => {});
  }, [symbol]);

  return { dividends };
}

// On-demand: fetched when user clicks into a position (1 call, cached forever)
export function usePriceHistory(symbol, from, to) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);

    let url = `/api/prices/${symbol}`;
    const params = [];
    if (from) params.push(`from=${from}`);
    if (to) params.push(`to=${to}`);
    if (params.length) url += '?' + params.join('&');

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) {
          setError(data?.error || 'No price data — run Sync first');
          return;
        }
        // Sort oldest first for charts
        setHistory([...data].sort((a, b) => a.date.localeCompare(b.date)));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [symbol, from, to]);

  return { history, loading, error };
}
