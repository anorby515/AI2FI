const YahooFinance = require('yahoo-finance2').default;
const tracker = require('./apiTracker');

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function formatDate(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === 'string') return d.slice(0, 10);
  return null;
}

async function fetchHistoricalPrices(symbol, from, to) {
  tracker.incrementAttempted();
  const result = await yf.chart(symbol, {
    period1: from || '1993-01-01',
    period2: to || new Date().toISOString().slice(0, 10),
  });
  const data = (result.quotes || []).map(q => ({
    date: formatDate(q.date),
    open: q.open,
    high: q.high,
    low: q.low,
    close: q.close,
    volume: q.volume,
    adjClose: q.adjclose,
  }));
  tracker.incrementSuccessful();
  tracker.setLastSync();
  return data;
}

async function fetchQuote(symbol) {
  tracker.incrementAttempted();
  const q = await yf.quote(symbol);
  tracker.incrementSuccessful();
  tracker.setLastSync();
  return {
    symbol: q.symbol,
    price: q.regularMarketPrice,
    change: q.regularMarketChange,
    changePercent: q.regularMarketChangePercent,
    dayHigh: q.regularMarketDayHigh,
    dayLow: q.regularMarketDayLow,
    volume: q.regularMarketVolume,
    previousClose: q.regularMarketPreviousClose,
    name: q.shortName || q.longName,
  };
}

async function fetchSplits(symbol) {
  tracker.incrementAttempted();
  const result = await yf.chart(symbol, {
    period1: '1980-01-01',
    events: 'splits',
  });
  const splits = (result.events?.splits || []).map(s => ({
    date: formatDate(s.date),
    numerator: s.numerator,
    denominator: s.denominator,
  }));
  tracker.incrementSuccessful();
  tracker.setLastSync();
  return splits;
}

async function fetchDividends(symbol) {
  tracker.incrementAttempted();
  const result = await yf.chart(symbol, {
    period1: '1980-01-01',
    events: 'div',
  });
  const dividends = (result.events?.dividends || []).map(d => ({
    date: formatDate(d.date),
    dividend: d.amount,
    adjDividend: d.amount,
  }));
  tracker.incrementSuccessful();
  tracker.setLastSync();
  return dividends;
}

async function healthCheck() {
  try {
    const q = await yf.quote('AAPL');
    return q && q.regularMarketPrice > 0;
  } catch {
    return false;
  }
}

module.exports = { fetchHistoricalPrices, fetchQuote, fetchSplits, fetchDividends, healthCheck };
