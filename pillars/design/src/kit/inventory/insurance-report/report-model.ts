/**
 * The insurance report's grouping, location-subtree filtering and sorting,
 * ported as a pure function from
 * `pillars/inventory/src/api/modules/reports/insurance-report.ts`'s
 * `getInsuranceReport`. The source computes this against SQLite; here it runs
 * over an in-memory row list and the fixture's own {@link LocationTreeNode}
 * tree instead of a flat `parentId` table, but the filter/group/sort rules
 * are unchanged.
 */
import type { LocationTreeNode } from '../location-picker';
import type { ReportGroup, ReportItem } from './csv';

export type SortBy = 'value' | 'name' | 'type';

/**
 * A report row with `type`, which the API serves (`InsuranceReportItem.type`)
 * but the frontend's own {@link ReportItem} never declared. Sorting by type
 * needs it even though the rendered row does not; see the report for this
 * gap in the source.
 */
export type SortableReportItem = ReportItem & { type: string | null };

export interface ReportOptions {
  locationId?: string | null;
  includeChildren?: boolean;
  sortBy?: SortBy;
}

export interface InsuranceReport {
  groups: ReportGroup[];
  totalItems: number;
  totalValue: number;
}

function collectSubtreeIds(nodes: LocationTreeNode[], rootId: string, into: Set<string>): boolean {
  for (const node of nodes) {
    if (node.id === rootId) {
      into.add(node.id);
      collectAllIds(node.children, into);
      return true;
    }
    if (collectSubtreeIds(node.children, rootId, into)) return true;
  }
  return false;
}

function collectAllIds(nodes: LocationTreeNode[], into: Set<string>): void {
  for (const node of nodes) {
    into.add(node.id);
    collectAllIds(node.children, into);
  }
}

/** `rootId` and every descendant beneath it in `tree`, or an empty set if `rootId` is not in `tree`. */
function getLocationSubtreeIds(tree: LocationTreeNode[], rootId: string): Set<string> {
  const ids = new Set<string>();
  collectSubtreeIds(tree, rootId, ids);
  return ids;
}

function compareItems(a: SortableReportItem, b: SortableReportItem, sortBy: SortBy): number {
  switch (sortBy) {
    case 'value':
      return (b.replacementValue ?? 0) - (a.replacementValue ?? 0);
    case 'name':
      return a.itemName.localeCompare(b.itemName);
    case 'type':
      return (a.type ?? '').localeCompare(b.type ?? '');
  }
}

function buildGroups(items: ReportItem[]): ReportGroup[] {
  const groupMap = new Map<string | null, ReportItem[]>();
  for (const item of items) {
    const existing = groupMap.get(item.locationId) ?? [];
    if (!groupMap.has(item.locationId)) groupMap.set(item.locationId, existing);
    existing.push(item);
  }

  const groups: ReportGroup[] = [];
  for (const [locId, list] of groupMap) {
    groups.push({
      locationId: locId,
      locationName: locId ? (list[0]?.locationName ?? 'Unknown') : 'No Location',
      items: list,
    });
  }
  groups.sort((a, b) => {
    if (a.locationId === null) return 1;
    if (b.locationId === null) return -1;
    return a.locationName.localeCompare(b.locationName);
  });
  return groups;
}

export function buildInsuranceReport(
  items: SortableReportItem[],
  locationTree: LocationTreeNode[],
  options: ReportOptions = {}
): InsuranceReport {
  const { locationId, includeChildren = true, sortBy = 'value' } = options;

  let locationIds: Set<string> | null = null;
  if (locationId) {
    locationIds = includeChildren
      ? getLocationSubtreeIds(locationTree, locationId)
      : new Set([locationId]);
  }

  const filteredItems = items
    .filter(
      (item) => !locationIds || (item.locationId !== null && locationIds.has(item.locationId))
    )
    .toSorted((a, b) => compareItems(a, b, sortBy));

  const totalValue = filteredItems.reduce((sum, item) => sum + (item.replacementValue ?? 0), 0);

  return {
    groups: buildGroups(filteredItems),
    totalItems: filteredItems.length,
    totalValue,
  };
}
