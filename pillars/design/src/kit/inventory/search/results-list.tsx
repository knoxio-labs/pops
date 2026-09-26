/**
 * The left half of the search page: the pinned code match, then Items and
 * containers, then Places (or Purchases in that scope), each headed with
 * its count. Arrow keys and j/k walk every row in order; the active row
 * drives the preview.
 */
import { Button, cn } from '@pops/ui';

import { CodeBadge, INVENTORY_ICONS, ShortcutHint, locationPath } from '../foundation';
import { PurchaseResultRow } from './purchase-result-row';
import { ItemResultRow, PlaceResultRow, ResultHeading } from './result-rows';
import { splitHits } from './search-model';

import type { ReactNode } from 'react';

import type { ItemRowModel, PlacementWorld, SelectionApi } from '../foundation';
import type { PurchaseResult } from './purchase-model';
import type { InventoryResults, ItemHit } from './search-model';

/** Props for {@link ResultsList}. */
export interface ResultsListProps {
  query: string;
  results: InventoryResults;
  world: PlacementWorld;
  activeId: string | null;
  selection: SelectionApi;
}

/** Where a place sits, parents only. */
export function parentPath(world: PlacementWorld, id: string): string {
  return locationPath(world, id)
    .slice(0, -1)
    .map((node) => node.name)
    .join(' › ');
}

/** How many items sit directly in a place. */
export function directlyAt(world: PlacementWorld, locationId: string): number {
  return [...world.items.values()].filter(
    (item) => item.placement.kind === 'location' && item.placement.locationId === locationId
  ).length;
}

function ExactCode({ item, active }: { item: ItemRowModel; active: boolean }) {
  const Icon = item.container === null ? INVENTORY_ICONS.item : INVENTORY_ICONS.container;
  return (
    <>
      <div
        role="option"
        aria-selected={active}
        aria-label={`Code ${item.code ?? ''} is ${item.name}`}
        className={cn(
          'm-2 flex items-center gap-3 rounded-lg border px-3 py-2.5',
          active ? 'border-app-accent bg-app-accent/10' : 'border-app-accent/40 bg-app-accent/5'
        )}
      >
        <Icon className="size-5 text-app-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold tracking-label text-muted-foreground uppercase">
            Exact code
          </p>
          <p className="flex items-center gap-2 text-sm font-medium">
            <CodeBadge code={item.code} /> {item.name}
          </p>
        </div>
        <Button size="sm" suffix={<ShortcutHint id="list-open" />}>
          Open
        </Button>
      </div>
      <p className="px-3 pb-2 text-xs text-muted-foreground">
        Codes are unique, so a whole code finds one item. A link ending in ?code= opens it directly.
      </p>
    </>
  );
}

function listWrap(children: ReactNode) {
  return (
    <div
      role="listbox"
      aria-label="Search results"
      aria-multiselectable
      tabIndex={0}
      className="relative min-h-0 flex-1 overflow-y-auto outline-none"
    >
      {children}
    </div>
  );
}

function ItemSection({
  title,
  hits,
  query,
  world,
  activeId,
  selection,
}: ResultsListProps & { title: string; hits: readonly ItemHit[] }) {
  if (hits.length === 0) return null;
  return (
    <section>
      <ResultHeading title={title} count={hits.length} />
      <div className="divide-y divide-border/60">
        {hits.map((hit) => (
          <ItemResultRow
            key={hit.item.id}
            hit={hit}
            query={query}
            world={world}
            active={activeId === hit.item.id}
            selected={selection.isSelected(hit.item.id)}
            onToggle={selection.onRowToggle}
          />
        ))}
      </div>
    </section>
  );
}

/** Inventory results. */
export function ResultsList(props: ResultsListProps) {
  const { query, results, world, activeId } = props;
  const { byName, elsewhere } = splitHits(results.items);
  return listWrap(
    <>
      {results.exact ? (
        <ExactCode item={results.exact} active={activeId === results.exact.id} />
      ) : null}
      <ItemSection title="Items and containers" hits={byName} {...props} />
      {results.places.length > 0 ? (
        <section>
          <ResultHeading title="Places" count={results.places.length} />
          <div className="divide-y divide-border/60">
            {results.places.map((hit) => (
              <PlaceResultRow
                key={hit.place.id}
                hit={hit}
                query={query}
                path={parentPath(world, hit.place.id)}
                holds={directlyAt(world, hit.place.id)}
                active={activeId === hit.place.id}
              />
            ))}
          </div>
        </section>
      ) : null}
      <ItemSection title="Found by code, note, type or place" hits={elsewhere} {...props} />
    </>
  );
}

/** Purchases results. */
export function PurchaseList({
  query,
  purchases,
  activeId,
}: {
  query: string;
  purchases: readonly PurchaseResult[];
  activeId: string | null;
}) {
  return listWrap(
    <section>
      <ResultHeading title="Purchases" count={purchases.length} />
      <div className="divide-y divide-border/60">
        {purchases.map((purchase) => (
          <PurchaseResultRow
            key={purchase.id}
            purchase={purchase}
            query={query}
            active={activeId === purchase.id}
          />
        ))}
      </div>
    </section>
  );
}
