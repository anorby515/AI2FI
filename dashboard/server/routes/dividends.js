const express = require('express');
const router = express.Router();
const { fetchDividends } = require('../yahooClient');
const cache = require('../cache');

const DIV_TTL = 24 * 60 * 60 * 1000;

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
