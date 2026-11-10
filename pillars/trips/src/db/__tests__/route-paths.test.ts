import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';

import { journeys, routeGaps, routePaths, tripRoutes } from '../schema.js';
import { createEvent, getEvent } from '../services/events.js';
import { createJourneyLeg, listJourneyLegs } from '../services/journey-legs.js';
import { getJourney } from '../services/journeys.js';
import { getVisit } from '../services/records.js';
import { createStay, getStay } from '../services/stays.js';
import { withRouteFixture } from './route-test-utils.js';

import type { RouteSource } from '../../contract/route-schemas.js';

it('moves the entire ordered path before its explicit gap, retains competitors and never changes source or booking facts', () => {
  withRouteFixture(({ db, trip, first, second, journey, read, run, gap, path }) => {
    const stay = createStay(db, trip.id, {
      visitId: second.id,
      status: 'Purchased',
      timing: { arrival: '2028-03-09', departure: '2028-03-08' },
    });
    const event = createEvent(db, trip.id, { visitId: second.id, name: 'Linked event' });
    const leg = createJourneyLeg(db, trip.id, journey.id, {
      mode: 'Chosen source mode',
      from: { placeId: first.placeId, local: '2028-03-11T21:00', timeZone: 'UTC' },
      to: { sourceLabel: 'Original destination', local: '2028-03-10T10:00', timeZone: 'UTC' },
      purchase: 'Purchased',
      reference: 'Original reference',
    });
    const original = {
      first: getVisit(db, trip.id, first.id),
      second: getVisit(db, trip.id, second.id),
      journey: getJourney(db, trip.id, journey.id),
    };
    const anchor = gap();
    const chosen = path(anchor.id, [
      { kind: 'journey', id: journey.id },
      { kind: 'visit', id: second.id },
    ]);
    const competitor = path(anchor.id, [], 'Other path');
    const before = read();
    const applied = run({ kind: 'path.apply', pathId: chosen.id });
    expect(applied.current.order).toEqual([
      { kind: 'visit', id: first.id },
      ...chosen.members,
      anchor,
    ]);
    expect(applied.current.paths).toEqual([{ ...chosen, state: 'applied' }, competitor]);
    expect(applied.receipt.before.order).toEqual(before.order);
    expect(getVisit(db, trip.id, first.id)).toEqual(original.first);
    expect(getVisit(db, trip.id, second.id)).toEqual(original.second);
    expect(getJourney(db, trip.id, journey.id)).toEqual(original.journey);
    expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([leg]);
    expect(getStay(db, trip.id, stay.id)).toEqual(stay);
    expect(getEvent(db, trip.id, event.id)).toEqual(event);
    const repeated = run({ kind: 'path.apply', pathId: chosen.id });
    expect(repeated.current).toEqual(applied.current);
    expect(repeated.receipt.after).toEqual(repeated.receipt.before);
    expect(() => run({ kind: 'undo', targetOperationId: repeated.receipt.operationId })).toThrow(
      'route_undo_conflict'
    );
  });
});

it('moves a canonical source exclusively between root and alternatives, retaining explicit member order', () => {
  withRouteFixture(({ first, second, journey, read, run, gap, path }) => {
    const anchor = gap();
    const a = path(anchor.id, [{ kind: 'visit', id: first.id }]);
    const b = path(anchor.id, [{ kind: 'visit', id: second.id }]);
    run({
      kind: 'source.move',
      source: { kind: 'visit', id: first.id },
      destination: { kind: 'path', pathId: b.id, before: { kind: 'visit', id: second.id } },
    });
    expect(read().paths.find((item) => item.id === a.id)?.members).toEqual([]);
    expect(read().paths.find((item) => item.id === b.id)?.members).toEqual([
      { kind: 'visit', id: first.id },
      { kind: 'visit', id: second.id },
    ]);
    run({
      kind: 'source.move',
      source: { kind: 'journey', id: journey.id },
      destination: { kind: 'route', before: anchor },
    });
    expect(read().order).toEqual([{ kind: 'journey', id: journey.id }, anchor]);
    run({
      kind: 'source.move',
      source: { kind: 'visit', id: first.id },
      destination: { kind: 'route', before: anchor },
    });
    expect(read().order).toEqual([
      { kind: 'journey', id: journey.id },
      { kind: 'visit', id: first.id },
      anchor,
    ]);
    expect(read().paths.find((item) => item.id === b.id)?.members).toEqual([
      { kind: 'visit', id: second.id },
    ]);
  });
});

