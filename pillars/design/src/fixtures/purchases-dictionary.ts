/**
 * Fictional product dictionary entries, shaped like the wire payload the
 * purchases pillar's `GET /products` returns (see
 * the pillar's product contract), typed here
 * rather than imported so the design surface never depends on a generated
 * client.
 *
 * `receipt` and `amazon` are the two sources used throughout: they are the
 * only adapters that state no product identifier of their own, which is the
 * whole reason this dictionary exists.
 */

/** One printed wording that resolves to a product. */
export interface DictionaryAlias {
  id: string;
  printedName: string;
  normalisedName: string;
  source: string;
  /** Groups a wording with the account or store it was printed under. */
  scopeKey: string;
  confirmedAt: string | null;
  createdAt: string;
}

/** A product a human recognises, with every printed wording that reaches it. */
export interface DictionaryProduct {
  id: string;
  label: string;
  labelConfirmedAt: string | null;
  createdAt: string;
  aliases: DictionaryAlias[];
}

/** What one run of the proposal pass changed. */
export interface ProposalOutcome {
  scannedLines: number;
  observedWordings: number;
  proposed: number;
  retired: number;
  confirmed: number;
}

/**
 * Fictional Australian retail entries covering what the page's filters and
 * corrections are for: a product asserted across two sources, one with
 * several aliases still half-proposed, an obviously-wrong split worth
 * merging, and two real products a merchant prints identically — the
 * dictionary's stated limitation, since a wording is all it groups on.
 */
export const dictionaryProducts: DictionaryProduct[] = [
  {
    id: 'prod_milk',
    label: 'Full Cream Milk 2L',
    labelConfirmedAt: '2026-08-12T09:03:00.000Z',
    createdAt: '2026-08-01T09:03:00.000Z',
    aliases: [
      {
        id: 'alias_milk_receipt',
        printedName: 'MILK FULL CR 2L',
        normalisedName: 'milk full cr 2l',
        source: 'receipt',
        scopeKey: 'receipt:milk full cr 2l',
        confirmedAt: '2026-08-12T09:03:00.000Z',
        createdAt: '2026-08-01T09:03:00.000Z',
      },
      {
        id: 'alias_milk_amazon',
        printedName: 'Full Cream Milk 2L',
        normalisedName: 'full cream milk 2l',
        source: 'amazon',
        scopeKey: 'amazon:full cream milk 2l',
        confirmedAt: '2026-08-14T11:20:00.000Z',
        createdAt: '2026-08-03T11:20:00.000Z',
      },
    ],
  },
  {
    id: 'prod_eggs',
    label: 'FR EGGS 12PK',
    labelConfirmedAt: null,
    createdAt: '2026-08-05T08:00:00.000Z',
    aliases: [
      {
        id: 'alias_eggs_receipt_1',
        printedName: 'FR EGGS 12PK',
        normalisedName: 'fr eggs 12pk',
        source: 'receipt',
        scopeKey: 'receipt:fr eggs 12pk',
        confirmedAt: '2026-08-16T10:00:00.000Z',
        createdAt: '2026-08-05T08:00:00.000Z',
      },
      {
        id: 'alias_eggs_receipt_2',
        printedName: 'FREE RANGE EGG 12',
        normalisedName: 'free range egg 12',
        source: 'receipt',
        scopeKey: 'receipt:free range egg 12',
        confirmedAt: null,
        createdAt: '2026-08-19T08:00:00.000Z',
      },
      {
        id: 'alias_eggs_amazon',
        printedName: 'Free Range Eggs Dozen',
        normalisedName: 'free range eggs dozen',
        source: 'amazon',
        scopeKey: 'amazon:free range eggs dozen',
        confirmedAt: null,
        createdAt: '2026-08-22T08:00:00.000Z',
      },
    ],
  },
  {
    id: 'prod_lamb_woolworths',
    label: 'Lamb backstrap',
    labelConfirmedAt: '2026-08-27T09:12:00.000Z',
    createdAt: '2026-08-24T06:15:00.000Z',
    aliases: [
      {
        id: 'alias_lamb_woolworths',
        printedName: 'LAMB BACKSTRAP KG',
        normalisedName: 'lamb backstrap kg',
        source: 'woolworths',
        scopeKey: 'woolworths:lamb backstrap kg',
        confirmedAt: '2026-08-27T09:12:00.000Z',
        createdAt: '2026-08-24T06:15:00.000Z',
      },
    ],
  },
  {
    id: 'prod_charcoal_receipt',
    label: 'COLGATE CHARC 110G',
    labelConfirmedAt: null,
    createdAt: '2026-08-09T07:40:00.000Z',
    aliases: [
      {
        id: 'alias_charcoal_receipt',
        printedName: 'COLGATE CHARC 110G',
        normalisedName: 'colgate charc 110g',
        source: 'receipt',
        scopeKey: 'receipt:colgate charc 110g',
        confirmedAt: null,
        createdAt: '2026-08-09T07:40:00.000Z',
      },
    ],
  },
  {
    id: 'prod_charcoal_amazon',
    label: 'Colgate Total Charcoal Toothpaste',
    labelConfirmedAt: null,
    createdAt: '2026-08-10T07:40:00.000Z',
    aliases: [
      {
        id: 'alias_charcoal_amazon',
        printedName: 'Colgate Total Charcoal Toothpaste 110g',
        normalisedName: 'colgate total charcoal toothpaste 110g',
        source: 'amazon',
        scopeKey: 'amazon:colgate total charcoal toothpaste 110g',
        confirmedAt: null,
        createdAt: '2026-08-10T07:40:00.000Z',
      },
    ],
  },
  {
    id: 'prod_sponge',
    label: 'Kitchen Sponge 4pk',
    labelConfirmedAt: '2026-08-18T12:00:00.000Z',
    createdAt: '2026-08-06T12:00:00.000Z',
    aliases: [
      {
        id: 'alias_sponge',
        printedName: 'SPONGE',
        normalisedName: 'sponge',
        source: 'receipt',
        scopeKey: 'receipt:sponge:store-a',
        confirmedAt: '2026-08-18T12:00:00.000Z',
        createdAt: '2026-08-06T12:00:00.000Z',
      },
    ],
  },
  {
    id: 'prod_scourer',
    label: 'SPONGE',
    labelConfirmedAt: null,
    createdAt: '2026-08-07T12:00:00.000Z',
    aliases: [
      {
        id: 'alias_scourer',
        printedName: 'SPONGE',
        normalisedName: 'sponge',
        source: 'receipt',
        scopeKey: 'receipt:sponge:store-b',
        confirmedAt: null,
        createdAt: '2026-08-07T12:00:00.000Z',
      },
    ],
  },
];
