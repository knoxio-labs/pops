/**
 * The Activity filter row: kind chips with their counts, who made the
 * change, and a search over item names and summaries. Filters live in the
 * URL (`kind`, `actor`, `item`), so a filtered feed is a link.
 */
import { Search } from 'lucide-react';

import { Button, Select, TextInput, cn } from '@pops/ui';

import { KIND_GROUP_LABELS, groupCounts } from './activity-model';

import type { EventActor, EventModel } from '../shared/model';
import type { ActivityFilter, KindGroup } from './activity-model';

const ACTORS: ReadonlyArray<{ value: EventActor | 'anyone'; label: string }> = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'web', label: 'This web app' },
  { value: 'device', label: "Joao's iPhone" },
  { value: 'service', label: 'Purchases import' },
  { value: 'migration', label: 'Catalogue revisions' },
];

function isActor(raw: string): raw is EventActor | 'anyone' {
  return ACTORS.some((actor) => actor.value === raw);
}

/** Props for {@link ActivityFilters}. */
export interface ActivityFiltersProps {
  events: readonly EventModel[];
  filter: ActivityFilter;
  onChange?: (filter: ActivityFilter) => void;
}

function Chip({
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
}) {
  return (
    <Button
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

/** The filter row. */
export function ActivityFilters({ events, filter, onChange }: ActivityFiltersProps) {
  const counts = groupCounts(events);
  const set = (patch: Partial<ActivityFilter>) => onChange?.({ ...filter, ...patch });
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <div role="group" aria-label="Kind of change" className="flex flex-wrap items-center gap-1">
        {KIND_GROUP_LABELS.map((chip) => (
          <Chip
            key={chip.id}
            id={chip.id}
            label={chip.label}
            count={counts[chip.id]}
            active={filter.group === chip.id}
            onPick={(group) => set({ group })}
          />
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Select
          aria-label="Who made the change"
          size="sm"
          options={[...ACTORS]}
          value={filter.actor}
          onChange={(event) => {
            if (isActor(event.target.value)) set({ actor: event.target.value });
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
      </div>
    </div>
  );
}
