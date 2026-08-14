import { describe, expect, it } from 'vitest';

import { solve } from '../solve.js';

import type { SolvableCharge, SolvableTransaction, SolverInput, SolverOutput } from '../types.js';

function charge(overrides: Partial<SolvableCharge> = {}): SolvableCharge {
  return {
    id: 'chg-1',
    purchaseId: 'ord-1',
    position: 0,
    amountCents: 2000,
    role: 'capture',
    orderedAt: '2026-03-04T00:00:00Z',
    descriptorPattern: null,
    settlementWindowDays: null,
    ...overrides,
  };
}

function txn(overrides: Partial<SolvableTransaction> = {}): SolvableTransaction {
  return {
    uri: 'pops://finance/transaction/t1',
    description: 'AMAZON MKTPLACE AU',
    amountCents: 5000,
    date: '2026-03-06',
    ...overrides,
  };
}

function run(input: Partial<SolverInput> = {}): SolverOutput {
  return solve({
    charges: [],
    transactions: [],
    confirmed: [],
    rejected: [],
    defaultWindowDays: 21,
    ...input,
  });
}

describe('combined settlement', () => {
  it('links several charges to the one transaction that paid for them', () => {
    // Two orders, one card charge. The per-charge loop cannot see this:
    // neither charge has anything summing to itself.
    const { links, review } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 2000 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 3000 }),
      ],
      transactions: [txn({ amountCents: 5000 })],
    });

    expect(review).toHaveLength(0);
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.linkType)).toEqual(['combined', 'combined']);
    expect(links.reduce((sum, l) => sum + l.amountCents, 0)).toBe(5000);
  });

  it('attributes each charge its own amount, not a share of the transaction', () => {
    const { links } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 1250 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 3750 }),
      ],
      transactions: [txn({ amountCents: 5000 })],
    });

    expect(links.find((l) => l.chargeId === 'c1')?.amountCents).toBe(1250);
    expect(links.find((l) => l.chargeId === 'c2')?.amountCents).toBe(3750);
  });

  it('points every combined link at the same transaction', () => {
    const { links } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 2000 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 3000 }),
      ],
      transactions: [txn({ amountCents: 5000 })],
    });
    expect(new Set(links.map((l) => l.transactionUri)).size).toBe(1);
  });
});

