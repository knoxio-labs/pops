import { describe, expect, it } from 'vitest';

import { variantFor } from './entity-card-variants';

const cases = [
  ['pops:finance/transaction/1', 'Transaction'],
  ['pops:finance/account/1', 'Account'],
  ['pops:finance/budget/1', 'Budget'],
  ['pops:finance/entity/1', 'Entity'],
  ['pops:purchases/purchase/1', 'Purchase'],
  ['pops:purchases/purchase-item/1', 'Purchase item'],
  ['pops:inventory/item/1', 'Item'],
  ['pops:inventory/location/1', 'Location'],
  ['pops:media/movie/1', 'Movie'],
  ['pops:media/tv-show/1', 'TV show'],
  ['pops:cerebrum/engram/1', 'Engram'],
] as const;

describe('variantFor', () => {
  it.each(cases)('returns %s as the %s variant', (uri, label) => {
    expect(variantFor(uri).label).toBe(label);
  });

  it.each(['pops:foo/bar/1', 'https://example.com', 'pops:finance/transactionx/1'])(
    'returns the fallback variant for %s',
    (uri) => {
      expect(variantFor(uri).label).toBe('Link');
    }
  );
});
