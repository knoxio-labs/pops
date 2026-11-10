import { detachCanvasCard, refreshCanvasGaps } from './canvas-graph';

import type { CanvasState } from './canvas-model';

function replaceId(ids: string[], id: string, replacements: string[]): string[] {
  return [...new Set(ids.flatMap((key) => (key === id ? replacements : [key])))];
}

/** Remove a placed city visit and lift linked items into its root or alternative section, retaining source facts. */
export function removeCanvasVisit(state: CanvasState, id: string): CanvasState {
  const record = state.records.find((item) => item.id === id);
  const section = state.sections.find(
    (item) => item.cards.includes(id) && state.order.includes(item.gapId)
  );
  const atRoot = state.order.includes(id);
  if (record?.kind !== 'city' || (!atRoot && !section)) return state;
  const linkedIds = state.records
    .filter((item) => item.kind !== 'city' && item.visitId === id)
    .map((item) => item.id);
  const affected = new Set([id, ...linkedIds]);
  const detached = [...affected].reduce(detachCanvasCard, state);
  return refreshCanvasGaps({
    ...detached,
    order: atRoot ? replaceId(state.order, id, linkedIds) : detached.order,
    sections: detached.sections.map((item) =>
      !atRoot && item.id === section?.id
        ? { ...item, cards: replaceId(section.cards, id, linkedIds) }
        : item
    ),
    activityStays: Object.fromEntries(
      Object.entries(state.activityStays).filter(
        ([activityId, stayId]) => !affected.has(activityId) && !affected.has(stayId)
      )
    ),
  });
}
