import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';

import { journeys, stays, tripDocumentAssociations, tripRoutes, visits } from '../schema.js';
import { createEvent, getEvent } from '../services/events.js';
import { createJourneyLeg, listJourneyLegs, updateJourneyLeg } from '../services/journey-legs.js';
import { deleteJourney, getJourney } from '../services/journeys.js';
import { getJourneyLegSet } from '../services/leg-set.js';
import { getMeetingPlan } from '../services/meeting-plan-queries.js';
import { operateMeetingPlan } from '../services/meeting-plans.js';
import { getVisit } from '../services/records.js';
import { createRental, getRental } from '../services/rentals.js';
import { createStay, getStay, updateStay } from '../services/stays.js';
import { deleteDraft, draftState, undoDraft } from './route-draft-test-utils.js';
import { withRouteFixture } from './route-test-utils.js';

it('restores exact source and path identities with new lifecycle revisions instead of creating replacements', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, journey, gap, path } = fixture;
    const stay = createStay(db, trip.id, {
      visitId: first.id,
      reference: 'Source identity',
      documentLinks: [{ uri: 'pops:documents/document/retained-original' }],
    });
    const event = createEvent(db, trip.id, { visitId: first.id, timing: { start: '2028-03-10' } });
    const rental = createRental(db, trip.id, { pickupVisitId: first.id, returnVisitId: first.id });
    const contactUri = 'pops:contacts/contact/person';
    const meeting = operateMeetingPlan(
      db,
      trip.id,
      {
        operationId: randomUUID(),
        command: {
          kind: 'create',
          input: { contactUri, visitId: first.id, intention: 'Planned', agreement: 'Not agreed' },
        },
      },
      contactUri
    ).current;
    const leg = createJourneyLeg(db, trip.id, journey.id, {
      from: { date: '2028-03-10', placeId: first.placeId },
      notes: 'Independent source facts',
    });
    const draft = path(gap().id, [
      { kind: 'journey', id: journey.id },
      { kind: 'visit', id: first.id },
    ]);
    const before = draftState(fixture);
    const { result } = deleteDraft(fixture, draft.id, [
      { kind: 'visit', id: first.id },
      { kind: 'journey', id: journey.id },
      { kind: 'journey-leg', journeyId: journey.id, id: leg.id },
      { kind: 'stay', id: stay.id },
      { kind: 'event', id: event.id },
      { kind: 'rental', id: rental.id },
      { kind: 'meeting', id: meeting.id },
    ]);
    expect(result.currentSources.filter((source) => source.state === 'removed')).toHaveLength(7);
    const restored = undoDraft(fixture, result.receipt.operationId);
    expect(restored.current).toEqual({
      ...before.snapshot.route,
      revision: result.current.revision + 1,
    });
    expect(restored.receipt.undoneOperationId).toBe(result.receipt.operationId);
    expect(restored.currentSources.every((source) => source.state === 'active')).toBe(true);
    expect(getVisit(db, trip.id, first.id)).toMatchObject({
      id: first.id,
      placeId: first.placeId,
      timing: first.timing,
      revision: first.revision + 2,
    });
    expect(getJourney(db, trip.id, journey.id)).toMatchObject({
      id: journey.id,
      name: journey.name,
      sourceLinks: journey.sourceLinks,
    });
    expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([
      expect.objectContaining({ id: leg.id, from: leg.from, notes: leg.notes }),
    ]);
    expect(getStay(db, trip.id, stay.id)).toMatchObject({
      id: stay.id,
      reference: stay.reference,
      documentLinks: stay.documentLinks,
    });
    expect(getEvent(db, trip.id, event.id)).toMatchObject({ id: event.id, timing: event.timing });
    expect(getRental(db, trip.id, rental.id)).toMatchObject({
      id: rental.id,
      pickupVisitId: first.id,
      returnVisitId: first.id,
      revision: rental.revision + 2,
    });
    expect(getMeetingPlan(db, trip.id, meeting.id)).toMatchObject({
      id: meeting.id,
      contactUri,
      revision: meeting.revision + 2,
      removed: false,
    });
    expect(draftState(fixture)).toMatchObject({ paths: before.paths, gaps: before.gaps });
    expect(db.select().from(visits).where(eq(visits.id, first.id)).get()).toMatchObject({
      removalRevision: 2,
      removedAt: null,
      removalOperationId: null,
    });
  });
});

