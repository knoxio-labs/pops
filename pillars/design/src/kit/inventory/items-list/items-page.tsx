/**
 * The Items page: every tracked thing, filterable, in a table, a compact
 * table or cards, with the shared selection bar for bulk verbs. Design
 * states open it with a seed (filters, view, selection) and optionally a
 * banner and an overlay (a bulk sheet) drawn over it.
 */
import { INVENTORY_ICONS, SelectionBar, StateBanner } from '../foundation';
import { ExportMenu } from './export-menu';
import { ItemsBody } from './items-body';
import { ItemsSummary } from './items-summary';
import { ItemsToolbar } from './items-toolbar';
import { ListPage } from './list-page';
import { NewItemButton } from './new-item-button';
import { carriedCount, itemSelectionActions } from './selection-actions';
import { useItemsBrowser } from './use-items-browser';

import type { ReactNode } from 'react';

import type { ItemRowModel, PlacementWorld, SelectionBarAction } from '../foundation';
import type { FilterOption } from './filter-popover';
import type { ListStatus } from './items-body';
import type { BrowserSeed } from './use-items-browser';

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

function offlineActions(actions: SelectionBarAction[]): SelectionBarAction[] {
  return actions.map((action) => ({ ...action, disabledReason: 'No connection' }));
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

/** The Items page. */
export function ItemsPage(props: ItemsPageProps) {
  const { items, world, status = 'ready' } = props;
  const browser = useItemsBrowser(items, world, props.seed);
  const ids = browser.selection.selectedIds;
  const actions = itemSelectionActions(world, ids);
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
      }
      dock={
        <SelectionBar
          count={browser.selection.count}
          loadedCount={browser.rows.length}
          coverage={browser.selection.coverage}
          actions={props.offline ? offlineActions(actions) : actions}
          carriedCount={carriedCount(world, ids)}
          onSelectAll={browser.selection.onHeaderToggle}
          onClear={browser.selection.clearSelection}
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
