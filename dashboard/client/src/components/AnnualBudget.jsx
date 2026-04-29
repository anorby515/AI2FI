import { useEffect, useMemo, useRef, useState } from 'react';
import { sankey as d3Sankey, sankeyLinkHorizontal, sankeyJustify } from 'd3-sankey';
import { Card, Stat, Button } from '../ui';
import './AnnualBudget.css';

/**
 * AnnualBudget — Sankey flow diagram of income → categories → line items.
 *
 * Data contract: { nodes: [{ id, name }], links: [{ source, target, value }] }.
 * Pulls from a Budget tab in Finances.xlsx via /api/budget, falling back to
 * a bundled sample.
 */

// Node colors — pull from token palette so accent swaps cascade correctly.
const NODE_PALETTE = [
  'var(--accent)',
  'var(--accent-2)',
  '#f472b6',
  '#fbbf24',
  '#a78bfa',
  '#34d399',
  '#60a5fa',
  '#fb923c',
];

function fmtUSD(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function fmtUSDK(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1_000_000) return s + '$' + (a / 1_000_000).toFixed(2) + 'M';
  if (a >= 1_000) return s + '$' + Math.round(a / 1_000) + 'K';
  return s + '$' + Math.round(a);
}

// Bundled sample — a generic household budget showing the income → category →
// detail flow shape. Numbers are illustrative, not real.
const SAMPLE_BUDGET = {
  nodes: [
    { id: 'Salary',        name: 'Salary' },
    { id: 'Bonus',         name: 'Bonus' },
    { id: 'Dividends',     name: 'Dividends' },
    { id: 'Income',        name: 'Total Income' },
    { id: 'Taxes',         name: 'Taxes' },
    { id: 'Housing',       name: 'Housing' },
    { id: 'Transport',     name: 'Transport' },
    { id: 'Food',          name: 'Food' },
    { id: 'Lifestyle',     name: 'Lifestyle' },
    { id: 'Savings',       name: 'Savings & Invest' },
    { id: 'Mortgage',      name: 'Mortgage' },
    { id: 'Utilities',     name: 'Utilities' },
    { id: 'Gas',           name: 'Gas & Insurance' },
    { id: 'Groceries',     name: 'Groceries' },
    { id: 'Dining',        name: 'Dining Out' },
    { id: 'Entertainment', name: 'Entertainment' },
    { id: 'Travel',        name: 'Travel' },
    { id: 'Retirement',    name: '401k / IRA' },
    { id: 'Brokerage',     name: 'Brokerage' },
    { id: 'Emergency',     name: 'Emergency Fund' },
  ],
  links: [
    { source: 'Salary',    target: 'Income', value: 180000 },
    { source: 'Bonus',     target: 'Income', value: 30000 },
    { source: 'Dividends', target: 'Income', value: 8000 },

    { source: 'Income', target: 'Taxes',     value: 55000 },
    { source: 'Income', target: 'Housing',   value: 48000 },
    { source: 'Income', target: 'Transport', value: 14000 },
    { source: 'Income', target: 'Food',      value: 18000 },
    { source: 'Income', target: 'Lifestyle', value: 22000 },
    { source: 'Income', target: 'Savings',   value: 61000 },

    { source: 'Housing',   target: 'Mortgage',      value: 36000 },
    { source: 'Housing',   target: 'Utilities',     value: 12000 },
    { source: 'Transport', target: 'Gas',           value: 14000 },
    { source: 'Food',      target: 'Groceries',     value: 12000 },
    { source: 'Food',      target: 'Dining',        value: 6000 },
    { source: 'Lifestyle', target: 'Entertainment', value: 8000 },
    { source: 'Lifestyle', target: 'Travel',        value: 14000 },
    { source: 'Savings',   target: 'Retirement',    value: 30000 },
    { source: 'Savings',   target: 'Brokerage',     value: 21000 },
    { source: 'Savings',   target: 'Emergency',     value: 10000 },
  ],
};

