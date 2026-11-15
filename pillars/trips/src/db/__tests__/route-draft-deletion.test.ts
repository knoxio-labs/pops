import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';

import {
  journeyLegs,
  legRemovals,
  meetingPlanOperations,
  routeOperations,
  tripRoutes,
  visits,
} from '../schema.js';
import {
  createDecision,
  createDecisionOption,
  deleteDecisionOption,
} from '../services/decisions.js';
import { createEvent, getEvent } from '../services/events.js';
import { createJourneyGroup } from '../services/journey-groups.js';
import { createJourneyLeg, listJourneyLegs } from '../services/journey-legs.js';
import { getJourney } from '../services/journeys.js';
import { removeJourneyLeg } from '../services/leg-removals.js';
import { getJourneyLegSet } from '../services/leg-set.js';
import { operateMeetingPlan } from '../services/meeting-plans.js';
import { getPlace, getVisit, listVisits } from '../services/records.js';
import { createRental, getRental } from '../services/rentals.js';
import { operateRouteDraft } from '../services/route-draft-operations.js';
import { previewRouteDraftDeletion } from '../services/route-draft-snapshot.js';
import { createStay, getStay, updateStay } from '../services/stays.js';
import { send } from './capture-test-utils.js';
import {
  deleteDraft,
  deletionRequest,
  draftCandidate,
  draftState,
} from './route-draft-test-utils.js';
import { withRouteFixture } from './route-test-utils.js';

import type { RouteDraftSource } from '../../contract/route-draft-schemas.js';

it('actually removes selected unconfirmed sources, keeps allocator identities and the root gap, and leaves a repeated Place occurrence intact', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, second, journey, gap, path, read } = fixture;
    const stay = createStay(db, trip.id, {
      visitId: first.id,
      status: 'Considering',
      documentLinks: [{ uri: 'pops:documents/document/original' }],
    });
    const event = createEvent(db, trip.id, { visitId: first.id, arrangement: 'Not needed' });
    const leg = createJourneyLeg(db, trip.id, journey.id, { intention: 'Alternative' });
    const anchor = gap();
    const draft = path(anchor.id, [
      { kind: 'visit', id: first.id },
      { kind: 'journey', id: journey.id },
    ]);
    const competitor = path(anchor.id, [], 'Other draft');
    const before = draftState(fixture);
    const { result } = deleteDraft(fixture, draft.id, [
      { kind: 'visit', id: first.id },
      { kind: 'journey', id: journey.id },
      { kind: 'journey-leg', journeyId: journey.id, id: leg.id },
      { kind: 'stay', id: stay.id },
      { kind: 'event', id: event.id },
    ]);
    expect(read()).toMatchObject({
      order: [{ kind: 'visit', id: second.id }, anchor],
      paths: [competitor],
      missingSources: [],
    });
    expect(result.current.revision).toBe(before.snapshot.route.revision + 1);
    for (const readRemoved of [
      () => getVisit(db, trip.id, first.id),
      () => getJourney(db, trip.id, journey.id),
      () => getStay(db, trip.id, stay.id),
      () => getEvent(db, trip.id, event.id),
    ]) {
      expect(readRemoved).toThrow('not_found');
    }
    expect(listVisits(db, trip.id)).toEqual([second]);
    expect(getPlace(db, first.placeId).id).toBe(first.placeId);
    expect(getVisit(db, trip.id, second.id)).toEqual(second);
    const archived = db.select().from(visits).where(eq(visits.id, first.id)).get();
    expect(archived).toMatchObject({
      id: first.id,
      removedAt: expect.any(String),
      removalOperationId: result.receipt.operationId,
    });
    expect(db.select().from(journeyLegs).where(eq(journeyLegs.id, leg.id)).get()).toMatchObject({
      removedAt: expect.any(String),
    });
    expect(draftState(fixture)).toMatchObject({ paths: before.paths, gaps: before.gaps });
    expect(db.select().from(routeOperations).all()).toHaveLength(before.operations.length + 1);
    expect(result.currentSources.filter((source) => source.state === 'removed')).toHaveLength(5);
  });
});

