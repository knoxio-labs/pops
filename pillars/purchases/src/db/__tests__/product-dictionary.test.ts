/**
 * The learned product dictionary.
 *
 * The failure this table exists to prevent does not throw and is not visible
 * downstream: two genuinely different products sharing one identity, with one
 * summed cost and one wording as the label. So the assertions that matter
 * most are the ones that check things stay *apart* — across merchants, across
 * sources that name many shops, and against a sku a merchant asserted — and
 * the ones that check a human's correction is honoured in both directions.
 *
 * The second family is the proposal pass overreaching. `confirmedAt` is the
 * only thing separating "a pass owns this row" from "a human does", so every
 * verb the pass has is tested against a confirmed entry as well as an
 * unconfirmed one.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPurchase,
  deleteAlias,
  deleteProduct,
  deletePurchase,
  identifyProduct,
  listProducts,
  loadProductDictionary,
  proposeProducts,
  purchaseProductAliases,
  purchaseProducts,
  rankProductPurchases,
  renameProduct,
  updateAlias,
  upsertSource,
} from '../index.js';
import { openTempDb, seedAmazonSource } from './helpers.js';

import type {
  CreateItemInput,
  CreatePurchaseInput,
  OpenedPurchasesDb,
  ProductWithAliases,
} from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  upsertSource(opened.db, {
    id: 'woolworths',
    label: 'Woolworths',
    settlementWindowDays: 14,
    autoLinkPolicy: 'auto',
  });
  upsertSource(opened.db, {
    id: 'receipt',
    label: 'Uploaded receipt',
    settlementWindowDays: 14,
    autoLinkPolicy: 'review',
  });
});

afterEach(() => {
  cleanup();
});

function line(overrides: Partial<CreateItemInput> & { name: string }): CreateItemInput {
  return { unitPriceCents: 1179, lineTotalCents: 1179, ...overrides };
}

function order(
  overrides: Partial<CreatePurchaseInput> & { checksum: string }
): CreatePurchaseInput {
  return {
    source: 'woolworths',
    ingestMethod: 'upload',
    orderedAt: '2026-02-02T01:41:21Z',
    currency: 'AUD',
    totalCents: 5678,
    sourceOrderId: overrides.checksum,
    merchantEntityName: 'Woolworths',
    ...overrides,
  };
}

/** An order under the source every photographed receipt shares, whatever shop printed it. */
function photographed(
  overrides: Partial<CreatePurchaseInput> & { checksum: string; merchantEntityName: string }
): CreatePurchaseInput {
  return order({ source: 'receipt', ...overrides });
}

function aliasFor(printedName: string): ProductWithAliases['aliases'][number] {
  const found = listProducts(opened.db)
    .flatMap((entry) => entry.aliases)
    .find((alias) => alias.printedName === printedName);
  if (found === undefined) throw new Error(`no dictionary entry printed '${printedName}'`);
  return found;
}

function productIdFor(printedName: string): string {
  return aliasFor(printedName).productId;
}

/** How a line whose product identity is being asserted resolves right now. */
function resolve(name: string, source = 'woolworths', merchantEntityName = 'Woolworths') {
  return identifyProduct(
    { id: 'probe', source, sku: null, name, merchantEntityId: null, merchantEntityName },
    loadProductDictionary(opened.db)
  );
}

describe('what the proposal pass learns', () => {
  it('mints one entry per printed wording and nothing for a line that states a sku', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'shop',
        items: [
          line({ name: 'CHK BRST 1KG' }),
          line({ name: 'chk  brst   1kg' }),
          line({ name: 'MILK 2L', sku: '6015322' }),
        ],
      })
    );

    const outcome = proposeProducts(opened.db);

    expect(outcome).toMatchObject({ scannedLines: 3, observedWordings: 1, proposed: 1 });
    expect(listProducts(opened.db)).toHaveLength(1);
    // The sku line is not merely unproposed — an entry for it could never be
    // reached, because the dictionary is not consulted when a sku is stated.
    expect(aliasFor('CHK BRST 1KG').normalisedName).toBe('chk brst 1kg');
  });

  it('is idempotent: a second run over unchanged lines changes nothing', () => {
    createPurchase(opened.db, order({ checksum: 'shop', items: [line({ name: 'CHK BRST 1KG' })] }));
    proposeProducts(opened.db);
    const before = listProducts(opened.db);

    const second = proposeProducts(opened.db);

    expect(second).toMatchObject({ proposed: 0, retired: 0 });
    expect(listProducts(opened.db)).toEqual(before);
  });

  it('labels a fresh entry with the newest printing, not with whichever row was read first', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'old',
        orderedAt: '2026-01-01T00:00:00Z',
        items: [line({ name: 'CHK BRST 1KG' })],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'new',
        orderedAt: '2026-06-01T00:00:00Z',
        items: [line({ name: 'Chk Brst 1kg' })],
      })
    );

    proposeProducts(opened.db);

    expect(listProducts(opened.db)[0]?.product.label).toBe('Chk Brst 1kg');
  });

  it('skips a line whose name normalises to nothing, rather than bucketing them together', () => {
    createPurchase(
      opened.db,
      order({ checksum: 'shop', items: [line({ name: '***' }), line({ name: '---' })] })
    );

    expect(proposeProducts(opened.db)).toMatchObject({ observedWordings: 0, proposed: 0 });
    expect(listProducts(opened.db)).toEqual([]);
  });
});

