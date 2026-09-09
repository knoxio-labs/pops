import type { ProductListResponses } from '../../purchases-api/types.gen';

/**
 * Fictional throughout, following the convention in `pillars/design/src/
 * fixtures/`. Chosen to make the page's own reasoning visible rather than to
 * be the smallest payload that typechecks — a fixture where everything
 * reconciles renders a page that looks right and demonstrates nothing.
 */

const ASSERTED_AT = '2026-08-16T01:00:00.000Z';

/**
 * Three products across the assertion split the page filters on: one whose
 * every wording a person confirmed, one holding a proposal the pass minted and
 * nobody has looked at, and one named by a person but still part-proposed —
 * the "part asserted" case the leaderboard rule turns on, and the one a
 * fixture of two clean products would leave unrendered.
 */
export const PRODUCT_DICTIONARY: ProductListResponses[200] = {
  products: [
    {
      id: 'prd_drill',
      label: 'Cordless hammer drill, 18V',
      labelConfirmedAt: ASSERTED_AT,
      createdAt: '2026-07-02T10:00:00.000Z',
      aliases: [
        {
          confirmedAt: ASSERTED_AT,
          createdAt: '2026-07-02T10:00:00.000Z',
          id: 'als_1',
          normalisedName: 'cordless hammer drill 18v',
          printedName: 'Cordless hammer drill, 18V',
          scopeKey: 'hardware-barn',
          source: 'hardware-barn',
        },
      ],
    },
    {
      id: 'prd_bits',
      label: 'Masonry bit set, 10 piece',
      labelConfirmedAt: null,
      createdAt: '2026-08-14T03:20:00.000Z',
      aliases: [
        {
          confirmedAt: null,
          createdAt: '2026-08-14T03:20:00.000Z',
          id: 'als_2',
          normalisedName: 'masonry bit set 10 piece',
          printedName: 'Masonry bit set, 10 piece',
          scopeKey: 'hardware-barn',
          source: 'hardware-barn',
        },
      ],
    },
    {
      id: 'prd_milk',
      label: 'Full cream milk, 2L',
      labelConfirmedAt: ASSERTED_AT,
      createdAt: '2026-05-11T08:00:00.000Z',
      aliases: [
        {
          confirmedAt: ASSERTED_AT,
          createdAt: '2026-05-11T08:00:00.000Z',
          id: 'als_3',
          normalisedName: 'full cream milk 2l',
          printedName: 'Full cream milk 2L',
          scopeKey: 'grocer-co',
          source: 'grocer-co',
        },
        {
          confirmedAt: null,
          createdAt: '2026-08-27T09:10:00.000Z',
          id: 'als_4',
          normalisedName: 'milk full cream 2 litre',
          printedName: 'MILK FULL CREAM 2 LITRE',
          scopeKey: 'grocer-co',
          source: 'receipt-upload',
        },
      ],
    },
  ],
};
