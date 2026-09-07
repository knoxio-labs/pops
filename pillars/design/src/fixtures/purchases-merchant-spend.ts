import type { PurchaseAccounting } from '@/fixtures/purchases-vocabulary';

/**
 * Fictional merchant roll-ups for the purchases merchant lens screen. Shaped
 * like the `/analytics/merchant-spend` and `/purchases` responses, not
 * imported from them — a design fixture owes nothing to the wire format.
 *
 * Two currencies are in play (AUD, USD) so the currency grouping is visible,
 * and one merchant in each is unattributed so the residual is never zero
 * everywhere at once. Every `SpendAccounting` here is built by `accounting()`
 * below, which derives `residualCents` and `netSpendCents` rather than
 * letting them be typed by hand, so the explained/unexplained split a
 * reviewer checks on this screen always adds up.
 */
export type MerchantResolution = 'entity' | 'name' | 'unattributed';

export type MerchantIdentity =
  | { resolution: 'entity'; entityId: string; name: string | null }
  | { resolution: 'name'; entityId: null; name: string }
  | { resolution: 'unattributed'; entityId: null; name: null };

/** The roll-up-grain name for the pillar's one accounting split. */
export type SpendAccounting = PurchaseAccounting;

export interface MerchantSpend {
  merchant: MerchantIdentity;
  currency: string;
  orderCount: number;
  accounting: SpendAccounting;
}

export interface CurrencySpend {
  currency: string;
  orderCount: number;
  accounting: SpendAccounting;
}

/** One currency's merchants under that currency's own total, or no total at all. */
export interface CurrencyGroup {
  currency: string;
  total: CurrencySpend | null;
  merchants: MerchantSpend[];
}

/** The window a roll-up's figures were computed over. `null`/`null` means all time. */
export interface SpendPeriod {
  from: string | null;
  to: string | null;
}

function accounting(input: {
  totalCents: number;
  matchedCents: number;
  awaitingImportCents?: number;
  refundedCents?: number;
}): SpendAccounting {
  const awaitingImportCents = input.awaitingImportCents ?? 0;
  const refundedCents = input.refundedCents ?? 0;
  return {
    totalCents: input.totalCents,
    matchedCents: input.matchedCents,
    awaitingImportCents,
    refundedCents,
    residualCents: input.totalCents - input.matchedCents - awaitingImportCents,
    netSpendCents: input.totalCents - refundedCents,
  };
}

/** A currency total is the component-wise sum of its merchants, never a hand-typed figure. */
function sumAccounting(list: SpendAccounting[]): SpendAccounting {
  return list.reduce(
    (sum, a) => ({
      totalCents: sum.totalCents + a.totalCents,
      matchedCents: sum.matchedCents + a.matchedCents,
      awaitingImportCents: sum.awaitingImportCents + a.awaitingImportCents,
      refundedCents: sum.refundedCents + a.refundedCents,
      residualCents: sum.residualCents + a.residualCents,
      netSpendCents: sum.netSpendCents + a.netSpendCents,
    }),
    {
      totalCents: 0,
      matchedCents: 0,
      awaitingImportCents: 0,
      refundedCents: 0,
      residualCents: 0,
      netSpendCents: 0,
    }
  );
}

const entity = (entityId: string, name: string | null): MerchantIdentity => ({
  resolution: 'entity',
  entityId,
  name,
});
const named = (name: string): MerchantIdentity => ({ resolution: 'name', entityId: null, name });
const unattributed: MerchantIdentity = { resolution: 'unattributed', entityId: null, name: null };

/** A resolved entity whose every dollar is explained. */
export const woolworths: MerchantSpend = {
  merchant: entity('woolworths', 'Woolworths Metro George St'),
  currency: 'AUD',
  orderCount: 6,
  accounting: accounting({ totalCents: 45_230, matchedCents: 45_230 }),
};

/** The row carrying every figure at once — matched, awaiting, refunded and a residual. */
export const bunnings: MerchantSpend = {
  merchant: entity('bunnings', 'Bunnings Warehouse Alexandria'),
  currency: 'AUD',
  orderCount: 3,
  accounting: accounting({
    totalCents: 128_500,
    matchedCents: 98_000,
    awaitingImportCents: 15_000,
    refundedCents: 5_000,
  }),
};

/** A bare label the roll-up could not resolve to an entity. */
export const wooliesBroadway: MerchantSpend = {
  merchant: named('Woolies Metro Broadway'),
  currency: 'AUD',
  orderCount: 2,
  accounting: accounting({ totalCents: 8_900, matchedCents: 8_900 }),
};

/**
 * A residual of one cent against a five-figure total. The share must read
 * 99%, never the 100% it rounds to: the whole point of the bucket is that a
 * reader can tell "nothing is unexplained" from "almost nothing is".
 */
export const sliverResidual: MerchantSpend = {
  merchant: entity('coles', 'Coles Broadway'),
  currency: 'AUD',
  orderCount: 2,
  accounting: accounting({ totalCents: 52_000, matchedCents: 51_999 }),
};

/**
 * More linked than was ever spent. This is not a part of a whole, so no
 * share is offered at all and the meter is withheld rather than clamped.
 */
export const overLinked: MerchantSpend = {
  merchant: named('IGA Surry Hills'),
  currency: 'AUD',
  orderCount: 1,
  accounting: accounting({ totalCents: 12_000, matchedCents: 13_500 }),
};

/** Spend the roll-up attributed to no merchant at all. */
export const audUnattributed: MerchantSpend = {
  merchant: unattributed,
  currency: 'AUD',
  orderCount: 1,
  accounting: accounting({ totalCents: 3_200, matchedCents: 0 }),
};

