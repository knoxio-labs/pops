/**
 * Stage 4 through the whole ladder.
 *
 * The scenario every test here is a variation of: a source registers ONE
 * descriptor pattern by hand, the merchant bills under more than one, and
 * the charges settled under the others are blocked forever. A rule learned
 * from a confirmed link is the only thing that knows the second descriptor
 * belongs to the same merchant.
 *
 * Each test that shows a rule firing is paired with the run that shows what
 * happens without it, because the interesting claim is never "a link was
 * made" — it is that the rule is what made it.
 */
import { describe, expect, it } from 'vitest';

import { charge, rule, run, txn } from './solver-fixtures.js';

import type { SolvableCharge, SolvableTransaction } from '../types.js';

/** An order from a source whose registered pattern is `AMAZON%`. */
function blockedCharge(overrides: Partial<SolvableCharge> = {}): SolvableCharge {
  return charge({ descriptorPattern: 'AMAZON%', ...overrides });
}

/** A descriptor the same merchant bills under, which `AMAZON%` misses. */
function learnedTxn(overrides: Partial<SolvableTransaction> = {}): SolvableTransaction {
  return txn({ description: 'AMZN MKTP AU', ...overrides });
}

describe('a learned rule on a later charge', () => {
  const world = { charges: [blockedCharge()], transactions: [learnedTxn()] };

  it('leaves the charge unmatched when nothing has been learned', () => {
    const { links, review } = run(world);
    expect(links).toEqual([]);
    expect(review[0]?.reason).toBe('no-candidate');
  });

  it('links it once a confirmed decision has taught the descriptor', () => {
    const { links, review } = run({ ...world, rules: [rule()] });
    expect(review).toEqual([]);
    expect(links).toEqual([
      {
        chargeId: 'chg-1',
        transactionUri: 'pops://finance/transaction/t1',
        transactionDescription: 'AMZN MKTP AU',
        amountCents: 4128,
        linkType: 'rule',
        // The rule's own confidence, capped by the stage.
        confidence: 0.8,
        matchRuleId: 'rule-1',
      },
    ]);
  });

  it('carries a rule learned from weaker evidence at its own confidence', () => {
    // A rule inherits the confidence of the link that taught it, so one
    // learned from a part-payment must not sort alongside one learned from
    // an exact match.
    const { links } = run({ ...world, rules: [rule({ confidence: 0.6 })] });
    expect(links[0]?.confidence).toBe(0.6);
  });

  it('does nothing once the rule is deactivated', () => {
    const { links } = run({ ...world, rules: [rule({ isActive: false })] });
    expect(links).toEqual([]);
  });

  it('applies an unscoped rule to a source it was not decided for', () => {
    const { links } = run({
      charges: [blockedCharge({ source: 'bunnings', descriptorPattern: 'BUNNINGS%' })],
      transactions: [learnedTxn({ description: 'PAYPAL *AUS' })],
      rules: [rule({ source: null, descriptionPattern: 'PAYPAL *AUS' })],
    });
    expect(links.map((l) => l.linkType)).toEqual(['rule']);
  });
});

describe('a rule for another merchant', () => {
  it('does not fire on a source it was not decided for', () => {
    const { links, review } = run({
      charges: [blockedCharge({ source: 'bunnings', descriptorPattern: 'BUNNINGS%' })],
      transactions: [learnedTxn()],
      rules: [rule({ source: 'amazon' })],
    });
    expect(links).toEqual([]);
    expect(review[0]?.reason).toBe('no-candidate');
  });

  it('does not fire on a descriptor it says nothing about', () => {
    const { links } = run({
      charges: [blockedCharge()],
      transactions: [learnedTxn({ description: 'BUNNINGS WAREHOUSE' })],
      rules: [rule()],
    });
    expect(links).toEqual([]);
  });
});

