import { DragDock } from '../drag/drag-dock.js';
import { useDropTarget } from './drop-target.js';

import type { ReactElement } from 'react';

import type { DragPlacementApi } from '../drag/use-drag-placement.js';

const IN_HAND = { kind: 'in-hand' } as const;

/** Renders the temporary In hand drop target while an item drag is active. */
export function InHandStrip({ drag }: { drag: DragPlacementApi }): ReactElement | null {
  const target = IN_HAND;
  const { setNodeRef, state } = useDropTarget(drag, target);
  if (drag.dragging.length === 0) return null;
  const verdict = drag.verdictFor(target);
  return (
    <div ref={setNodeRef} className="pt-3">
      <DragDock
        count={drag.dragging.length}
        state={state === 'idle' ? 'available' : state}
        reason={verdict.ok ? undefined : verdict.reason}
      />
    </div>
  );
}