it('keeps independent edits to retained confirmed and context sources when restoring a draft', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, second, gap, path } = fixture;
    const stay = createStay(db, trip.id, { visitId: first.id, status: 'Purchased' });
    const draft = path(gap().id, [
      { kind: 'visit', id: first.id },
      { kind: 'visit', id: second.id },
    ]);
    const { result } = deleteDraft(fixture, draft.id);
    const edited = updateStay(db, trip.id, stay.id, {
      notes: 'Independent edit must survive Undo',
    });
    undoDraft(fixture, result.receipt.operationId);
    expect(getStay(db, trip.id, stay.id)).toEqual(edited);
    expect(getVisit(db, trip.id, first.id)).toEqual(first);
    expect(getVisit(db, trip.id, second.id).id).toBe(second.id);
  });
});

it('supports own LIFO across two source deletions while rejecting an earlier inverse before its successor', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, second, gap, path } = fixture;
    const anchor = gap();
    const a = path(anchor.id, [{ kind: 'visit', id: first.id }]);
    const b = path(anchor.id, [{ kind: 'visit', id: second.id }]);
    const before = draftState(fixture);
    const firstDelete = deleteDraft(fixture, a.id).result;
    const secondDelete = deleteDraft(fixture, b.id).result;
    const removed = draftState(fixture);
    expect(() => undoDraft(fixture, firstDelete.receipt.operationId)).toThrow(
      'route_draft_undo_conflict'
    );
    expect(draftState(fixture)).toEqual(removed);
    undoDraft(fixture, secondDelete.receipt.operationId);
    const restored = undoDraft(fixture, firstDelete.receipt.operationId);
    expect(restored.current).toEqual({
      ...before.snapshot.route,
      revision: before.snapshot.route.revision + 4,
    });
    expect(getVisit(db, trip.id, first.id).revision).toBe(first.revision + 2);
    expect(getVisit(db, trip.id, second.id).revision).toBe(second.revision + 2);
  });
});

it('rejects a foreign round trip with identical route values rather than accepting value equality as own lineage', () => {
  withRouteFixture((fixture) => {
    const { first, gap, path, run, read } = fixture;
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const { result } = deleteDraft(fixture, draft.id);
    const order = read().order;
    run({ kind: 'route.reorder', order: order.toReversed() });
    run({ kind: 'route.reorder', order });
    const before = draftState(fixture);
    expect(() => undoDraft(fixture, result.receipt.operationId)).toThrow(
      'route_draft_undo_conflict'
    );
    expect(draftState(fixture)).toEqual(before);
  });
});

it('rejects restored-then-removed source ABA even when visible values and the old removal owner are identical', () => {
  withRouteFixture((fixture) => {
    const { db, first, gap, path } = fixture;
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const { result } = deleteDraft(fixture, draft.id);
    const removed = db.select().from(visits).where(eq(visits.id, first.id)).get();
    if (removed === undefined) throw new Error('Expected retained Visit identity');
    db.update(visits)
      .set({
        removedAt: null,
        removalOperationId: null,
        revision: removed.revision + 1,
        removalRevision: removed.removalRevision + 1,
      })
      .where(eq(visits.id, first.id))
      .run();
    db.update(visits)
      .set({
        removedAt: removed.removedAt,
        removalOperationId: removed.removalOperationId,
        revision: removed.revision + 2,
        removalRevision: removed.removalRevision + 2,
      })
      .where(eq(visits.id, first.id))
      .run();
    const before = draftState(fixture);
    expect(() => undoDraft(fixture, result.receipt.operationId)).toThrow(
      'route_draft_undo_conflict'
    );
    expect(draftState(fixture)).toEqual(before);
  });
});

