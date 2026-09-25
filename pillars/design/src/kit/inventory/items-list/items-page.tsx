/**
 * The Items page: every tracked thing, filterable, in a table, a compact
 * table or cards, with the shared selection bar for bulk verbs. Design
 * states open it with a seed (filters, view, selection) and optionally a
 * banner and an overlay (a bulk sheet) drawn over it.
 */
import { INVENTORY_ICONS, StateBanner } from '../foundation';
import { ExportMenu } from './export-menu';
import { ItemsBody } from './items-body';
import { ItemsSummary } from './items-summary';
import { ItemsToolbar } from './items-toolbar';
import { ListPage } from './list-page';
import { NewItemButton } from './new-item-button';
import { itemSelectionActions } from './selection-actions';
import { SelectionDock } from './selection-dock';
import { useItemsBrowser } from './use-items-browser';

import type { ReactNode } from 'react';

import type { ItemRowModel, PlacementWorld } from '../foundation';
import type { FilterOption } from './filter-popover';
import type { ListStatus } from './items-body';
import type { BrowserSeed, ItemsBrowser } from './use-items-browser';

/** Props for {@link ItemsPage}. */
export interface ItemsPageProps {
  items: readonly ItemRowModel[];
  world: PlacementWorld;
  types: readonly FilterOption[];
  places: readonly FilterOption[];
  seed?: BrowserSeed;
  status?: ListStatus;
  banner?: ReactNode;
  overlay?: ReactNode;
  offline?: boolean;
  filterOpen?: boolean;
  exportOpen?: boolean;
  pendingIds?: ReadonlySet<string>;
  rejections?: Readonly<Record<string, string>>;
}

/** The offline banner every list page shows the same way. */
export function OfflineBanner() {
  return (
    <StateBanner
      kind="offline"
      title="No connection. Showing what loaded at 10:42."
      detail="Changes are off until the connection is back."
    />
  );
}

function ItemsHead({ browser, props }: { browser: ItemsBrowser; props: ItemsPageProps }) {
  return (
    <>
      <ItemsToolbar
        filters={browser.filters}
        view={browser.view}
        types={props.types}
        places={props.places}
        onFilters={browser.setFilters}
        onClear={browser.clearFilters}
        onView={browser.setView}
        filterOpen={props.filterOpen}
      />
      <ItemsSummary
        shown={browser.total}
        total={browser.baseline}
        noun="items"
        hiddenInactive={browser.hidden}
        chips={browser.chips}
        address={browser.address}
      />
    </>
  );
}

/** The Items page. */
export function ItemsPage(props: ItemsPageProps) {
  const { items, world, status = 'ready' } = props;
  const browser = useItemsBrowser(items, world, props.seed);
  return (
    <ListPage
      title="Items"
      icon={INVENTORY_ICONS.item}
      actions={
        <>
          <ExportMenu
            viewCount={browser.total}
            selectedCount={browser.selection.count}
            defaultOpen={props.exportOpen}
          />
          <NewItemButton />
        </>
      }
      banner={props.offline ? <OfflineBanner /> : props.banner}
      toolbar={<ItemsHead browser={browser} props={props} />}
      dock={
        <SelectionDock
          world={world}
          selection={browser.selection}
          loadedCount={browser.rows.length}
          actions={itemSelectionActions(world, browser.selection.selectedIds)}
          offline={props.offline}
        />
      }
      overlay={props.overlay}
    >
      <ItemsBody
        browser={browser}
        world={world}
        status={status}
        population={items.length}
        pendingIds={props.pendingIds}
        rejections={props.rejections}
      />
    </ListPage>
  );
}
