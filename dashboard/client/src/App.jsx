import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { usePortfolio, useBenchmark } from './hooks/usePortfolio';
import { DEFAULT_TAX_RATES, aggregateOpenBySymbol, aggregateAllBySymbol } from './utils/calculations';
import Dashboard from './components/Dashboard';
import HoldingsList from './components/HoldingsList';
import PositionDetail from './components/PositionDetail';
import ClosedPositions from './components/ClosedPositions';
import LossHarvesting from './components/LossHarvesting';
import PortfolioChart from './components/PortfolioChart';
// import PortfolioPies from './components/PortfolioPies';
import Sidebar from './components/Sidebar';
import NetWorthView from './components/NetWorthView';
import CollegeView from './components/CollegeView';
import ComingSoon from './components/ComingSoon';
import Welcome from './components/Welcome';
import FinancialStrategy from './components/FinancialStrategy';
import OnboardingEmptyState from './components/OnboardingEmptyState';
import './App.css';

// Map sidebar keys to Coming Soon page titles
const COMING_SOON_TITLES = {
  dashboard: 'Dashboard',
  goals: 'Goal Tracking',
  budget: 'Annual Budget (Sankey)',
  retirement: 'Retirement',
  health: 'Health Savings',
  debt: 'Debt',
  'debt-advisor': 'Debt Advisor',
  'debt-high': 'High Interest Debt',
  'debt-non-mortgage': 'Non-Mortgage Debt',
  'debt-mortgage': 'Mortgage',
  investing: 'Investing',
  analysis: 'Analysis',
  moat: 'Moat Analysis Results & Tool',
};

const PORTFOLIO_TABS = ['Holdings', 'Closed', 'Harvest'];
// Owners and Accounts are derived dynamically from the data below
const LOT_FILTERS = ['All', 'Open', 'Closed'];

