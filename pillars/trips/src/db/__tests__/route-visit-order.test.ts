import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';

import { tripRoutes, visits } from '../schema.js';
import { createVisit, getVisit, listVisits, reorderVisits } from '../services/records.js';
import { withRouteFixture } from './route-test-utils.js';

it('projects a complete legacy permutation only into each container’s Visit slots and preserves every Journey/gap token', () => {
  withRouteFixture(({ db, trip, first, second, journey, read, run, gap, path }) => {
    const third = createVisit(db, trip.id, { placeId: first.placeId });
    const fourth = createVisit(db, trip.id, { placeId: first.placeId });
    const anchor = gap();
    const alternative = path(anchor.id, [
      { kind: 'visit', id: second.id },
      { kind: 'journey', id: journey.id },
      { kind: 'visit', id: fourth.id },
    ]);
    const original = [first, second, third, fourth].map((visit) => getVisit(db, trip.id, visit.id));
    run({
      kind: 'route.reorder',
      order: [{ kind: 'visit', id: first.id }, anchor, { kind: 'visit', id: third.id }],
    });
    const before = read();
    const result = reorderVisits(db, trip.id, [fourth.id, third.id, second.id, first.id]);
    expect(read().order).toEqual([
      { kind: 'visit', id: third.id },
      anchor,
      { kind: 'visit', id: first.id },
    ]);
    expect(read().paths[0]).toEqual({
      ...alternative,
      members: [
        { kind: 'visit', id: fourth.id },
        { kind: 'journey', id: journey.id },
        { kind: 'visit', id: second.id },
      ],
    });
    expect(read().revision).toBe(before.revision + 1);
    expect(result.map((visit) => visit.id)).toEqual([third.id, first.id, fourth.id, second.id]);
    for (const visit of original)
      expect(getVisit(db, trip.id, visit.id)).toEqual({ ...visit, revision: visit.revision + 1 });
    const appended = createVisit(db, trip.id, { placeId: first.placeId });
    expect(read().order.at(-1)).toEqual({ kind: 'visit', id: appended.id });
    expect(listVisits(db, trip.id).map((visit) => visit.id)).toEqual([
      third.id,
      first.id,
      appended.id,
      fourth.id,
      second.id,
    ]);
  });
});

it('keeps unplaced canonical Visits visible in existing source order and supports no Visit slots', () => {
  withRouteFixture(({ db, trip, first, second, read, gap, path }) => {
    const anchor = gap();
    path(anchor.id, [
      { kind: 'visit', id: first.id },
      { kind: 'visit', id: second.id },
    ]);
    expect(read().order).toEqual([anchor]);
    reorderVisits(db, trip.id, [second.id, first.id]);
    expect(listVisits(db, trip.id).map((visit) => visit.id)).toEqual([second.id, first.id]);
    const row = db.select().from(tripRoutes).where(eq(tripRoutes.tripId, trip.id)).get();
    if (row === undefined) throw new Error('Expected route');
    db.update(tripRoutes)
      .set({ content: { ...row.content, paths: [] } })
      .where(eq(tripRoutes.tripId, trip.id))
      .run();
    expect(listVisits(db, trip.id).map((visit) => visit.id)).toEqual([second.id, first.id]);
  });
});

it('rejects malformed legacy permutations and exhaustion atomically across route and every Visit revision', () => {
  withRouteFixture(({ db, trip, first, second, foreign, read }) => {
    const before = read();
    const source = listVisits(db, trip.id);
    for (const ids of [[first.id], [first.id, first.id], [first.id, foreign.id]]) {
      expect(() => reorderVisits(db, trip.id, ids)).toThrow('order_invalid');
      expect(read()).toEqual(before);
      expect(listVisits(db, trip.id)).toEqual(source);
    }
    db.update(visits)
      .set({ revision: Number.MAX_SAFE_INTEGER })
      .where(eq(visits.id, second.id))
      .run();
    expect(() => reorderVisits(db, trip.id, [second.id, first.id])).toThrow(
      'visit_revision_exhausted'
    );
    expect(read()).toEqual(before);
    db.update(visits).set({ revision: 0 }).where(eq(visits.id, second.id)).run();
    db.update(tripRoutes)
      .set({ revision: Number.MAX_SAFE_INTEGER })
      .where(eq(tripRoutes.tripId, trip.id))
      .run();
    expect(() => createVisit(db, trip.id, { placeId: first.placeId })).toThrow(
      'route_revision_conflict'
    );
    expect(listVisits(db, trip.id)).toEqual(source);
  });
});
