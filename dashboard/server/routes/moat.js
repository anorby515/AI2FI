const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { resolveProfile, REPO_ROOT } = require('../profile-resolver');

const DEMO_RESEARCH_DIR = path.join(REPO_ROOT, 'core', 'sample-data', 'research');

// Search order: real profile research dir first, then bundled demo research.
// Demo files exist for the tickers in the committed Financial Template, so
// the moat UI is populated even when no user profile has been set up.
function moatSearchDirs() {
  const dirs = [];
  const profile = resolveProfile();
  if (profile && profile.researchDir) dirs.push(profile.researchDir);
  if (fs.existsSync(DEMO_RESEARCH_DIR)) dirs.push(DEMO_RESEARCH_DIR);
  return dirs;
}

function findMoatFile(ticker) {
  const upper = ticker.toUpperCase();
  for (const dir of moatSearchDirs()) {
    const p = path.join(dir, `${upper}.md`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function parseMoatFile(content) {
  const lines = content.split('\n');

  // Extract metadata from the header bullet points
  let size = null, direction = null, sources = null, summary = null;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];
    const sizeMatch = line.match(/\*\*Moat Size:\*\*\s*(.+)/);
    if (sizeMatch) size = sizeMatch[1].trim();
    const dirMatch = line.match(/\*\*Moat Direction:\*\*\s*(.+)/);
    if (dirMatch) direction = dirMatch[1].trim();
    const srcMatch = line.match(/\*\*Primary Moat Source\(s\):\*\*\s*(.+)/);
    if (srcMatch) sources = srcMatch[1].trim();
    const sumMatch = line.match(/\*\*Summary:\*\*\s*(.+)/);
    if (sumMatch) summary = sumMatch[1].trim();
  }

  // Extract section assessments
  const sections = [];
  const sectionRegex = /^## (.+)/;
  const assessRegex = /\*\*Assessment:\*\*\s*(.+)/;
  let currentSection = null;
  for (const line of lines) {
    const secMatch = line.match(sectionRegex);
    if (secMatch) {
      currentSection = secMatch[1].trim();
      continue;
    }
    if (currentSection) {
      const assMatch = line.match(assessRegex);
      if (assMatch) {
        sections.push({ name: currentSection, assessment: assMatch[1].trim() });
        currentSection = null;
      }
    }
  }

  return {
    size,
    direction,
    sources,
    summary,
    sections,
    fullMarkdown: content,
  };
}

// GET /api/moat/:ticker
router.get('/:ticker', (req, res) => {
  const { ticker } = req.params;
  const filePath = findMoatFile(ticker);

  if (!filePath) {
    return res.status(404).json({ error: 'No moat analysis available' });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseMoatFile(content);
    res.json({ ticker: ticker.toUpperCase(), ...parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/moat — list all available tickers (union of profile + demo dirs)
// When called with ?summary=1, returns a map of { TICKER: { size, direction, sources } }
// so callers can render aggregated badges across many symbols without N+1 fetches.
router.get('/', (req, res) => {
  const tickers = new Set();
  for (const dir of moatSearchDirs()) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.md')) tickers.add(f.replace('.md', ''));
      }
    } catch { /* ignore */ }
  }
  if (!req.query.summary) {
    return res.json([...tickers]);
  }
  const out = {};
  for (const t of tickers) {
    const filePath = findMoatFile(t);
    if (!filePath) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = parseMoatFile(content);
      out[t] = { size: parsed.size, direction: parsed.direction, sources: parsed.sources };
    } catch { /* skip unreadable */ }
  }
  res.json(out);
});

module.exports = router;