describe('what combined must not do', () => {
  it('never overrules an exact match', () => {
    // c1 has its own transaction. Sweeping it into a partition with c2
    // would take a certain answer and replace it with an inferred one.
    const { links } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 2000 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 3000 }),
      ],
      transactions: [
        txn({ uri: 'exact', amountCents: 2000, date: '2026-03-05' }),
        txn({ uri: 'combined', amountCents: 5000, date: '2026-03-06' }),
      ],
    });

    expect(links.find((l) => l.chargeId === 'c1')?.linkType).toBe('exact');
    expect(links.find((l) => l.chargeId === 'c1')?.transactionUri).toBe('exact');
  });

  it('runs before partial, so a guess cannot eat the transaction it needs', () => {
    // Both stages can claim this transaction. `c3` is larger than it, so
    // partial would take it as a part-payment and leave c1 and c2 with
    // nothing; combined instead finds the exact two-charge partition.
    // A certain answer beats a speculative one, so combined goes first.
    const { links, review } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 2000 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 3000 }),
        charge({ id: 'c3', purchaseId: 'o3', amountCents: 9000 }),
      ],
      transactions: [txn({ amountCents: 5000 })],
    });

    expect(links.map((l) => l.chargeId).toSorted()).toEqual(['c1', 'c2']);
    expect(links.every((l) => l.linkType === 'combined')).toBe(true);
    // c3 is left for review rather than given a partial link to a
    // transaction that demonstrably paid for two other orders.
    expect(review.map((r) => r.chargeId)).toEqual(['c3']);
  });

  it('refuses an ambiguous partition rather than choosing one', () => {
    // 2000+3000 and 1000+4000 both reach 5000.
    const { links } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 2000 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 3000 }),
        charge({ id: 'c3', purchaseId: 'o3', amountCents: 1000 }),
        charge({ id: 'c4', purchaseId: 'o4', amountCents: 4000 }),
      ],
      transactions: [txn({ amountCents: 5000 })],
    });
    expect(links.filter((l) => l.linkType === 'combined')).toHaveLength(0);
  });

  it('does not combine charges the transaction is not eligible for', () => {
    // c2's order is months away, so this transaction is outside its window.
    // Amounts adding up is not a reason to link across merchants or years.
    const { links, review } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 2000 }),
        charge({
          id: 'c2',
          purchaseId: 'o2',
          amountCents: 3000,
          orderedAt: '2026-09-04T00:00:00Z',
        }),
      ],
      transactions: [txn({ amountCents: 5000 })],
    });

    expect(links.filter((l) => l.linkType === 'combined')).toHaveLength(0);
    expect(review.length).toBeGreaterThan(0);
  });

  it('respects each charge own source descriptor', () => {
    const { links } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 2000, descriptorPattern: 'AMAZON%' }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 3000, descriptorPattern: 'WOOLWORTHS%' }),
      ],
      transactions: [txn({ amountCents: 5000, description: 'AMAZON MKTPLACE AU' })],
    });
    expect(links.filter((l) => l.linkType === 'combined')).toHaveLength(0);
  });

  it('never mixes signs, so a refund cannot help settle purchases', () => {
    const { links } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 7000 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: -2000, role: 'refund' }),
      ],
      transactions: [txn({ amountCents: 5000 })],
    });
    expect(links.filter((l) => l.linkType === 'combined')).toHaveLength(0);
  });

  it('spends a transaction only once across the whole run', () => {
    const { links } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 2000 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 3000 }),
        charge({ id: 'c3', purchaseId: 'o3', amountCents: 5000 }),
      ],
      transactions: [txn({ amountCents: 5000 })],
    });

    expect(new Set(links.map((l) => l.transactionUri)).size).toBe(links.length > 0 ? 1 : 0);
    // c3 matches exactly, so it wins the transaction and no combination is
    // left to make.
    expect(links).toHaveLength(1);
    expect(links[0]?.linkType).toBe('exact');
  });
});

describe('combined determinism', () => {
  const messy: Partial<SolverInput> = {
    charges: [
      charge({ id: 'c3', purchaseId: 'o3', amountCents: 1500 }),
      charge({ id: 'c1', purchaseId: 'o1', amountCents: 2500 }),
      charge({ id: 'c2', purchaseId: 'o2', amountCents: 1000 }),
    ],
    transactions: [
      txn({ uri: 'z', amountCents: 4000, date: '2026-03-06' }),
      txn({ uri: 'a', amountCents: 9999, date: '2026-03-05' }),
    ],
  };

  it('produces identical output across runs', () => {
    const first = run(messy);
    for (let attempt = 0; attempt < 20; attempt++) expect(run(messy)).toEqual(first);
  });

  it('does not depend on input order', () => {
    const forward = run(messy);
    const reversed = run({
      charges: [...(messy.charges ?? [])].toReversed(),
      transactions: [...(messy.transactions ?? [])].toReversed(),
    });
    expect(reversed).toEqual(forward);
  });
});

describe('combined and confirmed links', () => {
  it('never uses a transaction a human already pinned elsewhere', () => {
    const { links } = run({
      charges: [
        charge({ id: 'c1', purchaseId: 'o1', amountCents: 2000 }),
        charge({ id: 'c2', purchaseId: 'o2', amountCents: 3000 }),
      ],
      transactions: [txn({ amountCents: 5000 })],
      confirmed: [{ chargeId: 'chg-elsewhere', transactionUri: 'pops://finance/transaction/t1' }],
    });
    expect(links).toHaveLength(0);
  });
});
