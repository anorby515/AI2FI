const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, 'cache');

function cacheFile(namespace, key) {
  const dir = path.join(CACHE_DIR, namespace);
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
