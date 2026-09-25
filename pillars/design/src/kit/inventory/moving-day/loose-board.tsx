/**
 * What has not been packed yet, room by room, plus what is in hand. Each
 * thing has one verb, Pack, which opens the placement picker with the open
 * boxes first; a whole room's things can be selected and packed together.
 */
import { Button } from '@pops/ui';

import { INVENTORY_ICONS, QuantityBadge } from '../foundation';
import { BoardColumn } from './stage-board';

import type { ItemRowModel } from '../foundation';
import type { MovingSummary } from './moving-model';

/** Props for {@link LooseBoard}. */
export interface LooseBoardProps {
  summary: MovingSummary;
  onPack: (ids: readonly string[]) => void;
}

function LooseRow({ entry, onPack }: { entry: ItemRowModel; onPack: () => void }) {
  return (
    <li className="flex h-10 items-center gap-2 rounded-md bg-card px-2.5 text-sm">
      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      <QuantityBadge quantity={entry.quantity} />
      <Button
        size="sm"
        variant="ghost"
        className="h-8 px-2 text-muted-foreground"
        onClick={onPack}
        prefix={<INVENTORY_ICONS.container className="size-3.5" aria-hidden />}
      >
        Pack
      </Button>
    </li>
  );
}

/** The not-packed board. */
export function LooseBoard({ summary, onPack }: LooseBoardProps) {
  const groups = [
    ...summary.loose.map((group) => ({
      id: group.room.id,
      title: group.room.name,
      items: group.items,
    })),
    ...(summary.inHand.length > 0
      ? [{ id: 'in-hand', title: 'In hand', items: summary.inHand }]
      : []),
  ];
  return (
    <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 items-start gap-3 overflow-y-auto lg:grid-cols-3">
      {groups.map((group) => (
        <BoardColumn key={group.id} title={group.title} count={group.items.length}>
          {group.items.map((entry) => (
            <LooseRow key={entry.id} entry={entry} onPack={() => onPack([entry.id])} />
          ))}
          {group.items.length > 1 ? (
            <li>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => onPack(group.items.map((entry) => entry.id))}
              >
                Pack all {group.items.length}
              </Button>
            </li>
          ) : null}
        </BoardColumn>
      ))}
    </div>
  );
}
