import { finance, type FinanceSearchInput, type StructuredFilter } from './finance-client.js';
import { mapCallResult, reqStr, toolError } from './utils.js';

import type { ToolDef } from './index.js';

function parseFilters(args: Record<string, unknown>): StructuredFilter[] | undefined {
  if (!Array.isArray(args['filters'])) return undefined;
  return (args['filters'] as unknown[]).filter(
    (f): f is StructuredFilter =>
      typeof f === 'object' &&
      f !== null &&
      typeof (f as Record<string, unknown>)['field'] === 'string' &&
      typeof (f as Record<string, unknown>)['operator'] === 'string' &&
      typeof (f as Record<string, unknown>)['value'] === 'string'
  );
}

const financeSearch: ToolDef = {
  name: 'finance.search',
  description:
    "Search the finance pillar's domains (transactions, budgets, wishlist) for a free-text query. Returns ranked hits across all three.",
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Search query text' },
      filters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            operator: { type: 'string' },
            value: { type: 'string' },
          },
          required: ['field', 'operator', 'value'],
        },
        description: 'Optional structured filters',
      },
    },
    required: ['text'],
  },
  handler: async (args) => {
    const text = reqStr(args, 'text');
    if (!text) return toolError('Missing required field: text');
    const filters = parseFilters(args);
    const query: FinanceSearchInput['query'] =
      filters !== undefined && filters.length > 0 ? { text, filters } : { text };
    return mapCallResult(await finance().search.search({ query }));
  },
};

export const searchTools: readonly ToolDef[] = [financeSearch];
