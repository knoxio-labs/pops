/**
 * Guards for the canonical transaction-type taxonomy (#3607).
 *
 * The pre-#3607 defect was two independently-declared `z.enum` copies (in the
 * corrections contract and the imports contract) plus half a dozen hand-copied
 * union literals, all of which had to be kept in sync by hand since #2448. This
 * suite pins the consolidation: one constant, one schema, shared by reference —
 * so a future fork of either copy fails a test instead of silently drifting.
 */
import { describe, expect, it } from 'vitest';

import { TRANSACTION_TYPES } from '../corrections-constants.js';
import { TransactionTypeSchema as CorrectionsTypeSchema } from '../rest-corrections-schemas.js';
import { TransactionTypeSchema as ImportsTypeSchema } from '../rest-imports-schemas.js';

const EXPECTED = [
  'purchase',
  'transfer',
  'income',
  'refund',
  'reversal',
  'loan',
  'rebate',
  'tax',
] as const;

describe('transaction-type taxonomy (#3607)', () => {
  it('exposes exactly the eight canonical values, in order', () => {
    expect([...TRANSACTION_TYPES]).toEqual([...EXPECTED]);
  });

  it('keeps the legacy three as the leading subset so existing rows stay valid', () => {
    expect([...TRANSACTION_TYPES].slice(0, 3)).toEqual(['purchase', 'transfer', 'income']);
  });

  it('is ONE schema shared by the corrections and imports contracts (re-exported, not re-declared)', () => {
    // Identity, not structural equality: the imports contract must re-export the
    // corrections definition. The moment someone reintroduces a second
    // `z.enum([...])`, this reference check fails.
    expect(ImportsTypeSchema).toBe(CorrectionsTypeSchema);
  });

  it('parses every canonical value', () => {
    for (const type of TRANSACTION_TYPES) {
      expect(CorrectionsTypeSchema.parse(type)).toBe(type);
    }
  });

  it('rejects non-canonical strings, including the capitalised display forms', () => {
    for (const bad of ['expense', 'Expense', 'Income', 'Transfer', 'Refund', '', 'unknown']) {
      expect(CorrectionsTypeSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('the schema option set equals the canonical constant', () => {
    expect(new Set(CorrectionsTypeSchema.options)).toEqual(new Set(TRANSACTION_TYPES));
  });
});
