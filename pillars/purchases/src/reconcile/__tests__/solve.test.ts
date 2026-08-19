import { describe, expect, it } from 'vitest';

import { charge, run, txn } from './solver-fixtures.js';

import type { SolverInput } from '../types.js';

describe('stage 1 — exact', () => {
  it('links a charge to the single transaction for its amount', () => {
    const { links, review } = run();
    expect(review).toHaveLength(0);
    expect(links).toEqual([
      {
        chargeId: 'chg-1',
        transactionUri: 'pops://finance/transaction/t1',
        // Carried so a later confirm can key a match rule on it. The solver
        // itself never matches on this — blocking reads the source's own
        // pattern.
        transactionDescription: 'AMAZON MKTPLACE AU',
        amountCents: 4128,
        linkType: 'exact',
        confidence: 0.99,
        matchRuleId: null,
      },
    ]);
  });

  it('routes to review when two transactions share the amount', () => {
    // A duplicate charge and its correction look identical from here, and
    // a coin flip gets it wrong half the time.
    const { links, review } = run({
      transactions: [txn({ uri: 'a' }), txn({ uri: 'b', date: '2026-03-07' })],
    });
    expect(links).toHaveLength(0);
    expect(review[0]?.reason).toBe('ambiguous');
    expect(review[0]?.candidateCount).toBe(2);
  });
});

describe('stage 2 — split', () => {
  it('links one charge to the shipment transactions that settle it', () => {
    const { links, review } = run({
      charges: [charge({ amountCents: 5000 })],
      transactions: [
        txn({ uri: 'a', amountCents: 2000 }),
        txn({ uri: 'b', amountCents: 3000, date: '2026-03-09' }),
      ],
    });
    expect(review).toHaveLength(0);
    expect(links.map((l) => l.linkType)).toEqual(['split', 'split']);
    expect(links.reduce((sum, l) => sum + l.amountCents, 0)).toBe(5000);
  });

  it('prefers an exact single match over a partition of the same total', () => {
    const { links } = run({
      charges: [charge({ amountCents: 5000 })],
      transactions: [
        txn({ uri: 'exact', amountCents: 5000 }),
        txn({ uri: 'a', amountCents: 2000, date: '2026-03-07' }),
        txn({ uri: 'b', amountCents: 3000, date: '2026-03-08' }),
      ],
    });
    expect(links).toHaveLength(1);
    expect(links[0]?.linkType).toBe('exact');
    expect(links[0]?.transactionUri).toBe('exact');
  });

  it('routes an ambiguous partition to review rather than choosing', () => {
    const { links, review } = run({
      charges: [charge({ amountCents: 3000 })],
      transactions: [
        txn({ uri: 'a', amountCents: 1000 }),
        txn({ uri: 'b', amountCents: 2000, date: '2026-03-07' }),
        txn({ uri: 'c', amountCents: 1000, date: '2026-03-08' }),
        txn({ uri: 'd', amountCents: 2000, date: '2026-03-09' }),
      ],
    });
    expect(links).toHaveLength(0);
    expect(review[0]?.reason).toBe('ambiguous');
  });
});

describe('stage 3 — partial payment', () => {
  it('links a gift-card-part-paid order to the one candidate that remains', () => {
    const { links } = run({
      charges: [charge({ amountCents: 5000 })],
      transactions: [txn({ uri: 'a', amountCents: 3000 })],
    });
    expect(links[0]?.linkType).toBe('partial');
    expect(links[0]?.amountCents).toBe(3000);
    // The residual is 2000 and is deliberately NOT recorded as a link: it
    // is derived from the order, never invented here.
  });

  it('refuses to guess which of two smaller transactions was the payment', () => {
    const { links, review } = run({
      charges: [charge({ amountCents: 5000 })],
      transactions: [
        txn({ uri: 'a', amountCents: 3000 }),
        txn({ uri: 'b', amountCents: 1200, date: '2026-03-08' }),
      ],
    });
    expect(links).toHaveLength(0);
    expect(review[0]?.reason).toBe('ambiguous-partial');
  });
});

