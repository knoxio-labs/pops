/**
 * Picks what the Items list body draws: the skeleton, a failure, the empty
 * inventory, a filter that left nothing, or the rows in the chosen view.
 */
import { ItemsCards } from './items-cards';
import { ItemsTable } from './items-table';
import { EmptyFiltered, EmptyInventory, ListError, ListSkeleton } from './list-states';

import type { ReactNode } from 'react';

import type { ItemRowModel, PlacementWorld } from '../foundation';
import type { ItemsBrowser } from './use-items-browser';

/** Whether the list has data to draw. */
export type ListStatus = 'ready' | 'loading' | 'error';

/** Props for {@link ItemsBody}. */
export interface ItemsBodyProps {
  browser: ItemsBrowser;
  world: PlacementWorld;
  status: ListStatus;
  population: number;
  noun?: string;
  pendingIds?: ReadonlySet<string>;
  rejections?: Readonly<Record<string, string>>;
  secondHeader?: string;
  secondCell?: (item: ItemRowModel) => ReactNode;
}

/** The list body. */
export function ItemsBody({ browser, world, status, population, ...rest }: ItemsBodyProps) {
  const noun = rest.noun ?? 'items';
  if (status === 'loading') return <ListSkeleton label={`Loading ${noun}`} />;
  if (status === 'error') return <ListError noun={noun} />;
  if (population === 0) return <EmptyInventory noun={noun} />;
  if (browser.rows.length === 0)
    return <EmptyFiltered noun={noun} onClear={browser.clearFilters} />;
  if (browser.view === 'cards') {
    return (
      <ItemsCards
        rows={browser.rows}
        total={browser.total}
        world={world}
        selection={browser.selection}
      />
    );
  }
  return (
    <ItemsTable
      label={noun}
      rows={browser.rows}
      total={browser.total}
      world={world}
      selection={browser.selection}
      density={browser.view === 'compact' ? 'compact' : 'default'}
      sort={browser.filters.sort}
      onSort={(sort) => browser.setFilters({ sort })}
      pendingIds={rest.pendingIds}
      rejections={rest.rejections}
      secondHeader={rest.secondHeader}
      secondCell={rest.secondCell}
    />
  );
}
