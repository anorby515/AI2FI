const fs = require('fs');
const path = require('path');

const TRACKER_FILE = path.join(__dirname, 'cache', 'api-tracker.json');

function today() { return new Date().toISOString().slice(0, 10); }

function load() {
  try {
    if (fs.existsSync(TRACKER_FILE)) return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  } catch {}
  return { attempted: 0, successful: 0, date: today(), lastSync: null };
}

function save(data) {
  const dir = path.dirname(TRACKER_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(data), 'utf8');
}

function getStatus() {
  const data = load();
  if (data.date !== today()) {
    data.attempted = 0;
    data.successful = 0;
    data.date = today();
    save(data);
  }
  return data;
}

function incrementAttempted() {
  const data = getStatus();
  data.attempted++;
  save(data);
}

function incrementSuccessful() {
  const data = getStatus();
  data.successful++;
  save(data);
}

function setLastSync() {
  const data = getStatus();
  data.lastSync = new Date().toISOString();
  save(data);
}

module.exports = { getStatus, incrementAttempted, incrementSuccessful, setLastSync };
