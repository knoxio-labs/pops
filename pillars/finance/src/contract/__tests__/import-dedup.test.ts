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
  buildLegacyDedupKeyFromStoredRow,
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
    accountId: 'acc-amex',
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

  it('ignores case and whitespace but PRESERVES digits in the description', () => {
    // Case + whitespace differences are cosmetic re-export noise → same key.
    expect(buildImportDedupKey({ ...base, description: '  starbucks   STORE 1234 ' })).toBe(
      buildImportDedupKey({ ...base, description: 'STARBUCKS STORE 1234' })
    );
    // But embedded digits distinguish genuinely different charges (terminal id,
    // card suffix). Reference-less banks rely on the description alone, so these
    // must NOT collide, or a real charge is silently dropped as a duplicate.
    expect(
      buildImportDedupKey({ ...base, reference: '', description: 'EFTPOS 4821 COLES' })
    ).not.toBe(buildImportDedupKey({ ...base, reference: '', description: 'EFTPOS 7734 COLES' }));
  });

  it('distinguishes different amounts, dates, references, merchants, and accounts', () => {
    const a = buildImportDedupKey(base);
    expect(buildImportDedupKey({ ...base, amount: -42.51 })).not.toBe(a);
    expect(buildImportDedupKey({ ...base, date: '2026-01-16' })).not.toBe(a);
    expect(buildImportDedupKey({ ...base, reference: 'REF-000' })).not.toBe(a);
    expect(buildImportDedupKey({ ...base, description: 'ALDI GROCERIES' })).not.toBe(a);
    expect(buildImportDedupKey({ ...base, accountId: 'acc-anz' })).not.toBe(a);
  });

  it('scopes the key to the real account id (POPS-2773, re-scoped by POPS-2852): identical rows on two accounts both commit', () => {
    // The same subscription billed to two cards on the same day is a
    // legitimate duplicate row across accounts, not a re-export of one charge —
    // each account must get its own dedup identity so both commit.
    const amex = buildImportDedupKey({ ...base, accountId: 'acc-amex' });
    const anz = buildImportDedupKey({ ...base, accountId: 'acc-anz' });
    expect(amex).not.toBe(anz);
  });

  it('scopes to the account id, not the bank dialect: two real accounts at the same bank differ', () => {
    // The POPS-2773 fix scoped this key to the BankType dialect label
    // (e.g. "ANZ Credit Card"), which two distinct real ANZ accounts share —
    // so it never actually separated them. Keying on `accountId` does.
    const anzPersonal = buildImportDedupKey({ ...base, accountId: 'acc-anz-personal' });
    const anzJoint = buildImportDedupKey({ ...base, accountId: 'acc-anz-joint' });
    expect(anzPersonal).not.toBe(anzJoint);
  });

  it('re-importing an existing file for the same account still dedupes', () => {
    // Same account, same canonical fields, re-hashed on a second run of the
    // same import (e.g. a re-uploaded file) — must collapse to one key.
    const first = buildImportDedupKey(base);
    const second = buildImportDedupKey({ ...base });
    expect(first).toBe(second);
  });

  it('hashes to a digest that is stable across the client (crypto-js) and node', () => {
    // Pinned against an independently computed digest; crypto-js in the browser
    // produces the same value (verified in the app-side validation test).
    expect(sha256(buildImportDedupKey(base))).toBe(
      '842b30b481c30e011f25e79a5a3cae463cb4bb50038eeba1e473d57eece5033f'
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
      accountId: 'acc-amex',
      date: '2026-01-15',
      amount: -42.5,
      description: 'STARBUCKS STORE 1234',
      rawRow,
    });
    expect(fromStored).toBe(
      buildImportDedupKey({
        accountId: 'acc-amex',
        date: '2026-01-15',
        amount: -42.5,
        description: 'STARBUCKS STORE 1234',
        reference: 'REF-999',
      })
    );
  });

  it('re-keys two exports of one charge (differing Address) identically', () => {
    const common = {
      accountId: 'acc-amex',
      date: '2026-01-15',
      amount: -42.5,
      description: 'STARBUCKS STORE 1234',
    };
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

  it('scopes the stored-row key to the account: the same row on two accounts differs', () => {
    const common = {
      date: '2026-01-15',
      amount: -42.5,
      description: 'STARBUCKS STORE 1234',
      rawRow: JSON.stringify({ Reference: 'REF-999' }),
    };
    const amex = buildImportDedupKeyFromStoredRow({ ...common, accountId: 'acc-amex' });
    const anz = buildImportDedupKeyFromStoredRow({ ...common, accountId: 'acc-anz' });
    expect(amex).not.toBe(anz);
  });

  it('tolerates null / malformed raw_row (reference becomes empty)', () => {
    const noRef = buildImportDedupKey({
      accountId: 'acc-amex',
      date: '2026-01-15',
      amount: -42.5,
      description: 'STARBUCKS STORE 1234',
    });
    expect(
      buildImportDedupKeyFromStoredRow({
        accountId: 'acc-amex',
        date: '2026-01-15',
        amount: -42.5,
        description: 'STARBUCKS STORE 1234',
        rawRow: null,
      })
    ).toBe(noRef);
    expect(
      buildImportDedupKeyFromStoredRow({
        accountId: 'acc-amex',
        date: '2026-01-15',
        amount: -42.5,
        description: 'STARBUCKS STORE 1234',
        rawRow: 'not json',
      })
    ).toBe(noRef);
  });
});

describe('buildLegacyDedupKeyFromStoredRow (frozen for migration 0059)', () => {
  it('matches the pre-account canonical digest pinned before POPS-2773', () => {
    // This is the exact digest `buildImportDedupKey`/`buildImportDedupKeyFromStoredRow`
    // produced before account-scoping landed. It must never change: migration
    // `0059_recompute_canonical_checksum` calls this (via the frozen 4-argument
    // `finance_canonical_checksum` SQLite function) on every fresh install, and
    // its output must stay byte-identical to what it always produced.
    const key = buildLegacyDedupKeyFromStoredRow({
      date: '2026-01-15',
      amount: -42.5,
      description: 'STARBUCKS STORE 1234',
      rawRow: JSON.stringify({ Reference: 'REF-999' }),
    });
    expect(sha256(key)).toBe('7d245cd708a1e3d9ca94a1ba704da5451f17d06b357dd718504ff0f615502605');
  });
});
