import { describe, expect, it } from 'vitest';

import { initialJourney } from './fixture';
import {
  addLeg,
  connectionMinutes,
  endpointInstant,
  endpointLabel,
  journeyFindings,
  journeyWindow,
  legMinutes,
  removeLeg,
  updateLeg,
} from './model';

import type { JourneyEndpoint, JourneyLeg, JourneyState } from './model';

function leg(state: JourneyState, index = 0): JourneyLeg {
  const source = state.legs[index];
  if (!source) throw new Error('Fixture leg missing');
  return source;
}
function endpoint(local: string, timeZone = 'America/Chicago'): JourneyEndpoint {
  return { locationId: 'dfw', local, timeZone };
}
function ids(state: JourneyState): string[] {
  return journeyFindings(state).map((item) => item.id);
}

function contextItem(
  id: string,
  start: JourneyEndpoint,
  end: JourneyEndpoint,
  kind: JourneyState['context'][number]['kind'] = 'event'
): JourneyState['context'][number] {
  return { id, title: id, kind, start, end };
}

describe('journey source timing', () => {
  it('uses actual instants across the date line and overnight connection', () => {
    const state = initialJourney('default');
    expect(legMinutes(leg(state))).toBe(915);
    expect(connectionMinutes(leg(state), leg(state, 1))).toBe(165);
    const overnight = initialJourney('overnight');
    expect(connectionMinutes(leg(overnight), leg(overnight, 1))).toBe(1485);
    expect(legMinutes(leg(overnight, 1))).toBe(750);
  });

  it.each([
    ['', 'America/Chicago'],
    ['2028-02-30T10:00', 'America/Chicago'],
    ['2028-03-12T02:30', 'America/Chicago'],
    ['2028-11-05T01:30', 'America/Chicago'],
    ['2028-01-15T10:00', 'Missing/Zone'],
    ['2028-01-15T10:00', ''],
  ])('does not resolve invalid or ambiguous %s in %s', (local, zone) => {
    expect(endpointInstant(endpoint(local, zone))).toBeUndefined();
  });

  it.each(['2028-02-30T10:00', '2028-11-05T01:30'])(
    'flags a complete invalid or ambiguous clock %s',
    (local) => {
      const state = initialJourney('default');
      const changed = updateLeg(state, { ...leg(state), to: endpoint(local) });
      expect(journeyFindings(changed)).toContainEqual(
        expect.objectContaining({ id: 'syd-dfw-clock', kind: 'conflict' })
      );
    }
  );

  it('rejects reversed legs but preserves signed connection overlaps for findings', () => {
    const state = initialJourney('default');
    const source = leg(state);
    const reversed = { ...source, from: source.to, to: source.from };
    expect(legMinutes(reversed)).toBeUndefined();
    expect(ids(updateLeg(state, reversed))).toContain('syd-dfw-reversed');
    const next = { ...leg(state, 1), from: endpoint('2028-01-15T08:00') };
    expect(connectionMinutes(source, next)).toBe(-15);
    expect(ids(updateLeg(state, next))).toContain('syd-dfw-dfw-gru-overlap');
  });

  it('uses configured connection minimum with an inclusive safe boundary', () => {
    const state = initialJourney('tight-connection');
    expect(ids(state)).toContain('syd-dfw-dfw-gru-buffer');
    expect(ids({ ...state, minimumConnectionMinutes: 45 })).not.toContain('syd-dfw-dfw-gru-buffer');
    expect(ids({ ...state, minimumConnectionMinutes: 46 })).toContain('syd-dfw-dfw-gru-buffer');
  });

  it('reports wrong airports as a transfer gap without claiming a numeric connection is safe', () => {
    const state = initialJourney('tight-connection');
    const next = leg(state, 1);
    const changed = updateLeg(state, { ...next, from: { ...next.from, locationId: 'gru' } });
    expect(ids(changed)).toContain('syd-dfw-dfw-gru-transfer');
    expect(ids(changed)).not.toContain('syd-dfw-dfw-gru-buffer');
  });

  it('retains chronology conflicts across changed airports after source reordering', () => {
    const state = initialJourney('default');
    const reordered = { ...state, legs: state.legs.toReversed() };
    expect(ids(reordered)).toContain('dfw-gru-syd-dfw-transfer');
    expect(journeyFindings(reordered)).toContainEqual(
      expect.objectContaining({
        id: 'dfw-gru-syd-dfw-overlap',
        kind: 'conflict',
        legIds: ['dfw-gru', 'syd-dfw'],
      })
    );
    expect(reordered.legs.toReversed()).toEqual(state.legs);
  });

  it('does not derive numeric conflicts from unknown clocks or missing locations', () => {
    const state = initialJourney('default');
    const source = leg(state);
    const changed = updateLeg(state, {
      ...source,
      to: { ...source.to, local: '', locationId: 'gone' },
    });
    expect(ids(changed)).toContain('syd-dfw-location');
    expect(ids(changed)).not.toContain('syd-dfw-clock');
    expect(
      journeyFindings({ ...changed, context: [] })
        .filter((item) => item.legIds.includes(source.id))
        .every((item) => item.kind === 'gap')
    ).toBe(true);
    expect(endpointLabel(state, { ...source.to, locationId: '' })).toBe('');
    expect(endpointLabel(state, { ...source.to, locationId: 'gone' })).toBe('Location unavailable');
    expect(endpointLabel(state, source.to)).toBe('Dallas Fort Worth Airport (DFW)');
    const noCodes = { ...state, locations: state.locations.map((item) => ({ ...item, code: '' })) };
    expect(endpointLabel(noCodes, source.to)).toBe('Dallas Fort Worth Airport');
  });
});

