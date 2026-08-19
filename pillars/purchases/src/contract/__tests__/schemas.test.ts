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
  MERCHANT_RESOLUTIONS,
  PRODUCT_IDENTITY_BASES,
  PURCHASE_STATUSES,
  RESIDUAL_BEARING_ROLES,
  SETTLEMENT_ROLES,
  SHIPMENT_STATUSES,
} from '../constants.js';
import { PurchasesErrorSchema } from '../errors.js';
import { purchasesManifest } from '../manifest.js';
import { MerchantIdentitySchema, ProductIdentitySchema } from '../rest-analytics.js';
import {
  CentsSchema,
  CurrencySchema,
  IsoTimestampSchema,
  NonNegativeCentsSchema,
  PopsUriSchema,
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
        refundedCents: 0,
        netSpendCents: 5678,
      }).success
    ).toBe(true);
  });

  it('rejects a negative refund total, which would be a sign error not a fact', () => {
    // Refunds are reported as a magnitude. A negative here means something
    // upstream flipped a sign, and passing it through would corrupt any
    // consumer summing spend.
    expect(
      PurchaseAccountingSchema.safeParse({
        totalCents: 5678,
        matchedCents: 5678,
        awaitingImportCents: 0,
        residualCents: 0,
        refundedCents: -1179,
        netSpendCents: 4499,
      }).success
    ).toBe(false);
  });

  it('permits a negative net spend, which a genuine over-refund produces', () => {
    // More came back than the order ever cost. A refund in full now reads
    // 0, so the only way to reach a negative is the case worth surfacing.
    expect(
      PurchaseAccountingSchema.safeParse({
        totalCents: 5678,
        matchedCents: 5678,
        awaitingImportCents: 0,
        residualCents: 0,
        refundedCents: 6000,
        netSpendCents: -322,
      }).success
    ).toBe(true);
  });
});

describe('IsoTimestampSchema', () => {
  it('accepts a UTC timestamp with or without fractional seconds', () => {
    for (const value of ['2026-02-02T01:41:21Z', '2026-02-02T01:41:21.965Z']) {
      expect(IsoTimestampSchema.safeParse(value).success, value).toBe(true);
    }
  });

  it('accepts an explicit offset', () => {
    expect(IsoTimestampSchema.safeParse('2026-02-02T11:41:21+10:00').success).toBe(true);
  });

  it('rejects a timestamp with no timezone, which is ambiguous by up to a day', () => {
    // The matching window is 14–21 days, so a day of ambiguity is a
    // meaningful fraction of it.
    expect(IsoTimestampSchema.safeParse('2026-02-02T01:41:21').success).toBe(false);
  });

  it.each(['2026-02-02', 'next tuesday', '02/02/2026', '', '2026-2-2T01:41:21Z'])(
    'rejects %p, which the date-window matcher would silently never match',
    (value) => {
      expect(IsoTimestampSchema.safeParse(value).success).toBe(false);
    }
  );
});

