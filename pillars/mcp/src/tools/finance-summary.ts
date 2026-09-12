import { SUMMARY_WINDOWS, finance, type SummaryWindow } from './finance-client.js';
import { mapCallResult, optNum } from './utils.js';

import type { ToolDef } from './tool-def.js';

/**
 * What the assistant has to understand about the numbers before it quotes
 * them. Both halves exist because the alternative is a confident `$0.00`.
 */
const READING_NOTE =
  'Every amount comes as { cents, transactionCount }: transactionCount 0 means nothing ' +
  'matched, so say "no data" rather than "$0.00" — a category nothing has ever been filed ' +
  'under and one that genuinely netted to zero are different answers. Shares are null when ' +
  'the total they are a share of is zero. There is no income figure because the ledger holds ' +
  'no income rows at all.';

const summaryGet: ToolDef = {
  name: 'finance.summary.get',
  description:
    'Spend for one window and the period before it, aggregated by the finance pillar — use ' +
    'this instead of paging finance.transactions.list and adding it up. Returns the resolved ' +
    'window and the range it is compared against, the total and previous total with their ' +
    'delta, spend by account, by month (stacked by account), by tag and by entity, and an ' +
    'inference block: largest charge, how concentrated spend is across the top merchants, ' +
    `subscriptions, and foreign spend with its FX fees. ${READING_NOTE}`,
  inputSchema: {
    type: 'object',
    properties: {
      window: {
        type: 'string',
        enum: SUMMARY_WINDOWS,
        description:
          'Window to summarise (default "30d"). "30d"/"90d" are rolling and end today; ' +
          '"month"/"year" are to-date and are compared against the same elapsed days of the ' +
          'previous month/year; "all" is the whole ledger and has no comparison period.',
      },
      topLimit: {
        type: 'number',
        description: 'Rows in the tag and entity breakdowns (default 10, max 50)',
      },
    },
  },
  handler: async (args) =>
    mapCallResult(
      await finance().summary.get({
        window: (SUMMARY_WINDOWS as readonly string[]).includes(args['window'] as string)
          ? (args['window'] as SummaryWindow)
          : undefined,
        topLimit: optNum(args, 'topLimit'),
      })
    ),
};

export const summaryTools: readonly ToolDef[] = [summaryGet];
