import { once } from 'node:events';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBodySchema } from '@pops/types';

import { openTripsDb } from '../../db/index.js';
import { rentals } from '../../db/schema.js';
import { createTrip } from '../../db/services/records.js';
import { createRental, deleteRental } from '../../db/services/rentals.js';
import {
  getResponsibility,
  listResponsibilities,
  replaceResponsibility,
} from '../../db/services/responsibilities.js';
import { createTripsApiApp } from '../app.js';

import type { Server } from 'node:http';

import type { OpenedTripsDb } from '../../db/index.js';

const selected = 'pops:contacts/contact/retired+opaque%2Fidentity';
const canonical = 'pops:contacts/contact/canonical+opaque%2Fidentity';
const resolveContactReference = vi.fn<(uri: string) => Promise<string | null | undefined>>();
let opened: OpenedTripsDb;
let server: Server;
let path: string;
let tripId: number;
let foreignTripId: number;
let rentalId: number;

beforeEach(async () => {
  opened = openTripsDb(':memory:');
  tripId = createTrip(opened.db, {}).id;
  foreignTripId = createTrip(opened.db, {}).id;
  rentalId = createRental(opened.db, tripId, {}).id;
  resolveContactReference.mockReset();
  resolveContactReference.mockResolvedValue(undefined);
  server = createTripsApiApp({
    tripsDb: opened,
    version: 'test',
    selfBaseUrl: 'http://localhost:3018',
    resolveContactReference,
    serviceAccountVerifier: async () => ({
      outcome: 'authenticated',
      principal: { id: 'source', name: 'Source', scopes: ['trips'] },
    }),
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server');
  path = `http://127.0.0.1:${address.port}/trips/${tripId}/responsibilities/rental/${rentalId}`;
});
afterEach(async () => {
  server.closeIdleConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  opened.raw.close();
});
function replace(expectedRevision: number, uri: string | null): Promise<Response> {
  return fetch(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-api-key': 'source' },
    body: JSON.stringify({
      expectedRevision,
      responsibility: uri === null ? null : { kind: 'contact', uri },
    }),
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  const state: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>((resolve) => {
    state.resolve = resolve;
  });
  if (state.resolve === undefined) throw new Error('Promise executor did not initialize');
  return { promise, resolve: state.resolve };
}

describe('Responsibility Contact ownership proof', () => {
  it('rejects a shaped but never-issued identity without creating an assignment', async () => {
    resolveContactReference.mockResolvedValue(null);
    const response = await replace(0, selected);
    expect(response.status).toBe(400);
    expect(ErrorBodySchema.parse(await response.json())).toMatchObject({
      code: 'trips.responsibility.contact_unknown',
      retryable: false,
    });
    expect(resolveContactReference).toHaveBeenCalledExactlyOnceWith(selected);
    expect(listResponsibilities(opened.db, tripId)).toEqual([]);
  });

  it.each(['unavailable', 'thrown', 'malformed'] as const)(
    'keeps upstream %s failures typed and leaves existing state unchanged',
    async (failure) => {
      const before = replaceResponsibility(
        opened.db,
        tripId,
        { kind: 'rental', id: rentalId },
        { expectedRevision: 0, responsibility: { kind: 'self' } }
      );
      if (failure === 'thrown')
        resolveContactReference.mockRejectedValue(new Error('Owner unavailable'));
      if (failure === 'malformed')
        resolveContactReference.mockResolvedValue('pops:documents/document/4');
      const response = await replace(1, selected);
      expect(response.status).toBe(503);
      expect(ErrorBodySchema.parse(await response.json())).toMatchObject({
        code: 'trips.responsibility.contacts_unavailable',
        retryable: true,
      });
      expect(getResponsibility(opened.db, tripId, 'rental', rentalId)).toEqual(before);
    }
  );

  it('stores the issued canonical alias result and retains or clears it without an owner read', async () => {
    resolveContactReference.mockResolvedValue(canonical);
    const created = await replace(0, selected);
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      responsibility: { kind: 'contact', uri: canonical },
      revision: 1,
    });
    resolveContactReference.mockClear();
    resolveContactReference.mockRejectedValue(new Error('Contacts offline'));
    const retained = await replace(1, canonical);
    expect(retained.status).toBe(200);
    expect(await retained.json()).toMatchObject({
      responsibility: { kind: 'contact', uri: canonical },
      revision: 2,
    });
    const cleared = await replace(2, null);
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({ responsibility: null, revision: 3 });
    expect(resolveContactReference).not.toHaveBeenCalled();
    expect((await replace(3, canonical)).status).toBe(503);
    expect(getResponsibility(opened.db, tripId, 'rental', rentalId)).toMatchObject({
      responsibility: null,
      revision: 3,
    });
  });

  it('keeps self selection and independent rental edits usable without Contacts', async () => {
    const self = await fetch(path, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-api-key': 'source' },
      body: JSON.stringify({ expectedRevision: 0, responsibility: { kind: 'self' } }),
    });
    expect(self.status).toBe(200);
    expect(await self.json()).toMatchObject({ responsibility: { kind: 'self' }, revision: 1 });
    const sourcePath = path.replace('/responsibilities/rental/', '/rentals/');
    const edit = await fetch(sourcePath, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-api-key': 'source' },
      body: JSON.stringify({ expectedRevision: 0, provider: 'Captured independently' }),
    });
    expect(edit.status).toBe(200);
    expect(resolveContactReference).not.toHaveBeenCalled();
    expect(getResponsibility(opened.db, tripId, 'rental', rentalId)).toMatchObject({
      responsibility: { kind: 'self' },
      revision: 1,
    });
  });

  it('allows an unchanged retained missing identity without reissuing it', async () => {
    replaceResponsibility(
      opened.db,
      tripId,
      { kind: 'rental', id: rentalId },
      { expectedRevision: 0, responsibility: { kind: 'contact', uri: selected } }
    );
    expect((await replace(1, selected)).status).toBe(200);
    expect(resolveContactReference).not.toHaveBeenCalled();
    expect(getResponsibility(opened.db, tripId, 'rental', rentalId)).toMatchObject({
      responsibility: { kind: 'contact', uri: selected },
      revision: 2,
    });
  });

  it('rejects stale revisions before requesting Contact proof', async () => {
    replaceResponsibility(
      opened.db,
      tripId,
      { kind: 'rental', id: rentalId },
      { expectedRevision: 0, responsibility: { kind: 'self' } }
    );
    expect((await replace(0, selected)).status).toBe(409);
    expect(resolveContactReference).not.toHaveBeenCalled();
  });

  it('rechecks the revision after proof resolves, preserving a concurrent replacement', async () => {
    const pending = deferred<string | null | undefined>();
    const started = deferred<void>();
    resolveContactReference.mockImplementation(() => {
      started.resolve();
      return pending.promise;
    });
    const response = replace(0, selected);
    await started.promise;
    const concurrent = replaceResponsibility(
      opened.db,
      tripId,
      { kind: 'rental', id: rentalId },
      { expectedRevision: 0, responsibility: { kind: 'self' } }
    );
    pending.resolve(canonical);
    expect((await response).status).toBe(409);
    expect(getResponsibility(opened.db, tripId, 'rental', rentalId)).toEqual(concurrent);
  });

  it.each(['deleted', 'foreign'] as const)(
    'rechecks %s target ownership after proof resolves without leaving an orphan',
    async (change) => {
      const pending = deferred<string | null | undefined>();
      const started = deferred<void>();
      resolveContactReference.mockImplementation(() => {
        started.resolve();
        return pending.promise;
      });
      const response = replace(0, selected);
      await started.promise;
      if (change === 'deleted') deleteRental(opened.db, tripId, rentalId, 0);
      else
        opened.db
          .update(rentals)
          .set({ tripId: foreignTripId })
          .where(eq(rentals.id, rentalId))
          .run();
      pending.resolve(canonical);
      expect((await response).status).toBe(404);
      expect(listResponsibilities(opened.db, tripId)).toEqual([]);
      expect(listResponsibilities(opened.db, foreignTripId)).toEqual([]);
    }
  );
});
