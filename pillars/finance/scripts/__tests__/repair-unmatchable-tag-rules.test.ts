/**
 * The verdict `repair-unmatchable-tag-rules.ts` reaches about one stored rule.
 *
 * This is the whole risk surface of the script: everything else is a SELECT,
 * a report and an UPDATE keyed on the verdict. Getting it wrong writes over
 * operator data that cannot be re-derived — a rule repaired against the wrong
 * merchant is worse than the unmatchable rule it replaced, because it starts
 * tagging.
 *
 * The cases are the four the ticket names (POPS-2940) plus the two the
 * scanner has to leave alone to reach them, all drawn from the real prod
 * rows rather than invented.
 */
import { describe, expect, it } from 'vitest';

import { planRuleRepair, type RuleUnderRepair } from '../repair-unmatchable-tag-rules.js';

function rule(overrides: Partial<RuleUnderRepair> = {}): RuleUnderRepair {
  return {
    id: 'rule-1',
    pattern: 'imperial hotel erskineville',
    matchType: 'contains',
    entityId: 'entity-1',
    descriptions: ['IMPERIAL HOTEL ERSKIN 2 ERSKINEVILLE'],
    ...overrides,
  };
}

describe('planRuleRepair', () => {
  it('leaves a rule that already fires alone', () => {
    expect(
      planRuleRepair(rule({ pattern: 'woolworths', descriptions: ['WOOLWORTHS 1234 SYDNEY'] }))
    ).toEqual({ action: 'ok' });
  });

  it('repairs a rule whose merchant name is not what the bank sent', () => {
    const plan = planRuleRepair(rule());

    expect(plan.action).toBe('repair');
    expect(plan).toMatchObject({ from: 'imperial hotel erskineville' });
    expect(plan.action === 'repair' && plan.to).toBe('IMPERIAL HOTEL ERSKIN ERSKINEVILLE');
  });

  it('repairs across a bank truncation that removes the space', () => {
    const plan = planRuleRepair(
      rule({ pattern: 'corridor digital', descriptions: ['CORRIDORDIGITAL'] })
    );

    expect(plan.action).toBe('repair');
    expect(plan.action === 'repair' && plan.to).toBe('CORRIDORDIGITAL');
  });

  it('derives the shared part when the merchant has several descriptors', () => {
    const plan = planRuleRepair(
      rule({
        pattern: "lily's pad cafe",
        descriptions: ['LILYS PAD CAFE LEURA', 'LILYS PAD CAFE KATOOMBA'],
      })
    );

    expect(plan.action === 'repair' && plan.to).toBe('LILYS PAD CAFE');
  });

  it('flags entity mis-assignment for review rather than repairing it', () => {
    for (const [pattern, descriptor] of [
      ['anz', 'PAYMENT THANKYOU'],
      ['eurovision', 'VOTINGPARTNER ONCENET'],
      ['archie brothers', 'STRIKE AUSTRALIA PTY LT'],
    ] as const) {
      const plan = planRuleRepair(rule({ pattern, descriptions: [descriptor] }));
      expect(plan.action, `${pattern} vs ${descriptor}`).toBe('review');
    }
  });

  it('disables a rule whose merchant yields no pattern long enough to be specific', () => {
    const plan = planRuleRepair(
      rule({ pattern: 'prospero', descriptions: ['PROSPER ALPHA', 'QQQQQQQ'] })
    );

    expect(plan).toEqual({
      action: 'disable',
      from: 'prospero',
      reason: 'no descriptor pattern long enough to be specific',
    });
  });

  it('disables rather than storing a pattern that is only the shared suburb', () => {
    const plan = planRuleRepair(
      rule({
        pattern: 'transport for nsw',
        descriptions: ['TRANSPORTFORNSWTRAVEL   SYDNEY', 'TFNSW OPAL FARE \\       SYDNEY'],
      })
    );

    expect(plan.action).toBe('disable');
    expect(plan.action === 'disable' && plan.reason).toContain('covers too little');
  });

  it('never rewrites a regex rule, whose pattern this pass has no safe way to judge', () => {
    const plan = planRuleRepair(
      rule({
        pattern: '^IMPERIAL HOTEL.*\\d{2}$',
        matchType: 'regex',
        descriptions: ['IMPERIAL HOTEL ERSKIN 2 ERSKINEVILLE'],
      })
    );

    expect(plan).toEqual({ action: 'regex' });
  });

  it('still reports a regex rule that fires as ok, not as skipped', () => {
    expect(
      planRuleRepair(
        rule({
          pattern: 'imperial hotel',
          matchType: 'regex',
          descriptions: ['IMPERIAL HOTEL ERSKIN 2 ERSKINEVILLE'],
        })
      )
    ).toEqual({ action: 'ok' });
  });

  it('leaves an unscoped rule alone — there is no merchant to derive from', () => {
    expect(planRuleRepair(rule({ entityId: null, descriptions: [] }))).toEqual({
      action: 'unscoped',
    });
  });

  it('leaves a rule whose merchant has no transactions yet alone', () => {
    expect(planRuleRepair(rule({ descriptions: [] }))).toEqual({ action: 'unused' });
  });

  it('never proposes a pattern that fails to match the merchant it came from', () => {
    const subject = rule({
      pattern: "lily's pad cafe",
      descriptions: ['LILYS PAD CAFE LEURA', 'LILYS PAD CAFE KATOOMBA'],
    });
    const plan = planRuleRepair(subject);

    if (plan.action !== 'repair') return;
    expect(planRuleRepair({ ...subject, pattern: plan.to })).toEqual({ action: 'ok' });
  });
});
