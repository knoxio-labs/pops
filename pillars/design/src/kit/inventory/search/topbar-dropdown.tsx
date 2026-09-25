/**
 * The TopBar search box, focused, and its dropdown: up to eight results in
 * the results page's order, the scope chips, and the one line that says
 * Enter opens every result. Before anything is typed it lists recent
 * queries and records. It finds; the palette (Cmd-K) acts.
 */
import { ArrowRight } from 'lucide-react';

import { KeyCombo } from '../foundation';
import { ScopeChip } from './search-bar';
import { typeaheadRows } from './search-model';
import { PurchaseRow, Recents, ResultRow } from './topbar-rows';

import type { PaletteCommand, PlacementWorld } from '../foundation';
import type { PurchaseResult } from './purchase-model';
import type { SearchScope } from './search-bar';
import type { InventoryResults } from './search-model';

/** Props for {@link TopbarDropdown}. */
export interface TopbarDropdownProps {
  query: string;
  scope: SearchScope;
  world: PlacementWorld;
  results: InventoryResults;
  purchases: readonly PurchaseResult[];
  recentQueries: readonly string[];
  recentRecords: readonly PaletteCommand[];
  total: Readonly<Record<SearchScope, number>>;
}

function Footer({ scope, total, typed }: { scope: SearchScope; total: number; typed: boolean }) {
  return (
    <footer className="flex items-center gap-4 border-t px-3 py-2 text-2xs text-muted-foreground">
      {typed && total > 0 ? (
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <KeyCombo sequence={['Enter']} /> All {total} results in{' '}
          {scope === 'inventory' ? 'Inventory' : 'Purchases'}
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

function Scopes({
  scope,
  total,
}: {
  scope: SearchScope;
  total: Readonly<Record<SearchScope, number>>;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Search in"
      className="flex items-center gap-0.5 border-b bg-muted/60 p-1"
    >
      <ScopeChip
        id="inventory"
        label="Inventory"
        count={total.inventory}
        active={scope === 'inventory'}
      />
      <ScopeChip
        id="purchases"
        label="Purchases"
        count={total.purchases}
        active={scope === 'purchases'}
      />
    </div>
  );
}

function NoMatch({
  query,
  scope,
  total,
}: {
  query: string;
  scope: SearchScope;
  total: Readonly<Record<SearchScope, number>>;
}) {
  const other: SearchScope = scope === 'inventory' ? 'purchases' : 'inventory';
  return (
    <div className="px-3 py-5 text-center text-sm">
      <p className="font-medium">{`Nothing in ${scope === 'inventory' ? 'Inventory' : 'Purchases'} matches “${query.trim()}”`}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {total[other] > 0
          ? `${String(total[other])} in ${other === 'inventory' ? 'Inventory' : 'Purchases'}. Tab switches.`
          : 'Names, codes, notes, types and places were searched.'}
      </p>
    </div>
  );
}

/** The dropdown's list and footer. */
export function TopbarDropdown(props: TopbarDropdownProps) {
  const { query, scope, world } = props;
  const typed = query.trim() !== '';
  const rows = typeaheadRows(props.results);
  return (
    <div className="overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
      {typed ? <Scopes scope={scope} total={props.total} /> : null}
      <div role="listbox" aria-label="Search results" className="p-1.5">
        {typed && props.total[scope] === 0 ? (
          <NoMatch query={query} scope={scope} total={props.total} />
        ) : null}
        {!typed ? <Recents queries={props.recentQueries} records={props.recentRecords} /> : null}
        {typed && scope === 'inventory'
          ? rows.map((row, index) => (
              <ResultRow
                key={row.kind === 'place' ? row.place.id : row.hit.item.id}
                row={row}
                query={query.trim()}
                world={world}
                active={index === 0}
              />
            ))
          : null}
        {typed && scope === 'purchases'
          ? props.purchases
              .slice(0, 8)
              .map((purchase, index) => (
                <PurchaseRow key={purchase.id} purchase={purchase} active={index === 0} />
              ))
          : null}
      </div>
      <Footer scope={scope} total={props.total[scope]} typed={typed} />
    </div>
  );
}
