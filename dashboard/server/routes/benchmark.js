const express = require('express');
const router = express.Router();
const { fetchHistoricalPrices } = require('../yahooClient');
const cache = require('../cache');

const BENCHMARK_TTL = 7 * 24 * 60 * 60 * 1000;

router.get('/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const cached = cache.get('benchmark', ticker, BENCHMARK_TTL);
  if (cached) return res.json(cached);

  try {
    const data = await fetchHistoricalPrices(ticker, '1993-01-01');
    // adjClose is dividend-adjusted — used for total-return alpha vs SPY.
    const lean = data.map(d => ({ date: d.date, close: d.close, adjClose: d.adjClose }));
    cache.set('benchmark', ticker, lean);
    res.json(lean);
  } catch (err) {
    res.status(502).json({ error: `Yahoo Finance error: ${err.message}` });
  }
});

module.exports = router;
