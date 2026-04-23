// Profile resolver — single source of truth for "whose data is this dashboard showing?"
//
// Resolution order (first match wins):
//   1. process.env.AI2FI_PROFILE       (explicit override, e.g. for dev)
//   2. .ai2fi-config at the repo root  ({ "profile": "name" } — written by setup.command)
//   3. Auto-detect: first non-`example` directory under user-profiles/ that has
//      private/Finances.xlsx, or if none has a spreadsheet, the first such directory
//
// Returns a profile object or null. Routes should treat null as a structured empty state
// (no profile configured) rather than a 500.
//
// This file deliberately avoids any Express or request coupling so it can be called
// from the server entry point, from route handlers, and from tests alike.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '../..');
const PROFILES_DIR = path.join(REPO_ROOT, 'user-profiles');
const CONFIG_FILE = path.join(REPO_ROOT, '.ai2fi-config');

const EXCLUDED = new Set(['example', 'README.md']);

function readConfigProfile() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return (cfg && typeof cfg.profile === 'string' && cfg.profile) || null;
  } catch {
    return null;
  }
}

function listProfileDirs() {
  if (!fs.existsSync(PROFILES_DIR)) return [];
  return fs.readdirSync(PROFILES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !EXCLUDED.has(d.name) && !d.name.startsWith('.'))
    .map(d => d.name);
}

function buildProfile(name) {
  const profileDir    = path.join(PROFILES_DIR, name);
  const privateDir    = path.join(profileDir, 'private');
  const spreadsheetPath = path.join(privateDir, 'Finances.xlsx');
  const researchDir   = path.join(profileDir, 'research');
  return {
    name,
    profileDir,
    privateDir,
    spreadsheetPath,
    researchDir,
    hasSpreadsheet: () => fs.existsSync(spreadsheetPath),
    exists: () => fs.existsSync(profileDir),
  };
}

function resolveProfile() {
  // 1. Env override
  if (process.env.AI2FI_PROFILE) {
    return buildProfile(process.env.AI2FI_PROFILE);
  }
  // 2. Config file
  const fromConfig = readConfigProfile();
  if (fromConfig) return buildProfile(fromConfig);
  // 3. Auto-detect — prefer dirs with a spreadsheet
  const dirs = listProfileDirs();
  for (const name of dirs) {
    if (fs.existsSync(path.join(PROFILES_DIR, name, 'private', 'Finances.xlsx'))) {
      return buildProfile(name);
    }
  }
  // Fall back to first profile dir even without a spreadsheet (partial setup)
  if (dirs.length > 0) return buildProfile(dirs[0]);
  return null;
}

// Structured "no data yet" response shape used by routes. The client keys on
// `noProfile` / `noSpreadsheet` to render an onboarding screen instead of an error.
function noProfileResponse() {
  return {
    noProfile: true,
    error: 'No user profile configured',
    hint: 'Create a folder at user-profiles/<your-name>/ and drop your spreadsheet into private/Finances.xlsx. Setting AI2FI_PROFILE or writing .ai2fi-config at the repo root also works.',
  };
}

function noSpreadsheetResponse(profile) {
  return {
    noSpreadsheet: true,
    profileName: profile.name,
    error: `Spreadsheet not found for profile "${profile.name}"`,
    hint: `Put your data at user-profiles/${profile.name}/private/Finances.xlsx`,
    expectedPath: `user-profiles/${profile.name}/private/Finances.xlsx`,
  };
}

module.exports = {
  resolveProfile,
  listProfileDirs,
  buildProfile,
  noProfileResponse,
  noSpreadsheetResponse,
  REPO_ROOT,
  PROFILES_DIR,
};
