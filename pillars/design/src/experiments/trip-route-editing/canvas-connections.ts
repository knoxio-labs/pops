import { transportMissing } from './canvas-issues';

import type { CanvasState } from './canvas-model';

/** A missing route edge gets a slot only when no existing transport card already represents it. */
export function missingTransportSlot(state: CanvasState, from: string): boolean {
  const index = state.order.indexOf(from);
  const origin = state.records.find((record) => record.id === from);
  if (index < 0 || origin?.kind !== 'city') return false;
  const following = state.order
    .slice(index + 1)
    .map((id) => state.records.find((record) => record.id === id));
  const destination = following.find((record) => record?.kind === 'city' || record?.kind === 'gap');
  if (destination?.kind !== 'city') return false;
  const positioned = following
    .slice(0, following.indexOf(destination))
    .some(
      (record) =>
        record?.kind === 'transport' &&
        state.transitLinks[record.id]?.from === from &&
        state.transitLinks[record.id]?.to === destination.id
    );
  return !positioned && transportMissing(state, from, destination.id);
}
