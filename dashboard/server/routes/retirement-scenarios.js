// /api/retirement/scenarios — CRUD on retirement-forecast scenarios stored as
// JSON files under <profile-dir>/scenarios/. Each scenario is a self-contained
// what-if input bundle for the Monte Carlo engine.
//
// Filename convention: <id>.json. ID is slugified from the human-friendly
// name (lowercased, non-alphanumeric runs collapsed to '-', leading/trailing
// hyphens trimmed). Reserved IDs starting with an underscore (e.g. `_default`)
// can never be created via POST so the GET /_default endpoint is unambiguous.
//
// Defensive guarantees:
//   - Never write outside the scenarios subdirectory.
//   - Never delete the scenarios directory itself, only files within it.
//   - Validate that the resolved file path is still inside the scenarios dir
//     after any path join (mitigates `..` injection in the :id parameter).
//
// Schema validation: minimum required fields for create/update are `name`. ID
// is server-generated from name; if the body sends an `id` it must match the
// slugified name (otherwise we return 400). Other schema fields fall back to a
// default object on read so older scenarios continue to load when the schema
// grows in future phases.

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { resolveProfile, noProfileResponse } = require('../profile-resolver');
const { aggregateInputs } = require('./retirement-inputs');

// ── Path helpers ──────────────────────────────────────────────────────────

// Returns { dir } for the active profile's scenarios directory, creating it
// on demand. Returns null if no profile is configured.
function ensureScenariosDir() {
  const profile = resolveProfile();
  if (!profile) return null;
  const dir = path.join(profile.profileDir, 'scenarios');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return { dir, profile };
}

// Slugify a human name into a filesystem-safe id. Lowercase, replace any run
// of non-alphanumeric characters with '-', trim leading/trailing hyphens.
function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80); // hard cap
}

// Defensive: confirm a candidate path is inside the scenarios dir.
function isInsideDir(candidatePath, dir) {
  const resolvedDir = path.resolve(dir) + path.sep;
  const resolvedFile = path.resolve(candidatePath);
  return resolvedFile.startsWith(resolvedDir);
}

function scenarioFilePath(dir, id) {
  if (!id || /^[._]/.test(id) || id.includes('/') || id.includes('\\')) return null;
  const filePath = path.join(dir, `${id}.json`);
  if (!isInsideDir(filePath, dir)) return null;
  return filePath;
}

