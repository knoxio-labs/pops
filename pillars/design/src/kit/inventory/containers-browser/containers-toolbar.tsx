/**
 * The Containers toolbar: the list filter, Type and Where, the segments
 * with their counts, and the summary line. There is no view toggle; boxes
 * are read as a table.
 */
import { ItemsSummary } from '../items-list/items-summary';
import { ItemsToolbar } from '../items-list/items-toolbar';
import { segmentCounts } from './containers-model';
import { SegmentControl } from './segment-control';

import type { ItemRowModel } from '../foundation';
import type { FilterOption } from '../items-list/filter-popover';
import type { ItemsBrowser } from '../items-list/use-items-browser';
import type { ContainerSegment } from './containers-model';

function withState(address: string, segment: ContainerSegment): string {
  if (segment === 'all') return address;
  return `${address}${address.includes('?') ? '&' : '?'}state=${segment}`;
}

/** Props for {@link ContainersToolbar}. */
export interface ContainersToolbarProps {
  browser: ItemsBrowser;
  segment: ContainerSegment;
  items: readonly ItemRowModel[];
  shown: number;
  types: readonly FilterOption[];
  places: readonly FilterOption[];
}

/** The toolbar and summary. */
export function ContainersToolbar({
  browser,
  segment,
  items,
  shown,
  types,
  places,
}: ContainersToolbarProps) {
  return (
    <>
      <ItemsToolbar
        filters={browser.filters}
        view={browser.view}
        types={types}
        places={places}
        onFilters={browser.setFilters}
        onClear={browser.clearFilters}
        onView={browser.setView}
        placeholder="Filter by name or code"
        scope="containers"
        views={false}
      >
        <SegmentControl value={segment} counts={segmentCounts(items)} />
      </ItemsToolbar>
      <ItemsSummary
        shown={browser.total}
        total={shown}
        noun="containers"
        hiddenInactive={0}
        chips={browser.chips.filter((chip) => chip.id !== 'inactive')}
        address={withState(browser.address, segment)}
      />
    </>
  );
}
