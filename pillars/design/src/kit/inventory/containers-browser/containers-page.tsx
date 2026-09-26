/**
 * The Containers page: every box, tub and case, segmented by what matters
 * about a container (open, closed, full, retired) plus Moving day, which
 * leads with packing progress and lists what is still open first. Same
 * table, filters and selection bar as Items; the Type column becomes what
 * each container holds.
 */
import { useMemo } from 'react';

import { INVENTORY_ICONS } from '../foundation';
import { ItemsBody } from '../items-list/items-body';
import { OfflineBanner } from '../items-list/items-page';
import { SelectionDock } from '../items-list/selection-dock';
import { useItemsBrowser } from '../items-list/use-items-browser';
import { NewItemButton } from '../shared/new-item-button';
import { InventoryPage } from '../shared/page-frame';
import { containerActions } from './container-actions';
import { inSegment, movingOrder, packingProgress } from './containers-model';
import { ContainersToolbar } from './containers-toolbar';
import { HoldsCell } from './holds-cell';
import { PackingStrip } from './packing-strip';

import type { ReactNode } from 'react';

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

function banner(props: ContainersPageProps, segment: ContainerSegment): ReactNode {
  if (props.offline) return <OfflineBanner />;
  if (segment !== 'moving') return null;
  return <PackingStrip progress={packingProgress(props.world, props.items)} />;
}

/** The Containers page. */
export function ContainersPage(props: ContainersPageProps) {
  const { items, world, segment = 'all' } = props;
  const population = items.filter((item) => item.container !== null).length;
  const rows = useMemo(() => rowsFor(items, segment), [items, segment]);
  const browser = useItemsBrowser(
    rows,
    world,
    { ...props.seed, filters: { inactive: segment === 'retired', ...props.seed?.filters } },
    { path: '/inventory/containers' }
  );
  return (
    <InventoryPage
      title="Containers"
      icon={INVENTORY_ICONS.container}
      actions={<NewItemButton label="New container" offline={props.offline} />}
      banner={banner(props, segment)}
      toolbar={
        (props.status ?? 'ready') === 'ready' && population > 0 ? (
          <ContainersToolbar
            browser={browser}
            segment={segment}
            items={items}
            shown={rows.length}
            types={props.types}
            places={props.places}
          />
        ) : null
      }
      dock={
        <SelectionDock
          world={world}
          selection={browser.selection}
          loadedCount={browser.rows.length}
          actions={containerActions(world, browser.selection.selectedIds)}
          offline={props.offline}
        />
      }
    >
      <ItemsBody
        browser={browser}
        world={world}
        status={props.status ?? 'ready'}
        population={population}
        noun="containers"
        secondColumn={{ header: 'Holds', Cell: HoldsCell }}
      />
    </InventoryPage>
  );
}
