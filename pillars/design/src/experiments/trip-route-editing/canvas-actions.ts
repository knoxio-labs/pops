import {
  attachCanvasCard,
  canvasGap,
  canvasNeighbours,
  detachCanvasCard,
  nextCanvasId,
  refreshCanvasGaps,
  validCanvasTarget,
  wouldCycle,
} from './canvas-graph';

import type { TripRecord } from '@/fixtures/trip-overview-model';
import type { TripPlace } from '@/fixtures/trip-places';

import type { CaptureKind, CaptureTarget } from './canvas-capture';
import type { CanvasState } from './canvas-model';

export type { CaptureKind, CaptureTarget } from './canvas-capture';

function place(state: CanvasState, name: string): { places: TripPlace[]; id: string } {
  const found = state.places.find(
    (item) => item.kind !== 'airport' && item.name.toLowerCase() === name.toLowerCase()
  );
  if (found) return { places: state.places, id: found.id };
  const id = nextCanvasId(state, 'place');
  return { places: [...state.places, { id, name, kind: 'city' }], id };
}

/** Select or create a reusable place, preserving a non-city card's independent title. */
export function renamePlace(state: CanvasState, id: string, name: string): CanvasState {
  if (!name.trim() || !state.records.some((record) => record.id === id)) return state;
  const selected = place(state, name.trim());
  return {
    ...state,
    places: selected.places,
    records: state.records.map((record) =>
      record.id === id
        ? {
            ...record,
            placeId: selected.id,
            title: record.kind === 'city' ? undefined : record.title,
          }
        : record
    ),
  };
}

function captureSection(state: CanvasState, title: string, target: CaptureTarget): CanvasState {
  const gap = canvasGap(state, target);
  return {
    ...gap.state,
    sections: [
      ...gap.state.sections,
      { id: nextCanvasId(gap.state), gapId: gap.id, title, cards: [] },
    ],
  };
}

function captureRental(state: CanvasState, title: string, target: CaptureTarget): CanvasState {
  const neighbours = canvasNeighbours(state, target);
  return {
    ...state,
    rentals: [
      ...state.rentals,
      {
        id: nextCanvasId(state),
        provider: title,
        from: neighbours.from,
        to: neighbours.to,
        start: '',
        end: '',
        status: 'Considering',
      },
    ],
  };
}

function captureRecord(
  state: CanvasState,
  kind: Exclude<CaptureKind, 'rental' | 'section'>,
  title: string,
  target: CaptureTarget
): CanvasState {
  const selected =
    kind === 'city'
      ? place(state, title)
      : {
          places: state.places,
          id: state.records.find((record) => record.id === target.visitId)?.placeId ?? '',
        };
  const record: TripRecord = {
    id: nextCanvasId(state),
    kind,
    placeId: selected.id,
    title: kind === 'city' ? undefined : title,
    timing: kind === 'city' ? {} : undefined,
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes: '',
    schedule: target.start ? { start: target.start, end: target.end } : undefined,
  };
  const next = attachCanvasCard(
    { ...state, places: selected.places, records: [...state.records, record] },
    record,
    target
  );
  return kind === 'transport'
    ? {
        ...next,
        transitLinks: { ...next.transitLinks, [record.id]: canvasNeighbours(state, target) },
      }
    : next;
}

/** Capture independent root cards, linked visit items, rentals or sections at a validated destination. */
export function captureCard(
  state: CanvasState,
  kind: CaptureKind,
  name: string,
  target: CaptureTarget
): CanvasState {
  const title = name.trim();
  if (!title || !validCanvasTarget(state, target)) return state;
  if (kind === 'section') return refreshCanvasGaps(captureSection(state, title, target));
  if (kind === 'rental') return captureRental(state, title, target);
  return refreshCanvasGaps(captureRecord(state, kind, title, target));
}

function moveSection(state: CanvasState, id: string, target: CaptureTarget): CanvasState {
  if (target.sectionId || target.visitId || target.after === id) return state;
  const gap = canvasGap(state, target);
  return refreshCanvasGaps({
    ...gap.state,
    sections: gap.state.sections.map((section) =>
      section.id === id ? { ...section, gapId: gap.id } : section
    ),
  });
}

/** Move existing cards or sections across containers while retaining source facts and descendants. */
export function moveCard(state: CanvasState, id: string, target: CaptureTarget): CanvasState {
  if (!validCanvasTarget(state, target) || target.after === id || target.visitId === id)
    return state;
  if (state.sections.some((section) => section.id === id)) return moveSection(state, id, target);
  const record = state.records.find((item) => item.id === id);
  if (!record || (target.visitId && wouldCycle(state, id, target.visitId))) return state;
  if (target.gapId || (record.kind === 'gap' && (target.visitId || target.sectionId))) return state;
  return refreshCanvasGaps(attachCanvasCard(detachCanvasCard(state, id), record, target));
}

/** Reorder exactly one known container; unknown or incomplete memberships leave state untouched. */
export function reorderCards(state: CanvasState, ids: string[], container = 'route'): CanvasState {
  const section = state.sections.find((item) => item.id === container);
  const current =
    container === 'route' ? state.order : (section?.cards ?? state.itemOrders[container]);
  if (
    !current ||
    ids.length !== current.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !current.includes(id))
  )
    return state;
  if (container === 'route') return refreshCanvasGaps({ ...state, order: [...ids] });
  if (section)
    return {
      ...state,
      sections: state.sections.map((item) =>
        item.id === container ? { ...item, cards: [...ids] } : item
      ),
    };
  return { ...state, itemOrders: { ...state.itemOrders, [container]: [...ids] } };
}