describe('confirmed links are pinned', () => {
  it('leaves a confirmed charge alone entirely', () => {
    const { links, review } = run({
      confirmed: [{ chargeId: 'chg-1', transactionUri: 'pops://finance/transaction/other' }],
    });
    expect(links).toHaveLength(0);
    expect(review).toHaveLength(0);
  });

  it('removes a confirmed transaction from every other charge candidate set', () => {
    // The constraint is what makes a human decision durable: the pinned
    // transaction cannot be re-used to satisfy a different order.
    const { links, review } = run({
      charges: [charge({ id: 'chg-2', purchaseId: 'ord-2' })],
      confirmed: [{ chargeId: 'chg-other', transactionUri: 'pops://finance/transaction/t1' }],
    });
    expect(links).toHaveLength(0);
    expect(review[0]?.reason).toBe('no-candidate');
  });
});

describe('blocking', () => {
  it('ignores a transaction outside the settlement window', () => {
    const { review } = run({ transactions: [txn({ date: '2026-05-01' })] });
    expect(review[0]?.reason).toBe('no-candidate');
  });

  it('honours a per-source window override', () => {
    const near = { transactions: [txn({ date: '2026-03-20' })] };
    expect(
      run({ ...near, charges: [charge({ settlementWindowDays: 3 })] })['review'][0]?.reason
    ).toBe('no-candidate');
    expect(run({ ...near, charges: [charge({ settlementWindowDays: 30 })] }).links).toHaveLength(1);
  });

  it('blocks on the source descriptor pattern', () => {
    const { review } = run({
      charges: [charge({ descriptorPattern: 'WOOLWORTHS%' })],
      transactions: [txn({ description: 'AMAZON MKTPLACE AU' })],
    });
    expect(review[0]?.reason).toBe('no-candidate');
  });

  it('matches the descriptor case-insensitively', () => {
    const { links } = run({
      charges: [charge({ descriptorPattern: 'amazon%' })],
      transactions: [txn({ description: 'AMAZON MKTPLACE AU' })],
    });
    expect(links).toHaveLength(1);
  });
});

describe('a zero-amount charge', () => {
  it('reports no candidate rather than ambiguity', () => {
    // Nothing can settle a zero charge. Treating it as merely sign-less
    // would let every negative transaction in the window count as a
    // candidate, and the charge would land in review as though the problem
    // were too much evidence rather than an unmatchable amount.
    const { links, review } = run({
      charges: [charge({ amountCents: 0 })],
      transactions: [
        txn({ uri: 'a', amountCents: -500 }),
        txn({ uri: 'b', amountCents: -900, date: '2026-03-07' }),
      ],
    });

    expect(links).toHaveLength(0);
    expect(review[0]?.reason).toBe('no-candidate');
    expect(review[0]?.candidateCount).toBe(0);
  });
});

describe('an overcrowded window', () => {
  it('routes to review rather than searching a window it cannot search honestly', () => {
    // Past the subset-sum ceiling the number of coincidental combinations
    // grows with the candidate count, so refusing is more honest than
    // returning one of them.
    const { links, review } = run({
      charges: [charge({ amountCents: 99_999 })],
      transactions: Array.from({ length: 14 }, (_, i) =>
        txn({ uri: `t${String(i)}`, amountCents: (i + 1) * 100, date: '2026-03-06' })
      ),
    });
    expect(links).toHaveLength(0);
    expect(review[0]?.reason).toBe('too-many-candidates');
  });
});

describe('refunds', () => {
  it('matches a refund against a negative transaction', () => {
    const { links } = run({
      charges: [charge({ amountCents: -1179, role: 'refund' })],
      transactions: [txn({ amountCents: -1179 })],
    });
    expect(links[0]?.linkType).toBe('exact');
    expect(links[0]?.amountCents).toBe(-1179);
  });

  it('never settles a refund with an ordinary purchase of the same size', () => {
    const { links, review } = run({
      charges: [charge({ amountCents: -1179, role: 'refund' })],
      transactions: [txn({ amountCents: 1179 })],
    });
    expect(links).toHaveLength(0);
    expect(review[0]?.reason).toBe('no-candidate');
  });

  it('never settles a purchase with a refund', () => {
    const { review } = run({
      charges: [charge({ amountCents: 4128 })],
      transactions: [txn({ amountCents: -4128 })],
    });
    expect(review[0]?.reason).toBe('no-candidate');
  });
});

