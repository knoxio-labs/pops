import { MovingDayBoxCard } from './moving-day-box-card.js';
import { boxesByDestination, type MovingDestinationGroup } from './moving-day-model.js';
import { BoardColumn } from './moving-day-stage-board.js';

import type { MovingBoxBoardProps } from './moving-day-board-types.js';

function destinationHint(group: MovingDestinationGroup): string {
  if (group.optionKey === null) return 'Choose where these go';
  return `${group.closed} of ${group.boxes.length} closed`;
}

/** Renders boxes grouped by their configured move destination. */
export function DestinationBoard(props: MovingBoxBoardProps) {
  return (
    <div className="grid min-h-0 flex-1 auto-cols-fr grid-flow-col gap-3 overflow-x-auto">
      {boxesByDestination(props.data).map((group) => (
        <BoardColumn
          key={group.optionKey ?? 'undecided'}
          title={group.label}
          hint={destinationHint(group)}
          count={group.boxes.length}
          highlight={group.optionKey === null}
        >
          {group.boxes.length === 0 ? (
            <li className="px-1 py-2 text-xs text-muted-foreground">No box assigned.</li>
          ) : null}
          {group.boxes.map((box) => (
            <MovingDayBoxCard
              key={box.id}
              box={box}
              world={props.world}
              hideDestination
              selected={props.selectedId === box.id}
              pending={props.pendingIds.has(box.id)}
              disabledReason={props.disabledReason}
              rejection={props.rejections[box.id]}
              onAction={(action) => props.onAction(box, action)}
              onOpen={() => props.onOpenBox(box.id)}
            />
          ))}
        </BoardColumn>
      ))}
    </div>
  );
}
