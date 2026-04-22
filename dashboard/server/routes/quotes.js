const express = require('express');
const router = express.Router();
const { fetchQuote } = require('../yahooClient');
const cache = require('../cache');

const CURRENT_TTL = 15 * 60 * 1000; // 15 minutes

// POST /api/quotes/live
// Accepts { tickers: string[] }
// Returns cached quotes immediately; fetches from Yahoo Finance for uncached tickers.
// Tickers that no longer trade (acquired, delisted) return null.
router.post('/live', async (req, res) => {
  const { tickers } = req.body;
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return res.status(400).json({ error: 'tickers array required' });
  }

  const results = {};
  const toFetch = [];

  for (const t of tickers) {
    const cached = cache.get('current', t, CURRENT_TTL);
    if (cached) {
      results[t] = cached;
    } else {
      toFetch.push(t);
    }
  }

  for (const sym of toFetch) {
    try {
      const q = await fetchQuote(sym);
      if (q && q.price != null) {
        cache.set('current', sym, q);
        results[sym] = q;
      } else {
        results[sym] = null;
      }
    } catch {
      results[sym] = null; // delisted, acquired, or unavailable
    }
    if (toFetch.length > 1) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  res.json(results);
});

module.exports = router;