describe('determinism', () => {
  const messy: Partial<SolverInput> = {
    charges: [
      charge({ id: 'c3', purchaseId: 'o3', amountCents: 1500 }),
      charge({ id: 'c1', purchaseId: 'o1', amountCents: 2500 }),
      charge({ id: 'c2', purchaseId: 'o2', amountCents: 1500 }),
    ],
    transactions: [
      txn({ uri: 'z', amountCents: 2500 }),
      txn({ uri: 'a', amountCents: 1500, date: '2026-03-05' }),
      txn({ uri: 'm', amountCents: 1500, date: '2026-03-07' }),
    ],
  };

  it('produces identical output across repeated runs', () => {
    const first = run(messy);
    for (let attempt = 0; attempt < 25; attempt++) {
      expect(run(messy)).toEqual(first);
    }
  });

  it('does not depend on the order the inputs arrive in', () => {
    // Ids are random UUIDs written in the same second, so input order is
    // genuinely arbitrary. If it changed the answer, a sweep could unlink
    // and relink the same order forever.
    const forward = run(messy);
    const reversed = run({
      charges: [...(messy.charges ?? [])].toReversed(),
      transactions: [...(messy.transactions ?? [])].toReversed(),
    });
    expect(reversed).toEqual(forward);
  });
});

describe('a transaction is never spent twice', () => {
  it('gives one transaction to only one charge', () => {
    const { links, review } = run({
      charges: [charge({ id: 'c1', purchaseId: 'o1' }), charge({ id: 'c2', purchaseId: 'o2' })],
      transactions: [txn()],
    });
    expect(links).toHaveLength(1);
    expect(review).toHaveLength(1);
    expect(review[0]?.reason).toBe('no-candidate');
  });

  it('never proposes the same transaction uri twice across the whole run', () => {
    const { links } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 1000 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 1000 }),
        charge({ id: 'c3', purchaseId: 'o3', amountCents: 1000 }),
      ],
      transactions: [
        txn({ uri: 'a', amountCents: 1000 }),
        txn({ uri: 'b', amountCents: 1000, date: '2026-03-07' }),
      ],
    });
    expect(new Set(links.map((l) => l.transactionUri)).size).toBe(links.length);
  });
});

describe('idempotency under re-derivation', () => {
  it('reaches the same answer when its own links are fed back as confirmed', () => {
    // A sweep tears down unconfirmed links and re-solves. Once a human
    // confirms what the solver proposed, re-running must not disturb it.
    const first = run({
      charges: [
        charge({ id: 'c1', amountCents: 2000 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 3000 }),
      ],
      transactions: [
        txn({ uri: 'a', amountCents: 2000 }),
        txn({ uri: 'b', amountCents: 3000, date: '2026-03-07' }),
      ],
    });

    const second = run({
      charges: [
        charge({ id: 'c1', amountCents: 2000 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 3000 }),
      ],
      transactions: [
        txn({ uri: 'a', amountCents: 2000 }),
        txn({ uri: 'b', amountCents: 3000, date: '2026-03-07' }),
      ],
      confirmed: first.links.map((l) => ({
        chargeId: l.chargeId,
        transactionUri: l.transactionUri,
      })),
    });

    expect(second.links).toHaveLength(0);
    expect(second.review).toHaveLength(0);
  });
});

