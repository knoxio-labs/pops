import { describe, expect, it } from 'vitest';

import { createArrangementState } from './fixture';
import {
  arrangementCoverage,
  arrangementRows,
  groupArrangements,
  visibleArrangements,
  type ArrangementFilters,
} from './model';

const all: ArrangementFilters = { query: '', kind: '', purchase: 'all' };

describe('source-preserving arrangements', () => {
  it('uses ordered source route endpoints for distinct transport identities and preserves explicit titles', () => {
    const state = createArrangementState();
    const transports = arrangementRows(state).filter((row) => row.kind === 'transport');
    expect(transports.map((row) => row.name)).toEqual([
      'SYD → DFW → GRU',
      'POA → REC',
      'FLN → SYD',
    ]);
    const outbound = transports[0];
    if (outbound?.source.kind !== 'record') throw new Error('Missing transport source');
    const route = structuredClone(outbound.source.record.route);
    outbound.source.record.title = 'Explicit overnight journey';
    expect(arrangementRows(state).find((row) => row.id === outbound.id)?.name).toBe(
      'Explicit overnight journey'
    );
    expect(outbound.source.record.route).toEqual(route);
  });

  it('keeps pending and purchased rows together and only hardens explicit purchased source facts', () => {
    const state = createArrangementState();
    const before = structuredClone(state);
    const rows = arrangementRows(state);
    expect(rows.some((row) => row.purchased)).toBe(true);
    expect(rows.some((row) => !row.purchased && row.status === 'Booked')).toBe(true);
    const rental = rows.find((row) => row.kind === 'rental');
    expect(rental).toMatchObject({ status: 'Reserved', purchased: false });
    expect(rental?.bookings[0]).toMatchObject({
      allDay: true,
      startAt: '2027-12-14T00:00:00Z',
      endAt: '2027-12-29T00:00:00Z',
    });
    const freeEvent = rows.find((row) => row.kind === 'event' && row.status === 'Not needed');
    expect(freeEvent?.purchased).toBe(false);
    expect(
      arrangementCoverage(state).some((finding) => finding.recordIds.includes(freeEvent?.id ?? ''))
    ).toBe(false);
    expect(state).toEqual(before);
    for (const row of rows) {
      if (row.source.kind === 'record')
        expect(row.source.record).toBe(state.canvas.records.find((record) => record.id === row.id));
    }
  });

  it('groups the same rows by source route order or source kind without substituting missing references', () => {
    const state = createArrangementState();
    const rows = arrangementRows(state);
    for (const mode of ['route', 'kinds'] as const) {
      const groups = groupArrangements(state, rows, mode);
      expect(
        groups
          .flatMap((group) => group.rows)
          .map((row) => row.id)
          .toSorted()
      ).toEqual(rows.map((row) => row.id).toSorted());
    }
    const missing = createArrangementState('missing-reference');
    expect(
      groupArrangements(missing, arrangementRows(missing), 'route').find(
        (group) => group.id === 'removed-visit'
      )?.name
    ).toBe('Visit unavailable');
    expect(visibleArrangements(missing, { ...all, query: 'Visit unavailable' })).toEqual([]);
  });

  it('combines accent-folded source search, exact source kind and purchase-flag filters', () => {
    const state = createArrangementState();
    expect(
      visibleArrangements(state, {
        ...all,
        query: 'POUSADA',
        kind: 'stay',
        purchase: 'purchased',
      }).map((row) => row.name)
    ).toEqual(['Pousada do Largo']);
    expect(visibleArrangements(state, { ...all, query: 'Sao Paulo' }).length).toBeGreaterThan(0);
    expect(visibleArrangements(state, { ...all, kind: 'rental', purchase: 'purchased' })).toEqual(
      []
    );
    expect(
      visibleArrangements(state, { ...all, kind: 'rental', purchase: 'not-purchased' })
    ).toHaveLength(1);
    expect(
      visibleArrangements(state, { ...all, query: 'fare difference' }).some(
        (row) => row.policy?.changeCost?.amount === 180
      )
    ).toBe(true);
  });
});

describe('explicit logistics coverage', () => {
  it('keeps unknown accommodation dates unknown and respects explicit open route segments', () => {
    const state = createArrangementState('empty');
    state.canvas.records = [
      {
        id: 'a',
        title: 'A',
        kind: 'city',
        placeId: 'a',
        intention: 'In plan',
        arrangement: 'Not needed',
        notes: '',
      },
      {
        id: 'gap',
        title: 'Open segment',
        kind: 'gap',
        placeId: '',
        intention: 'Considering',
        arrangement: 'Not needed',
        notes: '',
      },
      {
        id: 'b',
        title: 'B',
        kind: 'city',
        placeId: 'b',
        intention: 'In plan',
        arrangement: 'Not needed',
        notes: '',
      },
    ];
    state.canvas.order = ['a', 'gap', 'b'];
    expect(arrangementCoverage(state)).toEqual([]);
    state.canvas.order = ['a', 'b'];
    expect(arrangementCoverage(state)).toEqual([
      {
        id: 'transport-a-b',
        kind: 'transport',
        recordIds: ['a', 'b'],
        title: 'Transport not recorded',
        detail: 'A → B',
      },
    ]);
    expect(
      arrangementCoverage(createArrangementState('unknown-dates')).every(
        (finding) => finding.kind !== 'stay'
      )
    ).toBe(true);
  });

  it('uses arranged source stays for half-open coverage without requiring purchase', () => {
    const state = createArrangementState('empty');
    state.canvas.records = [
      {
        id: 'visit',
        title: 'Visit',
        kind: 'city',
        placeId: 'city',
        intention: 'In plan',
        arrangement: 'Not needed',
        notes: '',
        timing: { arrival: '2028-01-01', departure: '2028-01-04' },
      },
      {
        id: 'stay',
        title: 'Stay',
        kind: 'stay',
        placeId: 'city',
        visitId: 'visit',
        intention: 'In plan',
        arrangement: 'Booked',
        notes: '',
        schedule: { start: '2028-01-01', end: '2028-01-03' },
      },
    ];
    state.canvas.order = ['visit'];
    expect(arrangementCoverage(state)).toMatchObject([
      {
        kind: 'stay',
        recordIds: ['visit'],
        detail: 'Visit',
        start: '2028-01-03',
        end: '2028-01-04',
      },
    ]);
    const stay = state.canvas.records[1];
    if (!stay) throw new Error('Missing stay source');
    stay.schedule = { start: '2028-01-01', end: '2028-01-04' };
    expect(arrangementCoverage(state)).toEqual([]);
    expect(arrangementRows(state)[0]?.purchased).toBe(false);
  });
});
