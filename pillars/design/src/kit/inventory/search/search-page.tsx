/**
 * `/inventory/search`: full search in a split view (spec 3.7). Results on
 * the left, walked with the keyboard; the active result previewed on the
 * right; item results selectable for the shared bulk bar (Pick up, Move,
 * Print labels). Below 1024px the preview becomes a sheet (spec 3.10).
 */
import { Search } from 'lucide-react';

import { KeyCombo, SheetPanel } from '../foundation';
import { PageOverlay } from '../items-list/page-overlay';
import { itemSelectionActions } from '../items-list/selection-actions';
import { SelectionDock } from '../items-list/selection-dock';
import { InventoryPage } from '../shared/page-frame';
import { ActivePreview } from './active-preview';
import { RecentsList } from './recents-list';
import { PurchaseList, ResultsList } from './results-list';
import { SearchBar } from './search-bar';
import { SearchEmpty } from './search-empty';
import { useSearchPage } from './use-search-page';

import type { PaletteCommand, PlacementWorld } from '../foundation';
import type { PurchaseResult } from './purchase-model';
import type { SearchOption } from './search-bar';
import type { SearchPageState, SearchSeed } from './use-search-page';

/** Props for {@link SearchPage}. */
export interface SearchPageProps {
  world: PlacementWorld;
  purchases: readonly PurchaseResult[];
  types: readonly SearchOption[];
  places: readonly SearchOption[];
  recentQueries: readonly string[];
  recentRecords: readonly PaletteCommand[];
  seed?: SearchSeed;
  /** Tablet: one pane, the preview opened as a sheet. */
  narrow?: boolean;
}

function KeyHints() {
  const hint = (sequence: string[], text: string) => (
    <span className="inline-flex items-center gap-1">
      <KeyCombo sequence={sequence} /> {text}
    </span>
  );
  return (
    <p className="flex items-center gap-4 text-2xs text-muted-foreground">
      {hint(['ArrowDown'], 'next')}
      {hint(['x'], 'select')}
      {hint(['Enter'], 'open')}
      {hint(['p'], 'pick up')}
      {hint(['m'], 'move')}
      {hint(['/'], 'back to the query')}
    </p>
  );
}

function SearchList({ page, props }: { page: SearchPageState; props: SearchPageProps }) {
  const typed = page.query.trim() !== '';
  if (!typed) return <RecentsList queries={props.recentQueries} records={props.recentRecords} />;
  if (page.counts[page.scope] === 0) return <SearchEmpty page={page} world={props.world} />;
  if (page.scope === 'purchases') {
    return <PurchaseList query={page.query} purchases={page.purchases} activeId={page.activeId} />;
  }
  return (
    <ResultsList
      query={page.query}
      results={page.results}
      world={props.world}
      activeId={page.activeId}
      selection={page.selection}
    />
  );
}

function SearchSplit({ page, props }: { page: SearchPageState; props: SearchPageProps }) {
  const typed = page.query.trim() !== '';
  const single = props.narrow === true || (typed && page.counts[page.scope] === 0);
  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-card"
      onKeyDown={(event) => {
        if (page.onKey(event)) event.preventDefault();
      }}
    >
      <div
        className={single ? 'flex min-w-0 flex-1 flex-col' : 'flex w-md shrink-0 flex-col border-r'}
      >
        <SearchList page={page} props={props} />
      </div>
      {single ? null : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background/40">
          {typed ? (
            <ActivePreview page={page} world={props.world} purchases={props.purchases} />
          ) : (
            <PreviewHint />
          )}
        </div>
      )}
    </div>
  );
}

function NarrowPreview({ page, props }: { page: SearchPageState; props: SearchPageProps }) {
  if (props.narrow !== true || page.query.trim() === '' || page.counts[page.scope] === 0)
    return null;
  return (
    <PageOverlay align="right">
      <SheetPanel title="Preview" className="rounded-none rounded-l-xl">
        <ActivePreview page={page} world={props.world} purchases={props.purchases} />
      </SheetPanel>
    </PageOverlay>
  );
}

/** The search page. */
export function SearchPage(props: SearchPageProps) {
  const { world } = props;
  const page = useSearchPage(world, props.purchases, props.seed);
  return (
    <InventoryPage
      title="Search"
      icon={Search}
      actions={<KeyHints />}
      toolbar={
        <SearchBar
          query={page.query}
          scope={page.scope}
          counts={page.counts}
          filters={page.filters}
          types={props.types}
          places={props.places}
          onQuery={page.setQuery}
          onScope={page.setScope}
          onFilters={page.setFilters}
        />
      }
      dock={
        <SelectionDock
          world={world}
          selection={page.selection}
          loadedCount={page.results.items.length}
          actions={itemSelectionActions(world, page.selection.selectedIds)}
        />
      }
      overlay={<NarrowPreview page={page} props={props} />}
    >
      <SearchSplit page={page} props={props} />
    </InventoryPage>
  );
}

function PreviewHint() {
  return (
    <p className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
      Type a name, a code or a place. The first result previews here.
    </p>
  );
}
