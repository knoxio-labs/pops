/**
 * `mobile-wire-shape.test.ts` (in `api/__tests__/`) asserts the OpenAPI
 * PROJECTION carries no `enum` for `currency` — the thing the Swift generator
 * reads. This asserts the zod schema behind it, which is what the mobile
 * transactions routes actually declare as their `200` body
 * (`pillars/bfm/src/contract/rest.ts`): that a transaction in a currency
 * other than {@link FALLBACK_MOBILE_CURRENCY} is carried through unchanged rather than
 * failing validation, for both the list row and the fuller detail record.
 */
import { describe, expect, it } from 'vitest';

import {
  FALLBACK_MOBILE_CURRENCY,
  MobileReceiptUploadBodySchema,
  MobileTransactionDetailSchema,
  MobileTransactionSchema,
  MobileUpstreamErrorSchema,
} from '../rest-schemas.js';

const row = {
  id: 'txn-1',
  description: 'Coffee',
  amountMinorUnits: -450,
  currency: FALLBACK_MOBILE_CURRENCY,
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

describe('MobileTransactionSchema.shape.amountMinorUnits', () => {
  it('requires a whole number of minor units', () => {
    expect(MobileTransactionSchema.safeParse({ ...row, amountMinorUnits: 1999 }).success).toBe(
      true
    );
    expect(MobileTransactionSchema.safeParse({ ...row, amountMinorUnits: 1999.5 }).success).toBe(
      false
    );
  });
});

describe('MobileReceiptUploadBodySchema.parts', () => {
  const part = { mediaType: 'image/jpeg', dataBase64: 'AAAA' };

  it('rejects an empty parts array', () => {
    const result = MobileReceiptUploadBodySchema.safeParse({ parts: [] });
    expect(result.success).toBe(false);
  });

  it('accepts more than the old eight-part ceiling, matching purchases', () => {
    const result = MobileReceiptUploadBodySchema.safeParse({
      parts: Array.from({ length: 20 }, () => part),
    });
    expect(result.success).toBe(true);
  });
});

describe('MobileUpstreamErrorSchema.retryAfterSeconds', () => {
  const body = {
    code: 'gateway.upstream_rate_limited',
    message: 'Wait before retrying.',
    requestId: 'request-1',
    retryable: true,
    details: { upstream: { pillar: 'finance', status: 429 } },
  };

  it('accepts a positive whole-second producer delay', () => {
    expect(MobileUpstreamErrorSchema.safeParse({ ...body, retryAfterSeconds: 30 }).success).toBe(
      true
    );
  });

  it.each([0, 1.5, -1])('rejects invalid retry delay %s', (retryAfterSeconds) => {
    expect(MobileUpstreamErrorSchema.safeParse({ ...body, retryAfterSeconds }).success).toBe(false);
  });

  it('continues to accept open producer codes without a retry delay', () => {
    const result = MobileUpstreamErrorSchema.safeParse({
      ...body,
      code: 'purchases.request.body_too_large',
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.retryAfterSeconds).toBeUndefined();
  });
});