it('preserves confirmed children and their exact Visit context while removing explicitly selected unconfirmed neighbours', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, second, gap, path } = fixture;
    const confirmed = createStay(db, trip.id, {
      visitId: first.id,
      status: 'Agreed',
      reference: 'Original booking',
    });
    const disposable = createEvent(db, trip.id, {
      visitId: first.id,
      intention: 'In plan',
      arrangement: 'Not arranged',
    });
    const draft = path(gap().id, [
      { kind: 'visit', id: first.id },
      { kind: 'visit', id: second.id },
    ]);
    const { preview, result } = deleteDraft(fixture, draft.id, [
      { kind: 'visit', id: first.id },
      { kind: 'visit', id: second.id },
      { kind: 'stay', id: confirmed.id },
      { kind: 'event', id: disposable.id },
    ]);
    expect(getStay(db, trip.id, confirmed.id)).toEqual(confirmed);
    expect(getVisit(db, trip.id, first.id)).toEqual(first);
    expect(() => getVisit(db, trip.id, second.id)).toThrow('not_found');
    expect(() => getEvent(db, trip.id, disposable.id)).toThrow('not_found');
    expect(
      result.current.order.some((source) => source.kind === 'visit' && source.id === first.id)
    ).toBe(false);
    expect(draftCandidate(preview, { kind: 'visit', id: first.id })).toMatchObject({
      confirmed: false,
      reasons: ['context'],
      disposition: 'retain',
    });
    expect(draftCandidate(preview, { kind: 'stay', id: confirmed.id }).reasons).toContain(
      'confirmed'
    );
  });
});

it('retains an unticked independent source and its Visit even when both lack any confirmation', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, gap, path } = fixture;
    const event = createEvent(db, trip.id, {
      visitId: first.id,
      intention: 'Alternative',
      arrangement: 'Not arranged',
    });
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const { preview } = deleteDraft(fixture, draft.id, [{ kind: 'visit', id: first.id }]);
    expect(getVisit(db, trip.id, first.id)).toEqual(first);
    expect(getEvent(db, trip.id, event.id)).toEqual(event);
    expect(draftCandidate(preview, { kind: 'event', id: event.id })).toMatchObject({
      selected: false,
      confirmed: false,
      reasons: ['not-selected'],
    });
  });
});

