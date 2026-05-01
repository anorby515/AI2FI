import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePortfolio, useBenchmark } from './hooks/usePortfolio';
import { DEFAULT_TAX_RATES, aggregateOpenBySymbol, aggregateAllBySymbol } from './utils/calculations';
import Dashboard from './components/Dashboard';
import HoldingsList from './components/HoldingsList';
import PositionDetail from './components/PositionDetail';
import ClosedPositions from './components/ClosedPositions';
import TaxHarvesting from './components/TaxHarvesting';
import PortfolioChart from './components/PortfolioChart';
// import PortfolioPies from './components/PortfolioPies';
import Sidebar from './components/Sidebar';
import NetWorthView from './components/NetWorthView';
import MortgageView from './components/MortgageView';
import CollegeView from './components/CollegeView';
import EducationSavingsView from './components/EducationSavingsView';
import PensionView from './components/PensionView';
import AnnualBudget from './components/AnnualBudget';
import ComingSoon from './components/ComingSoon';
import Welcome from './components/Welcome';
import FinancialStrategy from './components/FinancialStrategy';
import OnboardingEmptyState from './components/OnboardingEmptyState';
import GettingStarted from './components/GettingStarted';
import RestartButton from './components/RestartButton';
import MoatAnalysis from './components/MoatAnalysis';
import RefinanceCalculator from './components/RefinanceCalculator';
import './App.css';

// Map sidebar keys to Coming Soon page titles
const COMING_SOON_TITLES = {
  tools: 'Tools',
  'tradeoff-calculator': 'Trade-Off Calculator',
  'loan-calculator': 'Loan Calculator',
};

// Sidebar keys that route to the portfolio screens. The parent
// (`portfolio-analysis`) shows the aggregate; each child filters by
// `accountTypeGroup` from the spreadsheet's Lookup Tables tab.
const PORTFOLIO_VIEW_KEYS = ['portfolio-analysis', 'retirement', 'brokerage', 'hsa', 'esa'];
const PORTFOLIO_GROUP_BY_VIEW = {
  retirement: 'Retirement',
  brokerage: 'Brokerage',
  hsa: 'HSA',
  esa: 'ESA',
};

const PORTFOLIO_TABS = ['Holdings', 'Closed'];
// Owners and Accounts are derived dynamically from the data below
const LOT_FILTERS = ['All', 'Open', 'Closed'];

