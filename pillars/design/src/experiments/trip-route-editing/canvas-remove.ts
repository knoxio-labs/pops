import { detachCanvasCard, refreshCanvasGaps } from './canvas-graph';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasState } from './canvas-model';

type VisitContainer =
  | { kind: 'route' }
  | { kind: 'section'; id: string }
  | { kind: 'visit'; id: string };

function containerOf(state: CanvasState, id: string): VisitContainer | undefined {
  if (state.order.includes(id)) return { kind: 'route' };
  const section = state.sections.find((item) => item.cards.includes(id));
  if (section) return { kind: 'section', id: section.id };
  const parent = state.parents[id];
  if (parent && state.records.some((record) => record.id === parent && record.kind === 'city'))
    return { kind: 'visit', id: parent };
  return undefined;
}

function nestedVisits(state: CanvasState, id: string): TripRecord[] {
  const order = state.itemOrders[`nested:${id}`] ?? [];
  const position = (key: string): number =>
    order.includes(key) ? order.indexOf(key) : order.length;
  return state.records
    .filter((record) => state.parents[record.id] === id)
    .toSorted((a, b) => position(a.id) - position(b.id));
}

function replaceId(ids: string[], id: string, children: string[]): string[] {
  return [...new Set(ids.flatMap((key) => (key === id ? children : [key])))];
}

interface Lift {
  id: string;
  children: TripRecord[];
  container: VisitContainer;
}

function liftToParent(
  state: CanvasState,
  original: CanvasState,
  { id, children }: Lift,
  parent: string
): CanvasState {
  const cityIds = children.filter((record) => record.kind === 'city').map((record) => record.id);
  const activityIds = new Set(
    children.filter((record) => record.kind !== 'city').map((record) => record.id)
  );
  return {
    ...state,
    parents: { ...state.parents, ...Object.fromEntries(cityIds.map((child) => [child, parent])) },
    records: state.records.map((record) =>
      activityIds.has(record.id) ? { ...record, visitId: parent } : record
    ),
    itemOrders: {
      ...state.itemOrders,
      [`nested:${parent}`]: replaceId(
        nestedVisits(original, parent).map((record) => record.id),
        id,
        cityIds
      ),
    },
  };
}

function liftChildren(state: CanvasState, original: CanvasState, lift: Lift): CanvasState {
  const { id, children, container } = lift;
  const ids = children.map((record) => record.id);
  if (container.kind === 'visit') return liftToParent(state, original, lift, container.id);
  if (container.kind === 'route') return { ...state, order: replaceId(original.order, id, ids) };
  return {
    ...state,
    sections: state.sections.map((section) =>
      section.id === container.id
        ? {
            ...section,
            cards: replaceId(
              original.sections.find((item) => item.id === section.id)?.cards ?? [],
              id,
              ids
            ),
          }
        : section
    ),
  };
}

function retainValidAssignments(
  state: CanvasState,
  original: CanvasState,
  affected: Set<string>
): CanvasState {
  const activityStays = Object.fromEntries(
    Object.entries(original.activityStays).filter(([id, stayId]) => {
      if (!affected.has(id) && !affected.has(stayId)) return true;
      const activity = state.records.find((record) => record.id === id);
      if (!activity?.visitId) return false;
      if (stayId === '') return true;
      const stay = state.records.find((record) => record.id === stayId && record.kind === 'stay');
      return stay?.visitId === activity.visitId;
    })
  );
  return { ...state, activityStays };
}

/** Remove one placed visit, lifting its direct children into its former container without deleting source facts. */
export function removeCanvasVisit(state: CanvasState, id: string): CanvasState {
  const record = state.records.find((item) => item.id === id);
  const container = containerOf(state, id);
  if (record?.kind !== 'city' || !container) return state;
  const children = [
    ...new Map(
      [...nestedVisits(state, id), ...state.records.filter((item) => item.visitId === id)]
        .filter((item) => item.id !== id)
        .map((item) => [item.id, item])
    ).values(),
  ];
  const affected = new Set([id, ...children.map((item) => item.id)]);
  const detached = [...affected].reduce(detachCanvasCard, state);
  const lifted = liftChildren(detached, state, { id, children, container });
  return refreshCanvasGaps(
    retainValidAssignments(
      {
        ...lifted,
        itemOrders: Object.fromEntries(
          Object.entries(lifted.itemOrders).filter(([key]) => key !== `nested:${id}`)
        ),
      },
      state,
      affected
    )
  );
}
