import { ExactCodeRow } from './exact-code-row.js';
import { useInfiniteSentinel } from './infinite-sentinel.js';
import { ItemResultRow, PlaceResultRow, ResultSectionHeading } from './result-rows.js';
import { searchResultDomId } from './search-model.js';

import type { KeyboardEvent } from 'react';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SearchItemHit, WebSearchResults } from '../../inventory-web/useWebSearch.js';

/** Props for the inventory listbox and its infinite-scroll sentinel. */
export interface ResultsListProps {
  readonly query: string;
  readonly results: WebSearchResults;
  readonly world: PlacementWorld;
  readonly activeId: string | null;
  readonly checkedIds: ReadonlySet<string>;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly onActivate: (id: string) => void;
  readonly onOpen: (id: string) => void;
  readonly onToggle: (id: string, shiftKey: boolean) => void;
  readonly onPickUp: (id: string) => void;
  readonly onPutBack: (id: string) => void;
  readonly onMove: (id: string) => void;
  readonly onFetchNextPage: () => void;
}

interface ItemSectionProps extends Omit<ResultsListProps, 'results'> {
  readonly title: string;
  readonly hits: readonly SearchItemHit[];
}

function ItemSection({ title, hits, ...props }: ItemSectionProps) {
  if (hits.length === 0) return null;
  return (
    <section aria-label={title}>
      <ResultSectionHeading title={title} count={hits.length} />
      {hits.map((hit) => (
        <ItemResultRow
          key={hit.item.id}
          hit={hit}
          query={props.query}
          world={props.world}
          active={props.activeId === hit.item.id}
          checked={props.checkedIds.has(hit.item.id)}
          onActivate={() => props.onActivate(hit.item.id)}
          onToggle={(shiftKey) => props.onToggle(hit.item.id, shiftKey)}
          onOpen={() => props.onOpen(hit.item.id)}
          onPickUp={() => props.onPickUp(hit.item.id)}
          onPutBack={() => props.onPutBack(hit.item.id)}
          onMove={() => props.onMove(hit.item.id)}
        />
      ))}
    </section>
  );
}

function activeKind(results: WebSearchResults, activeId: string | null): string {
  return results.places.some((hit) => hit.place.id === activeId) ? 'place' : 'item';
}

function SearchResultFooter({ isFetching }: { readonly isFetching: boolean }) {
  if (!isFetching) return null;
  return (
    <p role="status" className="px-3 py-2 text-center text-xs text-muted-foreground">
      Loading more results…
    </p>
  );
}

/** Renders inventory results with exact-code treatment, ranked sections, and a sentinel. */
export function ResultsList(props: ResultsListProps) {
  const sentinel = useInfiniteSentinel(
    props.hasNextPage,
    props.isFetchingNextPage,
    props.onFetchNextPage
  );
  const rankedItems = props.results.items.filter((hit) => hit.tier !== 'other');
  const otherItems = props.results.items.filter((hit) => hit.tier === 'other');
  return (
    <div
      role="listbox"
      aria-label="Inventory search results"
      aria-multiselectable="true"
      aria-activedescendant={
        props.activeId === null
          ? undefined
          : searchResultDomId(activeKind(props.results, props.activeId), props.activeId)
      }
      tabIndex={0}
      onKeyDown={props.onKeyDown}
      className="min-h-0 flex-1 overflow-auto rounded-xl border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {props.results.exact !== null ? (
        <section aria-label="Exact code" className="border-b bg-app-accent/5">
          <ResultSectionHeading title="Exact code" count={1} />
          <ExactCodeRow
            item={props.results.exact}
            query={props.query}
            world={props.world}
            active={props.activeId === props.results.exact.id}
            checked={props.checkedIds.has(props.results.exact.id)}
            onActivate={() => props.onActivate(props.results.exact?.id ?? '')}
            onOpen={() => props.onOpen(props.results.exact?.id ?? '')}
            onToggle={(shiftKey) => props.onToggle(props.results.exact?.id ?? '', shiftKey)}
          />
        </section>
      ) : null}
      <ItemSection title="Items and containers" hits={rankedItems} {...props} />
      {props.results.places.length > 0 ? (
        <section aria-label="Places">
          <ResultSectionHeading title="Places" count={props.results.places.length} />
          {props.results.places.map((hit) => (
            <PlaceResultRow
              key={hit.place.id}
              hit={hit}
              query={props.query}
              active={props.activeId === hit.place.id}
              onActivate={() => props.onActivate(hit.place.id)}
              onOpen={() => props.onOpen(hit.place.id)}
            />
          ))}
        </section>
      ) : null}
      <ItemSection title="Found by code, note, type or place" hits={otherItems} {...props} />
      <div ref={sentinel} data-testid="search-infinite-sentinel" aria-hidden className="h-2" />
      <SearchResultFooter isFetching={props.isFetchingNextPage} />
    </div>
  );
}
