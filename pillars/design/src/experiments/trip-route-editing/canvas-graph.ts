import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CaptureTarget } from './canvas-actions';
import type { CanvasState, TransitLink } from './canvas-model';

/** Generate a collision-free local identity without depending on collection lengths. */
export function nextCanvasId(state: CanvasState, prefix = 'card'): string {
  const used = new Set(
    [...state.records, ...state.sections, ...state.rentals, ...state.places].map((item) => item.id)
  );
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

/** Resolve only known city neighbours; empty endpoints remain explicitly unknown. */
export function canvasNeighbours(state: CanvasState, target: CaptureTarget): TransitLink {
  const anchor = target.visitId ?? target.after;
  const index = anchor ? state.order.indexOf(anchor) + 1 : 0;
  const cities = (ids: string[]): TripRecord[] =>
    ids.flatMap((id) =>
      state.records.filter((record) => record.id === id && record.kind === 'city')
    );
  const selected = state.records.find(
    (record) => record.id === target.visitId && record.kind === 'city'
  );
  return {
    from: selected?.id ?? cities(state.order.slice(0, index)).at(-1)?.id ?? '',
    to: cities(state.order.slice(index)).at(0)?.id ?? '',
  };
}

function placedVisit(state: CanvasState, id: string): boolean {
  const seen = new Set<string>();
  let current: string | undefined = id;
  while (current && !seen.has(current)) {
    if (state.order.includes(current)) return true;
    const section = state.sections.find((item) => item.cards.includes(current ?? ''));
    if (section && state.order.includes(section.gapId)) return true;
    seen.add(current);
    current = state.parents[current];
  }
  return false;
}

function validRecordDestination(state: CanvasState, target: CaptureTarget): boolean {
  if (
    target.stayId &&
    !state.records.some(
      (record) =>
        record.id === target.stayId && record.kind === 'stay' && record.visitId === target.visitId
    )
  )
    return false;
  if (
    target.visitId &&
    !state.records.some((record) => record.id === target.visitId && record.kind === 'city')
  )
    return false;
  if (target.visitId && !placedVisit(state, target.visitId)) return false;
  if (
    target.gapId &&
    !state.records.some((record) => record.id === target.gapId && record.kind === 'gap')
  )
    return false;
  if (target.gapId && !state.order.includes(target.gapId)) return false;
  return true;
}

/** Reject unknown or unplaced destinations before source records or memberships change. */
export function validCanvasTarget(state: CanvasState, target: CaptureTarget): boolean {
  if ([target.visitId, target.sectionId, target.gapId].filter(Boolean).length > 1) return false;
  if (!validRecordDestination(state, target)) return false;
  const section = state.sections.find((candidate) => candidate.id === target.sectionId);
  if (target.sectionId && (!section || !state.order.includes(section.gapId))) return false;
  if (!target.after) return true;
  const membership = section?.cards ?? state.order;
  return membership.includes(target.after);
}

/** Check ancestry through identities, including corrupt existing cycles, before nesting. */
export function wouldCycle(state: CanvasState, id: string, parentId: string): boolean {
  const seen = new Set([id]);
  let current: string | undefined = parentId;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = state.parents[current];
  }
  return false;
}

/** Remove placement edges while retaining records and descendant/source facts for undo. */
export function detachCanvasCard(state: CanvasState, id: string): CanvasState {
  return {
    ...state,
    order: state.order.filter((key) => key !== id),
    records: state.records.map((record) =>
      record.id === id && record.visitId ? { ...record, visitId: undefined } : record
    ),
    activityStays: Object.fromEntries(
      Object.entries(state.activityStays).filter(([key]) => key !== id)
    ),
    parents: Object.fromEntries(Object.entries(state.parents).filter(([key]) => key !== id)),
    sections: state.sections.map((section) => ({
      ...section,
      cards: section.cards.filter((key) => key !== id),
    })),
    itemOrders: Object.fromEntries(
      Object.entries(state.itemOrders).map(([key, ids]) => [key, ids.filter((item) => item !== id)])
    ),
  };
}

/** Refresh derived gap edges after moves without rewriting source timing or arrangement facts. */
export function refreshCanvasGaps(state: CanvasState): CanvasState {
  const records = state.records.map((record) => {
    if (record.kind !== 'gap') return record;
    const optionIds = state.sections
      .filter((section) => section.gapId === record.id)
      .flatMap((section) => section.cards);
    if (!state.order.includes(record.id)) return { ...record, optionIds };
    const neighbours = canvasNeighbours(state, { after: record.id });
    return {
      ...record,
      optionIds,
      timing: {
        ...record.timing,
        afterVisitId: neighbours.from || undefined,
        beforeVisitId: neighbours.to || undefined,
      },
    };
  });
  const choices = Object.fromEntries(
    Object.entries(state.choices).filter(([gap, selected]) =>
      records.some((record) => record.id === gap && record.optionIds?.includes(selected))
    )
  );
  return { ...state, records, choices };
}

/** Insert at the beginning or immediately after a validated member of the target container. */
export function insertCanvasId(ids: string[], id: string, after?: string): string[] {
  const next = ids.filter((item) => item !== id);
  next.splice(after ? next.indexOf(after) + 1 : 0, 0, id);
  return next;
}

/** Create a real root gap when a section has no explicit existing gap destination. */
export function canvasGap(
  state: CanvasState,
  target: CaptureTarget
): { state: CanvasState; id: string } {
  if (target.gapId) return { state, id: target.gapId };
  const id = nextCanvasId(state, 'gap');
  const neighbours = canvasNeighbours(state, target);
  const gap: TripRecord = {
    id,
    kind: 'gap',
    placeId: '',
    intention: 'Considering',
    arrangement: 'Not needed',
    notes: '',
    timing: {
      afterVisitId: neighbours.from || undefined,
      beforeVisitId: neighbours.to || undefined,
    },
  };
  return {
    id,
    state: {
      ...state,
      records: [...state.records, gap],
      order: insertCanvasId(state.order, id, target.after),
    },
  };
}

/** Attach one detached card without modifying its dates, purchase state or location. */
export function attachCanvasCard(
  state: CanvasState,
  record: TripRecord,
  target: CaptureTarget
): CanvasState {
  if (target.sectionId)
    return {
      ...state,
      sections: state.sections.map((section) =>
        section.id === target.sectionId
          ? { ...section, cards: insertCanvasId(section.cards, record.id, target.after) }
          : section
      ),
    };
  if (target.visitId && record.kind === 'city')
    return { ...state, parents: { ...state.parents, [record.id]: target.visitId } };
  if (target.visitId && !['transport', 'gap'].includes(record.kind))
    return {
      ...state,
      activityStays:
        target.stayId === undefined || record.kind === 'stay'
          ? state.activityStays
          : { ...state.activityStays, [record.id]: target.stayId },
      records: state.records.map((item) =>
        item.id === record.id ? { ...item, visitId: target.visitId } : item
      ),
    };
  return {
    ...state,
    order: insertCanvasId(state.order, record.id, target.after ?? target.visitId),
  };
}
