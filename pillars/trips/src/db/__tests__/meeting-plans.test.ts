import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { meetingPlans, visits } from '../schema.js';
import { getMeetingPlan, listMeetingPlans } from '../services/meeting-plan-queries.js';
import { operateMeetingPlan } from '../services/meeting-plans.js';
import { listVisits } from '../services/records.js';
import { meetingFixture } from './meeting-plan-fixture.js';

describe('Meeting source ownership and independent facts', () => {
  let f: ReturnType<typeof meetingFixture>;
  beforeEach(() => {
    f = meetingFixture();
  });
  afterEach(() => {
    f.opened.raw.close();
  });

  it('keeps repeated Visit occurrences distinct and preserves partial/reversed independent dates', () => {
    const a = f.create({
      visitId: f.first.id,
      startDate: '2028-03-04',
      agreement: 'Agreed',
    }).current;
    const b = f.create({
      visitId: f.second.id,
      startDate: '2028-03-05',
      endDate: '2028-03-01',
      intention: 'Planned',
    }).current;
    expect(a).toMatchObject({
      contactUri: 'pops:contacts/contact/canonical',
      endDate: null,
      intention: 'Considering',
      agreement: 'Agreed',
    });
    expect(b).toMatchObject({
      visitId: f.second.id,
      startDate: '2028-03-05',
      endDate: '2028-03-01',
      intention: 'Planned',
      agreement: 'Not agreed',
    });
    expect(listVisits(f.db, f.trip.id).map((visit) => visit.id)).toEqual([f.first.id, f.second.id]);
    expect(listMeetingPlans(f.db, f.trip.id)).toEqual([a, b]);
  });

  it('rejects new absent/foreign Visits and trip identities without partial writes', () => {
    const source = f.create().current;
    for (const visitId of [f.foreign.id, 99999]) {
      expect(() => f.create({ visitId })).toThrow('not_found');
      expect(() =>
        f.run({
          kind: 'update',
          id: source.id,
          expectedRevision: source.revision,
          patch: { visitId, notes: 'Rejected' },
        })
      ).toThrow('not_found');
    }
    expect(() => getMeetingPlan(f.db, f.other.id, source.id)).toThrow('not_found');
    expect(() =>
      operateMeetingPlan(
        f.db,
        99999,
        {
          operationId: randomUUID(),
          command: { kind: 'create', input: { contactUri: 'pops:contacts/contact/a' } },
        },
        'pops:contacts/contact/a'
      )
    ).toThrow('not_found');
    expect(listMeetingPlans(f.db, f.trip.id)).toEqual([source]);
  });

  it('retains missing Visit and Contact identities during unrelated edits and allows explicit clearing', () => {
    const source = f.create({ visitId: f.first.id }).current;
    f.db.delete(visits).where(eq(visits.id, f.first.id)).run();
    const edited = f.run({
      kind: 'update',
      id: source.id,
      expectedRevision: source.revision,
      patch: { notes: 'Retained', contactUri: source.contactUri, visitId: source.visitId },
    }).current;
    expect(edited).toMatchObject({
      contactUri: source.contactUri,
      visitId: f.first.id,
      notes: 'Retained',
    });
    const cleared = f.run({
      kind: 'update',
      id: source.id,
      expectedRevision: edited.revision,
      patch: { contactUri: null, visitId: null, startDate: null },
    }).current;
    expect(cleared).toMatchObject({ contactUri: null, visitId: null });
  });

  it('requires verified new Contact identity and rejects stale/exhausted revisions atomically', () => {
    expect(() =>
      f.run({ kind: 'create', input: { contactUri: 'pops:contacts/contact/a' } })
    ).toThrow('meeting_contact_unavailable');
    const source = f.create().current;
    expect(() =>
      f.run({ kind: 'update', id: source.id, expectedRevision: 99, patch: { notes: 'Rejected' } })
    ).toThrow('meeting_revision_conflict');
    expect(getMeetingPlan(f.db, f.trip.id, source.id)).toEqual(source);
    f.db
      .update(meetingPlans)
      .set({ revision: Number.MAX_SAFE_INTEGER - 1 })
      .where(eq(meetingPlans.id, source.id))
      .run();
    const terminal = f.run({
      kind: 'update',
      id: source.id,
      expectedRevision: Number.MAX_SAFE_INTEGER - 1,
      patch: { notes: 'Terminal safe revision' },
    });
    expect(terminal.current.revision).toBe(Number.MAX_SAFE_INTEGER);
    expect(() =>
      f.run({ kind: 'remove', id: source.id, expectedRevision: Number.MAX_SAFE_INTEGER })
    ).toThrow('meeting_revision_exhausted');
    expect(getMeetingPlan(f.db, f.trip.id, source.id).revision).toBe(Number.MAX_SAFE_INTEGER);
  });
});