it('defaults related unconfirmed sources to deletion while retaining confirmed and externally shared records unplaced', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, second, gap, path } = fixture;
    const stay = createStay(db, trip.id, { visitId: first.id, status: 'Considering' });
    const event = createEvent(db, trip.id, { visitId: first.id, arrangement: 'Not arranged' });
    const rental = createRental(db, trip.id, {
      pickupVisitId: first.id,
      returnVisitId: first.id,
      status: 'Considering',
    });
    const contactUri = 'pops:contacts/contact/draft-meeting';
    const meeting = operateMeetingPlan(
      db,
      trip.id,
      {
        operationId: randomUUID(),
        command: {
          kind: 'create',
          input: { contactUri, visitId: first.id, agreement: 'Not agreed' },
        },
      },
      contactUri
    ).current;
    const confirmed = createStay(db, trip.id, { visitId: first.id, status: 'Reserved' });
    const shared = createEvent(db, trip.id, { visitId: first.id, arrangement: 'Not arranged' });
    send(db, trip.id, { kind: 'explore.add', source: { kind: 'event', id: shared.id } });
    const crossPathRental = createRental(db, trip.id, {
      pickupVisitId: first.id,
      returnVisitId: second.id,
      status: 'Considering',
    });
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const { preview, result } = deleteDraft(fixture, draft.id);
    for (const source of [
      { kind: 'stay', id: stay.id },
      { kind: 'event', id: event.id },
      { kind: 'rental', id: rental.id },
      { kind: 'meeting', id: meeting.id },
    ] as const) {
      expect(draftCandidate(preview, source)).toMatchObject({
        selected: true,
        confirmed: false,
        disposition: 'remove',
        reasons: [],
      });
      expect(result.currentSources).toContainEqual(
        expect.objectContaining({ source, state: 'removed' })
      );
    }
    expect(() => getStay(db, trip.id, stay.id)).toThrow('not_found');
    expect(() => getEvent(db, trip.id, event.id)).toThrow('not_found');
    expect(() => getRental(db, trip.id, rental.id)).toThrow('not_found');
    expect(draftCandidate(preview, { kind: 'stay', id: confirmed.id })).toMatchObject({
      selected: false,
      confirmed: true,
      disposition: 'retain',
    });
    expect(draftCandidate(preview, { kind: 'event', id: shared.id })).toMatchObject({
      selected: false,
      confirmed: false,
      disposition: 'retain',
    });
    expect(draftCandidate(preview, { kind: 'event', id: shared.id }).reasons).toContain('shared');
    expect(draftCandidate(preview, { kind: 'rental', id: crossPathRental.id })).toMatchObject({
      selected: false,
      disposition: 'retain',
    });
    expect(draftCandidate(preview, { kind: 'rental', id: crossPathRental.id }).reasons).toContain(
      'shared'
    );
    expect(getStay(db, trip.id, confirmed.id)).toEqual(confirmed);
    expect(getEvent(db, trip.id, shared.id)).toEqual(shared);
    expect(getRental(db, trip.id, crossPathRental.id)).toEqual(crossPathRental);
    expect(getVisit(db, trip.id, first.id)).toEqual(first);
    expect(getVisit(db, trip.id, second.id)).toEqual(second);
    expect(draftCandidate(preview, { kind: 'visit', id: first.id }).reasons).toContain('context');
    expect(
      result.current.order.some((source) => source.kind === 'visit' && source.id === first.id)
    ).toBe(false);
    expect(result.current.paths.some((source) => source.id === draft.id)).toBe(false);
  });
});

it('honours an explicitly empty deletion selection instead of applying default related-source deletion', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, gap, path } = fixture;
    const stay = createStay(db, trip.id, { visitId: first.id, status: 'Considering' });
    const event = createEvent(db, trip.id, { visitId: first.id, arrangement: 'Not arranged' });
    const rental = createRental(db, trip.id, {
      pickupVisitId: first.id,
      returnVisitId: first.id,
      status: 'Considering',
    });
    const contactUri = 'pops:contacts/contact/unchecked-meeting';
    const meeting = operateMeetingPlan(
      db,
      trip.id,
      {
        operationId: randomUUID(),
        command: {
          kind: 'create',
          input: { contactUri, visitId: first.id, agreement: 'Not agreed' },
        },
      },
      contactUri
    ).current;
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const { preview, result } = deleteDraft(fixture, draft.id, []);
    expect(preview.selection).toEqual([]);
    expect(preview.candidates).toHaveLength(5);
    for (const candidate of preview.candidates) {
      expect(candidate).toMatchObject({ selected: false, confirmed: false, disposition: 'retain' });
      expect(candidate.reasons).toContain('not-selected');
    }
    expect(result.currentSources).toHaveLength(5);
    expect(result.currentSources.every((source) => source.state === 'active')).toBe(true);
    expect(getVisit(db, trip.id, first.id)).toEqual(first);
    expect(getStay(db, trip.id, stay.id)).toEqual(stay);
    expect(getEvent(db, trip.id, event.id)).toEqual(event);
    expect(getRental(db, trip.id, rental.id)).toEqual(rental);
    expect(draftCandidate(preview, { kind: 'meeting', id: meeting.id }).disposition).toBe('retain');
    expect(result.current.paths.some((source) => source.id === draft.id)).toBe(false);
  });
});