describe('what the dictionary refuses to merge on its own', () => {
  it('keeps two shops printing one abbreviation apart under a source that names many', () => {
    createPurchase(
      opened.db,
      photographed({
        checksum: 'kettle',
        merchantEntityName: 'Kettle Black',
        items: [line({ name: 'LATTE' })],
      })
    );
    createPurchase(
      opened.db,
      photographed({
        checksum: 'patricia',
        merchantEntityName: 'Patricia',
        items: [line({ name: 'LATTE' })],
      })
    );

    expect(proposeProducts(opened.db)).toMatchObject({ observedWordings: 2, proposed: 2 });
    expect(listProducts(opened.db)).toHaveLength(2);
  });

  it('does not propose that an abbreviation and its expansion are one product', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'shop',
        items: [line({ name: 'CHK BRST 1KG' }), line({ name: 'Chicken Breast 1kg' })],
      })
    );

    proposeProducts(opened.db);

    // The whole point: string similarity is not evidence. `MILK 1L` and
    // `MILK 2L` are similar too, and merging those is invisible afterwards.
    expect(listProducts(opened.db)).toHaveLength(2);
    expect(resolve('CHK BRST 1KG').key).not.toBe(resolve('Chicken Breast 1kg').key);
  });

  it('never claims a line that states a sku, even when a wording matches exactly', () => {
    createPurchase(
      opened.db,
      order({ checksum: 'named', items: [line({ name: 'Full Cream Milk 2L' })] })
    );
    proposeProducts(opened.db);

    const withSku = identifyProduct(
      {
        id: 'probe',
        source: 'woolworths',
        sku: '6015322',
        name: 'Full Cream Milk 2L',
        merchantEntityId: null,
        merchantEntityName: 'Woolworths',
      },
      loadProductDictionary(opened.db)
    );

    expect(withSku.identity.basis).toBe('sku');
  });
});

describe('what a human asserts, and how it is undone', () => {
  beforeEach(() => {
    createPurchase(
      opened.db,
      order({
        checksum: 'shop',
        items: [line({ name: 'CHK BRST 1KG' }), line({ name: 'Chicken Breast 1kg' })],
      })
    );
    proposeProducts(opened.db);
  });

  it('groups two wordings once one is pointed at the other product', () => {
    const target = productIdFor('Chicken Breast 1kg');

    updateAlias(opened.db, aliasFor('CHK BRST 1KG').id, { productId: target, confirmed: true });

    expect(resolve('CHK BRST 1KG').key).toBe(resolve('Chicken Breast 1kg').key);
    expect(resolve('CHK BRST 1KG').identity).toMatchObject({
      basis: 'product',
      productId: target,
      confirmed: true,
    });
  });

  it('applies the learned mapping to a line ingested afterwards', () => {
    updateAlias(opened.db, aliasFor('CHK BRST 1KG').id, {
      productId: productIdFor('Chicken Breast 1kg'),
      confirmed: true,
    });
    renameProduct(opened.db, productIdFor('Chicken Breast 1kg'), 'Chicken breast, 1kg');

    createPurchase(
      opened.db,
      order({
        checksum: 'later',
        orderedAt: '2026-07-07T00:00:00Z',
        items: [line({ name: 'chk brst 1kg' })],
      })
    );

    // No second pass, no second question: the wording already resolves.
    const leaderboard = rankProductPurchases(opened.db);
    const merged = leaderboard.products.find(
      (entry) => entry.product.basis === 'product' && entry.product.label === 'Chicken breast, 1kg'
    );
    expect(merged?.lineCount).toBe(3);
    // Coverage is counted per line from its own entry, so a group formed
    // from one asserted wording and one proposed one is reported as exactly
    // that rather than being rounded up to the stronger claim.
    expect(leaderboard.coverage).toMatchObject({
      confirmedProductLines: 2,
      proposedProductLines: 1,
    });
  });

  it('splits a wrong merge back out, minting the wording its own product again', () => {
    const target = productIdFor('Chicken Breast 1kg');
    const aliasId = aliasFor('CHK BRST 1KG').id;
    updateAlias(opened.db, aliasId, { productId: target, confirmed: true });

    updateAlias(opened.db, aliasId, { productId: null });

    expect(resolve('CHK BRST 1KG').key).not.toBe(resolve('Chicken Breast 1kg').key);
    expect(listProducts(opened.db)).toHaveLength(2);
  });

  it('returns a retracted entry to a proposal the pass may retire', () => {
    const aliasId = aliasFor('CHK BRST 1KG').id;
    updateAlias(opened.db, aliasId, { confirmed: true });

    expect(updateAlias(opened.db, aliasId, { confirmed: false }).confirmedAt).toBeNull();
  });

  it('keeps the original instant when an assertion is re-stated', () => {
    const aliasId = aliasFor('CHK BRST 1KG').id;
    const first = updateAlias(opened.db, aliasId, { confirmed: true }).confirmedAt;

    expect(updateAlias(opened.db, aliasId, { confirmed: true }).confirmedAt).toBe(first);
  });

  it('forgets one wording on request, returning its lines to the on-the-fly grouping', () => {
    expect(deleteAlias(opened.db, aliasFor('CHK BRST 1KG').id)).toBe(true);

    expect(resolve('CHK BRST 1KG').identity.basis).toBe('name');
  });

  it('forgets a product and every wording that resolved to it', () => {
    const target = productIdFor('Chicken Breast 1kg');
    updateAlias(opened.db, aliasFor('CHK BRST 1KG').id, { productId: target, confirmed: true });

    expect(deleteProduct(opened.db, target)).toBe(true);

    expect(opened.db.select().from(purchaseProductAliases).all()).toEqual([]);
    expect(resolve('CHK BRST 1KG').identity.basis).toBe('name');
  });

  it('removes a product the last wording was pointed away from', () => {
    const emptied = productIdFor('CHK BRST 1KG');

    updateAlias(opened.db, aliasFor('CHK BRST 1KG').id, {
      productId: productIdFor('Chicken Breast 1kg'),
    });

    // A product nothing resolves to is a label no read path can reach, and
    // one a caller could still confirm and rename.
    expect(
      opened.db
        .select()
        .from(purchaseProducts)
        .all()
        .map((row) => row.id)
    ).not.toContain(emptied);
  });

  it('renames a product without disturbing the wordings that resolve to it', () => {
    const target = productIdFor('CHK BRST 1KG');
    const before = aliasFor('CHK BRST 1KG');

    renameProduct(opened.db, target, 'Chicken breast, 1kg');

    expect(resolve('CHK BRST 1KG').identity).toMatchObject({
      label: 'Chicken breast, 1kg',
      name: 'CHK BRST 1KG',
    });
    expect(aliasFor('CHK BRST 1KG')).toEqual(before);
  });
});

