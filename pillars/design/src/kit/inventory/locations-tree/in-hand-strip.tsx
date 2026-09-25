/**
 * The In hand strip under the page while things are dragged: drop them on
 * it to pick them up. It is not there at any other time.
 */
import { DragDock } from '../foundation';
import { dropHandlers } from '../location-page/contents-rows';

import type { DragPlacementApi, PlacementTarget } from '../foundation';

const IN_HAND: PlacementTarget = { kind: 'in-hand' };

/** The strip, or nothing when no item is being dragged. */
export function InHandStrip({ api }: { api: { itemDrag: DragPlacementApi } }) {
  const drag = api.itemDrag;
  if (drag.dragging.length === 0) return null;
  const state = drag.stateFor(IN_HAND);
  const verdict = drag.verdictFor(IN_HAND);
  return (
    <div className="pt-3" {...dropHandlers(drag, IN_HAND)}>
      <DragDock
        count={drag.dragging.length}
        state={state === 'idle' ? 'available' : state}
        reason={verdict.ok ? undefined : verdict.reason}
      />
    </div>
  );
}
