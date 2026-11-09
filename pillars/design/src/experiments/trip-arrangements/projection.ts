import { normalizeSearchText } from '../../fixtures/search-text';
import { presentTripRecord } from '../../fixtures/trip-overview-format';
import { isPurchasedArrangement } from '../../fixtures/trip-overview-model';
import { canvasCalendar } from '../trip-route-editing/canvas-calendar';
import { canvasName } from '../trip-route-editing/canvas-model';
import { arrangementResponsibility } from './responsibility-source';

import type { ArrangementFilters, ArrangementRow, ArrangementState } from './types';

function visitName(state: ArrangementState, id: string): string {
  if (!id) return '';
  const visit = state.canvas.records.find((record) => record.id === id);
  return visit ? canvasName(state.canvas, visit) : 'Visit unavailable';
}

/** Projects transport, stays, events and rentals without changing their source arrangement or purchase fields. */
export function arrangementRows(state: ArrangementState): ArrangementRow[] {
  const bookings = canvasCalendar(state.canvas);
  const records = state.canvas.records.flatMap((record): ArrangementRow[] => {
    if (record.kind !== 'transport' && record.kind !== 'stay' && record.kind !== 'event') return [];
    if (state.canvas.rentals.some((rental) => rental.id === record.id)) return [];
    return [
      {
        id: record.id,
        kind: record.kind,
        name:
          record.kind === 'transport' && record.title === undefined
            ? presentTripRecord({ ...record, schedule: undefined }, state.canvas.records).title
            : canvasName(state.canvas, record),
        visitId: record.visitId ?? '',
        visitName: visitName(state, record.visitId ?? ''),
        status: record.arrangement,
        intention: record.intention,
        purchased: isPurchasedArrangement(record),
        bookings: bookings.filter((booking) => booking.recordId === record.id),
        source: { kind: 'record', record },
        policy: state.policies.find((policy) => policy.recordId === record.id),
        responsible: arrangementResponsibility(state, record.id),
      },
    ];
  });
  const rentals = state.canvas.rentals.map((rental): ArrangementRow => ({
    id: rental.id,
    kind: 'rental',
    name: rental.provider,
    visitId: rental.from,
    visitName: visitName(state, rental.from),
    status: rental.status,
    intention: '',
    purchased: rental.status === 'Purchased',
    bookings: bookings.filter((booking) => booking.recordId === rental.id),
    source: { kind: 'rental', rental },
    policy: state.policies.find((policy) => policy.recordId === rental.id),
    responsible: arrangementResponsibility(state, rental.id),
  }));
  return [...records, ...rentals];
}

function rowSearchFacts(row: ArrangementRow): string[] {
  const policy = row.policy ? [row.policy.source, row.policy.notes] : [];
  return [
    row.name,
    row.visitName === 'Visit unavailable' ? '' : row.visitName,
    row.status,
    row.responsible?.available ? row.responsible.label : '',
    ...sourceSearchFacts(row),
    ...policy,
    ...row.bookings.map((booking) => booking.location),
  ];
}

function sourceSearchFacts(row: ArrangementRow): string[] {
  if (row.source.kind === 'rental') return [row.source.rental.start, row.source.rental.end];
  const record = row.source.record;
  const dates = record.schedule
    ? [record.schedule.start, record.schedule.end ?? '', record.schedule.localTime ?? '']
    : [];
  return [record.intention, record.notes, ...dates];
}

/** Searches actual source facts with independent kind and purchase selections, without inferring missing purchases. */
export function visibleArrangements(
  state: ArrangementState,
  filters: ArrangementFilters
): ArrangementRow[] {
  const query = normalizeSearchText(filters.query.trim());
  return arrangementRows(state).filter((row) => {
    if (filters.kind && row.kind !== filters.kind) return false;
    if (filters.purchase === 'purchased' && !row.purchased) return false;
    if (filters.purchase === 'not-purchased' && row.purchased) return false;
    return rowSearchFacts(row).some((value) => normalizeSearchText(value).includes(query));
  });
}

/** Groups the exact supplied rows by source visit or source kind; missing visits remain distinct from unset links. */
export function groupArrangements(
  state: ArrangementState,
  rows: ArrangementRow[],
  mode: 'route' | 'kinds'
): { id: string; name: string; rows: ArrangementRow[] }[] {
  const kinds = {
    transport: 'Transport',
    stay: 'Stays',
    event: 'Events & tickets',
    rental: 'Rentals',
  };
  const groups = new Map<string, { id: string; name: string; rows: ArrangementRow[] }>();
  for (const row of rows) {
    const id = mode === 'kinds' ? row.kind : row.visitId;
    const name = mode === 'kinds' ? kinds[row.kind] : row.visitName || 'No visit';
    const group = groups.get(id) ?? { id, name, rows: [] };
    group.rows.push(row);
    groups.set(id, group);
  }
  if (mode === 'kinds') return [...groups.values()];
  const order = state.canvas.order;
  return [...groups.values()].toSorted((left, right) => {
    const a = order.indexOf(left.id);
    const b = order.indexOf(right.id);
    if (a === b) return 0;
    if (a < 0) return 1;
    if (b < 0) return -1;
    return a - b;
  });
}
