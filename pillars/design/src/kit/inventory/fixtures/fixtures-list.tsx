import {
  ColumnHeader,
  EmptyBody,
  FilterField,
  NoMatchBody,
  ScrollPanel,
} from '@/kit/inventory/secondary-page';
/**
 * The fixtures tab: every house fixture as a row with its kind, room and
 * what is wired to it (the first two by name, then a count). A fixture with
 * nothing wired says so in words. Rows open the fixture's page.
 */
import { ChevronRight, Plug } from 'lucide-react';

import { Button, ButtonPrimitive, Select, cn } from '@pops/ui';

import { FIXTURE_KIND_ORDER, FIXTURE_KINDS, FixtureMark } from './fixture-kinds';

import type { PlacementWorld } from '@/kit/inventory/foundation';

import type { FixtureFilter, FixtureKind, FixtureRow } from './fixture-model';

const GRID =
  'grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_1.5rem] @3xl:grid-cols-[minmax(0,1.3fr)_9rem_8rem_minmax(0,1.6fr)_1.5rem]';

function wiredSummary(row: FixtureRow): string {
  const names = row.wired.map((item) => item.name);
  if (names.length === 0) return 'Nothing wired';
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

function FixtureListRow({
  row,
  world,
  onOpen,
}: {
  row: FixtureRow;
  world: PlacementWorld;
  onOpen?: (id: string) => void;
}) {
  const { fixture } = row;
  return (
    <ButtonPrimitive
      variant="ghost"
      role="row"
      aria-label={`Open ${fixture.name}`}
      onClick={() => onOpen?.(fixture.id)}
      className={cn(
        'grid h-12 w-full items-center gap-3 rounded-none px-3 text-left font-normal',
        GRID
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <FixtureMark kind={fixture.kind} />
        <span className="truncate text-sm font-medium">{fixture.name}</span>
      </span>
      <span className="hidden truncate text-xs text-muted-foreground @3xl:block">
        {FIXTURE_KINDS[fixture.kind].label}
      </span>
      <span className="hidden truncate text-xs text-muted-foreground @3xl:block">
        {world.locations.get(fixture.locationId)?.name}
      </span>
      <span
        className={cn(
          'flex min-w-0 items-center gap-2 text-sm',
          row.wired.length === 0 && 'text-muted-foreground'
        )}
      >
        {row.wired.length > 0 ? (
          <span className="shrink-0 rounded-md bg-muted px-1.5 text-xs tabular-nums">
            {row.wired.length}
          </span>
        ) : null}
        <span className="truncate">{wiredSummary(row)}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </ButtonPrimitive>
  );
}

/** Props for {@link FixturesList}. */
export interface FixturesListProps {
  rows: readonly FixtureRow[];
  total: number;
  filter: FixtureFilter;
  world: PlacementWorld;
  onFilterChange?: (filter: FixtureFilter) => void;
  onOpen?: (id: string) => void;
  onNew?: () => void;
}

const KIND_OPTIONS = [
  { value: 'all', label: 'Every kind' },
  ...FIXTURE_KIND_ORDER.map((kind) => ({ value: kind, label: FIXTURE_KINDS[kind].label })),
];

function isKind(value: string): value is FixtureKind {
  return FIXTURE_KIND_ORDER.some((kind) => kind === value);
}

function Toolbar({ props }: { props: FixturesListProps }) {
  const { filter } = props;
  const change = (patch: Partial<FixtureFilter>) => props.onFilterChange?.({ ...filter, ...patch });
  const shown =
    props.rows.length === props.total
      ? `${props.total} fixtures`
      : `${props.rows.length} of ${props.total} fixtures`;
  return (
    <div className="flex items-center gap-3">
      <FilterField
        value={filter.query}
        placeholder="Filter by fixture or wired item"
        onChange={(query) => change({ query })}
        className="w-64 shrink-0"
      />
      <div className="w-44 shrink-0">
        <Select
          aria-label="Kind"
          value={filter.kind}
          options={KIND_OPTIONS}
          onChange={(event) =>
            change({ kind: isKind(event.target.value) ? event.target.value : 'all' })
          }
        />
      </div>
      <p className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {shown}
      </p>
    </div>
  );
}

function Table({ props }: { props: FixturesListProps }) {
  const header = (
    <ColumnHeader className={GRID}>
      <span>Fixture</span>
      <span className="hidden @3xl:block">Kind</span>
      <span className="hidden @3xl:block">Room</span>
      <span>Wired</span>
      <span aria-hidden />
    </ColumnHeader>
  );
  return (
    <ScrollPanel label="Fixtures" className="@container" header={header}>
      {props.rows.length === 0 ? (
        <NoMatchBody
          what="fixtures"
          onClear={() => props.onFilterChange?.({ query: '', kind: 'all', locationId: null })}
        />
      ) : (
        <div role="grid" aria-label="Fixtures" className="divide-y divide-border/60">
          {props.rows.map((row) => (
            <FixtureListRow
              key={row.fixture.id}
              row={row}
              world={props.world}
              onOpen={props.onOpen}
            />
          ))}
        </div>
      )}
    </ScrollPanel>
  );
}

/** The filter row and the list. */
export function FixturesList(props: FixturesListProps) {
  if (props.total === 0) {
    return (
      <ScrollPanel>
        <EmptyBody
          icon={Plug}
          title="No fixtures recorded"
          description="Add the outlets, ports and light fittings things are wired to, so a trace can end somewhere real."
          action={<Button onClick={props.onNew}>New fixture</Button>}
        />
      </ScrollPanel>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Toolbar props={props} />
      <Table props={props} />
    </div>
  );
}
