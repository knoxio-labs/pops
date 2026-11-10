import { once } from 'node:events';

import { describe, expect, it } from 'vitest';

import { ErrorBodySchema } from '@pops/types';

import { RentalSchema } from '../../contract/rental-schemas.js';
import { ArrangementResponsibilitySchema } from '../../contract/responsibilities.js';
import { openTripsDb } from '../../db/index.js';
import { createTrip } from '../../db/services/records.js';
import { createTripsApiApp } from '../app.js';

describe('Rental and responsibility HTTP source boundary', () => {
  it('guards every operation, validates owners and preserves revisions across replace/clear', async () => {
    const opened = openTripsDb(':memory:');
    const trip = createTrip(opened.db, {});
    const foreign = createTrip(opened.db, {});
    const server = createTripsApiApp({
      tripsDb: opened,
      version: 'test',
      selfBaseUrl: 'http://localhost:3018',
      resolveContactReference: async (uri) => uri,
      serviceAccountVerifier: async (key) => ({
        outcome: 'authenticated',
        principal: { id: key, name: 'Scoped principal', scopes: [`trips.${key}`] },
      }),
    }).listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
      const origin = `http://127.0.0.1:${address.port}`;
      const rentalsPath = `/trips/${trip.id}/rentals`;
      const responsibilityPath = `/trips/${trip.id}/responsibilities`;
      const request = (
        path: string,
        method: string,
        body?: unknown,
        key: string | null = 'rentals'
      ): Promise<Response> =>
        fetch(`${origin}${path}`, {
          method,
          headers: {
            ...(key === null ? {} : { 'x-api-key': key }),
            'content-type': 'application/json',
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      const created = await request(rentalsPath, 'POST', {
        start: '2028-03-01',
        end: '2028-02-29',
        status: 'Reserved',
      });
      expect(created.status).toBe(201);
      const rental = RentalSchema.parse(await created.json());
      expect(rental).toMatchObject({
        start: '2028-03-01',
        end: '2028-02-29',
        pickupVisitId: null,
        returnVisitId: null,
        status: 'Reserved',
        revision: 0,
      });
      const sourcePath = `${rentalsPath}/${rental.id}`;
      const targetPath = `${responsibilityPath}/rental/${rental.id}`;
      for (const [path, method, body] of [
        [rentalsPath, 'GET', undefined],
        [rentalsPath, 'POST', {}],
        [sourcePath, 'GET', undefined],
        [sourcePath, 'PATCH', { expectedRevision: 0 }],
        [sourcePath, 'DELETE', { expectedRevision: 0 }],
      ] as const) {
        expect((await request(path, method, body, null)).status).toBe(401);
        expect((await request(path, method, body, 'responsibilities')).status).toBe(403);
      }
      for (const [path, method, body] of [
        [responsibilityPath, 'GET', undefined],
        [targetPath, 'GET', undefined],
        [targetPath, 'PUT', { expectedRevision: 0, responsibility: { kind: 'self' } }],
      ] as const) {
        expect((await request(path, method, body, null)).status).toBe(401);
        expect((await request(path, method, body, 'rentals')).status).toBe(403);
      }
      for (const [method, body] of [
        ['GET', undefined],
        ['PATCH', { expectedRevision: 0 }],
        ['DELETE', { expectedRevision: 0 }],
      ] as const)
        expect(
          (await request(`/trips/${foreign.id}/rentals/${rental.id}`, method, body)).status
        ).toBe(404);
      expect(
        (
          await request(sourcePath, 'PATCH', {
            expectedRevision: 0,
            pickupVisitId: 99999,
            provider: 'Rejected',
          })
        ).status
      ).toBe(404);
      const missingRevision = await request(sourcePath, 'PATCH', { provider: 'Missing revision' });
      expect(missingRevision.status).toBe(400);
      expect(ErrorBodySchema.parse(await missingRevision.json())).toMatchObject({
        code: 'trips.request.invalid',
        retryable: false,
      });
      expect((await request(rentalsPath, 'POST', { start: '2027-02-29' })).status).toBe(400);
      expect(await (await request(sourcePath, 'GET')).json()).toEqual(rental);
      expect((await request(targetPath, 'GET', undefined, 'responsibilities')).status).toBe(200);
      const unresolved = { kind: 'contact', uri: 'pops:contacts/contact/source-issued-opaque' };
      const assigned = await request(
        targetPath,
        'PUT',
        { expectedRevision: 0, responsibility: unresolved },
        'responsibilities'
      );
      expect(assigned.status).toBe(200);
      expect(ArrangementResponsibilitySchema.parse(await assigned.json())).toMatchObject({
        revision: 1,
        responsibility: unresolved,
      });
      expect((await request(sourcePath, 'GET', undefined, 'responsibilities')).status).toBe(403);
      const staleAssignment = await request(
        targetPath,
        'PUT',
        { expectedRevision: 0, responsibility: null },
        'responsibilities'
      );
      expect(staleAssignment.status).toBe(409);
      expect(ErrorBodySchema.parse(await staleAssignment.json())).toMatchObject({
        code: 'trips.arrangement.arrangement_revision_conflict',
        retryable: false,
      });
      expect(
        (
          await request(
            targetPath,
            'PUT',
            {
              expectedRevision: 1,
              responsibility: { kind: 'contact', uri: 'pops:documents/document/1' },
            },
            'responsibilities'
          )
        ).status
      ).toBe(400);
      expect(
        (
          await request(
            `/trips/${foreign.id}/responsibilities/rental/${rental.id}`,
            'PUT',
            { expectedRevision: 1, responsibility: null },
            'responsibilities'
          )
        ).status
      ).toBe(404);
      const missingTarget = await request(
        `${responsibilityPath}/rental/99999`,
        'PUT',
        { expectedRevision: 0, responsibility: null },
        'responsibilities'
      );
      expect(missingTarget.status).toBe(404);
      expect(ErrorBodySchema.parse(await missingTarget.json())).toMatchObject({
        code: 'trips.record.not_found',
        retryable: false,
      });
      expect(
        (
          await request(
            `${responsibilityPath}/leg/${rental.id}`,
            'GET',
            undefined,
            'responsibilities'
          )
        ).status
      ).toBe(400);
      const cleared = await request(
        targetPath,
        'PUT',
        { expectedRevision: 1, responsibility: null },
        'responsibilities'
      );
      expect(cleared.status).toBe(200);
      expect(ArrangementResponsibilitySchema.parse(await cleared.json())).toMatchObject({
        revision: 2,
        responsibility: null,
      });
      expect(
        (
          await request(
            targetPath,
            'PUT',
            { expectedRevision: 0, responsibility: { kind: 'self' } },
            'responsibilities'
          )
        ).status
      ).toBe(409);
      expect(await (await request(sourcePath, 'GET')).json()).toEqual(rental);
      const updated = await request(sourcePath, 'PATCH', {
        expectedRevision: 0,
        status: 'Purchased',
      });
      expect(updated.status).toBe(200);
      expect(RentalSchema.parse(await updated.json())).toMatchObject({
        revision: 1,
        status: 'Purchased',
        start: rental.start,
        end: rental.end,
      });
      expect((await request(sourcePath, 'DELETE', { expectedRevision: 0 })).status).toBe(409);
      expect((await request(sourcePath, 'DELETE', { expectedRevision: 1 })).status).toBe(204);
      expect(
        await (await request(responsibilityPath, 'GET', undefined, 'responsibilities')).json()
      ).toEqual({ responsibilities: [] });
      expect(await (await request(rentalsPath, 'GET')).json()).toEqual({ rentals: [] });
      const spec: unknown = await (await fetch(`${origin}/openapi`)).json();
      expect(spec).toMatchObject({
        paths: {
          '/trips/{tripId}/rentals': { post: { operationId: 'rentals.create' } },
          '/trips/{tripId}/responsibilities/{targetKind}/{targetId}': {
            put: { operationId: 'responsibilities.replace' },
          },
        },
      });
    } finally {
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      opened.raw.close();
    }
  });
});
