import { useState } from 'react';

// Each entry: { key, label, children?: [...] }
const BASE_NAV = [
  {
    key: 'strategy', label: 'Financial Strategy', children: [
      { key: 'networth', label: 'Net Worth' },
      { key: 'budget', label: 'Annual Budget' },
      { key: 'debt-mortgage', label: 'Mortgage Payoff' },
    ]
  },
  { key: 'reboot', label: 'Reboot AI2FI' },
  {
    key: 'investing', label: 'Portfolio Analysis', children: [
      { key: 'hsa', label: 'HSA' },
      { key: 'retirement', label: 'Retirement (401ks, IRAs)' },
      { key: 'esa', label: 'ESA (529, Coverdell)' },
      { key: 'brokerage', label: 'Brokerage (ETFs, Stocks, Crypto)' },
    ]
  },
  {
    key: 'tools', label: 'Tools', children: [
      { key: 'tradeoff-calculator', label: 'Trade-Off Calculator' },
      { key: 'moat-analysis', label: 'Moat Analysis' },
      { key: 'sankey-diagram', label: 'Sankey Diagram' },
    ]
  },
];

export default function Sidebar({ activeView, onViewChange, isTemplate = false }) {
  const [expanded, setExpanded] = useState(false);

  // Getting Started is always in the nav now — its purpose is unchanged but
  // it stays surfaced after the user pivots off the demo template, since the
  // page also doubles as a re-entry point if they want to revisit onboarding.
  const nav = BASE_NAV;

  return (
    <nav
      className={`sidebar ${expanded ? 'sidebar-expanded' : ''}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="sidebar-logo">
        {expanded ? 'AI2FI' : 'A'}
      </div>
      {nav.map(item => {
        const hasChildren = item.children && item.children.length > 0;
        return (
          <div key={item.key}>
            <button
              className={`${hasChildren ? 'sidebar-section-header' : 'sidebar-item'} ${activeView === item.key ? 'active' : ''}`}
              onClick={() => onViewChange(item.key)}
              title={item.label}
            >
              {expanded ? <span className="sidebar-label">{item.label}</span> : <span className="sidebar-collapsed-label">{item.label.slice(0, 3)}</span>}
            </button>
            {hasChildren && expanded && item.children.map(child => (
              <button
                key={child.key}
                className={`sidebar-item sidebar-subitem ${activeView === child.key ? 'active' : ''}`}
                onClick={() => onViewChange(child.key)}
                title={child.label}
              >
                <span className="sidebar-label">{child.label}</span>
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
