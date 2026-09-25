/**
 * The Containers page: every box, tub and case, segmented by what matters
 * about a container (open, closed, full, retired) plus Moving day, which
 * leads with packing progress and lists what is still open first. Same
 * table, filters and selection bar as Items; the Type column becomes what
 * each container holds.
 */
import { useMemo } from 'react';

import { INVENTORY_ICONS, SelectionBar } from '../foundation';
import { ItemsBody } from '../items-list/items-body';
import { OfflineBanner } from '../items-list/items-page';
import { ItemsSummary } from '../items-list/items-summary';
import { ItemsToolbar } from '../items-list/items-toolbar';
import { ListPage } from '../items-list/list-page';
import { NewItemButton } from '../items-list/new-item-button';
import { carriedCount } from '../items-list/selection-actions';
import { useItemsBrowser } from '../items-list/use-items-browser';
import { containerActions } from './container-actions';
import { inSegment, movingOrder, packingProgress, segmentCounts } from './containers-model';
import { HoldsCell } from './holds-cell';
import { PackingStrip } from './packing-strip';
import { SegmentControl } from './segment-control';

import type { ItemRowModel, PlacementWorld } from '../foundation';
import type { FilterOption } from '../items-list/filter-popover';
import type { ListStatus } from '../items-list/items-body';
import type { BrowserSeed } from '../items-list/use-items-browser';
import type { ContainerSegment } from './containers-model';

/** Props for {@link ContainersPage}. */
export interface ContainersPageProps {
  items: readonly ItemRowModel[];
  world: PlacementWorld;
  types: readonly FilterOption[];
  places: readonly FilterOption[];
  segment?: ContainerSegment;
  seed?: BrowserSeed;
  status?: ListStatus;
  offline?: boolean;
}

function rowsFor(items: readonly ItemRowModel[], segment: ContainerSegment): ItemRowModel[] {
  const rows = items.filter((item) => inSegment(item, segment));
  return segment === 'moving' ? rows.toSorted(movingOrder) : rows;
}

function withState(address: string, segment: ContainerSegment): string {
  if (segment === 'all') return address;
  return `${address}${address.includes('?') ? '&' : '?'}state=${segment}`;
}

/** The Containers page. */
export function ContainersPage(props: ContainersPageProps) {
  const { items, world, segment = 'all' } = props;
  const rows = useMemo(() => rowsFor(items, segment), [items, segment]);
  const browser = useItemsBrowser(
    rows,
    world,
    { ...props.seed, filters: { inactive: segment === 'retired', ...props.seed?.filters } },
    '/inventory/containers'
  );
  const ids = browser.selection.selectedIds;
  return (
    <ListPage
      title="Containers"
      icon={INVENTORY_ICONS.container}
      actions={<NewItemButton label="New container" />}
      banner={
        props.offline ? (
          <OfflineBanner />
        ) : segment === 'moving' ? (
          <PackingStrip progress={packingProgress(world, items)} />
        ) : null
      }
      toolbar={
        <>
          <ItemsToolbar
            filters={browser.filters}
            view={browser.view}
            types={props.types}
            places={props.places}
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
            total={rows.length}
            noun="containers"
            hiddenInactive={0}
            chips={browser.chips.filter((chip) => chip.id !== 'inactive')}
            address={withState(browser.address, segment)}
          />
        </>
      }
      dock={
        <SelectionBar
          count={browser.selection.count}
          loadedCount={browser.rows.length}
          coverage={browser.selection.coverage}
          actions={containerActions(world, ids, props.offline === true)}
          carriedCount={carriedCount(world, ids)}
          onSelectAll={browser.selection.onHeaderToggle}
          onClear={browser.selection.clearSelection}
        />
      }
    >
      <ItemsBody
        browser={browser}
        world={world}
        status={props.status ?? 'ready'}
        population={items.filter((item) => item.container !== null).length}
        noun="containers"
        secondHeader="Holds"
        secondCell={(item) => <HoldsCell world={world} id={item.id} />}
      />
    </ListPage>
  );
}
