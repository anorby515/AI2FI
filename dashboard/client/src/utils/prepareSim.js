/**
 * Shared scenario preparation for the Monte Carlo simulator.
 *
 * Both the overview's projection chart and the editor's "Asset projection"
 * card go through this so they agree on the math. Keeping it in one place
 * also avoids subtle UI-vs-sim divergence (e.g. "the overview shows
 * Brokerage excluded but the editor's chart still pours $52k/yr into
 * taxable savings").
 *
 * What it does:
 *   • Derives 401(k) employee + employer-match dollar amounts from the
 *     percent-of-comp inputs the editor stores.
 *   • Honours account-inclusion toggles for ongoing contribution streams
 *     (not just starting balances) — if Brokerage is off, no taxable
 *     savings flow either.
 *   • Bounds lump-sum pensions to a single year (endDate = startDate).
 *     The `kind` may have been stored on the scenario by the picker; if
 *     the user saved before that field existed, we look it up from
 *     inputs.pensionOptions by optionId.
 */

export function prepareScenarioForSim(scenario, inputs) {
  if (!scenario) return scenario;

  const next = { ...scenario, contributions: { ...scenario.contributions } };

  // 1) Derive 401k contribution dollars from percent-of-comp.
  const base = Number(scenario.income?.preRetirementSalary || 0);
  const stip = Number(scenario.income?.stipPct || 0);
  const comp = base * (1 + stip);
  const empPct   = Number(scenario.contributions?.annual401kPct || 0);
  const matchPct = Number(scenario.contributions?.annualEmployerMatchPct || 0);
  if (empPct > 0)   next.contributions.annual401k = comp * empPct;
  if (matchPct > 0) next.contributions.annualEmployerMatch = comp * matchPct;

  // 2) Account-inclusion uniformity for contributions.
  const acctIncl = scenario.accountInclusion || {};
  if (acctIncl['401k'] === false) {
    next.contributions.annual401k = 0;
    next.contributions.annualEmployerMatch = 0;
  }
  if (acctIncl['Roth IRA'] === false) {
    next.contributions.annualRothIRA = 0;
  }
  if (acctIncl['Brokerage'] === false) {
    next.contributions.annualTaxableSavings = 0;
  }

  // 3) Lump-sum pension bounding. `kind` is stored on the scenario by the
  // picker, but old saved scenarios won't have it — fall back to looking
  // it up by optionId in inputs.pensionOptions.
  const pension = scenario.income?.pension;
  if (pension) {
    const explicitKind = pension.kind;
    const lookedUpKind = !explicitKind
      ? inputs?.pensionOptions?.find(p => p.id === pension.optionId)?.kind
      : null;
    const kind = explicitKind || lookedUpKind || null;
    if (kind === 'lump_sum') {
      next.income = {
        ...scenario.income,
        pension: {
          ...pension,
          kind,
          endDate: pension.startDate || null,
        },
      };
    }
  }

  return next;
}
