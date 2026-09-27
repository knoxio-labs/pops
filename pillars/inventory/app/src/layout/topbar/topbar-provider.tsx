import { ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { KeyCombo } from '@pops/ui';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { useRecents } from '../../inventory-web/recents.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { usePurchasesSearch } from '../../inventory-web/usePurchasesSearch.js';
import { useWebSearch } from '../../inventory-web/useWebSearch.js';
import { type SearchScope } from '../../pages/search/search-model.js';
import { itemRecordCommand, locationRecordCommand } from '../palette/palette-commands.js';
import { TopbarDropdown } from './topbar-dropdown.js';

import type { ReactElement } from 'react';

import type { SearchDropdownProps } from '@pops/navigation';
import type { PaletteCommand } from '@pops/ui';

import type { PickerSubject } from '../../foundation/model/contracts.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { RecentRecord } from '../../inventory-web/recents.js';
import type { WebSearchResults } from '../../inventory-web/useWebSearch.js';
import type { TypeaheadRow } from './topbar-rows.js';

/** The placeholder shown by the inventory TopBar search. */
export const TOPBAR_PLACEHOLDER = 'Name, code, note, type or place';

function typeaheadRows(results: WebSearchResults, limit = 8): TypeaheadRow[] {
  const exact: TypeaheadRow[] =
    results.exact === null
      ? []
      : [
          {
            kind: 'item',
            hit: { kind: 'item', item: results.exact, tier: 'prefix', field: 'code' },
            exact: true,
          },
        ];
  return [
    ...exact,
    ...results.items
      .filter((hit) => hit.tier !== 'other')
      .map((hit): TypeaheadRow => ({ kind: 'item', hit, exact: false })),
    ...results.places,
    ...results.items
      .filter((hit) => hit.tier === 'other')
      .map((hit): TypeaheadRow => ({ kind: 'item', hit, exact: false })),
  ].slice(0, limit);
}

function recordId(kind: 'item' | 'place', id: string): string {
  return `${kind}:${id}`;
}

function recentRecordEntries(
  records: readonly RecentRecord[],
  world: PlacementWorld
): PaletteCommand[] {
  return records.flatMap((record) => {
    if (record.kind === 'item') {
      const item = world.items.get(record.id);
      return item === undefined
        ? []
        : [{ ...itemRecordCommand(item, world, 'recents'), id: recordId('item', item.id) }];
    }
    const location = world.locations.get(record.id);
    return location === undefined
      ? []
      : [
          {
            ...locationRecordCommand(location, world, 'recents'),
            id: recordId('place', location.id),
          },
        ];
  });
}

function mergeWorld(
  base: PlacementWorld,
  results: Pick<WebSearchResults, 'exact' | 'items'>
): PlacementWorld {
  const items = new Map(base.items);
  if (results.exact !== null) items.set(results.exact.id, results.exact);
  for (const hit of results.items) items.set(hit.item.id, hit.item);
  return buildWorld([...items.values()], [...base.locations.values()]);
}

function scopeLabel(scope: SearchScope): string {
  return scope === 'inventory' ? 'Inventory' : 'Purchases';
}

function NoMatch({
  query,
  scope,
  totals,
}: {
  readonly query: string;
  readonly scope: SearchScope;
  readonly totals: Readonly<Record<SearchScope, number>>;
}): ReactElement {
  const other: SearchScope = scope === 'inventory' ? 'purchases' : 'inventory';
  return (
    <div className="px-3 py-5 text-center text-sm">
      <p className="font-medium">{`Nothing in ${scopeLabel(scope)} matches “${query.trim()}”`}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {totals[other] > 0
          ? `${String(totals[other])} in ${scopeLabel(other)}. Tab switches.`
          : 'Names, codes, notes, types and places were searched.'}
      </p>
    </div>
  );
}

function Footer({
  scope,
  total,
  typed,
}: {
  scope: SearchScope;
  total: number;
  typed: boolean;
}): ReactElement {
  return (
    <footer className="flex items-center gap-4 border-t px-3 py-2 text-2xs text-muted-foreground">
      {typed && total > 0 ? (
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <KeyCombo sequence={['Enter']} /> All {total} results in {scopeLabel(scope)}
          <ArrowRight className="size-3" aria-hidden />
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1">
        <KeyCombo sequence={['Tab']} /> switch scope
      </span>
      <span className="ml-auto inline-flex items-center gap-1">
        <KeyCombo sequence={['Mod+k']} /> run a command
      </span>
    </footer>
  );
}

function recentItemIds(records: readonly RecentRecord[]): string[] {
  return records.filter((record) => record.kind === 'item').map((record) => record.id);
}

/** Renders the inventory-owned dropdown below the shared TopBar search input. */
export function InventoryTopbarDropdown(props: SearchDropdownProps): ReactElement {
  const recents = useRecents();
  const inventory = useWebSearch({ q: props.query, limit: 8 });
  const purchases = usePurchasesSearch(props.query);
  const recentIds = useMemo(() => recentItemIds(recents.records), [recents.records]);
  const subject = useMemo<PickerSubject>(() => ({ kind: 'items', ids: recentIds }), [recentIds]);
  const placement = usePlacementSources(subject);
  const world = useMemo(
    () => mergeWorld(placement.world, inventory.results),
    [inventory.results, placement.world]
  );
  const rows = useMemo(() => typeaheadRows(inventory.results), [inventory.results]);
  const recentRecords = useMemo(
    () => recentRecordEntries(recents.records, world),
    [recents.records, world]
  );
  const [scope, setScope] = useState<SearchScope>('inventory');
  const recentQueries = useMemo(() => recents.queries.slice(0, 3), [recents.queries]);
  const totals = useMemo(
    () => ({ inventory: inventory.results.total, purchases: purchases.hits.length }),
    [inventory.results.total, purchases.hits.length]
  );
  const typed = props.query.trim() !== '';
  const total = totals[scope];
  const status = scope === 'inventory' ? inventory.status : purchases.status;
  const onScope = (nextScope: SearchScope): void => setScope(nextScope);
  return (
    <TopbarDropdown
      key={`${props.query}\u0000${scope}`}
      {...props}
      scope={scope}
      rows={rows}
      purchases={purchases.hits}
      recentQueries={recentQueries}
      recentRecords={recentRecords}
      world={world}
      totals={totals}
      onScope={onScope}
      emptyState={
        typed && status === 'success' && total === 0 ? (
          <NoMatch query={props.query} scope={scope} totals={totals} />
        ) : null
      }
      footer={<Footer scope={scope} total={total} typed={typed} />}
    />
  );
}
