// Profile artifacts route — serves user-profile markdown files (e.g. financial-dashboard.md)
// to the React client so they can be rendered in the sidebar views.
//
// The dashboard markdown is the synthesis artifact described in core/design-backlog.md
// (Financial Dashboard artifact pattern). This route exposes it as JSON so the client
// can render it with a markdown library.
//
// Active profile is resolved via ../profile-resolver (env > .ai2fi-config > auto-detect).

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { resolveProfile, listProfileDirs, PROFILES_DIR } = require('../profile-resolver');

// Allow-list of artifact names that can be requested. Keeps the path-join safe
// from `..` traversal and documents the contract.
const ARTIFACTS = {
  'financial-dashboard': 'financial-dashboard.md',
};

// GET /api/profile — returns the active profile's metadata so the client
// knows whose data to render. Used instead of hardcoding a username on the
// client side.
//
// `isSampleData` is true when a `.sample-data` marker is present in the
// profile directory. The auto-seed that historically wrote this marker
// has been removed — template placement is now Coach-driven (see
// core/finances-template-setup.md). The marker check is preserved for
// legacy installs and as a hook the Coach can use if a "demo mode" is
// reintroduced. Today, on a fresh install, this is always false.
router.get('/', (_, res) => {
  const profile = resolveProfile();
  if (!profile) {
    return res.status(404).json({
      noProfile: true,
      profiles: listProfileDirs(),
      error: 'No user profile configured',
    });
  }
  const markerPath = path.join(profile.profileDir, '.sample-data');
  res.json({
    name: profile.name,
    hasSpreadsheet: profile.hasSpreadsheet(),
    isSampleData: fs.existsSync(markerPath),
    profiles: listProfileDirs(),
  });
});

// GET /api/profile/:user/:artifact — returns { markdown, lastModified, source }
// for a named artifact belonging to a user. The allow-list of users is the
// set of directories present under user-profiles/ (minus the example template);
// it's dynamic so new users don't need a code change.
router.get('/:user/:artifact', (req, res) => {
  const { user, artifact } = req.params;

  const known = new Set(listProfileDirs());
  if (!known.has(user)) {
    return res.status(404).json({ error: `Unknown user: ${user}` });
  }
  const filename = ARTIFACTS[artifact];
  if (!filename) {
    return res.status(404).json({ error: `Unknown artifact: ${artifact}` });
  }

  const filePath = path.join(PROFILES_DIR, user, filename);
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
