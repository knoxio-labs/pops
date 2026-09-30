import { getPillar } from '../pillar-client.js';
import { PURCHASE_SCOPE_PROPERTIES, purchaseScopeDateError } from './purchase-scope.js';
import { mapCallResult, optNum, optStr, toolError } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './tool-def.js';

/** Query scope shared by the purchases analytics tools. */
export type MerchantSpendInput = {
  sources?: string[];
  statuses?: string[];
  from?: string;
  to?: string;
};

/** Purchases product roll-up scope, including its order-count threshold. */
export type ProductLeaderboardInput = MerchantSpendInput & {
  minOrderCount?: number;
};

type PurchasesAnalyticsShape = {
  analytics: {
    merchantSpend: (input: MerchantSpendInput) => unknown;
    productLeaderboard: (input: ProductLeaderboardInput) => unknown;
  };
};

function purchases(): PillarHandle<PurchasesAnalyticsShape> {
  return getPillar<PurchasesAnalyticsShape>('purchases');
}

function stringList(args: Record<string, unknown>, key: string): string[] | undefined {
  const raw = args[key];
  if (typeof raw === 'string') return [raw];
  if (!Array.isArray(raw)) return undefined;
  const values = raw.filter((value): value is string => typeof value === 'string');
  return values.length > 0 ? values : undefined;
}

/**
 * Normalise the shared query scope while preserving unknown statuses for
 * validation by the Purchases contract.
 */
export function scopeFrom(args: Record<string, unknown>): MerchantSpendInput {
  const scope: MerchantSpendInput = {};
  const sources = stringList(args, 'sources');
  if (sources !== undefined) scope.sources = sources;
  const statuses = stringList(args, 'statuses');
  if (statuses !== undefined) scope.statuses = statuses;
  const from = optStr(args, 'from');
  if (from !== undefined) scope.from = from;
  const to = optStr(args, 'to');
  if (to !== undefined) scope.to = to;
  return scope;
}

function productLeaderboardInput(args: Record<string, unknown>): ProductLeaderboardInput {
  const input = scopeFrom(args);
  const minOrderCount = optNum(args, 'minOrderCount');
  return minOrderCount === undefined ? input : { ...input, minOrderCount };
}

/** Read-only merchant spend roll-up exposed through the assistant layer. */
export const merchantSpend: ToolDef = {
  name: 'purchases.analytics.merchantSpend',
  description:
    'Spend per merchant and currency over a period, with the explained/unexplained split. Groups are keyed on merchant AND currency and there is no cross-currency total, because no such number exists. `residualCents` is spend nothing accounts for — report it rather than dropping it. Takes no limit: the period is the only bound.',
  inputSchema: {
    type: 'object',
    properties: { ...PURCHASE_SCOPE_PROPERTIES },
  },
  handler: async (args) => {
    const dateError = purchaseScopeDateError(args);
    if (dateError !== undefined) return toolError(dateError);

    return mapCallResult(await purchases().analytics.merchantSpend(scopeFrom(args)));
  },
};

/** Read-only product cadence and unit-price roll-up exposed to the assistant. */
export const productLeaderboard: ToolDef = {
  name: 'purchases.analytics.productLeaderboard',
  description:
    'Show repeat purchases by product over a date range. Groups state whether identity comes from a SKU, a normalised printed name, a human product entry, or one unidentified line. Cadence counts distinct orders; unit-price history excludes allocated shipping. Use minOrderCount to require a minimum number of orders. The result has no page limit.',
  inputSchema: {
    type: 'object',
    properties: {
      ...PURCHASE_SCOPE_PROPERTIES,
      minOrderCount: {
        type: 'number',
        minimum: 1,
        multipleOf: 1,
        description: 'Minimum number of distinct orders containing a product group (at least 1)',
      },
    },
  },
  handler: async (args) => {
    const dateError = purchaseScopeDateError(args);
    if (dateError !== undefined) return toolError(dateError);

    return mapCallResult(
      await purchases().analytics.productLeaderboard(productLeaderboardInput(args))
    );
  },
};
