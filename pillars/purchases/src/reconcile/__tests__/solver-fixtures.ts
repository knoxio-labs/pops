/**
 * Builders for the solver's snapshot, shared by the suites that drive
 * `solve` end to end.
 *
 * One default world — one Amazon order, one transaction that settles it —
 * so a test states only the thing it is about, and the reader can tell the
 * relevant field from the scenery.
 */
import { solve } from '../solve.js';

import type {
  SolvableCharge,
  SolvableRule,
  SolvableTransaction,
  SolverInput,
  SolverOutput,
} from '../types.js';

export function charge(overrides: Partial<SolvableCharge> = {}): SolvableCharge {
  return {
    id: 'chg-1',
    purchaseId: 'ord-1',
    source: 'amazon',
    position: 0,
    amountCents: 4128,
    role: 'capture',
    orderedAt: '2026-03-04T00:00:00Z',
    descriptorPattern: null,
    settlementWindowDays: null,
    ...overrides,
  };
}

export function txn(overrides: Partial<SolvableTransaction> = {}): SolvableTransaction {
  return {
    uri: 'pops://finance/transaction/t1',
    description: 'AMAZON MKTPLACE AU',
    amountCents: 4128,
    date: '2026-03-06',
    ...overrides,
  };
}

/**
 * A rule as the queue writes one: an `exact` match on an already-normalised
 * descriptor, scoped to the source the decision was made for.
 */
export function rule(overrides: Partial<SolvableRule> = {}): SolvableRule {
  return {
    id: 'rule-1',
    descriptionPattern: 'AMZN MKTP AU',
    matchType: 'exact',
    source: 'amazon',
    isActive: true,
    confidence: 0.99,
    priority: 0,
    ...overrides,
  };
}

export function run(input: Partial<SolverInput> = {}): SolverOutput {
  return solve({
    charges: [charge()],
    transactions: [txn()],
    confirmed: [],
    rejected: [],
    rules: [],
    defaultWindowDays: 21,
    ...input,
  });
}
