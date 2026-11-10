import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { MeetingPlanOperationResultSchema } from '../../contract/meeting-plan-schemas.js';
import { visits } from '../../db/schema.js';
import { getMeetingPlan, listMeetingPlans } from '../../db/services/meeting-plan-queries.js';
import { deferredMeetingValue, meetingHttp } from './meeting-plan-http.js';

const canonical = 'pops:contacts/contact/canonical';

describe('Meeting HTTP source and owning Contact boundary', () => {
  it('authenticates reads/operations, validates identity namespace and publishes source scopes', async () => {
    const h = await meetingHttp(async () => canonical);
    try {
      expect((await h.request(h.path, 'GET', undefined, null)).status).toBe(401);
      expect((await h.request(h.path, 'GET', undefined, 'stays')).status).toBe(403);
      expect(
        (await h.operation({ kind: 'create', input: { contactUri: 'pops:contacts/entity/1' } }))
          .status
      ).toBe(400);
      expect(
        (
          await h.request(`${h.path}/operations`, 'POST', {
            operationId: randomUUID(),
            command: { kind: 'update', id: 1, patch: {} },
          })
        ).status
      ).toBe(400);
      const source = await h.create();
      expect(source.current.contactUri).toBe(canonical);
      expect(
        (await h.request(`/trips/${h.other.id}/meeting-plans/${source.current.id}`)).status
      ).toBe(404);
      expect(
        (
          await h.request(
            `${h.path}/operations`,
            'POST',
            {
              operationId: randomUUID(),
              command: { kind: 'remove', id: source.current.id, expectedRevision: 1 },
            },
            'stays'
          )
        ).status
      ).toBe(403);
      const spec = z
        .object({
          paths: z.record(
            z.string(),
            z.object({ post: z.object({ operationId: z.string() }).optional() })
          ),
        })
        .parse(await (await fetch(`${h.origin}/openapi`)).json());
      expect(spec.paths['/trips/{tripId}/meeting-plans/operations']?.post?.operationId).toBe(
        'meetingPlans.operate'
      );
    } finally {
      await h.close();
    }
  });

  it('keeps immutable raw retry identity and skips Contact calls even after its canonical identity changes', async () => {
    const resolver = vi.fn(async () => canonical);
    const h = await meetingHttp(resolver);
    try {
      const operationId = randomUUID();
      const command = {
        kind: 'create',
        input: { contactUri: 'pops:contacts/contact/historical' },
      } as const;
      const first = MeetingPlanOperationResultSchema.parse(
        await (await h.operation(command, operationId)).json()
      );
      resolver.mockResolvedValue('pops:contacts/contact/new-canonical');
      const replay = MeetingPlanOperationResultSchema.parse(
        await (await h.operation(command, operationId)).json()
      );
      expect(replay).toEqual({ ...first, replayed: true });
      expect(resolver).toHaveBeenCalledExactlyOnceWith('pops:contacts/contact/historical');
      expect(
        (await h.operation({ kind: 'create', input: { contactUri: canonical } }, operationId))
          .status
      ).toBe(409);
      expect(listMeetingPlans(h.db, h.trip.id)).toEqual([first.current]);
    } finally {
      await h.close();
    }
  });

  it('allows retained unavailable identity edits/clears and keeps new unknown/unavailable selections atomic', async () => {
    const resolver = vi.fn<() => Promise<string | null | undefined>>().mockResolvedValue(canonical);
    const h = await meetingHttp(resolver);
    try {
      const source = await h.create();
      resolver.mockResolvedValue(undefined);
      const response = await h.operation({
        kind: 'update',
        id: source.current.id,
        expectedRevision: 1,
        patch: {
          contactUri: canonical,
          notes: 'Retained',
          startDate: '2028-02-10',
          endDate: '2028-02-01',
        },
      });
      const edited = MeetingPlanOperationResultSchema.parse(await response.json()).current;
      expect(edited).toMatchObject({
        contactUri: canonical,
        startDate: '2028-02-10',
        endDate: '2028-02-01',
      });
      expect(resolver).toHaveBeenCalledTimes(1);
      const command = {
        kind: 'update',
        id: edited.id,
        expectedRevision: edited.revision,
        patch: { contactUri: 'pops:contacts/contact/unknown', notes: 'Rejected' },
      } as const;
      expect((await h.operation(command)).status).toBe(503);
      resolver.mockRejectedValueOnce(new Error('Contacts unreachable'));
      expect((await h.operation(command)).status).toBe(503);
      resolver.mockResolvedValue(null);
      expect((await h.operation(command)).status).toBe(400);
      expect(getMeetingPlan(h.db, h.trip.id, edited.id)).toEqual(edited);
      expect(
        (
          await h.operation({
            kind: 'update',
            id: edited.id,
            expectedRevision: edited.revision,
            patch: { contactUri: null },
          })
        ).status
      ).toBe(200);
    } finally {
      await h.close();
    }
  });

  it('rechecks source CAS after deferred external identity verification', async () => {
    const resolver = vi.fn(async () => canonical);
    const h = await meetingHttp(resolver);
    try {
      const source = await h.create();
      const started = deferredMeetingValue<void>();
      const finish = deferredMeetingValue<string>();
      resolver.mockImplementationOnce(async () => {
        started.resolve();
        return finish.promise;
      });
      const pending = h.operation({
        kind: 'update',
        id: source.current.id,
        expectedRevision: 1,
        patch: { contactUri: 'pops:contacts/contact/new' },
      });
      await started.promise;
      const foreign = h.run({
        kind: 'update',
        id: source.current.id,
        expectedRevision: 1,
        patch: { notes: 'Foreign' },
      });
      finish.resolve(canonical);
      expect((await pending).status).toBe(409);
      expect(getMeetingPlan(h.db, h.trip.id, source.current.id)).toEqual(foreign.current);
    } finally {
      await h.close();
    }
  });

  it('rechecks a new Visit association after deferred Contact verification', async () => {
    const resolver = vi.fn(async () => canonical);
    const h = await meetingHttp(resolver);
    try {
      const source = await h.create();
      const started = deferredMeetingValue<void>();
      const finish = deferredMeetingValue<string>();
      resolver.mockImplementationOnce(async () => {
        started.resolve();
        return finish.promise;
      });
      const pending = h.operation({
        kind: 'update',
        id: source.current.id,
        expectedRevision: 1,
        patch: { contactUri: 'pops:contacts/contact/new', visitId: h.first.id },
      });
      await started.promise;
      h.db.delete(visits).where(eq(visits.id, h.first.id)).run();
      finish.resolve(canonical);
      expect((await pending).status).toBe(404);
      expect(getMeetingPlan(h.db, h.trip.id, source.current.id)).toEqual(source.current);
    } finally {
      await h.close();
    }
  });

  it('commits concurrent duplicate operation IDs once after both Contact resolutions', async () => {
    const started = deferredMeetingValue<void>();
    const finish = deferredMeetingValue<string>();
    let requests = 0;
    const h = await meetingHttp(async () => {
      requests += 1;
      if (requests === 2) started.resolve();
      return finish.promise;
    });
    try {
      const operationId = randomUUID();
      const command = { kind: 'create', input: { contactUri: canonical } } as const;
      const first = h.operation(command, operationId);
      const second = h.operation(command, operationId);
      await started.promise;
      finish.resolve(canonical);
      const outcomes = await Promise.all([first, second]);
      expect(outcomes.map((response) => response.status)).toEqual([200, 200]);
      const results = await Promise.all(
        outcomes.map(async (response) =>
          MeetingPlanOperationResultSchema.parse(await response.json())
        )
      );
      expect(results[0]?.receipt).toEqual(results[1]?.receipt);
      expect(results.map((result) => result.replayed).toSorted()).toEqual([false, true]);
      expect(listMeetingPlans(h.db, h.trip.id)).toHaveLength(1);
    } finally {
      await h.close();
    }
  });
});
