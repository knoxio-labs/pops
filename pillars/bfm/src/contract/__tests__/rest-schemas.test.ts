/**
 * `mobile-wire-shape.test.ts` (in `api/__tests__/`) asserts the OpenAPI
 * PROJECTION carries no `enum` for `currency` — the thing the Swift generator
 * reads. This asserts the zod schema behind it, which is what the mobile
 * transactions routes actually declare as their `200` body
 * (`pillars/bfm/src/contract/rest.ts`): that a transaction in a currency
 * other than {@link MOBILE_CURRENCY} is carried through unchanged rather than
 * failing validation, for both the list row and the fuller detail record.
 */
import { describe, expect, it } from 'vitest';

import {
  MOBILE_CURRENCY,
  MobileTransactionDetailSchema,
  MobileTransactionSchema,
} from '../rest-schemas.js';

const row = {
  id: 'txn-1',
  description: 'Coffee',
  amount: -4.5,
  currency: MOBILE_CURRENCY,
  date: '2026-03-05',
  type: 'purchase',
  entityName: 'Cafe',
  tags: ['food'],
};

const detail = {
  ...row,
  account: 'Everyday',
  entityId: 'entity-1',
  location: null,
  country: 'AU',
  notes: null,
  relatedTransactionId: null,
  lastEditedTime: '2026-03-05T10:00:00.000Z',
};

describe('MobileTransactionSchema.shape.currency', () => {
  it('carries a transaction in a currency other than AUD rather than rejecting it', () => {
    const result = MobileTransactionSchema.safeParse({ ...row, currency: 'USD' });

    expect(result.success).toBe(true);
    expect(result.data?.currency).toBe('USD');
  });

  it('still requires the field to be present', () => {
    const { currency: _currency, ...withoutCurrency } = row;

    expect(MobileTransactionSchema.safeParse(withoutCurrency).success).toBe(false);
  });
});

describe('MobileTransactionDetailSchema.shape.currency', () => {
  it('carries a currency other than AUD on the detail record too', () => {
    const result = MobileTransactionDetailSchema.safeParse({ ...detail, currency: 'USD' });

    expect(result.success).toBe(true);
    expect(result.data?.currency).toBe('USD');
  });
});