describe('a late-arriving transaction', () => {
  it('can change an earlier answer, which is why links are re-derived', () => {
    // Before the exact match imports, the order matches partially. After,
    // the same snapshot yields the exact link — patching state incrementally
    // is what would leave the stale partial in place.
    const before = run({
      charges: [charge({ amountCents: 5000 })],
      transactions: [txn({ uri: 'a', amountCents: 3000 })],
    });
    expect(before.links[0]?.linkType).toBe('partial');

    const after = run({
      charges: [charge({ amountCents: 5000 })],
      transactions: [
        txn({ uri: 'a', amountCents: 3000 }),
        txn({ uri: 'b', amountCents: 5000, date: '2026-03-08' }),
      ],
    });
    expect(after.links[0]?.linkType).toBe('exact');
    expect(after.links[0]?.transactionUri).toBe('b');
  });
});

describe('an empty world', () => {
  it('proposes nothing and reviews nothing', () => {
    expect(run({ charges: [], transactions: [] })).toEqual({ links: [], review: [] });
  });

  it('reports a charge with no candidates rather than dropping it', () => {
    const { review } = run({ transactions: [] });
    expect(review).toEqual([
      { chargeId: 'chg-1', purchaseId: 'ord-1', reason: 'no-candidate', candidateCount: 0 },
    ]);
  });
});

describe('a rejected pairing', () => {
  it('is never proposed again, however well the arithmetic fits', () => {
    const { links, review } = run({
      rejected: [{ chargeId: 'chg-1', transactionUri: 'pops://finance/transaction/t1' }],
    });

    expect(links).toEqual([]);
    // Removed at blocking, so the charge reports having had no candidate at
    // all rather than an ambiguity it never faced.
    expect(review).toEqual([
      { chargeId: 'chg-1', purchaseId: 'ord-1', reason: 'no-candidate', candidateCount: 0 },
    ]);
  });

  it('binds to the charge it was decided for and no other', () => {
    // The failure this catches would be silent and total: a rejection read
    // as global takes the transaction away from every charge, so one click
    // unmatches an order nobody looked at.
    const { links } = run({
      charges: [charge(), charge({ id: 'chg-2', purchaseId: 'ord-2' })],
      rejected: [{ chargeId: 'chg-1', transactionUri: 'pops://finance/transaction/t1' }],
    });

    expect(links).toHaveLength(1);
    expect(links[0]?.chargeId).toBe('chg-2');
  });

  it('does not spend the transaction it was rejected from', () => {
    // Blocking removes the candidate without the ladder forming an opinion,
    // so the transaction stays unclaimed. Consuming it here would leave the
    // charge that really settles it looking unexplained.
    const { links } = run({
      charges: [charge({ amountCents: 4128 }), charge({ id: 'chg-2', purchaseId: 'ord-2' })],
      transactions: [txn()],
      rejected: [{ chargeId: 'chg-1', transactionUri: 'pops://finance/transaction/t1' }],
    });

    expect(links).toEqual([
      {
        chargeId: 'chg-2',
        transactionUri: 'pops://finance/transaction/t1',
        transactionDescription: 'AMAZON MKTPLACE AU',
        amountCents: 4128,
        linkType: 'exact',
        confidence: 0.99,
        matchRuleId: null,
      },
    ]);
  });

  it('does not stop a combined settlement it was not part of', () => {
    const { links } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 1500 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 2628 }),
      ],
      transactions: [txn({ uri: 'combined', amountCents: 4128 })],
      rejected: [{ chargeId: 'c1', transactionUri: 'pops://finance/transaction/t1' }],
    });

    expect(links.map((link) => link.chargeId).toSorted()).toEqual(['c1', 'c2']);
    expect(links.every((link) => link.linkType === 'combined')).toBe(true);
  });

  it('keeps its charge out of a combined settlement it WAS part of', () => {
    // The same partition, with the rejection pointing at the transaction
    // the combined phase would have used. Blocking is compiled per charge
    // there too, so the charge is simply not eligible.
    const { links, review } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 1500 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 2628 }),
      ],
      transactions: [txn({ uri: 'combined', amountCents: 4128 })],
      rejected: [{ chargeId: 'c1', transactionUri: 'combined' }],
    });

    expect(links).toEqual([]);
    expect(review.map((entry) => entry.chargeId).toSorted()).toEqual(['c1', 'c2']);
  });
});