/**
 * An entity the roll-up resolved but that carries no name of its own — the
 * case merchantLabel falls back to the entity id for, distinctly from the
 * unattributed group below which has no entity at all.
 */
export const unnamedEntityMerchant: MerchantSpend = {
  merchant: entity('e-unnamed-042', null),
  currency: 'EUR',
  orderCount: 1,
  accounting: accounting({ totalCents: 4_500, matchedCents: 4_500 }),
};

/**
 * An entity and a name-grouped merchant that happen to render the same
 * label text. `merchantKey` (below) prefixes each key with its resolution,
 * so these two never collapse into one row even though their labels are
 * indistinguishable on screen — the invariant the original
 * `merchantOrdersQuery` enforced by sending `merchantEntityId` for one and
 * `merchantEntityName` for the other, never the same parameter for both.
 */
export const generalStoreEntity: MerchantSpend = {
  merchant: entity('general-store-e7', 'General Store'),
  currency: 'EUR',
  orderCount: 1,
  accounting: accounting({ totalCents: 6_000, matchedCents: 6_000 }),
};

/** The name-grouped counterpart to {@link generalStoreEntity} — same label, different key. */
export const generalStoreName: MerchantSpend = {
  merchant: named('General Store'),
  currency: 'EUR',
  orderCount: 1,
  accounting: accounting({ totalCents: 2_200, matchedCents: 2_200 }),
};

/** The second currency, so nothing can be blended into one number. */
export const amazonUs: MerchantSpend = {
  merchant: entity('amazon-us', 'Amazon.com'),
  currency: 'USD',
  orderCount: 4,
  accounting: accounting({ totalCents: 21_999, matchedCents: 15_000, awaitingImportCents: 4_000 }),
};

/** The unattributed bucket of the second currency — the key collision to avoid. */
export const usdUnattributed: MerchantSpend = {
  merchant: unattributed,
  currency: 'USD',
  orderCount: 1,
  accounting: accounting({ totalCents: 1_500, matchedCents: 0 }),
};

/**
 * Identifies a merchant grouping within one currency section — used as the
 * React list key and, combined with currency, as the fixture order lookup
 * below. Two unattributed identities in different currencies must not
 * collide, which is why the order lookup keys on the currency as well.
 */
export function merchantKey(identity: MerchantIdentity): string {
  return `${identity.resolution}:${identity.entityId ?? identity.name ?? ''}`;
}

const audMerchants = [
  woolworths,
  bunnings,
  sliverResidual,
  overLinked,
  wooliesBroadway,
  audUnattributed,
];
const usdMerchants = [amazonUs, usdUnattributed];

const audTotal: CurrencySpend = {
  currency: 'AUD',
  orderCount: audMerchants.reduce((sum, m) => sum + m.orderCount, 0),
  accounting: sumAccounting(audMerchants.map((m) => m.accounting)),
};

const usdTotal: CurrencySpend = {
  currency: 'USD',
  orderCount: usdMerchants.reduce((sum, m) => sum + m.orderCount, 0),
  accounting: sumAccounting(usdMerchants.map((m) => m.accounting)),
};

/** The default, all-time, multi-currency roll-up. */
export const merchantSpendGroups: CurrencyGroup[] = [
  { currency: 'AUD', total: audTotal, merchants: audMerchants },
  { currency: 'USD', total: usdTotal, merchants: usdMerchants },
];

/** Only AUD is in play — the single-currency state. */
export const merchantSpendGroupsSingleCurrency: CurrencyGroup[] = [
  { currency: 'AUD', total: audTotal, merchants: audMerchants },
];

/** No spend reached the roll-up in the selected window. */
export const merchantSpendGroupsEmpty: CurrencyGroup[] = [];

/**
 * A currency the roll-up reported merchants for but no total — the
 * `CurrencyGroupSection` branch that shows the merchants anyway rather than
 * dropping a currency the roll-up otherwise has something to say about.
 */
export const merchantSpendGroupsMissingTotal: CurrencyGroup[] = [
  { currency: 'AUD', total: null, merchants: [woolworths, bunnings] },
];

/** An entity with no name of its own — triggers merchantLabel's id fallback. */
export const merchantSpendGroupsUnnamedEntity: CurrencyGroup[] = [
  {
    currency: 'EUR',
    total: {
      currency: 'EUR',
      orderCount: unnamedEntityMerchant.orderCount,
      accounting: sumAccounting([unnamedEntityMerchant.accounting]),
    },
    merchants: [unnamedEntityMerchant],
  },
];

/**
 * An entity group and a name group whose displayed labels are identical
 * text, side by side, so a reviewer can see them render as two distinct
 * rows rather than collapsing into one.
 */
export const merchantSpendGroupsLabelCollision: CurrencyGroup[] = [
  {
    currency: 'EUR',
    total: {
      currency: 'EUR',
      orderCount: generalStoreEntity.orderCount + generalStoreName.orderCount,
      accounting: sumAccounting([generalStoreEntity.accounting, generalStoreName.accounting]),
    },
    merchants: [generalStoreEntity, generalStoreName],
  },
];

/**
 * The window the roll-up reported it computed over, which is not the window
 * the picker is showing. The screen captions the figures with this rather
 * than with the selection, so a total can never be read against a window it
 * was not computed over.
 */
export const allTimePeriod: SpendPeriod = { from: null, to: null };

/** The response a bounded selection came back with. */
export const boundedPeriod: SpendPeriod = { from: '2026-01-01', to: '2026-12-31' };
