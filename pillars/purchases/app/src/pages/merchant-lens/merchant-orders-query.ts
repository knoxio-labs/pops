import type { PurchaseListData } from '../../purchases-api/types.gen.js';
import type { MerchantIdentity, MerchantSpend, SpendPeriod } from './types.js';

type ListQuery = NonNullable<PurchaseListData['query']>;

/**
 * The order index caps a page at 500, and a merchant row is opened to be read
 * rather than paged, so the drill-down asks for the whole cap in one request
 * and reports what it could not fit rather than offering a second page.
 */
export const MERCHANT_ORDERS_LIMIT = 500;

/**
 * The three merchant parameters a group is named by.
 *
 * Exactly one is ever sent. The pillar refuses two, and rightly: `entity` and
 * `name` are different kinds of claim about who was paid, and a request
 * carrying both denotes no group the roll-up produces.
 */
function merchantParams(identity: MerchantIdentity): ListQuery {
  switch (identity.resolution) {
    case 'entity':
      return { merchantEntityId: identity.entityId };
    case 'name':
      return { merchantEntityName: identity.name };
    case 'unattributed':
      return { merchantUnattributed: true };
  }
}

/**
 * The request that turns one merchant row into the orders behind it.
 *
 * Scoped by the period the **response** reported rather than by the picker's
 * current value, for the reason the rendered window is echoed from the
 * response too: while a refetch is in flight the picker has already moved,
 * and a list read over one window under a headline computed over another is
 * the disagreement a reader has no way to see.
 *
 * `currency` travels because the roll-up groups on merchant *and* currency: a
 * merchant billing in two has two rows, and a request omitting it would
 * answer both of them with the same orders.
 */
export function merchantOrdersQuery(merchant: MerchantSpend, period: SpendPeriod): ListQuery {
  return {
    ...merchantParams(merchant.merchant),
    currency: merchant.currency,
    ...(period.from === null ? {} : { from: period.from }),
    ...(period.to === null ? {} : { to: period.to }),
    limit: MERCHANT_ORDERS_LIMIT,
  };
}
