import {
  amazonUs,
  audUnattributed,
  bunnings,
  generalStoreEntity,
  generalStoreName,
  merchantKey,
  overLinked,
  sliverResidual,
  unnamedEntityMerchant,
  usdUnattributed,
  wooliesBroadway,
  woolworths,
} from '@/fixtures/purchases-merchant-spend';

import type { MerchantSpend } from '@/fixtures/purchases-merchant-spend';
import type { PurchaseStatus } from '@/fixtures/purchases-vocabulary';

/** One order behind a merchant row, as the order index reports it. */
export interface MerchantOrder {
  id: string;
  orderedAt: string;
  sourceOrderId: string | null;
  status: PurchaseStatus;
  totalCents: number;
  currency: string;
}

/**
 * The lookup key for a merchant's orders. Two unattributed identities in
 * different currencies share a merchant key, so the currency has to be part
 * of it or one row's orders answer for the other's.
 */
export function merchantOrderKey(spend: MerchantSpend): string {
  return `${spend.currency}:${merchantKey(spend.merchant)}`;
}

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
 * shown of 3). Where a list disagrees on count it disagrees on money in the
 * same direction, so a reader adding the column up is not told one thing by
 * the notice and another by the figures.
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
    ['o-bw-2', '2026-01-19', 'BW-10099', 'linked', 38_600],
    ['o-bw-3', '2026-02-14', 'BW-10182', 'partial', 42_300],
    ['o-bw-4', '2026-03-02', 'BW-10240', 'linked', 38_700],
  ]),
  [merchantOrderKey(sliverResidual)]: orderList('AUD', [
    ['o-co-1', '2026-02-08', 'CO-55120', 'linked', 27_400],
    ['o-co-2', '2026-04-11', 'CO-55980', 'linked', 24_600],
  ]),
  [merchantOrderKey(overLinked)]: orderList('AUD', [
    ['o-ig-1', '2026-03-15', null, 'linked', 12_000],
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
  [merchantOrderKey(unnamedEntityMerchant)]: orderList('EUR', [
    ['o-un-1', '2026-04-02', 'UN-1122', 'linked', 4_500],
  ]),
  [merchantOrderKey(generalStoreEntity)]: orderList('EUR', [
    ['o-gs-e-1', '2026-02-19', 'GS-3001', 'linked', 6_000],
  ]),
  [merchantOrderKey(generalStoreName)]: orderList('EUR', [
    ['o-gs-n-1', '2026-03-27', null, 'linked', 2_200],
  ]),
};