it('removes only unconfirmed legs of an exclusive mixed Journey without changing the confirmed leg or Journey identity', () => {
  withRouteFixture((fixture) => {
    const { db, trip, journey, gap, path } = fixture;
    const purchased = createJourneyLeg(db, trip.id, journey.id, {
      intention: 'Alternative',
      arrangement: 'Not arranged',
      purchase: 'Purchased',
    });
    const booked = createJourneyLeg(db, trip.id, journey.id, {
      arrangement: 'Booked',
      purchase: null,
    });
    const disposable = createJourneyLeg(db, trip.id, journey.id, {
      intention: 'In plan',
      arrangement: 'Not needed',
    });
    const draft = path(gap().id, [{ kind: 'journey', id: journey.id }]);
    const { result } = deleteDraft(fixture, draft.id);
    expect(getJourney(db, trip.id, journey.id)).toEqual(journey);
    expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([purchased, booked]);
    expect(result.currentSources).toContainEqual(
      expect.objectContaining({
        source: { kind: 'journey-leg', journeyId: journey.id, id: disposable.id },
        state: 'removed',
      })
    );
  });
});

it('preserves shared Journey-group members and every leg, even if explicitly selected', () => {
  withRouteFixture((fixture) => {
    const { db, trip, journey, gap, path } = fixture;
    const leg = createJourneyLeg(db, trip.id, journey.id, { arrangement: 'Not arranged' });
    const group = createJourneyGroup(db, trip.id, { currentJourneyId: journey.id });
    const draft = path(gap().id, [{ kind: 'journey', id: journey.id }]);
    const { preview } = deleteDraft(fixture, draft.id, [
      { kind: 'journey', id: journey.id },
      { kind: 'journey-leg', journeyId: journey.id, id: leg.id },
    ]);
    expect(getJourney(db, trip.id, journey.id)).toEqual(journey);
    expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([leg]);
    expect(draftCandidate(preview, { kind: 'journey', id: journey.id }).reasons).toContain(
      'shared'
    );
    expect(draftState(fixture).snapshot.groups).toContainEqual(
      expect.objectContaining({ id: group.id, currentJourneyId: journey.id })
    );
  });
});

it('does not count already removed confirmed legs or Meetings as live protection and preserves their own receipts', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, journey, gap, path } = fixture;
    const confirmed = createJourneyLeg(db, trip.id, journey.id, { purchase: 'Purchased' });
    createJourneyLeg(db, trip.id, journey.id, { arrangement: 'Not arranged' });
    const ownRemoval = randomUUID();
    removeJourneyLeg(
      db,
      { tripId: trip.id, journeyId: journey.id, id: confirmed.id },
      {
        operationId: ownRemoval,
        expectedRevision: getJourneyLegSet(db, trip.id, journey.id).revision,
      }
    );
    const contactUri = 'pops:contacts/contact/removed';
    const meeting = operateMeetingPlan(
      db,
      trip.id,
      {
        operationId: randomUUID(),
        command: { kind: 'create', input: { contactUri, visitId: first.id, agreement: 'Agreed' } },
      },
      contactUri
    ).current;
    operateMeetingPlan(db, trip.id, {
      operationId: randomUUID(),
      command: { kind: 'remove', id: meeting.id, expectedRevision: meeting.revision },
    });
    const legHistory = db.select().from(legRemovals).all();
    const meetingHistory = db.select().from(meetingPlanOperations).all();
    const draft = path(gap().id, [
      { kind: 'visit', id: first.id },
      { kind: 'journey', id: journey.id },
    ]);
    const { preview } = deleteDraft(fixture, draft.id);
    expect(preview.candidates.some((candidate) => candidate.source.kind === 'meeting')).toBe(false);
    expect(
      preview.candidates.some(
        (candidate) =>
          candidate.source.kind === 'journey-leg' && candidate.source.id === confirmed.id
      )
    ).toBe(false);
    expect(() => getVisit(db, trip.id, first.id)).toThrow('not_found');
    expect(() => getJourney(db, trip.id, journey.id)).toThrow('not_found');
    expect(db.select().from(legRemovals).all()).toEqual(legHistory);
    expect(db.select().from(meetingPlanOperations).all()).toEqual(meetingHistory);
    expect(
      db.select().from(journeyLegs).where(eq(journeyLegs.id, confirmed.id)).get()
    ).toMatchObject({ removalOperationId: ownRemoval });
  });
});

