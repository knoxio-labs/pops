import { initialCanvas } from '../trip-route-editing/canvas-model';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasState } from '../trip-route-editing/canvas-model';

/** Review scenarios preserve unknown dates and purchases independently of path selection. */
export type AlternativeScenario = 'default' | 'empty' | 'date-conflict' | 'missing-reference';

/** Working selection and candidate records are separate; selecting never deletes a competing path. */
export interface AlternativesState {
  canvas: CanvasState;
  gapId: string;
  workingId?: string;
}

/** Build fictional alternatives from the same visit graph used in the route planner. */
export function initialAlternatives(scenario: AlternativeScenario): AlternativesState {
  const canvas = initialCanvas('default');
  canvas.sections = canvas.sections.filter((section) => section.gapId === 'open-january');
  canvas.records = canvas.records.map((record) => {
    if (record.id === 'northeast')
      return { ...record, timing: { arrival: '2028-01-06', departure: '2028-02-04' } };
    if (record.id === 'minas')
      return {
        ...record,
        timing: {
          arrival: scenario === 'date-conflict' ? '2028-01-27' : '2028-01-06',
          departure: '2028-02-04',
        },
      };
    if (record.id === 'rio')
      return { ...record, timing: { arrival: '2028-02-04', departure: '2028-02-14' } };
    return record;
  });
  canvas.records.push({
    id: 'coast-stay',
    title: 'Hotel da Praia',
    kind: 'stay',
    placeId: 'northeast',
    visitId: 'northeast',
    schedule: { start: '2028-01-10', end: '2028-01-13' },
    intention: 'In plan',
    arrangement: 'Booked',
    purchase: 'Purchased',
    notes: '',
  });
  if (scenario === 'empty') canvas.sections = [];
  if (scenario === 'missing-reference') canvas.sections[0]?.cards.push('removed-visit');
  return {
    canvas,
    gapId: 'open-january',
    workingId: scenario === 'empty' ? undefined : 'section-northeast',
  };
}

/** Expand only the selected gap, leaving the original graph and all records untouched. */
export function previewVisits(state: AlternativesState, sectionId?: string): TripRecord[] {
  const gap = state.canvas.records.find((record) => record.id === state.gapId);
  const section = state.canvas.sections.find(
    (candidate) => candidate.id === sectionId && candidate.gapId === state.gapId
  );
  const ids = [gap?.timing?.afterVisitId, ...(section?.cards ?? []), gap?.timing?.beforeVisitId];
  return ids.flatMap((id) =>
    state.canvas.records.filter((record) => record.id === id && record.kind === 'city')
  );
}

/** Explicitly change route membership without rewriting dates, purchases or competing sections. */
export function applyAlternative(state: AlternativesState, sectionId: string): AlternativesState {
  const section = state.canvas.sections.find(
    (candidate) => candidate.id === sectionId && candidate.gapId === state.gapId
  );
  if (!section || !section.cards.length || sectionId === state.workingId) return state;
  const visits = previewVisits(state, sectionId);
  if (section.cards.some((id) => !visits.some((visit) => visit.id === id))) return state;
  return { ...state, workingId: sectionId };
}
