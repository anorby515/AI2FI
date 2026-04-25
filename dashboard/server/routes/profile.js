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
const { resolveProfile, resolveSpreadsheet, listProfileDirs, PROFILES_DIR } = require('../profile-resolver');

// Allow-list of artifact names that can be requested. Keeps the path-join safe
// from `..` traversal and documents the contract.
const ARTIFACTS = {
  'financial-dashboard': 'financial-dashboard.md',
};

// GET /api/profile — returns metadata about what the dashboard is rendering.
//
// `isTemplate` is true whenever the dashboard is reading from the committed
// `core/sample-data/Financial Template.xlsx` instead of the user's own
// `private/Finances.xlsx`. The fallback fires either because no profile is
// configured yet, or the profile exists but the user has not yet copied the
// template into `private/`. The client uses `isTemplate` to render a sticky
// banner across all views and to default the sidebar to "Getting Started".
//
// As soon as `private/Finances.xlsx` appears, the next request flips
// `isTemplate` to false and the dashboard pivots to the user's data without
// a server restart.
router.get('/', (_, res) => {
  const sheet = resolveSpreadsheet();
  if (!sheet) {
    // Neither the user file nor the template is readable — genuine error state.
    return res.status(404).json({
      noProfile: true,
      profiles: listProfileDirs(),
      error: 'No spreadsheet available (template missing)',
    });
  }
  res.json({
    name: sheet.profile ? sheet.profile.name : null,
    hasSpreadsheet: sheet.profile ? sheet.profile.hasSpreadsheet() : false,
    isTemplate: sheet.isTemplate,
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
