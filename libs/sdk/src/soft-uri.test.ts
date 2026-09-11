import { describe, expect, it } from 'vitest';

import { parseSoftUri } from './soft-uri.js';

describe('parseSoftUri', () => {
  it('splits a well-formed reference', () => {
    expect(parseSoftUri('pops://finance/transaction/abc-123')).toEqual({
      pillar: 'finance',
      type: 'transaction',
      id: 'abc-123',
    });
  });

  it('keeps an id containing slashes whole', () => {
    expect(parseSoftUri('pops://documents/document/a/b')).toEqual({
      pillar: 'documents',
      type: 'document',
      id: 'a/b',
    });
  });

  it.each([
    ['empty string', ''],
    ['no scheme', 'not-a-uri'],
    ['not a uri at all', 'not a uri at all'],
    ['wrong scheme', 'http://finance/transaction/x'],
    ['missing type and id', 'pops://finance'],
    ['missing id', 'pops://inventory/item'],
    ['empty type', 'pops://inventory//1'],
    ['trailing slash, empty id', 'pops://finance/transaction/'],
  ])('rejects %s (%o)', (_label, uri) => {
    expect(parseSoftUri(uri)).toBeNull();
  });
});
