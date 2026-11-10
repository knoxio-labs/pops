import { tripOverviewRecords } from '@/fixtures/trip-overview';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Local planner state keeps flat visit occurrences and alternative selections distinct. */
export interface PlannerState {
  records: TripRecord[];
  order: string[];
  choices: Record<string, string>;
}

/** Named review scenarios share the same fictional source records. */
export type PlannerScenario =
  | 'default'
  | 'empty'
  | 'repeat-visit'
  | 'flat-return'
  | 'alternative-paths';

/** Build independent local state; no mutation reaches the shared fixtures. */
export function initialPlanner(scenario: PlannerScenario): PlannerState {
  const records = scenario === 'empty' ? [] : structuredClone(tripOverviewRecords);
  const order = records
    .filter((r) => r.sequence !== undefined)
    .toSorted((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((r) => r.id);
  const state: PlannerState = { records, order, choices: {} };
  if (scenario === 'repeat-visit') return addVisit(state, 'curitiba', 'rio');
  if (scenario === 'flat-return') {
    const outward = addVisit(state, 'es', 'recife');
    const index = outward.order.indexOf('recife') + 1;
    const excursion = outward.records.find((record) => record.id === outward.order[index]);
    if (!excursion) return state;
    const dated = updateVisit(outward, {
      ...excursion,
      timing: { arrival: '2028-01-06', departure: '2028-01-10' },
    });
    const returned = addVisit(dated, 'recife-olinda', excursion.id);
    const returnVisit = returned.records.find((record) => record.id === returned.order[index + 1]);
    return returnVisit
      ? updateVisit(returned, {
          ...returnVisit,
          timing: { arrival: '2028-01-10', departure: '2028-01-12' },
        })
      : state;
  }

  return state;
}

/** Move visits as units; their linked arrangements retain their original dates. */
export function moveVisit(state: PlannerState, id: string, delta: number): PlannerState {
  const index = state.order.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= state.order.length) return state;
  const order = [...state.order];
  order.splice(index, 1);
  order.splice(target, 0, id);
  return withOrder(state, order);
}

/** Insert a new visit occurrence after an existing route entry, or append when it is absent. */
export function addVisit(state: PlannerState, placeId: string, afterId?: string): PlannerState {
  let ordinal = state.records.length + 1;
  while (state.records.some((record) => record.id === `visit-${ordinal}`)) ordinal += 1;
  const id = `visit-${ordinal}`;
  const record: TripRecord = {
    id,
    kind: 'city',
    placeId,
    timing: {},
    intention: 'In plan',
    arrangement: 'Not arranged',
    notes: '',
  };
  const order = [...state.order];
  const afterIndex = afterId ? order.indexOf(afterId) : -1;
  order.splice(afterIndex < 0 ? order.length : afterIndex + 1, 0, id);
  return withOrder(
    {
      ...state,
      records: [...state.records, record],
    },
    order
  );
}

/** Replace one visit's structured values without touching its purchases or linked events. */
export function updateVisit(state: PlannerState, record: TripRecord): PlannerState {
  return { ...state, records: state.records.map((r) => (r.id === record.id ? record : r)) };
}

/** A route choice retains every competing option so it can be revisited. */
export function choosePath(state: PlannerState, gapId: string, optionId: string): PlannerState {
  const gap = state.records.find((r) => r.id === gapId);
  if (!gap?.optionIds?.includes(optionId)) return state;
  return { ...state, choices: { ...state.choices, [gapId]: optionId } };
}

function withOrder(state: PlannerState, order: string[]): PlannerState {
  const records = state.records.map((record) => {
    if (record.kind !== 'gap') return record;
    const index = order.indexOf(record.id);
    return {
      ...record,
      timing: { ...record.timing, afterVisitId: order[index - 1], beforeVisitId: order[index + 1] },
    };
  });
  return { ...state, records, order };
}

/** Accept a drag result only when it contains exactly the current route visits. */
export function reorderRoute(state: PlannerState, order: string[]): PlannerState {
  if (
    order.length !== state.order.length ||
    new Set(order).size !== order.length ||
    order.some((id) => !state.order.includes(id))
  )
    return state;
  return withOrder(state, order);
}

/** Move an item between visits without rewriting its purchase, location or dates. */
export function assignItem(state: PlannerState, itemId: string, visitId: string): PlannerState {
  const item = state.records.find((r) => r.id === itemId);
  const visit = state.records.find((r) => r.id === visitId);
  if (!item?.visitId || visit?.kind !== 'city') return state;
  return updateVisit(state, { ...item, visitId });
}

/** Remove a visit from this route while retaining its records for undo. */
export function removeVisit(state: PlannerState, id: string): PlannerState {
  return withOrder(
    state,
    state.order.filter((candidate) => candidate !== id)
  );
}
