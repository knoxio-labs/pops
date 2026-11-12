import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TripCreateOperationResultSchema } from '../../contract/trip-create-operations.js';
import { openTripsDb } from '../../db/index.js';
import { trips } from '../../db/schema.js';
import { createTripOperation } from '../../db/services/trip-create-operations.js';
import { createTripsApiApp } from '../app.js';

import type { Server } from 'node:http';

import type { TripCreateOperation } from '../../contract/trip-create-operations.js';

const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
const databasePath = join(scratch, `trip-create-operations-${randomUUID()}.db`);
const tagId = 'ac8bc979-9995-4f78-a0dc-b8fa34c74fc9';
const servers: Server[] = [];
const handles: ReturnType<typeof openTripsDb>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    })
  );
  handles.splice(0).forEach(({ raw }) => raw.close());
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
});

function open(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(scratch, { recursive: true });
  const opened = openTripsDb(path);
  handles.push(opened);
  return opened;
}

async function serve(
  opened: ReturnType<typeof openTripsDb>,
  fetchSharedTagIds?: () => Promise<readonly string[] | undefined>
) {
  const server = createTripsApiApp({
    tripsDb: opened,
    version: 'test',
    selfBaseUrl: 'http://localhost:3018',
    fetchSharedTagIds,
    serviceAccountVerifier: async (key) => ({
      outcome: 'authenticated',
      principal: { id: 'trip-create-test', name: 'test', scopes: [key] },
    }),
  }).listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
  return `http://127.0.0.1:${address.port}`;
}

function operation(input: TripCreateOperation['command']['input']): TripCreateOperation {
  return {
    operationId: randomUUID(),
    command: { kind: 'trip.create', input },
  };
}

function post(origin: string, body: unknown, scope = 'trips.trips.createOperation') {
  return fetch(`${origin}/trips/operations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': scope },
    body: JSON.stringify(body),
  });
}

describe('Trip creation operation receipts', () => {
  it('recovers after a post-commit lost acknowledgement and separates original from current state', async () => {
    const fetchIds = vi.fn<() => Promise<readonly string[] | undefined>>().mockResolvedValue([]);
    const first = open(databasePath);
    const request = operation({ name: 'First name', destination: 'Reykjavik' });
    await expect(
      (async () => {
        await createTripOperation(first.db, request, async () => {});
        throw new Error('response lost after commit');
      })()
    ).rejects.toThrow('response lost after commit');

    await Promise.all(
      servers.splice(0).map(async (server) => {
        server.closeIdleConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      })
    );
    handles.splice(0).forEach(({ raw }) => raw.close());
    const restarted = open(databasePath);
    const restartedOrigin = await serve(restarted, fetchIds);
    const replayResponse = await post(restartedOrigin, request);
    expect(replayResponse.status).toBe(201);
    const replay = TripCreateOperationResultSchema.parse(await replayResponse.json());
    expect(replay).toMatchObject({
      replayed: true,
      receipt: { operationId: request.operationId, trip: { name: 'First name' } },
      current: { trip: { name: 'First name' } },
    });
    expect(fetchIds).not.toHaveBeenCalled();

    const edited = await fetch(`${restartedOrigin}/trips/${replay.receipt.trip.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-api-key': 'trips.trips.update' },
      body: JSON.stringify({ name: 'Later name' }),
    });
    expect(edited.status).toBe(200);
    const afterEdit = TripCreateOperationResultSchema.parse(
      await (await post(restartedOrigin, request)).json()
    );
    expect(afterEdit.receipt.trip.name).toBe('First name');
    expect(afterEdit.current.trip.name).toBe('Later name');
  });

  it('rejects changed payload for a UUID and keeps invalid or unauthorized requests write-free', async () => {
    const opened = open();
    const origin = await serve(opened);
    const request = operation({ name: 'One' });
    expect((await post(origin, request)).status).toBe(201);
    const mismatch = await post(origin, {
      ...request,
      command: { kind: 'trip.create', input: { name: 'Two' } },
    });
    expect(mismatch.status).toBe(409);
    expect(await mismatch.json()).toMatchObject({
      code: 'trips.trip.trip_create_operation_mismatch',
      retryable: false,
    });
    expect((await post(origin, { ...request, extra: true })).status).toBe(400);
    expect(
      (
        await post(origin, {
          ...request,
          command: { kind: 'trip.create', input: { name: 'Invalid extra', arbitrary: true } },
        })
      ).status
    ).toBe(400);
    expect((await post(origin, request, 'trips.trips.update')).status).toBe(403);
    expect(opened.db.select().from(trips).all()).toHaveLength(1);
  });

  it('serializes concurrent identical requests into one durable Trip', async () => {
    const opened = open(databasePath);
    const second = open(databasePath);
    const [origin, secondOrigin] = await Promise.all([serve(opened), serve(second)]);
    const request = operation({ destination: 'Lisbon' });
    const responses = await Promise.all([post(origin, request), post(secondOrigin, request)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const results = await Promise.all(
      responses.map(async (response) =>
        TripCreateOperationResultSchema.parse(await response.json())
      )
    );
    expect(results.map((result) => result.replayed).toSorted()).toEqual([false, true]);
    expect(results[0]?.receipt.trip.id).toBe(results[1]?.receipt.trip.id);
    expect(opened.db.select().from(trips).all()).toHaveLength(1);
  });

  it('validates an explicit tag before creation and skips Tags on committed replay', async () => {
    const opened = open();
    const fetchIds = vi
      .fn<() => Promise<readonly string[] | undefined>>()
      .mockResolvedValue([tagId]);
    const origin = await serve(opened, fetchIds);
    const request = operation({ tagId });
    expect((await post(origin, request)).status).toBe(201);
    expect((await post(origin, request)).status).toBe(201);
    expect(fetchIds).toHaveBeenCalledTimes(1);
    expect(opened.db.select().from(trips).all()).toHaveLength(1);
  });

  it('keeps legacy plain creation permanent and does not accept its shape on the new endpoint', async () => {
    const origin = await serve(open());
    expect(
      (
        await fetch(`${origin}/trips`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': 'trips.trips.create' },
          body: JSON.stringify({ name: 'Legacy' }),
        })
      ).status
    ).toBe(201);
    expect(
      (await post(origin, { operationId: randomUUID(), input: { name: 'No command' } })).status
    ).toBe(400);
  });
});
