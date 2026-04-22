import { useState } from 'react';

const SIZE_COLORS = { 'Wide': 'positive', 'Narrow': 'warning', 'None': 'negative' };
const DIR_ARROWS = { 'Widening': '↑', 'Stable': '→', 'Narrowing': '↓' };
const DIR_COLORS = { 'Widening': 'positive', 'Stable': '', 'Narrowing': 'negative' };

// Simple markdown to HTML (handles headers, bold, bullets, links, quotes)
function renderMarkdown(md) {
  if (!md) return '';
  return md
    .split('\n')
    .map(line => {
      // Headers
      if (line.startsWith('# ')) return `<h2>${line.slice(2)}</h2>`;
      if (line.startsWith('## ')) return `<h3>${line.slice(3)}</h3>`;
      if (line.startsWith('### ')) return `<h4>${line.slice(4)}</h4>`;
      // Bullets
      if (line.match(/^\s*\*\s/)) {
        const content = line.replace(/^\s*\*\s/, '');
        return `<li>${formatInline(content)}</li>`;
      }
      // Numbered list
      if (line.match(/^\s*\d+\.\s/)) {
        const content = line.replace(/^\s*\d+\.\s/, '');
        return `<li>${formatInline(content)}</li>`;
      }
      // Empty line
      if (line.trim() === '') return '<br/>';
      // Paragraph
      return `<p>${formatInline(line)}</p>`;
    })
    .join('\n');
}

function formatInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/"([^"]+)"/g, '<q>$1</q>');
}

export default function MoatCard({ moat }) {
  const [expanded, setExpanded] = useState(false);

  if (!moat) return null;

  const sizeClass = SIZE_COLORS[moat.size] || '';
  const dirArrow = DIR_ARROWS[moat.direction] || '';
  const dirClass = DIR_COLORS[moat.direction] || '';

  const truncatedSummary = moat.summary && moat.summary.length > 300
    ? moat.summary.slice(0, 300) + '...'
    : moat.summary;

  return (
    <div className="moat-card">
      <div className="moat-header" onClick={() => setExpanded(!expanded)}>
        <div className="moat-title">
          <span className="moat-icon">🏰</span>
          <span className="moat-label">Moat Analysis</span>
        </div>
        <div className="moat-badges">
          <span className={`moat-badge ${sizeClass}`}>{moat.size} Moat</span>
          <span className={`moat-badge ${dirClass}`}>{dirArrow} {moat.direction}</span>
          {moat.sources && moat.sources.split(',').map((s, i) => (
            <span key={i} className="moat-source-tag">{s.trim()}</span>
          ))}
        </div>
        <button className="moat-expand-btn">{expanded ? 'Collapse ▲' : 'View Full Analysis ▼'}</button>
      </div>

      {!expanded && moat.summary && (
        <div className="moat-summary">{truncatedSummary}</div>
      )}

      {!expanded && moat.sections && moat.sections.length > 0 && (
        <div className="moat-sections-preview">
          {moat.sections.map((s, i) => (
            <span key={i} className="moat-section-chip">{s.name}: <strong>{s.assessment.split('(')[0].trim()}</strong></span>
          ))}
        </div>
      )}

      {expanded && (
        <div
          className="moat-full-content"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(moat.fullMarkdown) }}
        />
      )}
    </div>
  );
}
