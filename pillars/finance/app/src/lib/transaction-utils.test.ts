import { describe, expect, it } from 'vitest';

import { cleanDescription, findSimilarTransactions } from './transaction-utils';

import type { ProcessedTransaction } from '@pops/finance';

function makeTransaction(
  checksum: string,
  description: string,
  overrides: Partial<ProcessedTransaction> = {}
): ProcessedTransaction {
  return {
    date: '2026-05-07',
    description,
    amount: -29.41,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum,
    entity: { matchType: 'none' },
    status: 'uncertain',
    ...overrides,
  };
}

describe('findSimilarTransactions', () => {
  it('excludes the reference row by checksum even when it is a different object', () => {
    // The review step edits a local copy, so the store still holds a distinct
    // object for the same row. Identity by reference counted that copy as a
    // sibling and reported a similar row that does not exist.
    const reference = makeTransaction('maccas', 'MCLUU DARLINGHURST');
    const storeCopy = { ...reference };

    expect(findSimilarTransactions(reference, [storeCopy])).toEqual([]);
  });

  it('matches other rows with an identical description', () => {
    const reference = makeTransaction('a', 'MCLUU DARLINGHURST');
    const sibling = makeTransaction('b', 'MCLUU DARLINGHURST');

    expect(findSimilarTransactions(reference, [sibling])).toEqual([sibling]);
  });

  it('matches across differing digits — the same merchant with a terminal id', () => {
    const reference = makeTransaction('a', 'MCLUU DARLINGHURST 1234');
    const sibling = makeTransaction('b', 'MCLUU DARLINGHURST 9987');

    expect(findSimilarTransactions(reference, [sibling])).toEqual([sibling]);
  });

  it('does not match a different merchant', () => {
    const reference = makeTransaction('a', 'MCLUU DARLINGHURST');
    const other = makeTransaction('b', 'BUNNINGS KINGSGROVE');

    expect(findSimilarTransactions(reference, [other])).toEqual([]);
  });

  it('does not group two rows whose descriptions are only digits', () => {
    // cleanDescription() strips digits, so both sides collapse to '' — an
    // empty pattern would otherwise match every other numeric description.
    const reference = makeTransaction('a', '1234');
    const other = makeTransaction('b', '9999');

    expect(cleanDescription('1234')).toBe('');
    expect(findSimilarTransactions(reference, [other])).toEqual([]);
  });
});