describe('what the proposal pass may not touch', () => {
  /**
   * Both wordings stop being printed at once, so the only thing separating
   * their fates is the confirmation marker.
   */
  function shopThenDeleteIt(): void {
    const purchaseId = createPurchase(
      opened.db,
      order({
        checksum: 'shop',
        items: [line({ name: 'CHK BRST 1KG' }), line({ name: 'MILK 2L' })],
      })
    );
    proposeProducts(opened.db);
    updateAlias(opened.db, aliasFor('CHK BRST 1KG').id, { confirmed: true });
    deletePurchase(opened.db, purchaseId);
  }

  it('retires an unconfirmed entry once no line prints its wording', () => {
    shopThenDeleteIt();

    expect(proposeProducts(opened.db).retired).toBe(1);
    expect(listProducts(opened.db).map((entry) => entry.product.label)).toEqual(['CHK BRST 1KG']);
  });

  it('leaves an asserted entry standing when its wording stops being printed', () => {
    shopThenDeleteIt();
    proposeProducts(opened.db);

    // A human's assertion outlives the line that prompted it: that line may
    // only have been deleted and re-ingested, and re-asking is the cost.
    expect(aliasFor('CHK BRST 1KG').confirmedAt).not.toBeNull();
    expect(resolve('CHK BRST 1KG').identity).toMatchObject({ confirmed: true });
  });

  it('does not repoint or relabel an asserted entry', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'shop',
        items: [line({ name: 'CHK BRST 1KG' }), line({ name: 'Chicken Breast 1kg' })],
      })
    );
    proposeProducts(opened.db);
    const target = productIdFor('Chicken Breast 1kg');
    updateAlias(opened.db, aliasFor('CHK BRST 1KG').id, { productId: target, confirmed: true });
    renameProduct(opened.db, target, 'Chicken breast, 1kg');

    proposeProducts(opened.db);

    expect(aliasFor('CHK BRST 1KG').productId).toBe(target);
    expect(listProducts(opened.db).map((entry) => entry.product.label)).toEqual([
      'Chicken breast, 1kg',
    ]);
  });
});

describe('listing the dictionary', () => {
  beforeEach(() => {
    createPurchase(opened.db, order({ checksum: 'ww', items: [line({ name: 'CHK BRST 1KG' })] }));
    createPurchase(
      opened.db,
      photographed({
        checksum: 'cafe',
        merchantEntityName: 'Kettle Black',
        items: [line({ name: 'LATTE' })],
      })
    );
    proposeProducts(opened.db);
  });

  it('filters to the products holding a wording under one source', () => {
    expect(
      listProducts(opened.db, { source: 'receipt' }).map((entry) => entry.product.label)
    ).toEqual(['LATTE']);
  });

  it('separates what a human has touched from what only a pass has', () => {
    updateAlias(opened.db, aliasFor('LATTE').id, { confirmed: true });

    expect(
      listProducts(opened.db, { confirmed: true }).map((entry) => entry.product.label)
    ).toEqual(['LATTE']);
    expect(
      listProducts(opened.db, { confirmed: false }).map((entry) => entry.product.label)
    ).toEqual(['CHK BRST 1KG']);
  });
});
