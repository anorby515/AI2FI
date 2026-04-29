import { useState } from 'react';
import './RestartButton.css';

export default function RestartButton() {
  const [busy, setBusy] = useState(false);

  async function handleReboot() {
    if (!confirm('Kill the server, restart it, and refresh this page?')) return;
    setBusy(true);
    try {
      await fetch('/api/reboot', { method: 'POST' });
    } catch {
      // Server tears itself down — network error is the success path.
    }
    await waitForServer();
    window.location.reload();
  }

  return (
    <div className="restart-wrap">
      <button className="restart-btn" onClick={handleReboot} disabled={busy}>
        {busy ? 'Restarting…' : 'Restart AI2FI'}
      </button>
    </div>
  );
}

async function waitForServer(maxMs = 30000) {
  const deadline = Date.now() + maxMs;
  await sleep(1500);
  while (Date.now() < deadline) {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (res.ok) return true;
    } catch {
      // still down
    }
    await sleep(750);
  }
  return false;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