function readScenario(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeScenario(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ── Default-scenario builder ──────────────────────────────────────────────

// Build a fully-populated scenario from /api/retirement/inputs. The frontend
// receives this as a starting point and POSTs it explicitly to persist.
//
// Static placeholders we can't infer from the user's data:
//   - socialSecurity.{selfMonthlyAtFRA, spouseMonthlyAtFRA, claimAge}: SS
//     benefit data isn't on the spreadsheet. Defaults are 4000/2500 monthly
//     at FRA (2026 ballparks); user should pull their actual numbers from
//     ssa.gov and update.
//   - tax.effectiveRateOrdinary: 0.22 — rough effective rate for a high-
//     income household. User should override based on their actual bracket.
//   - tax.effectiveRateLTCG: 0.15.
//   - returns / allocation / monteCarlo: industry-standard defaults.
//
// Inferred from inputs when available:
//   - selfStopWorkingDate ← pension.stop_working OR pension.benefit_commencement - 1 day OR currentAge + 15
//   - preRetirementSalary ← inputs.salaryHints.currentAnnualSalary (null fallback)
//   - annualSalaryIncreasePct ← inputs.salaryHints.annualIncreasePct (0.04 fallback)
//   - stipPct ← inputs.salaryHints.stipPct (0.10 fallback)
//   - pension option ← first lump_sum, else first annuity
//   - spending bands ← derived from salary
//   - contributions ← inputs.contributionHints
async function buildDefaultScenario() {
  const inputs = await aggregateInputs();
  if (!inputs || inputs.error) return null;

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  // Stop-working date logic
  let selfStopWorkingDate = inputs.pensionMeta?.stopWorking || null;
  if (!selfStopWorkingDate && inputs.pensionMeta?.benefitCommencement) {
    const d = new Date(inputs.pensionMeta.benefitCommencement + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    selfStopWorkingDate = d.toISOString().slice(0, 10);
  }
  if (!selfStopWorkingDate && inputs.people?.self?.currentAge != null) {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCFullYear(d.getUTCFullYear() + 15);
    selfStopWorkingDate = d.toISOString().slice(0, 10);
  }

  // Pick a pension option: prefer the first lump_sum, else the first annuity.
  const opts = inputs.pensionOptions || [];
  const pickedLump = opts.find(o => o.kind === 'lump_sum');
  const pickedAnnuity = opts.find(o => o.kind === 'annuity');
  const pickedSsOffset = opts.find(o => o.kind === 'ss_offset_annuity');
  const picked = pickedLump || pickedAnnuity || pickedSsOffset || null;

  let pensionBlock = {
    optionId: null,
    annualAmount: 0,
    startDate: null,
  };
  if (picked) {
    if (picked.kind === 'lump_sum') {
      pensionBlock = {
        optionId: picked.id,
        annualAmount: picked.you_amount || 0,
        startDate: picked.date || null,
      };
    } else if (picked.kind === 'annuity') {
      pensionBlock = {
        optionId: picked.id,
        annualAmount: picked.you_amount || 0,
        startDate: picked.start_date || null,
      };
    } else if (picked.kind === 'ss_offset_annuity') {
      pensionBlock = {
        optionId: picked.id,
        annualAmount: picked.you_starting || 0,
        startDate: picked.start_date || null,
      };
    }
  }

  // Salary-derived spending bands
  const salary = inputs.salaryHints?.currentAnnualSalary || 0;
  const goGoBase = salary > 0 ? Math.round((salary * 0.5) / 1000) * 1000 : 180000;
  const slowGo = Math.round(goGoBase * 0.8 / 1000) * 1000;
  const noGo = Math.round(goGoBase * 0.55 / 1000) * 1000;

  return {
    id: 'base',
    name: 'Base case',
    createdAt: now,
    updatedAt: now,
    horizon: {
      mortalityAgeSelf: 95,
      mortalityAgeSpouse: 95,
    },
    retirementDates: {
      selfStopWorkingDate,
      spouseStopWorkingDate: null,
    },
    income: {
      preRetirementSalary: salary || null,
      annualSalaryIncreasePct: inputs.salaryHints?.annualIncreasePct ?? 0.04,
      stipPct: inputs.salaryHints?.stipPct ?? 0.10,
      socialSecurity: {
        // Placeholders — user must update with their ssa.gov projections.
        selfMonthlyAtFRA: 4000,
        spouseMonthlyAtFRA: 2500,
        selfClaimAge: 67,
        spouseClaimAge: 67,
      },
      pension: pensionBlock,
      otherIncome: [],
    },
    spending: {
      goGoAnnual: goGoBase,
      goGoEndAge: 75,
      slowGoAnnual: slowGo,
      slowGoEndAge: 85,
      noGoAnnual: noGo,
      healthcareAnnual: 0,
      healthcareGrowthPctOverInflation: 0.02,
    },
    contributions: {
      annual401k: inputs.contributionHints?.annual401kFromLedger || 0,
      annualEmployerMatch: inputs.contributionHints?.annualEmployerMatchFromLedger || 0,
      annualRothIRA: 0,
      annualTaxableSavings: 0,
      stopAtRetirement: true,
    },
    accountInclusion: {
      '401k': true,
      'BrokerageLink': true,
      'Traditional IRA': true,
      'Roth IRA': true,
      'Brokerage': true,
      'HSA': false,
      'ESA': false,
    },
    withdrawalSequence: ['taxable', 'traditional', 'roth'],
    tax: {
      effectiveRateOrdinary: 0.22,
      effectiveRateLTCG: 0.15,
    },
    // Return assumptions tuned to align with Fidelity's retirement projections
    // (long-term US historical averages). Vanguard's forward-looking CMA is
    // more conservative (~6-7% equity nominal) — user can override per scenario.
    returns: {
      equity:    { mean: 0.10, stdev: 0.16 },
      bond:      { mean: 0.04, stdev: 0.05 },
      cash:      { mean: 0.025, stdev: 0.01 },
      inflation: { mean: 0.025, stdev: 0.01 },
    },
    allocation: { equity: 0.75, bond: 0.20, cash: 0.05 },
    monteCarlo: {
      paths: 1000,
      seed: null,
    },
  };
}

// ── Routes ────────────────────────────────────────────────────────────────

// GET /api/retirement/scenarios — lightweight list, sorted by updatedAt desc.
router.get('/', (_req, res) => {
  const ctx = ensureScenariosDir();
  if (!ctx) return res.status(404).json(noProfileResponse());

  let entries = [];
  try { entries = fs.readdirSync(ctx.dir).filter(f => f.endsWith('.json')); } catch {}

  const out = [];
  for (const filename of entries) {
    if (filename.startsWith('_') || filename.startsWith('.')) continue;
    const filePath = path.join(ctx.dir, filename);
    const data = readScenario(filePath);
    if (!data || typeof data !== 'object') continue;
    out.push({
      id: data.id || filename.slice(0, -5),
      name: data.name || filename.slice(0, -5),
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
    });
  }
  out.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  res.json(out);
});

// GET /api/retirement/scenarios/_default — generated, never persisted.
// Must be matched BEFORE the parameterized :id route.
router.get('/_default', async (_req, res) => {
  try {
    const scenario = await buildDefaultScenario();
    if (!scenario) return res.status(404).json(noProfileResponse());
    res.json(scenario);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/retirement/scenarios/:id — full scenario JSON.
router.get('/:id', (req, res) => {
  const ctx = ensureScenariosDir();
  if (!ctx) return res.status(404).json(noProfileResponse());
  const filePath = scenarioFilePath(ctx.dir, req.params.id);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Scenario not found' });
  }
  const data = readScenario(filePath);
  if (!data) return res.status(500).json({ error: 'Scenario file is corrupt' });
  res.json(data);
});

// POST /api/retirement/scenarios — create. Body must include `name`. ID is
// generated from the name (or accepted verbatim if matching the slug). 409
// when the id already exists.
router.post('/', (req, res) => {
  const ctx = ensureScenariosDir();
  if (!ctx) return res.status(404).json(noProfileResponse());

  const body = req.body || {};
  if (!body.name || typeof body.name !== 'string') {
    return res.status(400).json({ error: '`name` is required' });
  }
  const id = slugify(body.id || body.name);
  if (!id) return res.status(400).json({ error: 'Could not generate a valid id from name' });

  const filePath = scenarioFilePath(ctx.dir, id);
  if (!filePath) return res.status(400).json({ error: 'Invalid id' });
  if (fs.existsSync(filePath)) return res.status(409).json({ error: 'Scenario id already exists', id });

  const now = new Date().toISOString();
  const data = {
    ...body,
    id,
    name: body.name,
    createdAt: body.createdAt || now,
    updatedAt: now,
  };

  try {
    writeScenario(filePath, data);
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/retirement/scenarios/:id — replace. Updates updatedAt. 404 when
// not found. Cannot rename via PUT — the id in the URL is authoritative.
router.put('/:id', (req, res) => {
  const ctx = ensureScenariosDir();
  if (!ctx) return res.status(404).json(noProfileResponse());

  const filePath = scenarioFilePath(ctx.dir, req.params.id);
  if (!filePath) return res.status(400).json({ error: 'Invalid id' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Scenario not found' });

  const body = req.body || {};
  if (!body.name || typeof body.name !== 'string') {
    return res.status(400).json({ error: '`name` is required' });
  }

  const existing = readScenario(filePath) || {};
  const data = {
    ...body,
    id: req.params.id,
    name: body.name,
    createdAt: existing.createdAt || body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    writeScenario(filePath, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/retirement/scenarios/:id — 204 on success, 404 otherwise.
router.delete('/:id', (req, res) => {
  const ctx = ensureScenariosDir();
  if (!ctx) return res.status(404).json(noProfileResponse());

  const filePath = scenarioFilePath(ctx.dir, req.params.id);
  if (!filePath) return res.status(400).json({ error: 'Invalid id' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Scenario not found' });

  try {
    fs.unlinkSync(filePath);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
