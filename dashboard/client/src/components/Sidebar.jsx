import { useState } from 'react';

// Each entry: { key, label, children?: [...] }
const BASE_NAV = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'strategy', label: 'Financial Strategy' },
  {
    key: 'dashboard', label: 'Dashboard', children: [
      { key: 'networth', label: 'Net Worth' },
      { key: 'goals', label: 'Goal Tracking' },
      { key: 'budget', label: 'Annual Budget (Sankey)' },
    ]
  },
  {
    key: 'investing', label: 'Investing', children: [
      { key: 'portfolio', label: 'Portfolio' },
      { key: 'analysis', label: 'Analysis' },
      { key: 'moat', label: 'Moat Analysis' },
    ]
  },
  { key: 'retirement', label: 'Retirement' },
  { key: 'college', label: 'College Savings' },
  { key: 'health', label: 'Health Savings' },
  {
    key: 'debt', label: 'Debt', children: [
      { key: 'debt-advisor', label: 'Debt Advisor' },
      { key: 'debt-high', label: 'High Interest' },
      { key: 'debt-non-mortgage', label: 'Non-mortgage' },
      { key: 'debt-mortgage', label: 'Mortgage' },
    ]
  },
];

export default function Sidebar({ activeView, onViewChange, isSampleData = false }) {
  const [expanded, setExpanded] = useState(false);

  // Prepend "Getting Started" when the dashboard is running on sample data.
  // Falls off the list once the onboarding skill clears the marker.
  const nav = isSampleData
    ? [{ key: 'getting-started', label: 'Getting Started' }, ...BASE_NAV]
    : BASE_NAV;

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
