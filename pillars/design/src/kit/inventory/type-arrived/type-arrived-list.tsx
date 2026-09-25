/**
 * The matched items, each ticked, with the label it was filed under and
 * where it is. A row's tick is the whole decision; nothing else on the row
 * is interactive, so the list reads as one question.
 */
import { Checkbox, cn } from '@pops/ui';

import { PlaceName } from '../overview/place-name';
import { TypeLabel } from '../shared/badges';
import { ItemMark } from '../shared/item-mark';

import type { PlacementWorld } from '../shared/placement-model';
import type { UntypedItem } from './type-arrived-model';

/** Props for {@link TypeArrivedList}. */
export interface TypeArrivedListProps {
  matches: readonly UntypedItem[];
  world: PlacementWorld;
  ticked: ReadonlySet<string>;
  /** After Apply: rows show their new type instead of a tick. */
  appliedType?: string;
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
}

function headerState(ticked: number, total: number): boolean | 'indeterminate' {
  if (ticked === 0) return false;
  return ticked === total ? true : 'indeterminate';
}

function HeaderRow({
  matches,
  ticked,
  onToggleAll,
  applied,
}: Pick<TypeArrivedListProps, 'matches' | 'ticked' | 'onToggleAll'> & { applied: boolean }) {
  const all = ticked.size === matches.length;
  return (
    <div className="grid h-9 grid-cols-[1.25rem_1.75rem_minmax(0,1fr)_10rem_12rem] items-center gap-3 border-b bg-muted/40 pr-4 pl-3 text-2xs font-semibold uppercase tracking-label text-muted-foreground">
      {applied ? (
        <span />
      ) : (
        <Checkbox
          checked={headerState(ticked.size, matches.length)}
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

/** The list. */
export function TypeArrivedList({
  matches,
  world,
  ticked,
  appliedType,
  onToggle,
  onToggleAll,
}: TypeArrivedListProps) {
  const applied = appliedType !== undefined;
  return (
    <div
      role="grid"
      aria-label="Matched items"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card"
    >
      <HeaderRow matches={matches} ticked={ticked} onToggleAll={onToggleAll} applied={applied} />
      <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
        {matches.map(({ item, legacyLabel }) => {
          const on = ticked.has(item.id);
          return (
            <div
              key={item.id}
              role="row"
              aria-selected={applied ? undefined : on}
              className={cn(
                'grid h-11 grid-cols-[1.25rem_1.75rem_minmax(0,1fr)_10rem_12rem] items-center gap-3 pr-4 pl-3',
                !applied && !on && 'text-muted-foreground'
              )}
            >
              {applied ? (
                <span />
              ) : (
                <Checkbox
                  checked={on}
                  aria-label={`Type ${item.name} as this type`}
                  onClick={() => onToggle?.(item.id)}
                />
              )}
              <ItemMark item={item} />
              <span className="truncate text-sm font-medium">{item.name}</span>
              {applied && on ? (
                <TypeLabel typeName={appliedType} />
              ) : (
                <span className="truncate font-mono text-xs">{legacyLabel}</span>
              )}
              <PlaceName world={world} target={item.placement} className="text-xs" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