it('rejects changed archived source facts and newly attached references with no partial restoration', () => {
  for (const change of ['edit', 'reference'] as const) {
    withRouteFixture((fixture) => {
      const { db, trip, first, gap, path } = fixture;
      const stay = createStay(db, trip.id, { visitId: first.id });
      const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
      const { result } = deleteDraft(fixture, draft.id, [
        { kind: 'visit', id: first.id },
        { kind: 'stay', id: stay.id },
      ]);
      if (change === 'edit')
        db.update(stays).set({ notes: 'Foreign archived edit' }).where(eq(stays.id, stay.id)).run();
      if (change === 'reference')
        db.insert(tripDocumentAssociations)
          .values({ tripId: trip.id, documentId: 42, targetKind: 'stay', targetId: stay.id })
          .run();
      const before = draftState(fixture);
      expect(() => undoDraft(fixture, result.receipt.operationId)).toThrow(
        'route_draft_undo_conflict'
      );
      expect(draftState(fixture)).toEqual(before);
      expect(() => getVisit(db, trip.id, first.id)).toThrow('not_found');
    });
  }
});

it('rejects stale leg collection revisions after another writer adds a live leg to the retained mixed Journey', () => {
  withRouteFixture((fixture) => {
    const { db, trip, journey, gap, path } = fixture;
    const confirmed = createJourneyLeg(db, trip.id, journey.id, { arrangement: 'Agreed' });
    createJourneyLeg(db, trip.id, journey.id, { arrangement: 'Not arranged' });
    const draft = path(gap().id, [{ kind: 'journey', id: journey.id }]);
    const { result } = deleteDraft(fixture, draft.id);
    const foreign = createJourneyLeg(db, trip.id, journey.id, {
      notes: 'New live collection member',
    });
    const before = draftState(fixture);
    expect(() => undoDraft(fixture, result.receipt.operationId)).toThrow(
      'route_draft_undo_conflict'
    );
    expect(draftState(fixture)).toEqual(before);
    expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([confirmed, foreign]);
  });
});

it('rolls back an earlier restoration when a later source cannot advance its exhausted revision', () => {
  withRouteFixture((fixture) => {
    const { db, first, second, gap, path } = fixture;
    db.update(visits)
      .set({ revision: Number.MAX_SAFE_INTEGER - 1 })
      .where(eq(visits.id, second.id))
      .run();
    const draft = path(gap().id, [
      { kind: 'visit', id: first.id },
      { kind: 'visit', id: second.id },
    ]);
    const { result } = deleteDraft(fixture, draft.id);
    const before = draftState(fixture);
    expect(() => undoDraft(fixture, result.receipt.operationId)).toThrow('route_draft_conflict');
    expect(draftState(fixture)).toEqual(before);
  });
});

it('rejects exhausted route and collection guards without acknowledging Undo or changing source lifecycles', () => {
  for (const guard of ['route', 'collection'] as const) {
    withRouteFixture((fixture) => {
      const { db, trip, first, journey, gap, path } = fixture;
      createJourneyLeg(db, trip.id, journey.id, {});
      const draft = path(gap().id, [
        { kind: 'visit', id: first.id },
        { kind: 'journey', id: journey.id },
      ]);
      const { result } = deleteDraft(fixture, draft.id);
      if (guard === 'route')
        db.update(tripRoutes)
          .set({ revision: Number.MAX_SAFE_INTEGER })
          .where(eq(tripRoutes.tripId, trip.id))
          .run();
      if (guard === 'collection')
        db.update(journeys)
          .set({ legRevision: Number.MAX_SAFE_INTEGER })
          .where(eq(journeys.id, journey.id))
          .run();
      const before = draftState(fixture);
      expect(() => undoDraft(fixture, result.receipt.operationId)).toThrow(
        guard === 'route' ? 'route_revision_conflict' : 'route_draft_undo_conflict'
      );
      expect(draftState(fixture)).toEqual(before);
    });
  }
});

it('rolls back all restored identities and owned lineage when the Undo receipt insert fails', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, gap, path, opened } = fixture;
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const { result } = deleteDraft(fixture, draft.id);
    opened.raw.exec(
      "CREATE TRIGGER reject_undo_receipt BEFORE INSERT ON route_operations BEGIN SELECT RAISE(ABORT, 'undo receipt failure'); END"
    );
    const before = draftState(fixture);
    expect(() => undoDraft(fixture, result.receipt.operationId)).toThrow('undo receipt failure');
    expect(draftState(fixture)).toEqual(before);
    expect(() => getVisit(db, trip.id, first.id)).toThrow('not_found');
    opened.raw.exec('DROP TRIGGER reject_undo_receipt');
    expect(undoDraft(fixture, result.receipt.operationId).current.paths).toEqual([draft]);
  });
});

