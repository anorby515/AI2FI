const express = require('express');
const router = express.Router();
const { fetchHistoricalPrices } = require('../yahooClient');
const cache = require('../cache');

const PRICE_TTL = Infinity;              // historical prices never change
const CURRENT_TTL = 15 * 60 * 1000;      // 15 minutes

// GET /api/prices/:ticker?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const { from, to } = req.query;
  const cacheKey = `${ticker}_${from || 'all'}_${to || 'all'}`;

  const cached = cache.get('prices', cacheKey, PRICE_TTL);
  if (cached) return res.json(cached);

  try {
    const data = await fetchHistoricalPrices(ticker, from, to);
    cache.set('prices', cacheKey, data);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: `Yahoo Finance error: ${err.message}` });
  }
});

// POST /api/prices/batch-current — returns cached quotes, serves stale if no fresh data
router.post('/batch-current', (req, res) => {
  const { tickers } = req.body;
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return res.status(400).json({ error: 'tickers array required' });
  }
  const results = {};
  for (const t of tickers) {
    // Serve any cached quote — stale data is better than no data
    const cached = cache.get('current', t, Infinity);
    if (cached) results[t] = cached;
  }
  res.json(results);
});

module.exports = router;