it('rejects foreign/missing members, overlapping alternatives and invalid anchors atomically, including identity allocations', () => {
  withRouteFixture(({ db, first, foreign, read, run, gap, path }) => {
    const anchor = gap();
    path(anchor.id, [{ kind: 'visit', id: first.id }]);
    const before = read();
    const allocated = db.select().from(routePaths).all();
    const invalid: RouteSource[][] = [
      [{ kind: 'visit', id: foreign.id }],
      [{ kind: 'visit', id: first.id }],
      [{ kind: 'journey', id: Number.MAX_SAFE_INTEGER }],
    ];
    for (const members of invalid) {
      expect(() =>
        run({ kind: 'path.create', title: 'Rejected', gapId: anchor.id, members })
      ).toThrow();
      expect(read()).toEqual(before);
      expect(db.select().from(routePaths).all()).toEqual(allocated);
    }
    const gaps = db.select().from(routeGaps).all();
    expect(() =>
      run({ kind: 'gap.create', before: { kind: 'gap', id: Number.MAX_SAFE_INTEGER } })
    ).toThrow('route_membership_conflict');
    expect(db.select().from(routeGaps).all()).toEqual(gaps);
    expect(read()).toEqual(before);
  });
});

it('retains missing source references visibly and rejects incomplete path application without partial movement', () => {
  withRouteFixture(({ db, second, journey, read, run, gap, path }) => {
    const anchor = gap();
    const alternative = path(anchor.id, [
      { kind: 'visit', id: second.id },
      { kind: 'journey', id: journey.id },
    ]);
    db.delete(journeys).where(eq(journeys.id, journey.id)).run();
    const before = read();
    expect(before.missingSources).toEqual([{ kind: 'journey', id: journey.id }]);
    expect(before.paths[0]?.members).toEqual(alternative.members);
    expect(() => run({ kind: 'path.apply', pathId: alternative.id })).toThrow('not_found');
    expect(read()).toEqual(before);
  });
});

it('pins UUID payload/revision and rejects stale writes and revision exhaustion without allocating identities', () => {
  withRouteFixture(({ db, trip, read, run }) => {
    const revision = read().revision;
    const operationId = randomUUID();
    const first = run({ kind: 'gap.create', before: null }, operationId, revision);
    expect(run({ kind: 'gap.create', before: null }, operationId, revision)).toMatchObject({
      receipt: first.receipt,
      replayed: true,
    });
    expect(() => run({ kind: 'gap.create', before: null }, operationId, revision + 1)).toThrow(
      'route_operation_mismatch'
    );
    expect(() => run({ kind: 'gap.create', before: null }, randomUUID(), revision)).toThrow(
      'route_revision_conflict'
    );
    const gaps = db.select().from(routeGaps).all();
    db.update(tripRoutes)
      .set({ revision: Number.MAX_SAFE_INTEGER })
      .where(eq(tripRoutes.tripId, trip.id))
      .run();
    expect(() => run({ kind: 'gap.create', before: null })).toThrow('route_revision_conflict');
    expect(db.select().from(routeGaps).all()).toEqual(gaps);
  });
});

it('rejects duplicate or incomplete root/path permutations and moves to self or an applied path', () => {
  withRouteFixture(({ first, second, read, run, gap, path }) => {
    const anchor = gap();
    const alternative = path(anchor.id, [
      { kind: 'visit', id: first.id },
      { kind: 'visit', id: second.id },
    ]);
    expect(() =>
      run({
        kind: 'path.reorder',
        pathId: alternative.id,
        members: [
          { kind: 'visit', id: first.id },
          { kind: 'visit', id: first.id },
        ],
      })
    ).toThrow('order_invalid');
    run({
      kind: 'path.reorder',
      pathId: alternative.id,
      members: alternative.members.toReversed(),
    });
    const applied = run({ kind: 'path.apply', pathId: alternative.id });
    const before = read();
    expect(() => run({ kind: 'route.reorder', order: applied.current.order.slice(1) })).toThrow(
      'order_invalid'
    );
    expect(() =>
      run({
        kind: 'source.move',
        source: { kind: 'visit', id: first.id },
        destination: { kind: 'route', before: { kind: 'visit', id: first.id } },
      })
    ).toThrow('route_membership_conflict');
    expect(() =>
      run({
        kind: 'source.move',
        source: { kind: 'visit', id: first.id },
        destination: { kind: 'path', pathId: alternative.id, before: null },
      })
    ).toThrow('route_membership_conflict');
    expect(read()).toEqual(before);
    run({ kind: 'route.reorder', order: before.order.toReversed() });
    expect(read().order).toEqual(before.order.toReversed());
  });
});
