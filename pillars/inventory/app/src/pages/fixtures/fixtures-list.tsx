import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { Select, TextInput, cn } from '@pops/ui';

import { ListBody } from '../../foundation/list-page/list-states.js';
import { isFiltered } from './fixture-filter.js';
import { FIXTURE_KIND_ORDER, FIXTURE_KINDS } from './fixture-kinds.js';
import { FixtureListRow as FixtureListRowComponent } from './fixture-list-row.js';
import {
  FixturesEmpty,
  FixturesEmptyFiltered,
  FixturesError,
  FixturesLoading,
} from './fixture-states.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { FixtureFilter } from './fixture-filter.js';
import type { FixtureKind } from './fixture-kinds.js';
import type { FixtureListRow as FixtureListRowModel } from './fixture-model.js';

/** Props for the server-backed fixture list body and toolbar. */
export interface FixturesListProps {
  readonly rows: readonly FixtureListRowModel[];
  readonly total: number | null;
  readonly unfilteredTotal: number | null;
  readonly queryDraft: string;
  readonly filter: FixtureFilter;
  readonly locations: readonly LocationModel[];
  readonly status: 'pending' | 'error' | 'success';
  readonly hasLoaded: boolean;
  readonly hasNextPage: boolean;
  readonly onLoadMore: () => void;
  readonly onFilterChange: (patch: Partial<{ query: string; kind: FixtureKind | 'all' }>) => void;
  readonly onClearFilters: () => void;
  readonly onOpen: (id: string) => void;
  readonly onEdit: (row: FixtureListRowModel) => void;
  readonly onNew: () => void;
  readonly onRetry: () => void;
}

const KIND_OPTIONS = [
  { value: 'all', label: 'Every kind' },
  ...FIXTURE_KIND_ORDER.map((kind) => ({ value: kind, label: FIXTURE_KINDS[kind].label })),
];

function isKind(value: string): value is FixtureKind {
  return FIXTURE_KIND_ORDER.some((kind) => kind === value);
}

function fixtureCount(props: FixturesListProps): string | null {
  if (props.total === null || props.unfilteredTotal === null) return null;
  if (isFiltered(props.filter)) return `${props.total} of ${props.unfilteredTotal} fixtures`;
  return `${props.unfilteredTotal} fixtures`;
}

function FixtureToolbar({ props }: { props: FixturesListProps }): ReactElement {
  const count = fixtureCount(props);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-56 flex-1 sm:max-w-sm">
        <TextInput
          size="sm"
          value={props.queryDraft}
          maxLength={200}
          placeholder="Filter by fixture or wired item"
          aria-label="Filter by fixture or wired item"
          prefix={<Search className="size-4" aria-hidden />}
          clearable
          onClear={props.onClearFilters}
          onChange={(event) => props.onFilterChange({ query: event.target.value })}
        />
      </div>
      <Select
        size="sm"
        aria-label="Kind"
        value={props.filter.kind}
        options={KIND_OPTIONS}
        containerClassName="w-44 shrink-0"
        onChange={(event) =>
          props.onFilterChange({
            kind: isKind(event.target.value) ? event.target.value : 'all',
          })
        }
      />
      {count === null ? null : (
        <p
          aria-live="polite"
          className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground"
        >
          {count}
        </p>
      )}
    </div>
  );
}

function LoadMore({ rowCount, onLoadMore }: { rowCount: number; onLoadMore: () => void }) {
  const fetchNextPageRef = useRef(onLoadMore);
  useEffect(() => {
    fetchNextPageRef.current = onLoadMore;
  });
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (node === null || typeof IntersectionObserver === 'undefined') return;
    let requested = false;
    const observer = new IntersectionObserver((entries) => {
      if (requested || !entries.some((entry) => entry.isIntersecting)) return;
      requested = true;
      observer.disconnect();
      fetchNextPageRef.current();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <div key={rowCount} ref={sentinelRef} aria-hidden className="h-px" />;
}

function FixtureTableBody({ props }: { props: FixturesListProps }): ReactElement {
  if (props.status === 'pending') return <FixturesLoading />;
  if (props.status === 'error') return <FixturesError onRetry={props.onRetry} />;
  if (props.unfilteredTotal === 0) return <FixturesEmpty onNew={props.onNew} />;
  if (props.rows.length === 0 && isFiltered(props.filter)) {
    return <FixturesEmptyFiltered onClear={props.onClearFilters} />;
  }
  const locations = new Map(props.locations.map((location) => [location.id, location] as const));
  return (
    <ListBody>
      <div role="grid" aria-label="Fixtures" className="divide-y divide-border/60">
        {props.rows.map((row) => (
          <FixtureListRowComponent
            key={row.id}
            row={row}
            locations={locations}
            onOpen={props.onOpen}
            onEdit={props.onEdit}
          />
        ))}
      </div>
      {props.hasNextPage ? (
        <LoadMore rowCount={props.rows.length} onLoadMore={props.onLoadMore} />
      ) : null}
    </ListBody>
  );
}

function FixtureTable({ props }: { props: FixturesListProps }): ReactElement {
  const grid = cn(
    'grid h-10 items-center gap-3 border-b px-3 text-xs font-medium text-muted-foreground',
    'grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_1.5rem] @3xl:grid-cols-[minmax(0,1.3fr)_9rem_9rem_minmax(0,1.6fr)_1.5rem]'
  );
  return (
    <div className="@container min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
      <div role="row" className={grid}>
        <span>Fixture</span>
        <span className="hidden @3xl:block">Kind</span>
        <span className="hidden @3xl:block">Room</span>
        <span>Wired</span>
        <span aria-hidden />
      </div>
      <FixtureTableBody props={props} />
    </div>
  );
}

/** Renders the fixture toolbar and server-paged list in every loaded state. */
export function FixturesList(props: FixturesListProps): ReactElement {
  if (!props.hasLoaded && props.status === 'pending') return <FixturesLoading />;
  if (!props.hasLoaded && props.status === 'error')
    return <FixturesError onRetry={props.onRetry} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <FixtureToolbar props={props} />
      <FixtureTable props={props} />
    </div>
  );
}