it('retains a cross-path Rental and only the exact candidate endpoint it references', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, second, gap, path } = fixture;
    const rental = createRental(db, trip.id, {
      pickupVisitId: first.id,
      returnVisitId: second.id,
      status: 'Considering',
    });
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const { preview } = deleteDraft(fixture, draft.id, [
      { kind: 'visit', id: first.id },
      { kind: 'rental', id: rental.id },
    ]);
    expect(getRental(db, trip.id, rental.id)).toEqual(rental);
    expect(getVisit(db, trip.id, first.id)).toEqual(first);
    expect(getVisit(db, trip.id, second.id)).toEqual(second);
    expect(draftCandidate(preview, { kind: 'rental', id: rental.id }).reasons).toContain('shared');
  });
});

it('rejects foreign, unrelated, duplicate and unlisted leg identities before any effects', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, second, foreign, journey, gap, path } = fixture;
    const leg = createJourneyLeg(db, trip.id, journey.id, {});
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const invalid: RouteDraftSource[][] = [
      [{ kind: 'visit', id: foreign.id }],
      [{ kind: 'visit', id: second.id }],
      [
        { kind: 'visit', id: first.id },
        { kind: 'visit', id: first.id },
      ],
      [{ kind: 'journey-leg', journeyId: journey.id, id: leg.id }],
      [{ kind: 'event', id: Number.MAX_SAFE_INTEGER }],
    ];
    const before = draftState(fixture);
    for (const deleteSources of invalid) {
      expect(() => previewRouteDraftDeletion(db, trip.id, draft.id, { deleteSources })).toThrow(
        'route_draft_conflict'
      );
      expect(draftState(fixture)).toEqual(before);
    }
  });
});

it('rejects changed booking facts, source content, leg membership and new shared references after preview with zero effects', () => {
  for (const change of ['booking', 'content', 'leg', 'reference'] as const) {
    withRouteFixture((fixture) => {
      const { db, trip, first, journey, gap, path } = fixture;
      const stay = createStay(db, trip.id, { visitId: first.id, status: 'Considering' });
      const draft = path(gap().id, [
        { kind: 'visit', id: first.id },
        { kind: 'journey', id: journey.id },
      ]);
      const request = deletionRequest(previewRouteDraftDeletion(db, trip.id, draft.id, {}));
      if (change === 'booking') updateStay(db, trip.id, stay.id, { status: 'Purchased' });
      if (change === 'content')
        updateStay(db, trip.id, stay.id, { notes: 'Changed independent facts' });
      if (change === 'leg') createJourneyLeg(db, trip.id, journey.id, {});
      if (change === 'reference') createJourneyGroup(db, trip.id, { currentJourneyId: journey.id });
      const before = draftState(fixture);
      expect(() => operateRouteDraft(db, trip.id, request)).toThrow('route_draft_conflict');
      expect(draftState(fixture)).toEqual(before);
      expect(getVisit(db, trip.id, first.id)).toEqual(first);
    });
  }
});

it('rolls source removal, collection revisions, route and receipt back if receipt persistence fails', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, journey, gap, path, opened } = fixture;
    const leg = createJourneyLeg(db, trip.id, journey.id, {});
    const stay = createStay(db, trip.id, { visitId: first.id });
    const draft = path(gap().id, [
      { kind: 'visit', id: first.id },
      { kind: 'journey', id: journey.id },
    ]);
    const request = deletionRequest(
      previewRouteDraftDeletion(db, trip.id, draft.id, {
        deleteSources: [
          { kind: 'visit', id: first.id },
          { kind: 'journey', id: journey.id },
          { kind: 'journey-leg', journeyId: journey.id, id: leg.id },
          { kind: 'stay', id: stay.id },
        ],
      })
    );
    opened.raw.exec(
      "CREATE TRIGGER reject_draft_receipt BEFORE INSERT ON route_operations BEGIN SELECT RAISE(ABORT, 'receipt failure'); END"
    );
    const before = draftState(fixture);
    expect(() => operateRouteDraft(db, trip.id, request)).toThrow('receipt failure');
    expect(draftState(fixture)).toEqual(before);
    expect(getStay(db, trip.id, stay.id)).toEqual(stay);
    expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([leg]);
    opened.raw.exec('DROP TRIGGER reject_draft_receipt');
    expect(operateRouteDraft(db, trip.id, request).replayed).toBe(false);
    expect(() => getVisit(db, trip.id, first.id)).toThrow('not_found');
  });
});

