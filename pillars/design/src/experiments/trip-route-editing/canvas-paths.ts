import { refreshCanvasGaps } from './canvas-graph';

import type { CanvasState } from './canvas-model';

/** Move one complete ordered path to its route gap without copying records or changing booking facts. */
export function activateAlternativePath(state: CanvasState, sectionId: string): CanvasState {
  const section = state.sections.find((item) => item.id === sectionId);
  if (!section || section.cards.length === 0 || !state.order.includes(section.gapId)) return state;
  const ids = new Set(section.cards);
  if (
    ids.size !== section.cards.length ||
    section.cards.some((id) => !state.records.some((record) => record.id === id)) ||
    state.order.some((id) => ids.has(id)) ||
    state.sections.some((item) => item.id !== section.id && item.cards.some((id) => ids.has(id)))
  )
    return state;
  const index = state.order.indexOf(section.gapId);
  return refreshCanvasGaps({
    ...state,
    order: [...state.order.slice(0, index), ...section.cards, ...state.order.slice(index)],
    sections: state.sections.filter((item) => item.id !== section.id),
    appliedPaths: [...state.appliedPaths, section],
  });
}
