const express = require('express');
const path = require('path');
const { spawn } = require('child_process');

const router = express.Router();

// POST /api/reboot — spawn the detached reboot script and immediately reply.
// The script sleeps briefly before killing this process, so the response has
// time to flush back to the browser. The Reboot component then polls
// /api/status until the new server answers, and reloads.
router.post('/', (_req, res) => {
  const script = path.join(__dirname, '..', '..', 'scripts', 'reboot.sh');
  try {
    const child = spawn('/usr/bin/env', ['bash', script], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
