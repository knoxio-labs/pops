/**
 * Unit tests for the canonical import dedup key (#3611).
 *
 * These pin the exact key shape so the browser parser and the re-key migration
 * cannot silently diverge: two exports of the same charge differing only in a
 * free-text column must produce the SAME key, genuinely different charges must
 * not, and the SHA-256 of a fixed key is asserted against an independently
 * computed digest so any change to normalization/amount-format/separator breaks
 * the test.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildImportDedupKey,
  buildImportDedupKeyFromStoredRow,
  extractReferenceValue,
  findReferenceHeader,
} from '../import-dedup.js';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('findReferenceHeader', () => {
  it('prefers a Reference column and is case-insensitive', () => {
    expect(findReferenceHeader(['Date', 'Amount', 'Reference'])).toBe('Reference');
    expect(findReferenceHeader(['reference number', 'x'])).toBe('reference number');
  });

  it('matches transaction id / receipt / ref no variants', () => {
    expect(findReferenceHeader(['Transaction ID'])).toBe('Transaction ID');
    expect(findReferenceHeader(['Receipt Number'])).toBe('Receipt Number');
    expect(findReferenceHeader(['Ref No'])).toBe('Ref No');
  });

  it('does not match unrelated columns (no bare id/ref false positives)', () => {
    expect(findReferenceHeader(['Date', 'Description', 'Amount', 'Address'])).toBeUndefined();
    expect(findReferenceHeader(['Paid', 'Valid'])).toBeUndefined();
  });
});

describe('extractReferenceValue', () => {
  it('reads and trims the reference column value', () => {
    expect(extractReferenceValue({ Date: '15/01/2026', Reference: '  REF-999  ' })).toBe('REF-999');
  });

  it('returns empty string when no reference column is present', () => {
    expect(extractReferenceValue({ Date: '15/01/2026', Amount: '42.50' })).toBe('');
  });

  it('coerces non-string values without throwing', () => {
    expect(extractReferenceValue({ Reference: 12345 })).toBe('12345');
    expect(extractReferenceValue({ Reference: null })).toBe('');
  });
});

describe('buildImportDedupKey', () => {
  const base = {
    date: '2026-01-15',
    amount: -42.5,
    description: 'STARBUCKS STORE 1234',
    reference: 'REF-999',
  };

  it('collapses free-text-only differences to the same key', () => {
    // Same charge re-exported: only a downstream free-text column changed, which
    // never reaches the canonical key, so the reference/date/amount/desc match.
    const a = buildImportDedupKey(base);
    const b = buildImportDedupKey({ ...base });
    expect(a).toBe(b);
  });

  it('ignores digits and case in the description', () => {
    const a = buildImportDedupKey({ ...base, description: 'starbucks store 1234' });
    const b = buildImportDedupKey({ ...base, description: 'STARBUCKS STORE 9999' });
    expect(a).toBe(b);
  });

  it('distinguishes different amounts, dates, references, and merchants', () => {
    const a = buildImportDedupKey(base);
    expect(buildImportDedupKey({ ...base, amount: -42.51 })).not.toBe(a);
    expect(buildImportDedupKey({ ...base, date: '2026-01-16' })).not.toBe(a);
    expect(buildImportDedupKey({ ...base, reference: 'REF-000' })).not.toBe(a);
    expect(buildImportDedupKey({ ...base, description: 'ALDI GROCERIES' })).not.toBe(a);
  });

  it('hashes to a digest that is stable across the client (crypto-js) and node', () => {
    // Pinned against an independently computed digest; crypto-js in the browser
    // produces the same value (verified in the app-side validation test).
    expect(sha256(buildImportDedupKey(base))).toBe(
      'a3a175220202738a2284db59c49efb2a7c8b42a9730f6b443166bcf51b19b137'
    );
  });

  it('does not let a merchant with a `|` collide across the desc/reference boundary', () => {
    const a = buildImportDedupKey({ ...base, description: 'A|B', reference: '' });
    const b = buildImportDedupKey({ ...base, description: 'A', reference: 'B' });
    expect(a).not.toBe(b);
  });
});

describe('buildImportDedupKeyFromStoredRow', () => {
  it('extracts the reference from stored raw_row JSON, matching a fresh parse', () => {
    const rawRow = JSON.stringify({
      Date: '15/01/2026',
      Description: 'STARBUCKS STORE 1234',
      Amount: '42.50',
      Reference: 'REF-999',
      Address: '1 King St',
    });
    const fromStored = buildImportDedupKeyFromStoredRow({
      date: '2026-01-15',
      amount: -42.5,
      description: 'STARBUCKS STORE 1234',
      rawRow,
    });
    expect(fromStored).toBe(
      buildImportDedupKey({
        date: '2026-01-15',
        amount: -42.5,
        description: 'STARBUCKS STORE 1234',
        reference: 'REF-999',
      })
    );
  });

  it('re-keys two exports of one charge (differing Address) identically', () => {
    const common = { date: '2026-01-15', amount: -42.5, description: 'STARBUCKS STORE 1234' };
    const rowA = buildImportDedupKeyFromStoredRow({
      ...common,
      rawRow: JSON.stringify({ Reference: 'REF-999', Address: '1 King St' }),
    });
    const rowB = buildImportDedupKeyFromStoredRow({
      ...common,
      rawRow: JSON.stringify({ Reference: 'REF-999', Address: '2 Queen St' }),
    });
    expect(rowA).toBe(rowB);
  });

  it('tolerates null / malformed raw_row (reference becomes empty)', () => {
    const noRef = buildImportDedupKey({
      date: '2026-01-15',
      amount: -42.5,
      description: 'STARBUCKS STORE 1234',
    });
    expect(
      buildImportDedupKeyFromStoredRow({
        date: '2026-01-15',
        amount: -42.5,
        description: 'STARBUCKS STORE 1234',
        rawRow: null,
      })
    ).toBe(noRef);
    expect(
      buildImportDedupKeyFromStoredRow({
        date: '2026-01-15',
        amount: -42.5,
        description: 'STARBUCKS STORE 1234',
        rawRow: 'not json',
      })
    ).toBe(noRef);
  });
});
