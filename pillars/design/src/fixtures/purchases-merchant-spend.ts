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

export interface SpendAccounting {
  totalCents: number;
  matchedCents: number;
  awaitingImportCents: number;
  refundedCents: number;
  residualCents: number;
  netSpendCents: number;
}

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

export interface MerchantOrder {
  id: string;
  orderedAt: string;
  sourceOrderId: string | null;
  status: 'awaiting_settlement' | 'linked' | 'partial' | 'settled_cash' | 'ignored';
  totalCents: number;
  currency: string;
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

const woolworths: MerchantSpend = {
  merchant: entity('woolworths', 'Woolworths Metro George St'),
  currency: 'AUD',
  orderCount: 6,
  accounting: accounting({ totalCents: 45_230, matchedCents: 45_230 }),
};

const bunnings: MerchantSpend = {
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

const wooliesBroadway: MerchantSpend = {
  merchant: named('Woolies Metro Broadway'),
  currency: 'AUD',
  orderCount: 2,
  accounting: accounting({ totalCents: 8_900, matchedCents: 8_900 }),
};

const audUnattributed: MerchantSpend = {
  merchant: unattributed,
  currency: 'AUD',
  orderCount: 1,
  accounting: accounting({ totalCents: 3_200, matchedCents: 0 }),
};

const amazonUs: MerchantSpend = {
  merchant: entity('amazon-us', 'Amazon.com'),
  currency: 'USD',
  orderCount: 4,
  accounting: accounting({ totalCents: 21_999, matchedCents: 15_000, awaitingImportCents: 4_000 }),
};

const usdUnattributed: MerchantSpend = {
  merchant: unattributed,
  currency: 'USD',
  orderCount: 1,
  accounting: accounting({ totalCents: 1_500, matchedCents: 0 }),
};

/**
 * Identifies a merchant grouping within one currency section — used as the
 * React list key and, combined with currency, as the fixture order lookup
 * below. Two unattributed identities in different currencies must not
 * collide, which is why the order lookup below keys on `merchantOrderKey`
 * rather than on this alone.
 */
export function merchantKey(identity: MerchantIdentity): string {
  return `${identity.resolution}:${identity.entityId ?? identity.name ?? ''}`;
}

export function merchantOrderKey(spend: MerchantSpend): string {
  return `${spend.currency}:${merchantKey(spend.merchant)}`;
}

const audMerchants = [woolworths, bunnings, wooliesBroadway, audUnattributed];
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

type OrderTuple = [
  id: string,
  orderedAt: string,
  sourceOrderId: string | null,
  status: MerchantOrder['status'],
  totalCents: number,
];

function orderList(currency: string, entries: OrderTuple[]): MerchantOrder[] {
  return entries.map(([id, orderedAt, sourceOrderId, status, totalCents]) => ({
    id,
    orderedAt,
    sourceOrderId,
    status,
    totalCents,
    currency,
  }));
}

/**
 * The orders behind each merchant row, keyed by `merchantOrderKey`. Order
 * counts are deliberately at odds with each row's `orderCount` for three of
 * the six merchants, so the drill-down's disagreement notice
 * (`short`/`none`/`over`) has something real to render in this fixture
 * rather than only in a unit test: Woolworths is short (4 shown of 6),
 * Woolies Metro Broadway has none (0 shown of 2), and Bunnings is over (4
 * shown of 3).
 */
export const merchantOrdersByKey: Record<string, MerchantOrder[]> = {
  [merchantOrderKey(woolworths)]: orderList('AUD', [
    ['o-ww-1', '2026-01-12', 'WW-88213', 'linked', 8_420],
    ['o-ww-2', '2026-02-03', 'WW-88940', 'linked', 6_110],
    ['o-ww-3', '2026-03-21', null, 'settled_cash', 4_990],
    ['o-ww-4', '2026-05-02', 'WW-90112', 'linked', 5_500],
  ]),
  [merchantOrderKey(bunnings)]: orderList('AUD', [
    ['o-bw-1', '2026-01-05', 'BW-10021', 'linked', 21_400],
    ['o-bw-2', '2026-01-19', 'BW-10099', 'linked', 8_600],
    ['o-bw-3', '2026-02-14', 'BW-10182', 'partial', 12_300],
    ['o-bw-4', '2026-03-02', 'BW-10240', 'linked', 9_800],
  ]),
  [merchantOrderKey(wooliesBroadway)]: [],
  [merchantOrderKey(audUnattributed)]: orderList('AUD', [
    ['o-au-1', '2026-04-18', null, 'awaiting_settlement', 3_200],
  ]),
  [merchantOrderKey(amazonUs)]: orderList('USD', [
    ['o-az-1', '2026-01-22', '112-3384921', 'linked', 5_499],
    ['o-az-2', '2026-02-27', '112-3401183', 'linked', 6_200],
    ['o-az-3', '2026-04-09', '112-3455012', 'partial', 4_800],
    ['o-az-4', '2026-06-14', '112-3502279', 'awaiting_settlement', 5_500],
  ]),
  [merchantOrderKey(usdUnattributed)]: orderList('USD', [
    ['o-au-2', '2026-05-30', null, 'awaiting_settlement', 1_500],
  ]),
};