it('rejects restoring a path whose deliberately retained Journey was independently deleted', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, journey, gap, path } = fixture;
    const draft = path(gap().id, [
      { kind: 'journey', id: journey.id },
      { kind: 'visit', id: first.id },
    ]);
    const { result } = deleteDraft(fixture, draft.id, [{ kind: 'visit', id: first.id }]);
    expect(getJourney(db, trip.id, journey.id).id).toBe(journey.id);
    deleteJourney(db, trip.id, journey.id);
    expect(fixture.read().revision).toBe(result.current.revision);
    const before = draftState(fixture);
    expect(() => undoDraft(fixture, result.receipt.operationId)).toThrow(
      'route_draft_undo_conflict'
    );
    expect(draftState(fixture)).toEqual(before);
    expect(() => getVisit(db, trip.id, first.id)).toThrow('not_found');
  });
});

it.each([false, true])(
  'preserves source-aware LIFO through own intervening placement Undo; foreign collection edit: %s',
  (foreignEdit) => {
    withRouteFixture((fixture) => {
      const { db, trip, journey, gap, path, run } = fixture;
      const a = createJourneyLeg(db, trip.id, journey.id, {
        notes: 'First selected unconfirmed source',
      });
      const b = createJourneyLeg(db, trip.id, journey.id, {
        notes: 'Initially unticked independent leg',
      });
      const c = createJourneyLeg(db, trip.id, journey.id, { arrangement: 'Booked' });
      const initialCollection = getJourneyLegSet(db, trip.id, journey.id);
      const anchor = gap();
      const originalPath = path(anchor.id, [{ kind: 'journey', id: journey.id }]);
      const originalRoute = draftState(fixture).snapshot.route;
      const firstDelete = deleteDraft(fixture, originalPath.id, [
        { kind: 'journey-leg', journeyId: journey.id, id: a.id },
      ]).result;
      expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([b, c]);
      const placement = run({
        kind: 'path.create',
        title: 'Second explicit placement',
        gapId: anchor.id,
        members: [{ kind: 'journey', id: journey.id }],
      });
      const secondPath = placement.current.paths.at(-1);
      if (secondPath === undefined) throw new Error('Expected second path');
      const secondDelete = deleteDraft(fixture, secondPath.id, [
        { kind: 'journey-leg', journeyId: journey.id, id: b.id },
      ]).result;
      expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([c]);
      undoDraft(fixture, secondDelete.receipt.operationId);
      expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([
        expect.objectContaining({ id: b.id, notes: b.notes }),
        c,
      ]);
      let foreignSource = c;
      if (foreignEdit) {
        foreignSource = updateJourneyLeg(
          db,
          { tripId: trip.id, journeyId: journey.id, id: c.id },
          { notes: 'Foreign edit with identical collection membership' }
        );
      }
      run({ kind: 'undo', targetOperationId: placement.receipt.operationId });
      if (foreignEdit) {
        const before = draftState(fixture);
        expect(() => undoDraft(fixture, firstDelete.receipt.operationId)).toThrow(
          'route_draft_undo_conflict'
        );
        expect(draftState(fixture)).toEqual(before);
        expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([
          expect.objectContaining({ id: b.id }),
          foreignSource,
        ]);
        return;
      }
      const restored = undoDraft(fixture, firstDelete.receipt.operationId);
      expect(restored.current).toEqual({ ...originalRoute, revision: originalRoute.revision + 6 });
      expect(restored.current.paths).toEqual([originalPath]);
      expect(getJourneyLegSet(db, trip.id, journey.id)).toEqual({
        revision: initialCollection.revision + 4,
        legs: [
          expect.objectContaining({ id: a.id, notes: a.notes }),
          expect.objectContaining({ id: b.id, notes: b.notes }),
          c,
        ],
      });
    });
  }
);
