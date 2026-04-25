import { useState } from 'react';

// Each entry: { key, label, children?: [...] }
const BASE_NAV = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'getting-started', label: 'Getting Started' },
  {
    key: 'strategy', label: 'Financial Strategy', children: [
      { key: 'networth', label: 'Net Worth' },
      { key: 'goals', label: 'Goals' },
      { key: 'budget', label: 'Annual Budget' },
      { key: 'assets', label: 'Assets' },
    ]
  },
  {
    key: 'cash-debt', label: 'Cash & Debt', children: [
      { key: 'emergency-savings', label: 'Emergency Savings' },
      { key: 'non-discretionary-savings', label: 'Non-Discretionary Savings' },
      { key: 'debt-high', label: 'High Interest Debt' },
      { key: 'debt-non-mortgage', label: 'Non-mortgage Debt' },
      { key: 'debt-mortgage', label: 'Mortgage' },
      { key: 'charitable-giving', label: 'Charitable Giving' },
      { key: 'education-savings', label: 'Education Savings' },
      { key: 'irregular-expenses', label: 'Irregular Expenses / Goals' },
      { key: 'whatever-you-want', label: 'Whatever You Want' },
    ]
  },
  { key: 'retirement', label: 'Retirement (401k, IRA)' },
  { key: 'investing', label: 'Investing (ETFs, Stocks, Crypto)' },
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