export default function App() {
  const [sidebarView, setSidebarView] = useState('getting-started');
  const [view, setView] = useState('Holdings');
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [selectedOwners, setSelectedOwners] = useState(new Set());
  const [selectedAccounts, setSelectedAccounts] = useState(new Set());
  const [lotFilter, setLotFilter] = useState('All');
  const [detailSortBy, setDetailSortBy] = useState('dateAcquired');
  const [detailSortDir, setDetailSortDir] = useState('asc');

  // Tax rates (LT/ST as decimals) — used by closed-lot G/L estimates downstream;
  // the in-app editor was removed from the status bar but the values still flow.
  const taxRates = DEFAULT_TAX_RATES;

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

  // Switching sidebar views also clears chip selections — owner/account
  // chips are scoped to the active group, so a Roth IRA selection on the
  // Retirement tab shouldn't carry over to Brokerage.
  function handleSidebarChange(v) {
    setSidebarView(v);
    setSelectedSymbol(null);
    setSelectedOwners(new Set());
    setSelectedAccounts(new Set());
  }

  // API status tracking
  const [apiStatus, setApiStatus] = useState(null);
  const [yahooAvailable, setYahooAvailable] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);

  const fetchStatus = useCallback(() => {
    fetch('/api/status').then(r => r.json()).then(setApiStatus).catch(() => {});
  }, []);
  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Active profile (for template-fallback detection + Getting Started routing).
  // `isTemplate: true` means the dashboard is reading from the committed
  // `core/sample-data/Financial Template.xlsx` — either because no user
  // profile is configured yet, or the profile exists but the user hasn't
  // copied the template into private/ yet. Either way, drop the user on
  // Getting Started so the demo-vs-real distinction is loud.
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setProfile(data);
        if (data.isTemplate) setSidebarView('getting-started');
      })
      .catch(() => {});
  }, []);

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

  const { lots: allLots, openLots: rawOpenLots, closedLots: rawClosedLots, positions: rawPositions, allPositions: rawAllPositions, quotes, loading, error, emptyState, refetch: reloadPortfolio } = usePortfolio();

  // Active portfolio sub-view (parent = aggregate, children filter by group).
  const isPortfolioView = PORTFOLIO_VIEW_KEYS.includes(sidebarView);
  const portfolioGroup = PORTFOLIO_GROUP_BY_VIEW[sidebarView] || null;

  // Apply the broad-group filter first; everything downstream (owner/account
  // chips, aggregations) operates on this pre-filtered set so chips only show
  // values that exist within the active group.
  const groupAllLots = useMemo(() => (
    portfolioGroup ? allLots.filter(l => l.accountTypeGroup === portfolioGroup) : allLots
  ), [allLots, portfolioGroup]);
  const groupOpenLots = useMemo(() => (
    portfolioGroup ? rawOpenLots.filter(l => l.accountTypeGroup === portfolioGroup) : rawOpenLots
  ), [rawOpenLots, portfolioGroup]);
  const groupClosedLots = useMemo(() => (
    portfolioGroup ? rawClosedLots.filter(l => l.accountTypeGroup === portfolioGroup) : rawClosedLots
  ), [rawClosedLots, portfolioGroup]);

  // Derive owners and accounts dynamically from the group-filtered data
  const OWNERS = useMemo(() => [...new Set(groupAllLots.map(l => l.owner).filter(Boolean))].sort(), [groupAllLots]);
  const ACCOUNTS = useMemo(() => [...new Set(groupAllLots.map(l => l.account).filter(Boolean))].sort(), [groupAllLots]);

  // Apply owner + account filters at the lot level BEFORE aggregation
  const allOwnersSelected = selectedOwners.size === 0;
  const allSelected = selectedAccounts.size === 0;

  const openLots = useMemo(() => {
    let lots = groupOpenLots;
    if (!allOwnersSelected) lots = lots.filter(l => selectedOwners.has(l.owner));
    if (!allSelected) lots = lots.filter(l => selectedAccounts.has(l.account));
    return lots;
  }, [groupOpenLots, selectedOwners, allOwnersSelected, selectedAccounts, allSelected]);

  const closedLots = useMemo(() => {
    let lots = groupClosedLots;
    if (!allOwnersSelected) lots = lots.filter(l => selectedOwners.has(l.owner));
    if (!allSelected) lots = lots.filter(l => selectedAccounts.has(l.account));
    return lots;
  }, [groupClosedLots, selectedOwners, allOwnersSelected, selectedAccounts, allSelected]);

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

  const statusBar = (
    <div className="status-bar">
      <div className="status-info">
        {apiStatus && (
          <span className="status-item">Last sync: <strong>{apiStatus.lastSync ? new Date(apiStatus.lastSync).toLocaleString() : 'Never'}</strong></span>
        )}
      </div>
      <div className="status-actions">
        {yahooAvailable != null && <span className={`status-dot ${yahooAvailable ? 'green' : 'red'}`} />}
        <span className="status-item">Yahoo: <strong>{yahooAvailable == null ? 'Unknown' : yahooAvailable ? 'Available' : 'Unavailable'}</strong></span>
        <button className="check-btn" onClick={handleCheckYahoo} disabled={checking}>{checking ? '...' : 'Check'}</button>
        <button className="sync-btn" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>
    </div>
  );

  if (selectedSymbol) {
    return (
      <div className="app">
        <Sidebar activeView={sidebarView} isTemplate={!!profile?.isTemplate} onViewChange={handleSidebarChange} />
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
          <RestartButton />
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
      <Sidebar activeView={sidebarView} isTemplate={!!profile?.isTemplate} onViewChange={handleSidebarChange} />
      <div className="app-body">
      <header className="app-header">
        <div className="header-filters">
          {isPortfolioView && (<>
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
        <RestartButton />
      </header>
      {profile?.isTemplate && sidebarView !== 'getting-started' && (
        <div className="sample-data-banner">
          <span>
            <strong>Demo template.</strong> The dashboard is reading from{' '}
            <code>core/sample-data/Financial Template.xlsx</code> &mdash; none of this is your data yet.
          </span>
          <button className="sample-data-cta" onClick={() => setSidebarView('getting-started')}>
            Start onboarding &rarr;
          </button>
        </div>
      )}

      {isPortfolioView && statusBar}

      <main>
        {sidebarView === 'getting-started' && <GettingStarted profileName={profile?.name} />}
        {sidebarView === 'welcome' && <Welcome />}
        {sidebarView === 'strategy' && <FinancialStrategy />}
        {sidebarView === 'networth' && <NetWorthView />}
        {sidebarView === 'debt-mortgage' && <MortgageView />}
        {sidebarView === 'college' && <CollegeView />}
        {sidebarView === 'education-savings' && <EducationSavingsView />}
        {sidebarView === 'pension' && <PensionView />}
        {sidebarView === 'budget' && <AnnualBudget />}
        {sidebarView === 'sankey-diagram' && (
          <AnnualBudget
            defaultTab="Sankey"
            title="Sankey Diagram"
            subtitle="Flow visualization for any source · target · value tab"
          />
        )}
        {sidebarView === 'moat-analysis' && <MoatAnalysis />}
        {sidebarView === 'refinance-calculator' && <RefinanceCalculator />}

        {isPortfolioView && (<>
          <Dashboard
            positions={positions}
            openLots={openLots}
            closedLots={closedLots}
            quotes={quotes}
            selectedAccounts={selectedAccounts}
            spyLookup={spyLookup}
            view={view}
            onReload={reloadPortfolio}
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

        </>)}

        {sidebarView === 'tax-harvesting' && <TaxHarvesting />}

        {!['getting-started', 'welcome', 'strategy', 'networth', 'college', 'debt-mortgage', 'education-savings', 'pension', 'budget', 'moat-analysis', 'sankey-diagram', 'refinance-calculator', 'tax-harvesting', ...PORTFOLIO_VIEW_KEYS].includes(sidebarView) && (
          <ComingSoon title={COMING_SOON_TITLES[sidebarView] || sidebarView} />
        )}
      </main>
      </div>
    </div>
  );
}
