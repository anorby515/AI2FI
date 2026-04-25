import './ProgressBar.css';

/**
 * Horizontal progress bar — for composition breakdowns, goals, etc.
 * tone: 'accent' | 'pos' | 'neg' | 'warn' | custom hex
 */
export default function ProgressBar({ value, max = 100, tone = 'accent', height = 6 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color =
    tone === 'accent' ? 'var(--accent)' :
    tone === 'pos'    ? 'var(--pos)' :
    tone === 'neg'    ? 'var(--neg)' :
    tone === 'warn'   ? 'var(--warn)' :
    tone; // assume raw color
  return (
    <div className="ui-progress" style={{ height }}>
      <div className="ui-progress__fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