it('preserves active Capture, Explore and Decision sharing and immutable originals without detaching their relations', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, journey, gap, path } = fixture;
    const event = createEvent(db, trip.id, { visitId: first.id, arrangement: 'Not arranged' });
    const captured = send(db, trip.id, {
      kind: 'capture.create',
      input: {
        originalText: 'Unedited original',
        attachments: [{ kind: 'document', documentId: 42 }],
      },
      target: { mode: 'existing', target: { kind: 'journey', id: journey.id } },
    });
    send(db, trip.id, { kind: 'explore.add', source: { kind: 'event', id: event.id } });
    const decision = createDecision(db, trip.id, {});
    createDecisionOption(
      db,
      { tripId: trip.id, id: decision.id },
      { affectedSources: [{ kind: 'visit', id: first.id }] },
      decision.revision
    );
    const draft = path(gap().id, [
      { kind: 'visit', id: first.id },
      { kind: 'journey', id: journey.id },
    ]);
    const before = draftState(fixture).snapshot;
    const { preview } = deleteDraft(fixture, draft.id, [
      { kind: 'visit', id: first.id },
      { kind: 'journey', id: journey.id },
      { kind: 'event', id: event.id },
    ]);
    for (const source of [
      { kind: 'visit', id: first.id },
      { kind: 'journey', id: journey.id },
      { kind: 'event', id: event.id },
    ] as const) {
      expect(draftCandidate(preview, source).reasons).toContain('shared');
      expect(draftCandidate(preview, source).confirmed).toBe(false);
    }
    const after = draftState(fixture).snapshot;
    expect(after.captures).toEqual(before.captures);
    expect(after.associations).toEqual(before.associations);
    expect(after.memberships).toEqual(before.memberships);
    expect(after.options).toEqual(before.options);
    expect(captured.receipt.captures[0]).toMatchObject({
      originalText: 'Unedited original',
      attachments: [{ kind: 'document', documentId: 42 }],
    });
    expect(getEvent(db, trip.id, event.id)).toEqual(event);
  });
});

it('keeps removed Decision-option references as history without keeping an unconfirmed Visit live', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, gap, path } = fixture;
    const decision = createDecision(db, trip.id, {});
    const option = createDecisionOption(
      db,
      { tripId: trip.id, id: decision.id },
      { affectedSources: [{ kind: 'visit', id: first.id }] },
      decision.revision
    );
    deleteDecisionOption(
      db,
      { tripId: trip.id, decisionId: decision.id, id: option.id },
      decision.revision + 1
    );
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const history = draftState(fixture).snapshot.options;
    const { preview } = deleteDraft(fixture, draft.id);
    expect(draftCandidate(preview, { kind: 'visit', id: first.id }).disposition).toBe('remove');
    expect(() => getVisit(db, trip.id, first.id)).toThrow('not_found');
    expect(draftState(fixture).snapshot.options).toEqual(history);
  });
});

it('refuses source.move, new path membership and applying an archived Visit or Journey', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, journey, gap, path, run } = fixture;
    const anchor = gap();
    const draft = path(anchor.id, [
      { kind: 'visit', id: first.id },
      { kind: 'journey', id: journey.id },
    ]);
    deleteDraft(fixture, draft.id);
    for (const source of [
      { kind: 'visit', id: first.id },
      { kind: 'journey', id: journey.id },
    ] as const) {
      const before = draftState(fixture);
      expect(() =>
        run({ kind: 'source.move', source, destination: { kind: 'route', before: anchor } })
      ).toThrow('not_found');
      expect(() =>
        run({
          kind: 'path.create',
          title: 'Invalid resurrection',
          gapId: anchor.id,
          members: [source],
        })
      ).toThrow('not_found');
      expect(draftState(fixture)).toEqual(before);
    }
    const current = fixture.read();
    db.update(tripRoutes)
      .set({ content: { order: current.order, paths: [draft] } })
      .where(eq(tripRoutes.tripId, trip.id))
      .run();
    const before = draftState(fixture);
    expect(() => run({ kind: 'path.apply', pathId: draft.id })).toThrow('not_found');
    expect(draftState(fixture)).toEqual(before);
  });
});

