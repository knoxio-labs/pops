import { Search } from 'lucide-react';

import { Button, DateRangeField, Select, TextInput, cn } from '@pops/ui';

import { KIND_GROUP_LABELS, groupCounts, isActivityActor } from './activity-model.js';

import type { ReactElement } from 'react';

import type { EventActor, EventModel } from '../../../foundation/model/model.js';
import type { ActivityFilter, KindGroup } from './activity-model.js';

const ACTORS: ReadonlyArray<{ value: EventActor | 'anyone'; label: string }> = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'web', label: 'This web app' },
  { value: 'device', label: 'Any device' },
  { value: 'service', label: 'Purchases import' },
  { value: 'migration', label: 'Catalogue revisions' },
];

/** Props for the Activity filter controls. */
export interface ActivityFiltersProps {
  events: readonly EventModel[];
  filter: ActivityFilter;
  onChange?: (filter: ActivityFilter) => void;
}

function KindChip({
  id,
  label,
  count,
  active,
  onPick,
}: {
  id: KindGroup;
  label: string;
  count: number;
  active: boolean;
  onPick: (id: KindGroup) => void;
}): ReactElement {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      aria-pressed={active}
      onClick={() => onPick(id)}
      className={cn('gap-1.5 rounded-full px-3', active && 'ring-1 ring-border')}
    >
      {label}
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </Button>
  );
}

/** Renders kind, actor, search, and inclusive date-range filters for Activity. */
export function ActivityFilters({ events, filter, onChange }: ActivityFiltersProps): ReactElement {
  const counts = groupCounts(events);
  const set = (patch: Partial<ActivityFilter>): void => onChange?.({ ...filter, ...patch });
  return (
    <div className="flex shrink-0 flex-wrap items-end gap-2">
      <div role="group" aria-label="Kind of change" className="flex flex-wrap items-center gap-1">
        {KIND_GROUP_LABELS.map((chip) => (
          <KindChip
            key={chip.id}
            id={chip.id}
            label={chip.label}
            count={counts[chip.id]}
            active={filter.group === chip.id}
            onPick={(group) => set({ group })}
          />
        ))}
      </div>
      <div className="ml-auto flex flex-wrap items-end gap-2">
        <Select
          aria-label="Who made the change"
          size="sm"
          options={[...ACTORS]}
          value={filter.actor}
          onChange={(event) => {
            if (isActivityActor(event.target.value)) set({ actor: event.target.value });
          }}
          containerClassName="w-40"
        />
        <TextInput
          aria-label="Search item or change"
          size="sm"
          placeholder="Item name or change"
          value={filter.query}
          onChange={(event) => set({ query: event.target.value })}
          prefix={<Search className="size-3.5 text-muted-foreground" aria-hidden />}
          containerClassName="w-48"
        />
        <DateRangeField
          value={{ start: filter.from, end: filter.to }}
          onChange={(range) => set({ from: range.start, to: range.end })}
          startLabel="From date"
          endLabel="To date"
          clearLabel="Clear date filters"
          size="sm"
          className="flex-wrap"
        />
      </div>
    </div>
  );
}
