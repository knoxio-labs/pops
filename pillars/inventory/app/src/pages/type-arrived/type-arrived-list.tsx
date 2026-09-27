import { Checkbox, cn } from '@pops/ui';

import { TypeLabel } from '../../foundation/badges/badges.js';
import { ItemMark } from '../../foundation/badges/item-mark.js';
import { PlaceName } from '../../foundation/badges/place-name.js';

import type { ReactElement } from 'react';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { UntypedItem } from './type-arrived-model.js';

/** Props for the Type arrived review list. */
export interface TypeArrivedListProps {
  matches: readonly UntypedItem[];
  world: PlacementWorld;
  ticked: ReadonlySet<string>;
  appliedIds?: ReadonlySet<string>;
  appliedType?: string;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}

function headerState(ticked: number, total: number): boolean | 'indeterminate' {
  if (ticked === 0) return false;
  return ticked === total ? true : 'indeterminate';
}

function ListHeader({
  applied,
  all,
  ticked,
  total,
  onToggleAll,
}: {
  applied: boolean;
  all: boolean;
  ticked: number;
  total: number;
  onToggleAll: () => void;
}): ReactElement {
  return (
    <div className="grid h-9 shrink-0 grid-cols-[1.25rem_1.75rem_minmax(0,1fr)_10rem_12rem] items-center gap-3 border-b bg-muted/40 pr-4 pl-3 text-2xs font-semibold uppercase tracking-label text-muted-foreground">
      {applied ? (
        <span />
      ) : (
        <Checkbox
          checked={headerState(ticked, total)}
          aria-label={all ? 'Untick all' : 'Tick all'}
          onClick={onToggleAll}
        />
      )}
      <span />
      <span>Item</span>
      <span>{applied ? 'Type' : 'Filed as'}</span>
      <span>Where</span>
    </div>
  );
}

function ArrivedRow({
  entry,
  world,
  applied,
  appliedType,
  appliedIds,
  checked,
  onToggle,
}: {
  entry: UntypedItem;
  world: PlacementWorld;
  applied: boolean;
  appliedType: string | undefined;
  appliedIds: ReadonlySet<string>;
  checked: boolean;
  onToggle: (id: string) => void;
}): ReactElement {
  const { item, legacyLabel } = entry;
  return (
    <div
      role="row"
      aria-selected={applied ? undefined : checked}
      className={cn(
        'grid h-11 grid-cols-[1.25rem_1.75rem_minmax(0,1fr)_10rem_12rem] items-center gap-3 pr-4 pl-3',
        !applied && !checked && 'text-muted-foreground'
      )}
    >
      {applied ? (
        <span />
      ) : (
        <Checkbox
          checked={checked}
          aria-label={`Type ${item.name} as this type`}
          onClick={() => onToggle(item.id)}
        />
      )}
      <ItemMark item={item} />
      <span className="truncate text-sm font-medium">{item.name}</span>
      {applied && appliedIds.has(item.id) ? (
        <TypeLabel typeName={appliedType ?? null} />
      ) : (
        <span className="truncate font-mono text-xs">{legacyLabel}</span>
      )}
      <PlaceName world={world} target={item.placement} className="text-xs" />
    </div>
  );
}

/** Renders the selectable rows and their filed-as and placement context. */
export function TypeArrivedList({
  matches,
  world,
  ticked,
  appliedIds = ticked,
  appliedType,
  onToggle,
  onToggleAll,
}: TypeArrivedListProps): ReactElement {
  const applied = appliedType !== undefined;
  const all = matches.length > 0 && ticked.size === matches.length;
  return (
    <div
      role="grid"
      aria-label="Matched items"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card"
    >
      <ListHeader
        applied={applied}
        all={all}
        ticked={ticked.size}
        total={matches.length}
        onToggleAll={onToggleAll}
      />
      <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
        {matches.map((entry) => (
          <ArrivedRow
            key={entry.item.id}
            entry={entry}
            world={world}
            applied={applied}
            appliedType={appliedType}
            appliedIds={appliedIds}
            checked={ticked.has(entry.item.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