it('rejects applied, foreign, absent and unavailable-member paths without changing live sources or allocations', () => {
  withRouteFixture((fixture) => {
    const { db, trip, other, first, second, gap, path, run } = fixture;
    const anchor = gap();
    const applied = path(anchor.id, [{ kind: 'visit', id: first.id }]);
    run({ kind: 'path.apply', pathId: applied.id });
    let before = draftState(fixture);
    expect(() => previewRouteDraftDeletion(db, trip.id, applied.id, {})).toThrow(
      'route_membership_conflict'
    );
    expect(() => previewRouteDraftDeletion(db, other.id, applied.id, {})).toThrow('not_found');
    expect(() => previewRouteDraftDeletion(db, trip.id, Number.MAX_SAFE_INTEGER, {})).toThrow(
      'not_found'
    );
    expect(draftState(fixture)).toEqual(before);
    const draft = path(anchor.id, [{ kind: 'visit', id: second.id }]);
    db.update(visits)
      .set({ removedAt: '2028-03-11T00:00:00.000Z' })
      .where(eq(visits.id, second.id))
      .run();
    before = draftState(fixture);
    expect(() => previewRouteDraftDeletion(db, trip.id, draft.id, {})).toThrow(
      'route_draft_conflict'
    );
    expect(draftState(fixture)).toEqual(before);
    expect(getVisit(db, trip.id, first.id)).toEqual(first);
  });
});

it.each([
  {
    table: 'visits',
    trigger:
      "CREATE TRIGGER reject_draft_effect AFTER UPDATE ON visits BEGIN SELECT RAISE(ABORT, 'effect failure'); END",
  },
  {
    table: 'stays',
    trigger:
      "CREATE TRIGGER reject_draft_effect AFTER UPDATE ON stays BEGIN SELECT RAISE(ABORT, 'effect failure'); END",
  },
  {
    table: 'journey_legs',
    trigger:
      "CREATE TRIGGER reject_draft_effect AFTER UPDATE ON journey_legs BEGIN SELECT RAISE(ABORT, 'effect failure'); END",
  },
  {
    table: 'journeys',
    trigger:
      "CREATE TRIGGER reject_draft_effect AFTER UPDATE ON journeys BEGIN SELECT RAISE(ABORT, 'effect failure'); END",
  },
  {
    table: 'trip_routes',
    trigger:
      "CREATE TRIGGER reject_draft_effect AFTER UPDATE ON trip_routes BEGIN SELECT RAISE(ABORT, 'effect failure'); END",
  },
])('rolls back all effects when the $table write aborts', ({ trigger }) => {
  withRouteFixture((fixture) => {
    const { db, trip, first, journey, gap, path, opened } = fixture;
    const leg = createJourneyLeg(db, trip.id, journey.id, {});
    const stay = createStay(db, trip.id, { visitId: first.id });
    const draft = path(gap().id, [
      { kind: 'visit', id: first.id },
      { kind: 'journey', id: journey.id },
    ]);
    const request = deletionRequest(
      previewRouteDraftDeletion(db, trip.id, draft.id, {
        deleteSources: [
          { kind: 'visit', id: first.id },
          { kind: 'journey', id: journey.id },
          { kind: 'journey-leg', journeyId: journey.id, id: leg.id },
          { kind: 'stay', id: stay.id },
        ],
      })
    );
    opened.raw.exec(trigger);
    const before = draftState(fixture);
    expect(() => operateRouteDraft(db, trip.id, request)).toThrow('effect failure');
    expect(draftState(fixture)).toEqual(before);
    expect(getVisit(db, trip.id, first.id)).toEqual(first);
    expect(getStay(db, trip.id, stay.id)).toEqual(stay);
    expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([leg]);
  });
});
