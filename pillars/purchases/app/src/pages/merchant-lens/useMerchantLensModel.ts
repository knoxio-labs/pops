import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../purchases-api-helpers.js';
import { analyticsMerchantSpend } from '../../purchases-api/index.js';
import { periodRange, type PeriodSelection } from './period.js';

import type { CurrencySpend, MerchantSpend, SpendPeriod } from './types.js';

export interface CurrencyGroup {
  currency: string;
  /**
   * The roll-up's own total for this currency, or `null` when it reported
   * merchants in a currency it gave no total for.
   */
  total: CurrencySpend | null;
  merchants: MerchantSpend[];
}

/**
 * A union rather than one shape with everything optional, for the reason the
 * analytics contract gives for `MerchantIdentity`: the tag constrains the
 * row. Flat, a failed load carrying no error and a ready load carrying no
 * period both type-check, and every consumer re-derives the invariant with an
 * assertion it has no grounds for.
 */
export type MerchantLensModel =
  | { state: 'loading'; refetch: () => void }
  | { state: 'failed'; failure: Error; refetch: () => void }
  | { state: 'ready'; period: SpendPeriod; groups: CurrencyGroup[]; refetch: () => void };

export function useMerchantLensModel(selection: PeriodSelection): MerchantLensModel {
  const query = useQuery({
    queryKey: ['purchases', 'analytics', 'merchantSpend', selection],
    queryFn: async () => unwrap(await analyticsMerchantSpend({ query: periodRange(selection) })),
    retry: false,
  });

  const refetch = (): void => {
    void query.refetch();
  };

  if (query.isPending) return { state: 'loading', refetch };
  if (query.error !== null) return { state: 'failed', failure: query.error, refetch };

  return {
    state: 'ready',
    period: query.data.period,
    groups: groupByCurrency(query.data.merchants, query.data.totals),
    refetch,
  };
}

/**
 * Fold the two flat arrays into one group per currency, in the order the
 * roll-up returned its totals.
 *
 * Server order is preserved rather than re-sorted: currency ascending then net
 * spend descending is a decision the roll-up already made, and a second
 * ordering here is a second place for it to be wrong.
 *
 * Driven off `totals` because that is the roll-up's own statement of which
 * currencies are in scope — but a merchant in a currency `totals` never
 * mentioned still gets a group, with no total beside it. Keying only off
 * `totals` would silently drop that merchant's spend, which is the same
 * failure as dropping the residual one level down.
 */
function groupByCurrency(merchants: MerchantSpend[], totals: CurrencySpend[]): CurrencyGroup[] {
  const byCurrency = new Map<string, MerchantSpend[]>();
  for (const merchant of merchants) {
    const bucket = byCurrency.get(merchant.currency);
    if (bucket === undefined) byCurrency.set(merchant.currency, [merchant]);
    else bucket.push(merchant);
  }

  const groups = totals.map((total) => ({
    currency: total.currency,
    total,
    merchants: byCurrency.get(total.currency) ?? [],
  }));

  const accountedFor = new Set(totals.map((total) => total.currency));
  const orphaned: CurrencyGroup[] = [];
  for (const [currency, bucket] of byCurrency) {
    if (accountedFor.has(currency)) continue;
    orphaned.push({ currency, total: null, merchants: bucket });
  }

  return [...groups, ...orphaned];
}
