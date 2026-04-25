/**
 * Sparkline — tiny line chart for table rows and cards.
 * Pure SVG. No hover.
 */
export default function Sparkline({
  data,
  width = 70,
  height = 22,
  color,
  fill,
  glow = false,
  strokeWidth = 1.5,
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - ((v - min) / range) * height]);
  const path = pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  const area = fill ? `${path} L ${width} ${height} L 0 ${height} Z` : null;
  const uid = 'sg' + Math.random().toString(36).slice(2, 7);
  const stroke = color || 'var(--accent)';
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {glow && <filter id={uid}><feGaussianBlur stdDeviation="2" /></filter>}
      {area && <path d={area} fill={fill} />}
      {glow && <path d={path} fill="none" stroke={stroke} strokeWidth="3" opacity="0.4" filter={`url(#${uid})`} />}
      <path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
