const express = require('express');
const router = express.Router();
const { fetchDividends } = require('../yahooClient');
const cache = require('../cache');

const DIV_TTL = 24 * 60 * 60 * 1000;

// POST /api/dividends/batch — cache-only lookup for many tickers at once.
// Used by HoldingsList/Dashboard to fold dividends into total-return CAGR
// without hitting Yahoo on every page load. Empty arrays for cache misses.
router.post('/batch', (req, res) => {
  const tickers = Array.isArray(req.body?.tickers) ? req.body.tickers : [];
  const out = {};
  for (const t of tickers) {
    const cached = cache.get('dividends', t, Infinity); // ignore TTL — sync refreshes
    out[t] = Array.isArray(cached) ? cached : [];
  }
  res.json(out);
});

router.get('/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const cached = cache.get('dividends', ticker, DIV_TTL);
  if (cached) return res.json(cached);

  try {
    const data = await fetchDividends(ticker);
    cache.set('dividends', ticker, data);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: `Yahoo Finance error: ${err.message}` });
  }
});

module.exports = router;
