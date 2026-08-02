/**
 * The wire schema is the boundary that stops a float ever reaching the
 * subset-sum matcher. These tests pin the rejections that matter, at the
 * schema level rather than through HTTP, so a change to them is visible
 * even if no route happens to exercise the field.
 */
import { describe, expect, it } from 'vitest';

import {
  INGEST_METHODS,
  ITEM_KINDS,
  isResidualBearing,
  LINK_TYPES,
  PURCHASE_STATUSES,
  RESIDUAL_BEARING_ROLES,
  SETTLEMENT_ROLES,
  SHIPMENT_STATUSES,
} from '../constants.js';
import { PurchasesErrorSchema } from '../errors.js';
import { purchasesManifest } from '../manifest.js';
import {
  CentsSchema,
  CurrencySchema,
  NonNegativeCentsSchema,
  PurchaseAccountingSchema,
} from '../schemas/purchase.js';

describe('CentsSchema', () => {
  it('accepts integers on both signs and zero', () => {
    for (const value of [0, 1, -1, 5678, -1179]) {
      expect(CentsSchema.parse(value)).toBe(value);
    }
  });

  it.each([56.78, 0.1, -0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects %p rather than rounding it',
    (value) => {
      expect(CentsSchema.safeParse(value).success).toBe(false);
    }
  );

  it('rejects a numeric string, so "5678" cannot masquerade as money', () => {
    expect(CentsSchema.safeParse('5678').success).toBe(false);
  });
});

describe('NonNegativeCentsSchema', () => {
  it('rejects a negative component amount', () => {
    expect(NonNegativeCentsSchema.safeParse(-1).success).toBe(false);
    expect(NonNegativeCentsSchema.parse(0)).toBe(0);
  });
});

describe('CurrencySchema', () => {
  it('accepts an uppercase ISO 4217 code', () => {
    expect(CurrencySchema.parse('AUD')).toBe('AUD');
  });

  it.each(['aud', 'Aud', 'AUDD', 'AU', '', '$', 'A1D'])('rejects %p', (value) => {
    expect(CurrencySchema.safeParse(value).success).toBe(false);
  });
});

describe('PurchaseAccountingSchema', () => {
  it('permits a negative residual, because over-charging must stay visible', () => {
    expect(
      PurchaseAccountingSchema.safeParse({
        totalCents: 5678,
        matchedCents: 5778,
        awaitingImportCents: 0,
        residualCents: -100,
      }).success
    ).toBe(true);
  });
});

describe('settlement roles', () => {
  it('excludes authorizations from the residual and includes everything else', () => {
    expect(isResidualBearing('authorization')).toBe(false);
    for (const role of ['capture', 'refund', 'adjustment'] as const) {
      expect(isResidualBearing(role)).toBe(true);
    }
  });

  it('keeps RESIDUAL_BEARING_ROLES a strict subset of SETTLEMENT_ROLES', () => {
    for (const role of RESIDUAL_BEARING_ROLES) {
      expect(SETTLEMENT_ROLES).toContain(role);
    }
    expect(RESIDUAL_BEARING_ROLES.length).toBeLessThan(SETTLEMENT_ROLES.length);
  });
});

describe('closed vocabularies', () => {
  it.each([
    ['INGEST_METHODS', INGEST_METHODS],
    ['PURCHASE_STATUSES', PURCHASE_STATUSES],
    ['SHIPMENT_STATUSES', SHIPMENT_STATUSES],
    ['ITEM_KINDS', ITEM_KINDS],
    ['LINK_TYPES', LINK_TYPES],
    ['SETTLEMENT_ROLES', SETTLEMENT_ROLES],
  ])('%s has no duplicates', (_label, values) => {
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('PurchasesErrorSchema', () => {
  it('accepts the shared contract statuses', () => {
    expect(PurchasesErrorSchema.safeParse({ kind: 'not-found' }).success).toBe(true);
  });

  it('accepts each domain error with its payload', () => {
    expect(
      PurchasesErrorSchema.safeParse({ kind: 'unknown-purchase', purchaseId: 'p1' }).success
    ).toBe(true);
    expect(PurchasesErrorSchema.safeParse({ kind: 'unknown-source', sourceId: 's1' }).success).toBe(
      true
    );
    expect(
      PurchasesErrorSchema.safeParse({ kind: 'duplicate-purchase', checksum: 'c1' }).success
    ).toBe(true);
  });

  it('rejects a domain error missing its payload', () => {
    expect(PurchasesErrorSchema.safeParse({ kind: 'unknown-purchase' }).success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(PurchasesErrorSchema.safeParse({ kind: 'vibes' }).success).toBe(false);
  });
});

describe('purchasesManifest', () => {
  it('identifies the pillar for the module registry', () => {
    expect(purchasesManifest.id).toBe('purchases');
    expect(purchasesManifest.surfaces).toEqual(['app']);
  });
});
