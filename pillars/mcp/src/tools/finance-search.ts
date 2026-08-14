import {
  finance,
  SEARCH_FILTER_FIELDS,
  SEARCH_FILTER_OPERATORS,
  type FinanceSearchInput,
  type SearchFilterField,
  type SearchFilterOperator,
  type StructuredFilter,
} from './finance-client.js';
import { mapCallResult, reqStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

function isSearchFilterField(value: unknown): value is SearchFilterField {
  return (SEARCH_FILTER_FIELDS as readonly unknown[]).includes(value);
}

function isSearchFilterOperator(value: unknown): value is SearchFilterOperator {
  return (SEARCH_FILTER_OPERATORS as readonly unknown[]).includes(value);
}

function parseFilters(args: Record<string, unknown>): StructuredFilter[] | undefined {
  if (!Array.isArray(args['filters'])) return undefined;
  return (args['filters'] as unknown[]).filter(
    (f): f is StructuredFilter =>
      typeof f === 'object' &&
      f !== null &&
      isSearchFilterField((f as Record<string, unknown>)['field']) &&
      isSearchFilterOperator((f as Record<string, unknown>)['operator']) &&
      typeof (f as Record<string, unknown>)['value'] === 'string'
  );
}

export const financeSearch: ToolDef = {
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
            field: {
              type: 'string',
              enum: [...SEARCH_FILTER_FIELDS],
              description:
                'The field to filter on. Each field applies to only one of the three domains.',
            },
            operator: {
              type: 'string',
              enum: [...SEARCH_FILTER_OPERATORS],
              description: 'How to compare `field` against `value`.',
            },
            value: { type: 'string' },
          },
          required: ['field', 'operator', 'value'],
        },
        description:
          'Optional structured filters. An unsupported field/operator is rejected by the finance pillar with a 400.',
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
