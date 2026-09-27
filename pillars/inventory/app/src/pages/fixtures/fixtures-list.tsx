import { Search } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Button, Select, TextInput, cn } from '@pops/ui';

import { ListBody } from '../../foundation/list-page/list-states.js';
import { FIXTURE_KIND_ORDER, FIXTURE_KINDS } from './fixture-kinds.js';
import { FixtureListRow as FixtureListRowComponent } from './fixture-list-row.js';
import { isFixtureFiltered } from './fixture-model.js';
import {
  FixturesEmpty,
  FixturesEmptyFiltered,
  FixturesError,
  FixturesLoading,
} from './fixture-states.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { FixtureKind } from './fixture-kinds.js';
import type { FixtureFilter, FixtureListRow as FixtureListRowModel } from './fixture-model.js';

/** Props for the server-backed fixture list body and toolbar. */
export interface FixturesListProps {
  readonly rows: readonly FixtureListRowModel[];
  readonly total: number | null;
  readonly filter: FixtureFilter;
  readonly locations: readonly LocationModel[];
  readonly status: 'pending' | 'error' | 'success';
  readonly hasNextPage: boolean;
  readonly onLoadMore: () => void;
  readonly onFilterChange: (patch: Partial<FixtureFilter>) => void;
  readonly onClearFilters: () => void;
  readonly onOpen: (id: string) => void;
  readonly onEdit: (row: FixtureListRowModel) => void;
  readonly onNew: () => void;
  readonly onRetry: () => void;
}

const KIND_OPTIONS = [
  { value: '', label: 'Every kind' },
  ...FIXTURE_KIND_ORDER.map((kind) => ({ value: kind, label: FIXTURE_KINDS[kind].label })),
];

function isKind(value: string): value is FixtureKind {
  return FIXTURE_KIND_ORDER.some((kind) => kind === value);
}

function FixtureToolbar({ props }: { props: FixturesListProps }): ReactElement {
  const shown = props.total === null ? '' : `${props.rows.length} of ${props.total} fixtures`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-56 flex-1 sm:max-w-sm">
        <TextInput
          size="sm"
          value={props.filter.q}
          maxLength={200}
          placeholder="Filter by fixture or wired item"
          aria-label="Filter fixtures"
          prefix={<Search className="size-4" aria-hidden />}
          clearable
          onClear={() => props.onFilterChange({ q: '' })}
          onChange={(event) => props.onFilterChange({ q: event.target.value })}
        />
      </div>
      <Select
        size="sm"
        aria-label="Fixture kind"
        value={props.filter.kind ?? ''}
        options={KIND_OPTIONS}
        containerClassName="w-44 shrink-0"
        onChange={(event) =>
          props.onFilterChange({ kind: isKind(event.target.value) ? event.target.value : null })
        }
      />
      <p
        aria-live="polite"
        className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground"
      >
        {shown}
      </p>
    </div>
  );
}

function LoadMore({ onLoadMore }: { onLoadMore: () => void }): ReactElement {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);
  useEffect(() => {
    loadedRef.current = false;
    const sentinel = sentinelRef.current;
    if (sentinel === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || loadedRef.current) return;
      loadedRef.current = true;
      onLoadMore();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore]);

  return (
    <div
      ref={sentinelRef}
      className="flex justify-center border-t p-2"
      data-testid="fixtures-load-more"
    >
      <Button variant="ghost" size="sm" onClick={onLoadMore}>
        Load more fixtures
      </Button>
    </div>
  );
}

function FixtureTable({ props }: { props: FixturesListProps }): ReactElement {
  const locations = new Map(props.locations.map((location) => [location.id, location] as const));
  return (
    <ListBody>
      <div className="@container overflow-hidden rounded-lg border bg-card">
        <div
          role="row"
          className={cn(
            'grid h-10 items-center gap-3 border-b px-3 text-xs font-medium text-muted-foreground',
            'grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_1.5rem] @3xl:grid-cols-[minmax(0,1.3fr)_9rem_9rem_minmax(0,1.6fr)_1.5rem]'
          )}
        >
          <span>Fixture</span>
          <span className="hidden @3xl:block">Kind</span>
          <span className="hidden @3xl:block">Room</span>
          <span>Wired</span>
          <span aria-hidden />
        </div>
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
        {props.hasNextPage ? <LoadMore onLoadMore={props.onLoadMore} /> : null}
      </div>
    </ListBody>
  );
}

/** Renders loading, error, empty, filtered-empty, and server-paged fixture rows. */
export function FixturesList(props: FixturesListProps): ReactElement {
  if (props.status === 'pending') return <FixturesLoading />;
  if (props.status === 'error') return <FixturesError onRetry={props.onRetry} />;
  if (props.total === 0 && !isFixtureFiltered(props.filter))
    return <FixturesEmpty onNew={props.onNew} />;
  if (props.total === 0) return <FixturesEmptyFiltered onClear={props.onClearFilters} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <FixtureToolbar props={props} />
      <FixtureTable props={props} />
    </div>
  );
}
