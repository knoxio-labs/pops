import { REWARDS_CARD_ID, REWARDS_CHECKPOINT_ID } from './accounts';

import type {
  BudgetsListResponses,
  CurrenciesListResponses,
  DataQualityNudgesResponses,
  WishlistListResponses,
} from '../../finance-api/types.gen';

/**
 * The smaller lists: budgets, the wishlist, currencies, and the data-quality
 * nudge that points at the rewards card's disagreeing checkpoint.
 *
 * One budget is over, one under, so the dashboard's budget strip has both
 * states to draw; one wishlist item is part-saved.
 */

const EDITED = '2026-09-02T08:00:00.000Z';

export const BUDGETS: BudgetsListResponses[200]['data'] = [
  {
    id: 'bud-groceries',
    category: 'Groceries',
    period: 'monthly',
    amount: 600,
    spent: 646.2,
    remaining: -46.2,
    active: true,
    notes: 'Over by the end of August.',
    lastEditedTime: EDITED,
  },
  {
    id: 'bud-transport',
    category: 'Transport',
    period: 'monthly',
    amount: 250,
    spent: 71.9,
    remaining: 178.1,
    active: true,
    notes: null,
    lastEditedTime: EDITED,
  },
];

export const WISHLIST: WishlistListResponses[200]['data'] = [
  {
    id: 'wish-bike',
    item: 'Commuter bike',
    priority: 'high',
    targetAmount: 1_400,
    saved: 520,
    remainingAmount: 880,
    notes: 'Steel frame, hub gears.',
    url: null,
    lastEditedTime: EDITED,
  },
];

export const CURRENCIES: CurrenciesListResponses[200]['data'] = [
  {
    code: 'AUD',
    name: 'Australian dollar',
    symbol: '$',
    decimals: 2,
    kind: 'fiat',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    code: 'NZD',
    name: 'New Zealand dollar',
    symbol: 'NZ$',
    decimals: 2,
    kind: 'fiat',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export const NUDGES: DataQualityNudgesResponses[200]['data'] = [
  {
    kind: 'checkpoint-inconsistency',
    accountId: REWARDS_CARD_ID,
    accountName: 'Rewards card',
    checkpointId: REWARDS_CHECKPOINT_ID,
    asOf: '2026-08-31',
    currency: 'AUD',
    deltaCents: -3_250,
    href: `/finance/accounts/${REWARDS_CARD_ID}/checkpoints`,
  },
];
