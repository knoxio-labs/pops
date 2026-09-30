/** Purchase search filters for the order-scope fields. */
export type PurchaseSearchFilter =
  | { field: 'source' | 'status'; operator: 'eq'; value: string }
  | { field: 'orderedAt'; operator: 'gte' | 'lte'; value: string };

/**
 * Translates purchase list scope values into the equivalent search filters.
 */
export function searchFiltersFrom(scope: {
  sources?: string[];
  statuses?: string[];
  from?: string;
  to?: string;
}): PurchaseSearchFilter[] | undefined {
  const filters: PurchaseSearchFilter[] = [];
  for (const source of scope.sources ?? []) {
    filters.push({ field: 'source', operator: 'eq', value: source });
  }
  for (const status of scope.statuses ?? []) {
    filters.push({ field: 'status', operator: 'eq', value: status });
  }
  if (scope.from !== undefined) {
    filters.push({ field: 'orderedAt', operator: 'gte', value: scope.from });
  }
  if (scope.to !== undefined) {
    filters.push({ field: 'orderedAt', operator: 'lte', value: scope.to });
  }
  return filters.length > 0 ? filters : undefined;
}
