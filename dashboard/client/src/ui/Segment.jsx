import './Segment.css';

/**
 * Segmented control — pill-style tab group for range/view switchers.
 * options: [{ label, value }]
 */
export default function Segment({ options, value, onChange, mono = false, className = '' }) {
  return (
    <div className={`ui-segment ${mono ? 'ui-segment--mono' : ''} ${className}`}>
      {options.map(o => (
        <button
          key={o.value ?? o}
          type="button"
          className={`ui-segment__btn ${value === (o.value ?? o) ? 'is-active' : ''}`}
          onClick={() => onChange(o.value ?? o)}
        >
          {o.label ?? o}
        </button>
      ))}
    </div>
  );
}
