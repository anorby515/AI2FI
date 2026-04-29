import { useState } from 'react';
import './Reboot.css';

const CLI_COMMANDS = `# From the dashboard/ directory
# 1. Kill anything bound to the dev ports
lsof -ti :3001 -ti :5173 | xargs kill -9 2>/dev/null

# 2. Restart the server + client together
npm run dev
`;

export default function Reboot() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleReboot() {
    if (!confirm('Kill the server, restart it, and refresh this page?')) return;
    setBusy(true);
    setStatus('Sending reboot signal…');
    try {
      await fetch('/api/reboot', { method: 'POST' });
    } catch {
      // The server tears itself down as part of the reboot, so a network
      // error here is the expected success path — keep going.
    }
    setStatus('Server is restarting. Waiting for it to come back…');
    await waitForServer();
    setStatus('Server is back. Refreshing…');
    window.location.reload();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(CLI_COMMANDS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="reboot-view">
      <div className="reboot-card">
        <h1>Reboot AI2FI</h1>
        <p className="reboot-lede">
          Use this when the dashboard feels stuck — a stale cache, a server
          that stopped responding, or a code change that needs a clean restart.
          The button below kills the running server, starts a fresh instance,
          and reloads the browser once it&rsquo;s back.
        </p>

        <button
          className="reboot-btn"
          onClick={handleReboot}
          disabled={busy}
        >
          {busy ? 'Restarting…' : 'Restart AI2FI'}
        </button>
        {status && <div className="reboot-status">{status}</div>}
      </div>

      <div className="reboot-card">
        <h2>Prefer the CLI?</h2>
        <p>
          Run these from a terminal in the <code>dashboard/</code> directory.
          Use this if the button above doesn&rsquo;t work or the server is
          completely unresponsive.
        </p>
        <div className="reboot-cli">
          <button className="reboot-copy" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <pre><code>{CLI_COMMANDS}</code></pre>
        </div>
      </div>
    </div>
  );
}

async function waitForServer(maxMs = 30000) {
  const deadline = Date.now() + maxMs;
  // Give the server a moment to actually exit before we start polling, so we
  // don't see the dying process answer the first ping and bail too early.
  await sleep(1500);
  while (Date.now() < deadline) {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (res.ok) return true;
    } catch {
      // still down — keep waiting
    }
    await sleep(750);
  }
  return false;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