describe('journey context and immutable source facts', () => {
  it('compares preflight context to the explicit configured airport buffer', () => {
    const state = initialJourney('default');
    expect(journeyFindings(state).find((item) => item.id === 'preflight-airport')?.title).toBe(
      'Example project handover · 120 min before departure · 180 min buffer'
    );
    expect(ids({ ...state, airportBufferMinutes: 120 })).not.toContain('preflight-airport');
    expect(ids({ ...state, airportBufferMinutes: 121 })).toContain('preflight-airport');
    const unknown = state.context.map((item) => ({ ...item, end: { ...item.end, local: '' } }));
    expect(ids({ ...state, context: unknown })).not.toContain('preflight-airport');
  });

  it.each([
    ['09:00', '11:00', true],
    ['11:00', '12:00', false],
    ['11:00', '09:00', false],
  ])('checks an event %s–%s against departure', (start, end, conflict) => {
    const state = initialJourney('default');
    const context = [
      contextItem(
        'overlap',
        endpoint(`2028-01-15T${start}`, 'Australia/Sydney'),
        endpoint(`2028-01-15T${end}`, 'Australia/Sydney')
      ),
    ];
    expect(ids({ ...state, context }).includes('overlap-airport')).toBe(conflict);
  });

  it('flags the intentionally missing arrival transfer until a valid explicit transfer is supplied', () => {
    const state = initialJourney('default');
    expect(ids(state)).toContain('stay-transfer');
    expect(ids(initialJourney('overnight'))).not.toContain('stay-transfer');
    const transfer = {
      id: 'arrival',
      title: 'Example transfer',
      kind: 'transfer',
      start: { ...leg(state, 1).to, local: '2028-01-16T01:00' },
      end: { locationId: 'stay', local: '2028-01-16T02:00', timeZone: 'America/Sao_Paulo' },
    } satisfies JourneyState['context'][number];
    expect(ids({ ...state, context: [...state.context, transfer] })).not.toContain('stay-transfer');
    expect(
      ids({
        ...state,
        context: [...state.context, { ...transfer, end: { ...transfer.end, local: '' } }],
      })
    ).toContain('stay-transfer');
  });

  it('keeps an already-open stay relevant and accepts transfer arrival after check-in', () => {
    const state = initialJourney('default');
    const arrival = leg(state, 1).to;
    const stayStart = { ...arrival, locationId: 'stay', local: '2028-01-15T15:00' };
    const stayEnd = { ...stayStart, local: '2028-01-20T10:00' };
    const stay = contextItem('open-stay', stayStart, stayEnd, 'stay');
    expect(ids({ ...state, context: [stay] })).toContain('open-stay-transfer');
    expect(ids({ ...state, context: [{ ...stay, end: arrival }] })).not.toContain(
      'open-stay-transfer'
    );
    const transferEnd = { ...stayStart, local: '2028-01-16T02:00' };
    const transfer = contextItem('recorded', arrival, transferEnd, 'transfer');
    expect(ids({ ...state, context: [stay, transfer] })).not.toContain('open-stay-transfer');
    expect(
      ids({ ...state, context: [stay, { ...transfer, end: { ...transferEnd, local: '' } }] })
    ).toContain('open-stay-transfer');
  });

  it('includes overlapping context and the whole arrival day plus one local day', () => {
    const state = initialJourney('default');
    const context = [
      contextItem(
        'window',
        endpoint('2028-01-13T12:00', 'Australia/Sydney'),
        endpoint('2028-01-14T00:00', 'Australia/Sydney')
      ),
      contextItem(
        'last-day',
        endpoint('2028-01-17T23:59', 'America/Sao_Paulo'),
        endpoint('2028-01-18T01:00', 'America/Sao_Paulo')
      ),
      contextItem(
        'outside',
        endpoint('2028-01-18T00:00', 'America/Sao_Paulo'),
        endpoint('2028-01-18T01:00', 'America/Sao_Paulo')
      ),
    ];
    expect(journeyWindow({ ...state, context }).map((entry) => entry.id)).toEqual([
      'window',
      'last-day',
    ]);
    expect(journeyWindow({ ...state, legs: [] })).toEqual([]);
    expect(journeyWindow(updateLeg(state, { ...leg(state), from: endpoint('') }))).toEqual([]);
  });

  it('retains local-day boundaries over DST instead of adding fixed 24-hour days', () => {
    const state = initialJourney('default');
    const source = {
      ...leg(state),
      from: endpoint('2028-03-12T10:00'),
      to: endpoint('2028-03-12T11:00'),
    };
    const context = [
      contextItem('dst', endpoint('2028-03-13T23:30'), endpoint('2028-03-13T23:45')),
    ];
    expect(journeyWindow({ ...state, legs: [source], context })).toEqual(context);
  });

  it('appends a soft blank leg and preserves existing purchase and attachment facts', () => {
    const state = initialJourney('default');
    const appended = addLeg(state, 'train');
    expect(appended.legs.at(-1)).toMatchObject({
      mode: 'train',
      status: 'Considering',
      reference: '',
      from: { locationId: '', local: '', timeZone: '' },
      to: { locationId: '', local: '', timeZone: '' },
    });
    expect(appended.legs.slice(0, 2)).toEqual(state.legs);
    const reordered = { ...appended, legs: appended.legs.toReversed() };
    const removed = removeLeg(reordered, leg(state).id);
    expect(removed.legs.find((item) => item.id === leg(state, 1).id)).toEqual(leg(state, 1));
    expect(removed.documentIds).toEqual(state.documentIds);
    expect(removed.reference).toBe(state.reference);
    expect(state.legs).toHaveLength(2);
    expect(journeyFindings(addLeg(initialJourney('empty'), 'ferry'))).toEqual([]);
  });

  it('preserves purchase facts and exposes the fictional unavailable document reference', () => {
    const state = initialJourney('missing-reference');
    expect(state.documentIds).toEqual(['unavailable-document']);
    expect(state.documents.some((item) => item.id === state.documentIds[0])).toBe(false);
    const source = leg(state);
    const changed = updateLeg(state, { ...source, from: endpoint('') });
    expect(leg(changed).status).toBe('Purchased');
    expect(leg(changed).reference).toBe('SAMPLE123');
    expect(
      ids({ ...state, legs: state.legs.map((item) => ({ ...item, reference: '' })) })
    ).not.toContain('syd-dfw-reference');
  });
});
