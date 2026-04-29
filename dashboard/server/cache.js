const fs = require('fs');
const path = require('path');
const { resolveSpreadsheet } = require('./profile-resolver');

const CACHE_DIR = path.join(__dirname, 'cache');

// When the dashboard is reading the demo template, scope the cache under a
// `template/` subdirectory so demo tickers (splits, quotes, benchmarks) can't
// bleed into a real user's cache once they pivot to their own spreadsheet.
function namespaceFor(namespace) {
  const sheet = resolveSpreadsheet();
  return sheet && sheet.isTemplate ? path.join('template', namespace) : namespace;
}

function cacheFile(namespace, key) {
  const dir = path.join(CACHE_DIR, namespaceFor(namespace));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, key.replace(/[^a-zA-Z0-9_.-]/g, '_') + '.json');
}

function get(namespace, key) {
  const file = cacheFile(namespace, key);
  if (!fs.existsSync(file)) return null;
  try {
    const { ts, data } = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ts, data };
  } catch {
    return null;
  }
}

function set(namespace, key, data) {
  fs.writeFileSync(cacheFile(namespace, key), JSON.stringify({ ts: Date.now(), data }), 'utf8');
}

// maxAge in milliseconds
function getOrNull(namespace, key, maxAge = Infinity) {
  const entry = get(namespace, key);
  if (!entry) return null;
  if (Date.now() - entry.ts > maxAge) return null;
  return entry.data;
}

module.exports = { get: getOrNull, set };
