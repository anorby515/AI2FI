// Hooks for the retirement-forecast page. Two surfaces:
//
//   useRetirementScenarios()  — list of saved scenarios + load/save/delete + the
//                               on-the-fly default builder. Optimistic-friendly:
//                               every mutation refetches the list so the UI
//                               stays in sync with on-disk state.
//
//   useRetirementInputs()     — read-only aggregator: DOBs, balances, pension
//                               options, salary/contribution hints. The Monte
//                               Carlo engine consumes this alongside the active
//                               scenario.
//
// Backend: /api/retirement/scenarios (CRUD + GET /_default), /api/retirement/inputs.

import { useState, useEffect, useCallback } from 'react';

const SCENARIOS_BASE = '/api/retirement/scenarios';
const INPUTS_URL = '/api/retirement/inputs';

export function useRetirementScenarios() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [emptyState, setEmptyState] = useState(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEmptyState(null);
    try {
      const res = await fetch(SCENARIOS_BASE);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (body && (body.noProfile || body.noSpreadsheet)) {
          setEmptyState(body);
          setList([]);
          return;
        }
        throw new Error(body?.error || `Server error ${res.status}`);
      }
      setList(Array.isArray(body) ? body : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const load = useCallback(async (id) => {
    if (!id) return null;
    const res = await fetch(`${SCENARIOS_BASE}/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return res.json();
  }, []);

  const loadDefault = useCallback(async () => {
    const res = await fetch(`${SCENARIOS_BASE}/_default`);
    if (!res.ok) return null;
    return res.json();
  }, []);

  // Create a brand-new scenario (server slugs the id from name). Returns the
  // saved scenario JSON or throws on conflict / server error.
  const create = useCallback(async (scenario) => {
    const res = await fetch(SCENARIOS_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scenario),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body?.error || `Create failed (${res.status})`;
      throw new Error(msg);
    }
    await fetchList();
    return body;
  }, [fetchList]);

  // Replace an existing scenario by id. Returns the saved scenario JSON.
  const update = useCallback(async (id, scenario) => {
    const res = await fetch(`${SCENARIOS_BASE}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scenario),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body?.error || `Save failed (${res.status})`;
      throw new Error(msg);
    }
    await fetchList();
    return body;
  }, [fetchList]);

  const remove = useCallback(async (id) => {
    const res = await fetch(`${SCENARIOS_BASE}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `Delete failed (${res.status})`);
    }
    await fetchList();
  }, [fetchList]);

  return {
    list, loading, error, emptyState,
    refetch: fetchList,
    load, loadDefault, create, update, remove,
  };
}

export function useRetirementInputs() {
  const [inputs, setInputs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [emptyState, setEmptyState] = useState(null);

  const fetchInputs = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEmptyState(null);
    try {
      const res = await fetch(INPUTS_URL);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (body && (body.noProfile || body.noSpreadsheet)) {
          setEmptyState(body);
          setInputs(null);
          return;
        }
        throw new Error(body?.error || `Server error ${res.status}`);
      }
      setInputs(body);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInputs(); }, [fetchInputs]);

  return { inputs, loading, error, emptyState, refetch: fetchInputs };
}
