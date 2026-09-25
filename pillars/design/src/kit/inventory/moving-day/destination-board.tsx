/**
 * Boxes by where they are going, one column per destination, each saying
 * how many are closed and how many are already there. Boxes with no
 * destination get their own column so none is left behind on the day.
 */
import { BoxCard } from './box-card';
import { boxesByDestination } from './moving-model';
import { BoardColumn } from './stage-board';

import type { DestinationGroup } from './moving-model';
import type { BoardProps } from './stage-board';

function hint(group: DestinationGroup): string {
  if (group.destination === null) return 'Choose where these go';
  const parts = [`${group.closed} of ${group.boxes.length} closed`];
  if (group.arrived > 0) parts.push(`${group.arrived} already there`);
  return parts.join(', ');
}

/** The destination board. */
export function DestinationBoard({ world, boxes, selectedId, onAction, onOpenBox }: BoardProps) {
  const groups = boxesByDestination(world, boxes);
  return (
    <div className="grid min-h-0 flex-1 auto-cols-fr grid-flow-col gap-3">
      {groups.map((group) => (
        <BoardColumn
          key={group.destination?.id ?? 'undecided'}
          title={group.destination?.name ?? 'No destination'}
          hint={hint(group)}
          count={group.boxes.length}
          highlight={group.destination === null}
        >
          {group.boxes.map((summary) => (
            <BoxCard
              key={summary.box.id}
              summary={summary}
              world={world}
              hideDestination
              selected={selectedId === summary.box.id}
              onAction={(action) => onAction(summary.box.id, action)}
              onOpen={() => onOpenBox(summary.box.id)}
            />
          ))}
        </BoardColumn>
      ))}
    </div>
  );
}