describe('a rejected pairing', () => {
  it('is not resurrected by a rule that matches its descriptor', () => {
    // The merged decision path stores a rejection as a pairing rather than
    // as a negative rule, so this is where the negative signal lives: the
    // rule admits the merchant, the rejection still excludes this pair.
    const { links, review } = run({
      charges: [blockedCharge()],
      transactions: [learnedTxn()],
      rules: [rule()],
      rejected: [{ chargeId: 'chg-1', transactionUri: 'pops://finance/transaction/t1' }],
    });
    expect(links).toEqual([]);
    expect(review[0]?.reason).toBe('no-candidate');
  });
});

describe('a stale rule', () => {
  it('proposes nothing rather than a link the amount does not support', () => {
    // The merchant kept the descriptor and changed nothing else; this
    // transaction simply is not the one that settled the order. A rule that
    // could licence a near miss would reconcile the money to the wrong
    // purchase and say so with confidence.
    const { links, review } = run({
      charges: [blockedCharge({ amountCents: 4128 })],
      transactions: [learnedTxn({ amountCents: 4000 })],
      rules: [rule()],
    });
    expect(links).toEqual([]);
    expect(review[0]?.reason).toBe('no-candidate');
  });

  it('does not let the ladder part-pay a charge from a descriptor only it admits', () => {
    // Partial is the ladder's weakest guess. Reaching it through a rule
    // would compound a stale merchant association with an invented
    // residual, which is the worst answer available.
    const { links } = run({
      charges: [blockedCharge({ amountCents: 4128 })],
      transactions: [learnedTxn({ amountCents: 3000 })],
      rules: [rule()],
    });
    expect(links).toEqual([]);
  });

  it('contributes no candidate, leaving the rest of the ladder untouched', () => {
    // The source's own pattern still admits a smaller transaction, so the
    // charge reaches partial exactly as it would have without the rule.
    const withoutRule = run({
      charges: [blockedCharge({ amountCents: 4128 })],
      transactions: [txn({ description: 'AMAZON AU', amountCents: 3000 })],
    });
    const withStaleRule = run({
      charges: [blockedCharge({ amountCents: 4128 })],
      transactions: [txn({ description: 'AMAZON AU', amountCents: 3000 })],
      rules: [rule()],
    });
    expect(withStaleRule).toEqual(withoutRule);
    expect(withStaleRule.links.map((l) => l.linkType)).toEqual(['partial']);
  });
});

describe('a rule never revises a hit', () => {
  it('leaves an exact arithmetic match alone', () => {
    const { links } = run({
      charges: [blockedCharge()],
      transactions: [
        txn({ uri: 'src', description: 'AMAZON AU', amountCents: 4128 }),
        learnedTxn({ uri: 'learned', amountCents: 4128 }),
      ],
      rules: [rule()],
    });
    expect(links).toHaveLength(1);
    expect(links[0]?.transactionUri).toBe('src');
    expect(links[0]?.linkType).toBe('exact');
    expect(links[0]?.matchRuleId).toBeNull();
  });

  it('refuses to choose between two transactions its own rule admits', () => {
    // A human accepted the MERCHANT, not the transaction, so the rule
    // cannot break the tie it just created.
    const { links, review } = run({
      charges: [blockedCharge()],
      transactions: [learnedTxn({ uri: 'a' }), learnedTxn({ uri: 'b', date: '2026-03-07' })],
      rules: [rule()],
    });
    expect(links).toEqual([]);
    expect(review[0]?.reason).toBe('ambiguous');
    expect(review[0]?.candidateCount).toBe(2);
  });
});

