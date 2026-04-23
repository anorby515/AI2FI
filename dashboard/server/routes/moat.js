const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { resolveProfile } = require('../profile-resolver');

function moatDir() {
  const profile = resolveProfile();
  return profile ? profile.researchDir : null;
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
  const dir = moatDir();
  if (!dir) return res.status(404).json({ error: 'No moat analysis available' });

  const { ticker } = req.params;
  const filePath = path.join(dir, `${ticker.toUpperCase()}.md`);

  if (!fs.existsSync(filePath)) {
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

// GET /api/moat — list all available tickers
router.get('/', (_, res) => {
  const dir = moatDir();
  if (!dir || !fs.existsSync(dir)) return res.json([]);
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    const tickers = files.map(f => f.replace('.md', ''));
    res.json(tickers);
  } catch {
    res.json([]);
  }
});

module.exports = router;