export default function AnnualBudget() {
  const [data, setData] = useState(null);
  const [source, setSource] = useState('loading'); // 'spreadsheet' | 'sample' | 'loading'
  const [apiError, setApiError] = useState(null);
  const [size, setSize] = useState({ w: 1000, h: 600 });
  const [hover, setHover] = useState(null); // { type: 'node'|'link', d, x, y }
  const [focusedNode, setFocusedNode] = useState(null);

  const wrapRef = useRef(null);

  // Pull the Budget tab from the user's spreadsheet on mount. Fall back to
  // the bundled sample if the tab isn't there yet (so a fresh profile still
  // sees a meaningful diagram).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/budget')
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok && body?.nodes && body?.links) {
          setData({ nodes: body.nodes, links: body.links });
          setSource('spreadsheet');
          setApiError(null);
        } else {
          setData(SAMPLE_BUDGET);
          setSource('sample');
          setApiError(body?.error || `HTTP ${r.status}`);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setData(SAMPLE_BUDGET);
        setSource('sample');
        setApiError(err.message);
      });
    return () => { cancelled = true; };
  }, []);

  // Track container width — Sankey needs explicit pixel dimensions.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(320, Math.floor(e.contentRect.width));
        setSize(s => (s.w === w ? s : { ...s, w }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!data?.nodes?.length || !data?.links?.length) return null;
    const sankeyGen = d3Sankey()
      .nodeId(d => d.id || d.name)
      .nodeAlign(sankeyJustify)
      .nodeWidth(14)
      .nodePadding(16)
      .extent([[8, 12], [size.w - 8, size.h - 12]]);

    // Deep-copy so d3 can mutate freely.
    const graph = sankeyGen({
      nodes: data.nodes.map(n => ({ ...n })),
      links: data.links.map(l => ({ ...l })),
    });
    return graph;
  }, [data, size.w, size.h]);

  // Stats — total inflow and outflow across the diagram.
  const stats = useMemo(() => {
    if (!data?.links?.length) return null;
    const incomingByNode = new Map();
    const outgoingByNode = new Map();
    for (const l of data.links) {
      incomingByNode.set(l.target, (incomingByNode.get(l.target) || 0) + l.value);
      outgoingByNode.set(l.source, (outgoingByNode.get(l.source) || 0) + l.value);
    }
    // Sources = nodes with no incoming (income), sinks = no outgoing (categories).
    let totalIn = 0, totalOut = 0, sourceCount = 0, sinkCount = 0;
    for (const n of data.nodes) {
      const id = n.id || n.name;
      const inV = incomingByNode.get(id) || 0;
      const outV = outgoingByNode.get(id) || 0;
      if (inV === 0) { totalIn += outV; sourceCount += 1; }
      if (outV === 0) { totalOut += inV; sinkCount += 1; }
    }
    return {
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      sources: sourceCount,
      sinks: sinkCount,
      flows: data.links.length,
    };
  }, [data]);

  // Color a node by its index — stable across re-renders.
  const nodeColor = (i) => NODE_PALETTE[i % NODE_PALETTE.length];

  function handleReloadFromSheet() {
    setSource('loading');
    setFocusedNode(null);
    fetch('/api/budget')
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (r.ok && body?.nodes && body?.links) {
          setData({ nodes: body.nodes, links: body.links });
          setSource('spreadsheet');
          setApiError(null);
        } else {
          setData(SAMPLE_BUDGET);
          setSource('sample');
          setApiError(body?.error || `HTTP ${r.status}`);
        }
      })
      .catch((err) => {
        setData(SAMPLE_BUDGET);
        setSource('sample');
        setApiError(err.message);
      });
  }

  // Determine which links are dimmed when a node is focused.
  function isLinkDim(link) {
    if (!focusedNode) return false;
    const sId = link.source.id || link.source.name;
    const tId = link.target.id || link.target.name;
    return sId !== focusedNode && tId !== focusedNode;
  }
  function isNodeDim(node) {
    if (!focusedNode) return false;
    const id = node.id || node.name;
    if (id === focusedNode) return false;
    // Also un-dim 1-hop neighbors so the local context is readable.
    const adj = (layout?.links || []).some(l => {
      const sId = l.source.id || l.source.name;
      const tId = l.target.id || l.target.name;
      return (sId === focusedNode && tId === id) || (tId === focusedNode && sId === id);
    });
    return !adj;
  }

  return (
    <div className="ab">
      <div className="ab__head">
        <div>
          <div className="ab__title">Annual Budget</div>
          <div className="ab__subtitle">Where the money comes in, and where it goes</div>
        </div>
        <div className="ab__head-right">
          <Button variant="ghost" onClick={handleReloadFromSheet}>Reload from sheet</Button>
        </div>
      </div>

      {source === 'sample' && apiError && (
        <Card className="ab__notice">
          <span>
            Showing the bundled sample — couldn't load the <code>Budget</code> tab from your spreadsheet ({apiError}).
            Add a <code>Budget</code> tab with <code>Source · Target · Value</code> columns and click <strong>Reload from sheet</strong>.
          </span>
        </Card>
      )}

      {stats && (
        <div className="ab__scoreboard">
          <Card><Stat label="Total income" value={fmtUSD(stats.totalIn)} tone="pos" /></Card>
          <Card><Stat label="Total spend"  value={fmtUSD(stats.totalOut)} /></Card>
          <Card>
            <Stat
              label="Net"
              value={fmtUSD(stats.net)}
              tone={stats.net >= 0 ? 'pos' : 'neg'}
              sub={stats.net >= 0 ? 'Surplus' : 'Deficit'}
              subTone={stats.net >= 0 ? 'pos' : 'neg'}
            />
          </Card>
          <Card><Stat label="Flows" value={String(stats.flows)} sub={`${stats.sources} sources · ${stats.sinks} sinks`} /></Card>
        </div>
      )}

      <Card className="ab__canvas-card">
        <div className="ab__canvas-head">
          <div className="ab__canvas-title">Cash flow</div>
          <div className="ab__legend">
            <span className="ab__legend-hint">Click a node to isolate · click again to clear</span>
          </div>
        </div>

        <div className="ab__canvas-wrap" ref={wrapRef}>
          {layout ? (
            <svg width={size.w} height={size.h} className="ab__svg">
              <g className="ab__links">
                {layout.links.map((link, i) => {
                  const sId = link.source.id || link.source.name;
                  const dim = isLinkDim(link);
                  const sourceIdx = layout.nodes.findIndex(n => (n.id || n.name) === sId);
                  return (
                    <path
                      key={i}
                      d={sankeyLinkHorizontal()(link)}
                      fill="none"
                      stroke={nodeColor(sourceIdx)}
                      strokeOpacity={dim ? 0.06 : 0.32}
                      strokeWidth={Math.max(1, link.width)}
                      onMouseEnter={(e) => setHover({ type: 'link', d: link, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => setHover(h => h ? { ...h, x: e.clientX, y: e.clientY } : null)}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
              </g>
              <g className="ab__nodes">
                {layout.nodes.map((node, i) => {
                  const dim = isNodeDim(node);
                  const id = node.id || node.name;
                  const labelLeft = node.x0 < size.w / 2;
                  return (
                    <g
                      key={id}
                      className="ab__node"
                      opacity={dim ? 0.25 : 1}
                      onMouseEnter={(e) => setHover({ type: 'node', d: node, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => setHover(h => h ? { ...h, x: e.clientX, y: e.clientY } : null)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => setFocusedNode(prev => prev === id ? null : id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <rect
                        x={node.x0}
                        y={node.y0}
                        width={node.x1 - node.x0}
                        height={Math.max(1, node.y1 - node.y0)}
                        fill={nodeColor(i)}
                        rx={2}
                      />
                      <text
                        x={labelLeft ? node.x1 + 8 : node.x0 - 8}
                        y={(node.y0 + node.y1) / 2}
                        textAnchor={labelLeft ? 'start' : 'end'}
                        dominantBaseline="middle"
                        className="ab__node-label"
                      >
                        {node.name}
                      </text>
                      <text
                        x={labelLeft ? node.x1 + 8 : node.x0 - 8}
                        y={(node.y0 + node.y1) / 2 + 14}
                        textAnchor={labelLeft ? 'start' : 'end'}
                        dominantBaseline="middle"
                        className="ab__node-value"
                      >
                        {fmtUSDK(node.value)}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          ) : (
            <div className="ab__empty">
              <div className="ab__empty-title">{source === 'loading' ? 'Loading budget…' : 'No data loaded'}</div>
              {source !== 'loading' && (
                <div className="ab__empty-text">Add a <code>Budget</code> tab to your spreadsheet, then click reload.</div>
              )}
            </div>
          )}
        </div>
      </Card>

      {hover && (
        <div
          className="ab__tooltip"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {hover.type === 'node' ? (
            <>
              <div className="ab__tooltip-label">{hover.d.name}</div>
              <div className="ab__tooltip-value">
                In: {fmtUSD((hover.d.targetLinks || []).reduce((s, l) => s + l.value, 0))}<br />
                Out: {fmtUSD((hover.d.sourceLinks || []).reduce((s, l) => s + l.value, 0))}
              </div>
            </>
          ) : (
            <>
              <div className="ab__tooltip-label">
                {(hover.d.source.name || hover.d.source)} → {(hover.d.target.name || hover.d.target)}
              </div>
              <div className="ab__tooltip-value">{fmtUSD(hover.d.value)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