describe('PopsUriSchema', () => {
  it.each([
    'pops://finance/transaction/abc-123',
    'pops://inventory/item/1',
    'pops://documents/document/inv-1',
  ])('accepts %p', (value) => {
    expect(PopsUriSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    'finance/transaction/1',
    'pops://finance/transaction/',
    'pops://finance/1',
    'https://finance/transaction/1',
    'pops://Finance/transaction/1',
    'pops://finance/transaction/with space',
  ])('rejects %p, which the nightly resolver would silently never resolve', (value) => {
    expect(PopsUriSchema.safeParse(value).success).toBe(false);
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
    ['MERCHANT_RESOLUTIONS', MERCHANT_RESOLUTIONS],
    ['PRODUCT_IDENTITY_BASES', PRODUCT_IDENTITY_BASES],
  ])('%s has no duplicates', (_label, values) => {
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('MerchantIdentitySchema', () => {
  it('offers exactly the resolutions the vocabulary names', () => {
    // The union's literals are the only place the vocabulary is restated.
    // A fourth resolution added to the constant without a variant here would
    // otherwise be a value the service can produce and the contract rejects,
    // discovered as a 500 rather than as a failing test.
    const covered = MerchantIdentitySchema.options.map((option) => option.shape.resolution.value);

    expect(covered.toSorted()).toEqual([...MERCHANT_RESOLUTIONS].toSorted());
  });

  it('accepts each variant in the shape the fold produces', () => {
    const variants = [
      { resolution: 'entity', entityId: 'ent-1', name: 'Bunnings Warehouse' },
      // An order can carry the operative id and no label at all.
      { resolution: 'entity', entityId: 'ent-1', name: null },
      { resolution: 'name', entityId: null, name: 'Amazon' },
      { resolution: 'unattributed', entityId: null, name: null },
    ];

    for (const variant of variants) {
      expect(MerchantIdentitySchema.safeParse(variant).success, JSON.stringify(variant)).toBe(true);
    }
  });

  it.each([
    // The whole point of the discriminator: an `entity` group whose id is
    // absent is claiming a resolved identity it does not have.
    ['entity without its id', { resolution: 'entity', entityId: null, name: 'Amazon' }],
    // A `name` group is keyed on the label, so a null one has no key.
    ['name without its label', { resolution: 'name', entityId: null, name: null }],
    // And a name group carrying an id would have been an entity group.
    ['name carrying an entity id', { resolution: 'name', entityId: 'ent-1', name: 'Amazon' }],
    [
      'unattributed carrying a label',
      { resolution: 'unattributed', entityId: null, name: 'Amazon' },
    ],
    ['unattributed carrying an id', { resolution: 'unattributed', entityId: 'ent-1', name: null }],
    ['an unknown resolution', { resolution: 'vibes', entityId: null, name: null }],
  ])('rejects %s', (_label, value) => {
    expect(MerchantIdentitySchema.safeParse(value).success).toBe(false);
  });
});

describe('ProductIdentitySchema', () => {
  it('offers exactly the bases the vocabulary names', () => {
    const covered = ProductIdentitySchema.options.map((option) => option.shape.basis.value);

    expect(covered.toSorted()).toEqual([...PRODUCT_IDENTITY_BASES].toSorted());
  });

  it('accepts each variant in the shape the fold produces', () => {
    const variants = [
      { basis: 'sku', source: 'amazon', sku: 'B0FCSJTKJ8', name: 'Magnetic Dosing Funnel' },
      {
        basis: 'name',
        source: 'woolworths',
        sku: null,
        name: 'WW Full Cream Milk 2L',
        normalisedName: 'ww full cream milk 2l',
      },
      { basis: 'unidentified', source: 'woolworths', sku: null, name: '***', itemId: 'item-1' },
    ];

    for (const variant of variants) {
      expect(ProductIdentitySchema.safeParse(variant).success, JSON.stringify(variant)).toBe(true);
    }
  });

  it.each([
    // A sku group without the identifier it claims to be keyed on is the
    // whole failure the basis exists to prevent: a name match presented as
    // a merchant-stated identity.
    ['a sku group without its sku', { basis: 'sku', source: 'amazon', sku: null, name: 'Funnel' }],
    [
      'a name group carrying a sku',
      {
        basis: 'name',
        source: 'woolworths',
        sku: 'B0FCSJTKJ8',
        name: 'Milk',
        normalisedName: 'milk',
      },
    ],
    [
      'a name group without the key it was formed on',
      { basis: 'name', source: 'woolworths', sku: null, name: 'Milk' },
    ],
    [
      'an unidentified group without its line',
      { basis: 'unidentified', source: 'woolworths', sku: null, name: '***' },
    ],
    ['an unknown basis', { basis: 'vibes', source: 'amazon', sku: null, name: 'Funnel' }],
  ])('rejects %s', (_label, value) => {
    expect(ProductIdentitySchema.safeParse(value).success).toBe(false);
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
