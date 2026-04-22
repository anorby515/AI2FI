// FinancialStrategy — renders user-profiles/{user}/financial-dashboard.md
// in the sidebar's "Financial Strategy" view.
//
// The dashboard markdown is a synthesis artifact (see core/design-backlog.md →
// "Financial Dashboard artifact"). It's authored/refreshed by Coach and is the
// canonical user-facing view of FOO state + active goals.
//
// This component:
//   1. Fetches /api/profile/andrew/financial-dashboard
//   2. Strips and parses YAML frontmatter for the header strip
//   3. Renders the markdown body with a small inline renderer
//
// Renderer scope (intentionally minimal — the markdown surface is controlled):
//   - YAML frontmatter strip
//   - Headers H1-H4
//   - Horizontal rules (---)
//   - Blockquotes (single + nested with >)
//   - GFM tables (| col | col |)
//   - Bulleted lists (- ) and numbered lists (1. )
//   - Inline: **bold**, *italic*, `code`, [text](url)
//
// If the markdown grows beyond this, swap in react-markdown + remark-gfm.

import { useEffect, useState } from 'react';

const ENDPOINT = '/api/profile/andrew/financial-dashboard';

// ---------- Frontmatter ----------

function parseFrontmatter(src) {
  if (!src.startsWith('---\n')) return { meta: {}, body: src };
  const end = src.indexOf('\n---\n', 4);
  if (end === -1) return { meta: {}, body: src };
  const yaml = src.slice(4, end);
  const body = src.slice(end + 5);
  const meta = {};
  let currentKey = null;
  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) continue;
    // List item under previous key
    const listMatch = line.match(/^\s+-\s*(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      meta[currentKey].push(stripQuotes(listMatch[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      const val = kv[2];
      meta[currentKey] = val === '' ? [] : stripQuotes(val);
    }
  }
  return { meta, body };
}

function stripQuotes(s) {
  if (typeof s !== 'string') return s;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ---------- Inline rendering ----------

// Returns an array of React nodes (strings + elements) for an inline string.
// Order matters: code spans first (so we don't process markup inside them),
// then links, then bold, then italic.
function renderInline(text, keyBase = 'in') {
  if (text == null) return null;
  // Tokenize iteratively
  const out = [];
  let i = 0;
  let buf = '';
  let nodeKey = 0;
  const push = (node) => {
    if (typeof node === 'string') {
      buf += node;
    } else {
      if (buf) { out.push(buf); buf = ''; }
      out.push(node);
    }
  };
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };

  while (i < text.length) {
    const ch = text[i];

    // Inline code: `...`
    if (ch === '`') {
      const close = text.indexOf('`', i + 1);
      if (close !== -1) {
        push(<code key={`${keyBase}-c${nodeKey++}`} className="fs-code">{text.slice(i + 1, close)}</code>);
        i = close + 1;
        continue;
      }
    }

    // Link: [text](url)
    if (ch === '[') {
      const closeBracket = text.indexOf(']', i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const linkText = text.slice(i + 1, closeBracket);
          const url = text.slice(closeBracket + 2, closeParen);
          push(
            <a key={`${keyBase}-a${nodeKey++}`} href={url} target="_blank" rel="noopener noreferrer" className="fs-link">
              {renderInline(linkText, `${keyBase}-a${nodeKey}`)}
            </a>
          );
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Bold: **...**
    if (ch === '*' && text[i + 1] === '*') {
      const close = text.indexOf('**', i + 2);
      if (close !== -1) {
        push(
          <strong key={`${keyBase}-b${nodeKey++}`}>
            {renderInline(text.slice(i + 2, close), `${keyBase}-b${nodeKey}`)}
          </strong>
        );
        i = close + 2;
        continue;
      }
    }

    // Italic: *...* (single star, not preceded/followed by space inside)
    if (ch === '*') {
      const close = text.indexOf('*', i + 1);
      if (close !== -1 && close > i + 1) {
        const inner = text.slice(i + 1, close);
        // skip empty / pure whitespace
        if (inner.trim()) {
          push(
            <em key={`${keyBase}-i${nodeKey++}`}>
              {renderInline(inner, `${keyBase}-i${nodeKey}`)}
            </em>
          );
          i = close + 1;
          continue;
        }
      }
    }

    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

// ---------- Block rendering ----------

function renderBlocks(body) {
  const lines = body.split('\n');
  const blocks = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines between blocks
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${key++}`} className="fs-hr" />);
      i += 1;
      continue;
    }

    // Headers (H1-H4). Trim trailing space.
    const h = line.match(/^(#{1,4})\s+(.*?)\s*$/);
    if (h) {
      const level = h[1].length;
      const Tag = `h${level}`;
      blocks.push(
        <Tag key={`h-${key++}`} className={`fs-h${level}`}>{renderInline(h[2])}</Tag>
      );
      i += 1;
      continue;
    }

    // Tables (GFM): line that starts with | and the next line is a separator
    if (line.trim().startsWith('|') && lines[i + 1] && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const headerCells = splitTableRow(line);
      const rows = [];
      i += 2; // skip header + separator
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={`tbl-${key++}`} className="fs-table-wrap">
          <table className="fs-table">
            <thead>
              <tr>{headerCells.map((c, ci) => <th key={ci}>{renderInline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Blockquote (one or more contiguous > lines, treated as a single block)
    if (line.startsWith('>')) {
      const quoted = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoted.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote key={`bq-${key++}`} className="fs-quote">
          {/* Each line in the quote becomes its own paragraph if separated by blanks; otherwise joined */}
          {quoted.map((q, qi) => (
            <p key={qi}>{renderInline(q)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Bulleted list
    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${key++}`} className="fs-list">
          {items.map((it, ii) => <li key={ii}>{renderInline(it)}</li>)}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${key++}`} className="fs-list">
          {items.map((it, ii) => <li key={ii}>{renderInline(it)}</li>)}
        </ol>
      );
      continue;
    }

    // Paragraph (gather contiguous non-blank, non-special lines)
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^---+\s*$/.test(lines[i]) &&
      !/^#{1,4}\s+/.test(lines[i]) &&
      !lines[i].startsWith('>') &&
      !lines[i].trim().startsWith('|') &&
      !/^\s*-\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    if (paraLines.length) {
      blocks.push(
        <p key={`p-${key++}`} className="fs-p">{renderInline(paraLines.join(' '))}</p>
      );
    }
  }
  return blocks;
}

function splitTableRow(line) {
  // Strip leading/trailing |, then split on | not preceded by \
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

// ---------- Component ----------

export default function FinancialStrategy() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(ENDPOINT)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed to load dashboard');
        return data;
      })
      .then(data => {
        if (cancelled) return;
        const { meta, body } = parseFrontmatter(data.markdown);
        setState({
          status: 'ready',
          meta,
          body,
          source: data.source,
          lastModified: data.lastModified,
        });
      })
      .catch(err => {
        if (!cancelled) setState({ status: 'error', error: err.message });
      });
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'loading') {
    return <div className="financial-strategy fs-loading">Loading your strategy…</div>;
  }
  if (state.status === 'error') {
    return (
      <div className="financial-strategy fs-error">
        <h2>Couldn't load Financial Strategy</h2>
        <p>{state.error}</p>
        <p className="fs-hint">
          Expected file: <code>user-profiles/andrew/financial-dashboard.md</code>.
          The Coach refreshes this at the close of each Part 3 / quarterly check-in.
        </p>
      </div>
    );
  }

  const { meta, body, source, lastModified } = state;
  return (
    <div className="financial-strategy">
      <FsHeaderStrip meta={meta} source={source} lastModified={lastModified} />
      <div className="fs-body">{renderBlocks(body)}</div>
    </div>
  );
}

function FsHeaderStrip({ meta, source, lastModified }) {
  // Curated view of frontmatter so the page has at-a-glance metadata
  // without re-rendering the YAML itself.
  const items = [
    meta.quarter && { label: 'Quarter', value: meta.quarter },
    meta.last_refreshed && { label: 'Refreshed', value: meta.last_refreshed },
    meta.next_check_in && { label: 'Next check-in', value: meta.next_check_in },
    meta.active_goal_count && { label: 'Active goals', value: meta.active_goal_count },
    meta.deferred_goal_count && { label: 'Deferred', value: meta.deferred_goal_count },
  ].filter(Boolean);

  return (
    <div className="fs-meta-strip">
      <div className="fs-meta-items">
        {items.map((it, i) => (
          <div key={i} className="fs-meta-item">
            <span className="fs-meta-label">{it.label}</span>
            <span className="fs-meta-value">{it.value}</span>
          </div>
        ))}
      </div>
      <div className="fs-meta-source" title={`Last modified ${lastModified}`}>
        <code>{source}</code>
      </div>
    </div>
  );
}
