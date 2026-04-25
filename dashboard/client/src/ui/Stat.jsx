import './Stat.css';

/**
 * Stat — label + big number + optional sub.
 * tone: 'neutral' (default) | 'pos' | 'neg'
 * size: 'md' (default) | 'lg' (hero)
 */
export default function Stat({ label, value, sub, tone = 'neutral', size = 'md', subTone }) {
  return (
    <div className="ui-stat">
      {label && <div className="ui-stat__label">{label}</div>}
      <div className={`ui-stat__value ui-stat__value--${size} tone-${tone}`}>{value}</div>
      {sub && <div className={`ui-stat__sub tone-${subTone || 'neutral'}`}>{sub}</div>}
    </div>
  );
}
