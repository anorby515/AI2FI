// Profile artifacts route — serves user-profile markdown files (e.g. financial-dashboard.md)
// to the React client so they can be rendered in the sidebar views.
//
// The dashboard markdown is the synthesis artifact described in core/design-backlog.md
// (Financial Dashboard artifact pattern). This route exposes it as JSON so the client
// can render it with a markdown library.

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// user-profiles/ lives at the repo root. From dashboard/server/routes/ that's three ..
const PROFILES_ROOT = path.join(__dirname, '../../../user-profiles');

// Allow-list of artifact names that can be requested. Keeps the path-join safe
// from `..` traversal and documents the contract.
const ARTIFACTS = {
  'financial-dashboard': 'financial-dashboard.md',
};

// Allow-list of users. Today: just andrew. Easy to extend.
const USERS = new Set(['andrew']);

// GET /api/profile/:user/:artifact
//   returns: { markdown: string, lastModified: ISO string, source: relative path }
router.get('/:user/:artifact', (req, res) => {
  const { user, artifact } = req.params;

  if (!USERS.has(user)) {
    return res.status(404).json({ error: `Unknown user: ${user}` });
  }
  const filename = ARTIFACTS[artifact];
  if (!filename) {
    return res.status(404).json({ error: `Unknown artifact: ${artifact}` });
  }

  const filePath = path.join(PROFILES_ROOT, user, filename);
  try {
    const stat = fs.statSync(filePath);
    const markdown = fs.readFileSync(filePath, 'utf8');
    res.json({
      markdown,
      lastModified: stat.mtime.toISOString(),
      source: `user-profiles/${user}/${filename}`,
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: `Artifact not found on disk: ${filePath}` });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
