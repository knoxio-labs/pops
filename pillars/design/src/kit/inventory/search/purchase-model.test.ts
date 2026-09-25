import { purchaseResults } from '@/fixtures/inventory/purchases-results';
import { describe, expect, it } from 'vitest';

import { searchPurchases } from './purchase-model';

const ids = (query: string) => searchPurchases(purchaseResults, query).map((p) => p.id);

describe('searchPurchases', () => {
  it('matches merchant, order number and line names, ignoring case', () => {
    expect(ids('officeworks')).toEqual(['po-1142']);
    expect(ids('114-2231')).toEqual(['po-1203']);
    expect(ids('OPTICAL')).toEqual(['po-0977']);
    expect(ids('cable')).toEqual(['po-1142', 'po-1188', 'po-1203', 'po-0977']);
  });

  it('returns nothing for an empty query or no match', () => {
    expect(ids('  ')).toEqual([]);
    expect(ids('snorkel')).toEqual([]);
  });
});
