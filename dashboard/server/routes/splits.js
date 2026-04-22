const express = require('express');
const router = express.Router();
const { fetchSplits } = require('../yahooClient');
const cache = require('../cache');

const SPLIT_TTL = 7 * 24 * 60 * 60 * 1000;

router.get('/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const cached = cache.get('splits', ticker, SPLIT_TTL);
  if (cached) return res.json(cached);

  try {
    const splits = await fetchSplits(ticker);
    cache.set('splits', ticker, splits);
    res.json(splits);
  } catch (err) {
    res.status(502).json({ error: `Yahoo Finance error: ${err.message}` });
  }
});

module.exports = router;
