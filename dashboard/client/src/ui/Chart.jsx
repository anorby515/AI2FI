import { useState, useRef, useId } from 'react';
import './Chart.css';

/**
 * Line chart with crosshair + hover tooltip + axes.
 * Pure SVG, no deps.
 *
 * Props:
 *   data:     [number] — required
 *   height:   number (default 320)
 *   color:    hex/css color (defaults to --accent via CSS)
 *   glow:     bool (soft glow under line)
 *   labelFn:  (i, total) => string  (x-axis + tooltip label)
 *   valueFn:  (v) => string          (y-axis + tooltip value)
 */
export default function Chart({
  data,
  height = 320,
  width = 800,
  color,
  glow = true,
  labelFn,
  valueFn,
  pad = { t: 24, r: 24, b: 32, l: 64 },
}) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const uid = useId();

  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const yRange = max - min || 1;
  const yPad = yRange * 0.08;
  const yMin = min - yPad;
  const yMax = max + yPad;

  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  const x = (i) => pad.l + (i / (data.length - 1)) * plotW;
  const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const points = data.map((v, i) => [x(i), y(v)]);
  const path = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  const areaPath = `${path} L ${x(data.length - 1)} ${pad.t + plotH} L ${x(0)} ${pad.t + plotH} Z`;

  const yTicks = [];
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * (i / 4);
    yTicks.push({ v, y: y(v) });
  }

  const xTicks = [];
  const xStep = Math.max(1, Math.floor((data.length - 1) / 5));
  for (let i = 0; i < data.length; i += xStep) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== data.length - 1) xTicks.push(data.length - 1);

  const onMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const rel = (px - pad.l) / plotW;
    const idx = Math.round(rel * (data.length - 1));
    if (idx >= 0 && idx < data.length) setHover(idx);
  };

  const glowId = `glow-${uid.replace(/:/g, '')}`;
  const gradId = `grad-${uid.replace(/:/g, '')}`;
  const stroke = color || 'var(--accent)';

  return (
    <div className="ui-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="ui-chart__svg"
        style={{ height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
          {glow && (
            <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          )}
        </defs>

        {yTicks.map((t, i) => (
          <g key={`y${i}`}>
            <line x1={pad.l} y1={t.y} x2={width - pad.r} y2={t.y} className="ui-chart__grid" />
            <text x={pad.l - 10} y={t.y + 4} textAnchor="end" className="ui-chart__axis">
              {valueFn ? valueFn(t.v) : Math.round(t.v).toLocaleString()}
            </text>
          </g>
        ))}

        {xTicks.map((i) => (
          <text key={`x${i}`} x={x(i)} y={height - pad.b + 18} textAnchor="middle" className="ui-chart__axis">
            {labelFn ? labelFn(i, data.length) : i}
          </text>
        ))}

        <path d={areaPath} fill={`url(#${gradId})`} />
        {glow && <path d={path} fill="none" stroke={stroke} strokeWidth="5" opacity="0.4" filter={`url(#${glowId})`} />}
        <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {hover !== null && (() => {
          const [hx, hy] = points[hover];
          const v = data[hover];
          const label = labelFn ? labelFn(hover, data.length) : String(hover);
          const valStr = valueFn ? valueFn(v) : v.toLocaleString();
          const tipW = 130, tipH = 48;
          const tipX = Math.min(Math.max(hx - tipW / 2, pad.l), width - pad.r - tipW);
          const tipY = Math.max(hy - tipH - 14, pad.t);
          return (
            <g>
              <line x1={hx} y1={pad.t} x2={hx} y2={pad.t + plotH} className="ui-chart__crosshair" />
              <circle cx={hx} cy={hy} r="6" fill={stroke} opacity="0.25" />
              <circle cx={hx} cy={hy} r="3.5" fill="var(--bg)" stroke={stroke} strokeWidth="2" />
              <g transform={`translate(${tipX}, ${tipY})`}>
                <rect width={tipW} height={tipH} rx="8" className="ui-chart__tip-bg" />
                <text x="10" y="18" className="ui-chart__tip-label">{label}</text>
                <text x="10" y="36" className="ui-chart__tip-val">{valStr}</text>
              </g>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