describe('where the stage sits in the ladder', () => {
  const partialCandidate = txn({ uri: 'small', description: 'AMAZON AU', amountCents: 3000 });
  const ruleCandidate = learnedTxn({ uri: 'exact', amountCents: 4128 });

  it('part-pays the charge when there is no rule', () => {
    const { links } = run({
      charges: [blockedCharge()],
      transactions: [partialCandidate, ruleCandidate],
    });
    expect(links.map((l) => [l.transactionUri, l.linkType])).toEqual([['small', 'partial']]);
  });

  it('runs before partial, so a guess cannot eat the transaction the rule points at', () => {
    // Partial CONSUMES a transaction. Running it first would settle this
    // charge against `small` and leave the rule's own candidate orphaned —
    // a correction a human made, silently disabled.
    const { links } = run({
      charges: [blockedCharge()],
      transactions: [partialCandidate, ruleCandidate],
      rules: [rule()],
    });
    expect(links.map((l) => [l.transactionUri, l.linkType])).toEqual([['exact', 'rule']]);
  });

  // Both answers available for the SAME charge: the partition closes
  // exactly, and the rule admits a transaction for that charge's own
  // amount. A world where the rule admits nothing is green whichever order
  // the phases run in — and green with the stage deleted — so it would
  // guard nothing at all.
  const halfOfAPartition = blockedCharge({ amountCents: 2000 });
  const theOtherHalf = blockedCharge({
    id: 'chg-2',
    purchaseId: 'ord-2',
    position: 1,
    amountCents: 2128,
  });
  const partition = txn({ uri: 'partition', description: 'AMAZON AU', amountCents: 4128 });
  const ruleAdmits = learnedTxn({ uri: 'learned', amountCents: 2000 });

  it('lets the rule settle that charge when no partition competes for it', () => {
    // What the ordering test below is choosing against. Without it that
    // test cannot tell "combined won" from "the rule never fired".
    const { links } = run({
      charges: [halfOfAPartition],
      transactions: [ruleAdmits],
      rules: [rule()],
    });
    expect(links.map((l) => [l.transactionUri, l.linkType])).toEqual([['learned', 'rule']]);
  });

  it('runs after combined, so a partition that closes exactly still wins', () => {
    // Rules first would link the 2000 charge to `learned` and strand the
    // other half, spending a human's descriptor on a charge that already
    // had a certain answer.
    const { links } = run({
      charges: [halfOfAPartition, theOtherHalf],
      transactions: [partition, ruleAdmits],
      rules: [rule()],
    });
    expect(links.map((l) => [l.transactionUri, l.linkType])).toEqual([
      ['partition', 'combined'],
      ['partition', 'combined'],
    ]);
  });
});

describe('an ambiguity a rule creates', () => {
  // The one case where the presence of a rule changes an outcome the rule
  // cannot itself reach, so it is pinned rather than left to be discovered.
  const world = {
    charges: [blockedCharge({ amountCents: 4128 })],
    transactions: [
      txn({ uri: 'smaller', description: 'AMAZON AU', amountCents: 3000 }),
      learnedTxn({ uri: 'a', amountCents: 4128 }),
      learnedTxn({ uri: 'b', date: '2026-03-07', amountCents: 4128 }),
    ],
  };

  it('part-pays the charge when there is no rule', () => {
    const { links } = run(world);
    expect(links.map((l) => [l.transactionUri, l.linkType])).toEqual([['smaller', 'partial']]);
  });

  it('sends the charge to review instead of letting partial guess', () => {
    // Two transactions from an accepted merchant, each for exactly this
    // charge: one of them settled it. Part-paying it from an unrelated
    // smaller transaction would reconcile the money to the wrong place and
    // stop asking, so the charge stops here.
    const { links, review } = run({ ...world, rules: [rule()] });
    expect(links).toEqual([]);
    expect(review).toEqual([
      { chargeId: 'chg-1', purchaseId: 'ord-1', reason: 'ambiguous', candidateCount: 2 },
    ]);
  });
});

describe('determinism', () => {
  const world = {
    charges: [blockedCharge()],
    transactions: [learnedTxn()],
    rules: [
      rule({ id: 'low-priority', priority: 5, confidence: 0.7 }),
      rule({ id: 'winner', priority: 1, confidence: 0.6 }),
    ],
  };

  it('attributes the link to the same rule however the rules arrive', () => {
    const forwards = run(world);
    const backwards = run({ ...world, rules: [...world.rules].reverse() });
    expect(forwards.links[0]?.matchRuleId).toBe('winner');
    expect(backwards).toEqual(forwards);
  });

  it('reaches the same answer when its own output is fed back as confirmed', () => {
    const first = run(world);
    const again = run({
      ...world,
      confirmed: first.links.map((link) => ({
        chargeId: link.chargeId,
        transactionUri: link.transactionUri,
      })),
    });
    expect(again.links).toEqual([]);
    expect(again.review).toEqual([]);
  });
});
