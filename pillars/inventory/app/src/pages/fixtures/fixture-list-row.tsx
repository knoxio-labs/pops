import { ChevronRight, Edit3 } from 'lucide-react';

import { ButtonPrimitive, cn } from '@pops/ui';

import { fixtureKindLabel, FixtureMark } from './fixture-kinds.js';
import { fixtureRoomName, wiredSummary } from './fixture-model.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { FixtureListRow as FixtureListRowModel } from './fixture-model.js';

const GRID =
  'grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_1.5rem] @3xl:grid-cols-[minmax(0,1.3fr)_9rem_9rem_minmax(0,1.6fr)_1.5rem]';

/** Props for one fixture row's open and edit actions. */
export interface FixtureListRowProps {
  readonly row: FixtureListRowModel;
  readonly locations: ReadonlyMap<string, LocationModel>;
  readonly onOpen: (id: string) => void;
  readonly onEdit: (row: FixtureListRowModel) => void;
}

/** Renders one server-owned fixture row without deriving or resorting its data. */
export function FixtureListRow({
  row,
  locations,
  onOpen,
  onEdit,
}: FixtureListRowProps): ReactElement {
  return (
    <div role="row" className="group relative">
      <ButtonPrimitive
        type="button"
        variant="ghost"
        aria-label={`Open ${row.name}`}
        onClick={() => onOpen(row.id)}
        className={cn(
          'grid h-12 w-full items-center gap-3 rounded-none pl-3 pr-24 text-left font-normal',
          GRID
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <FixtureMark kind={row.type} />
          <span className="truncate text-sm font-medium">{row.name}</span>
        </span>
        <span className="hidden truncate text-xs text-muted-foreground @3xl:block">
          {fixtureKindLabel(row.type)}
        </span>
        <span className="hidden truncate text-xs text-muted-foreground @3xl:block">
          {fixtureRoomName(locations, row.locationId)}
        </span>
        <span
          className={cn(
            'flex min-w-0 items-center gap-2 text-sm',
            row.wiredCount === 0 && 'text-muted-foreground'
          )}
        >
          {row.wiredCount > 0 ? (
            <span className="shrink-0 rounded-md bg-muted px-1.5 text-xs tabular-nums">
              {row.wiredCount}
            </span>
          ) : null}
          <span className="truncate">{wiredSummary(row)}</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </ButtonPrimitive>
      <ButtonPrimitive
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Edit ${row.name}`}
        onClick={() => onEdit(row)}
        className="absolute top-1/2 right-9 -translate-y-1/2 text-muted-foreground"
      >
        <Edit3 className="size-4" aria-hidden />
      </ButtonPrimitive>
    </div>
  );
}