export default function App() {
  const [sidebarView, setSidebarView] = useState('welcome');
  const [view, setView] = useState('Holdings');
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [selectedOwners, setSelectedOwners] = useState(new Set());
  const [selectedAccounts, setSelectedAccounts] = useState(new Set());
  const [lotFilter, setLotFilter] = useState('All');
  const [detailSortBy, setDetailSortBy] = useState('dateAcquired');
  const [detailSortDir, setDetailSortDir] = useState('asc');

  // Tax rate settings (LT/ST as decimals)
  const [taxRates, setTaxRates] = useState(DEFAULT_TAX_RATES);
  const [showTaxSettings, setShowTaxSettings] = useState(false);

  // CSV import state
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvStatus, setCsvStatus] = useState(null); // { count, error }
  const csvInputRef = useRef(null);

  function toggleDetailSort(col) {
    if (detailSortBy === col) setDetailSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setDetailSortBy(col); setDetailSortDir('desc'); }
  }
  function toggleOwner(owner) {
    setSelectedOwners(prev => {
      const next = new Set(prev);
      if (next.has(owner)) next.delete(owner);
      else next.add(owner);
      return next;
    });
  }
  function clearOwners() { setSelectedOwners(new Set()); }

  function toggleAccount(acct) {
    setSelectedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(acct)) next.delete(acct);
      else next.add(acct);
      return next;
    });
  }
  function clearAccounts() { setSelectedAccounts(new Set()); }

  // API status tracking
  const [apiStatus, setApiStatus] = useState(null);
  const [yahooAvailable, setYahooAvailable] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);

  const fetchStatus = useCallback(() => {
    fetch('/api/status').then(r => r.json()).then(setApiStatus).catch(() => {});
  }, []);
  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function handleCheckYahoo() {
    setChecking(true);
    try {
      const res = await fetch('/api/status/check-yahoo');
      const data = await res.json();
      setYahooAvailable(data.yahooAvailable);
      fetchStatus();
    } catch {} finally { setChecking(false); }
  }

  async function handleSync() {
    if (!confirm('Sync splits, benchmark, and current quotes from Yahoo Finance?')) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      setApiStatus({ attempted: data.attempted, successful: data.successful, lastSync: data.lastSync });
      if (data.aborted) {
        setYahooAvailable(false);
        alert(data.log.join('\n'));
      } else {
        setYahooAvailable(true);
        alert(data.log.join('\n') + (data.errors > 0 ? `\n\n${data.errors} errors occurred` : '\n\nSync complete!'));
        window.location.reload();
      }
    } catch { alert('Sync failed — server error'); } finally { setSyncing(false); }
  }

  // CSV import handler
  async function handleCsvFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    setCsvStatus(null);
    try {
      const text = await file.text();
      const res = await fetch('/api/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCsvStatus({ error: data.error });
      } else {
        setCsvStatus({ count: data.count });
        window.location.reload();
      }
    } catch (err) {
      setCsvStatus({ error: err.message });
    } finally {
      setCsvImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  }

  async function handleClearCsv() {
    if (!confirm('Remove all CSV-imported lots?')) return;
    await fetch('/api/import/csv', { method: 'DELETE' });
    window.location.reload();
  }

  const { lots: allLots, openLots: rawOpenLots, closedLots: rawClosedLots, positions: rawPositions, allPositions: rawAllPositions, quotes, loading, error, emptyState } = usePortfolio();

  // Derive owners and accounts dynamically from data
  const OWNERS = useMemo(() => [...new Set(allLots.map(l => l.owner).filter(Boolean))].sort(), [allLots]);
  const ACCOUNTS = useMemo(() => [...new Set(allLots.map(l => l.account).filter(Boolean))].sort(), [allLots]);

  // Apply owner + account filters at the lot level BEFORE aggregation
  const allOwnersSelected = selectedOwners.size === 0;
  const allSelected = selectedAccounts.size === 0;

  const openLots = useMemo(() => {
    let lots = rawOpenLots;
    if (!allOwnersSelected) lots = lots.filter(l => selectedOwners.has(l.owner));
    if (!allSelected) lots = lots.filter(l => selectedAccounts.has(l.account));
    return lots;
  }, [rawOpenLots, selectedOwners, allOwnersSelected, selectedAccounts, allSelected]);

  const closedLots = useMemo(() => {
    let lots = rawClosedLots;
    if (!allOwnersSelected) lots = lots.filter(l => selectedOwners.has(l.owner));
    if (!allSelected) lots = lots.filter(l => selectedAccounts.has(l.account));
    return lots;
  }, [rawClosedLots, selectedOwners, allOwnersSelected, selectedAccounts, allSelected]);

  const positions = useMemo(() => {
    return aggregateOpenBySymbol(openLots.map(l => ({ ...l, transaction: 'Open' })));
  }, [openLots]);

  const allPositions = useMemo(() => {
    return aggregateAllBySymbol([...openLots.map(l => ({ ...l, transaction: 'Open' })), ...closedLots]);
  }, [openLots, closedLots]);
  const { lookup: spyLookup } = useBenchmark('SPY');

  if (loading) return <div className="loading-screen">Loading portfolio...</div>;
  if (emptyState) return <OnboardingEmptyState info={emptyState} />;
  if (error) return <div className="error-screen">Error: {error}<br />Make sure the server is running at localhost:3001</div>;

  const hasImported = openLots.some(l => l.account === 'Imported') || closedLots.some(l => l.account === 'Imported');

  const statusBar = (
    <div className="status-bar">
      <div className="status-info">
        {apiStatus && (<>
          {yahooAvailable != null && <span className={`status-dot ${yahooAvailable ? 'green' : 'red'}`} />}
          <span className="status-item">Yahoo: <strong>{yahooAvailable == null ? 'Unknown' : yahooAvailable ? 'Available' : 'Unavailable'}</strong></span>
          <button className="check-btn" onClick={handleCheckYahoo} disabled={checking}>{checking ? '...' : 'Check'}</button>
          <span className="status-item">API: <strong>{apiStatus.successful ?? 0}</strong> ok / <strong>{apiStatus.attempted ?? 0}</strong> attempted</span>
          <span className="status-item">Last sync: <strong>{apiStatus.lastSync ? new Date(apiStatus.lastSync).toLocaleString() : 'Never'}</strong></span>
        </>)}

        {/* Tax rate settings */}
        <span className="status-separator" />
        <button className="check-btn" onClick={() => setShowTaxSettings(s => !s)}>
          Tax Rates {showTaxSettings ? '▲' : '▼'}
        </button>
        {showTaxSettings && (
          <span className="tax-rate-inputs">
            <label>LT
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={(taxRates.lt * 100).toFixed(1)}
                onChange={e => setTaxRates(r => ({ ...r, lt: parseFloat(e.target.value) / 100 || 0 }))}
              />%
            </label>
            <label>ST
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={(taxRates.st * 100).toFixed(1)}
                onChange={e => setTaxRates(r => ({ ...r, st: parseFloat(e.target.value) / 100 || 0 }))}
              />%
            </label>
          </span>
        )}

        {/* CSV import */}
        <span className="status-separator" />
        <label className="csv-import-label">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleCsvFile}
          />
          <button
            className="check-btn"
            onClick={() => csvInputRef.current?.click()}
            disabled={csvImporting}
          >
            {csvImporting ? 'Importing...' : 'Import CSV'}
          </button>
        </label>
        {hasImported && (
          <button className="check-btn warn-btn" onClick={handleClearCsv}>Clear CSV</button>
        )}
        {csvStatus?.count != null && <span className="status-item positive">Imported {csvStatus.count} lots</span>}
        {csvStatus?.error && <span className="status-item negative">{csvStatus.error}</span>}
      </div>
      <button className="sync-btn" onClick={handleSync} disabled={syncing}>
        {syncing ? 'Syncing...' : 'Sync'}
      </button>
    </div>
  );

  if (selectedSymbol) {
    return (
      <div className="app">
        <Sidebar activeView={sidebarView} onViewChange={(v) => { setSidebarView(v); setSelectedSymbol(null); }} />
        <div className="app-body">
        <header className="app-header">
          <div className="header-filters">
            <button className="back-btn-header" onClick={() => setSelectedSymbol(null)}>← Portfolio</button>
            <div className="header-separator" />
            <div className="filter-group">
              <button className={`tab ${allOwnersSelected ? 'active' : ''}`} onClick={clearOwners}>All</button>
              {OWNERS.map(o => (
                <button key={o} className={`tab ${selectedOwners.has(o) ? 'active' : ''}`} onClick={() => toggleOwner(o)}>{o}</button>
              ))}
            </div>
            <div className="header-separator" />
            <nav className="nav-tabs">
              {LOT_FILTERS.map(f => (
                <button key={f} className={`nav-tab ${lotFilter === f ? 'active' : ''}`} onClick={() => setLotFilter(f)}>{f}</button>
              ))}
            </nav>
            <div className="header-separator" />
            <div className="filter-group">
              <button className={`tab ${allSelected ? 'active' : ''}`} onClick={clearAccounts}>All</button>
              {ACCOUNTS.map(a => (
                <button key={a} className={`tab ${selectedAccounts.has(a) ? 'active' : ''}`} onClick={() => toggleAccount(a)}>{a}</button>
              ))}
            </div>
          </div>
        </header>
        {statusBar}
        <main>
          <PositionDetail
            symbol={selectedSymbol}
            allPositions={allPositions}
            quotes={quotes}
            onBack={() => setSelectedSymbol(null)}
            selectedAccounts={selectedAccounts}
            lotFilter={lotFilter}
            sortBy={detailSortBy}
            sortDir={detailSortDir}
            toggleSort={toggleDetailSort}
            taxRates={taxRates}
          />
        </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar activeView={sidebarView} onViewChange={setSidebarView} />
      <div className="app-body">
      <header className="app-header">
        <div className="header-filters">
          {sidebarView === 'portfolio' && (<>
          <div className="filter-group">
            <button className={`tab ${allOwnersSelected ? 'active' : ''}`} onClick={clearOwners}>All</button>
            {OWNERS.map(o => (
              <button key={o} className={`tab ${selectedOwners.has(o) ? 'active' : ''}`} onClick={() => toggleOwner(o)}>{o}</button>
            ))}
          </div>
          <div className="header-separator" />
          <nav className="nav-tabs">
            {PORTFOLIO_TABS.map(v => (
              <button key={v} className={`nav-tab ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>{v}</button>
            ))}
          </nav>
          <div className="header-separator" />
          <div className="filter-group">
            <button className={`tab ${allSelected ? 'active' : ''}`} onClick={clearAccounts}>All</button>
            {ACCOUNTS.map(a => (
              <button key={a} className={`tab ${selectedAccounts.has(a) ? 'active' : ''}`} onClick={() => toggleAccount(a)}>{a}</button>
            ))}
          </div>
          </>)}
        </div>
      </header>
      {(sidebarView === 'portfolio' || sidebarView === 'analysis') && statusBar}

      <main>
        {sidebarView === 'welcome' && <Welcome />}
        {sidebarView === 'strategy' && <FinancialStrategy />}
        {sidebarView === 'networth' && <NetWorthView />}
        {sidebarView === 'college' && <CollegeView />}

        {sidebarView === 'portfolio' && (<>
          <Dashboard
            positions={positions}
            openLots={openLots}
            closedLots={closedLots}
            quotes={quotes}
            selectedAccounts={selectedAccounts}
            spyLookup={spyLookup}
            view={view}
          />

          {(view === 'Holdings' || view === 'Closed') && (() => {
            const filteredPos = (() => {
              const src = view === 'Holdings' ? positions : allPositions;
              return allSelected ? src : src.filter(p => p.accounts.some(a => selectedAccounts.has(a)));
            })();
            return (
              <PortfolioChart positions={filteredPos} quotes={quotes} spyLookup={spyLookup} view={view} />
            );
          })()}

          {view === 'Holdings' && (
            <HoldingsList
              positions={positions}
              quotes={quotes}
              selectedAccounts={selectedAccounts}
              onSelectPosition={setSelectedSymbol}
              spyLookup={spyLookup}
            />
          )}

          {view === 'Closed' && (
            <ClosedPositions
              closedLots={closedLots}
              selectedAccounts={selectedAccounts}
              spyLookup={spyLookup}
              onSelectPosition={setSelectedSymbol}
              taxRates={taxRates}
            />
          )}

          {view === 'Harvest' && (
            <LossHarvesting
              openLots={openLots}
              quotes={quotes}
              selectedAccounts={selectedAccounts}
              taxRates={taxRates}
              onSelectPosition={setSelectedSymbol}
            />
          )}
        </>)}

        {!['welcome', 'strategy', 'networth', 'college', 'portfolio'].includes(sidebarView) && (
          <ComingSoon title={COMING_SOON_TITLES[sidebarView] || sidebarView} />
        )}
      </main>
      </div>
    </div>
  );
}
