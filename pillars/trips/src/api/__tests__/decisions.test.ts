import { once } from 'node:events';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { DecisionSchema, DecisionOptionSchema } from '../../contract/decision-schemas.js';
import { openTripsDb, type OpenedTripsDb } from '../../db/index.js';
import { createTrip } from '../../db/services/records.js';
import { createTripsApiApp } from '../app.js';

import type { Server } from 'node:http';

let opened: OpenedTripsDb;
let server: Server;
let origin: string;
let tripId: number;
beforeEach(async () => {
  opened = openTripsDb(':memory:');
  tripId = createTrip(opened.db, {}).id;
  server = createTripsApiApp({
    tripsDb: opened,
    version: 'test',
    selfBaseUrl: 'http://localhost:3018',
    serviceAccountVerifier: async () => ({
      outcome: 'authenticated',
      principal: { id: 'test', name: 'test', scopes: ['trips.decisions', 'trips.decisionOptions'] },
    }),
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server.closeIdleConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  opened.raw.close();
});
function call(
  path: string,
  body: unknown,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST',
  authenticated = true
): Promise<Response> {
  return fetch(origin + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(authenticated ? { 'x-api-key': 'scoped' } : {}),
    },
    body: JSON.stringify(body),
  });
}
it('publishes source CRUD and guarded selection with validation, scope and ownership errors', async () => {
  const base = `/trips/${tripId}/decisions`;
  expect((await call(base, {}, 'POST', false)).status).toBe(401);
  expect((await call(base, { deadline: '2028-02-30' })).status).toBe(400);
  const created = await call(base, { question: 'Which?' });
  expect(created.status).toBe(201);
  const decision = DecisionSchema.parse(await created.json());
  const options = `${base}/${decision.id}/options`;
  expect((await call(options, {})).status).toBe(400);
  const createdOption = await call(options, { expectedRevision: 0, title: 'Option' });
  expect(createdOption.status).toBe(201);
  const option = DecisionOptionSchema.parse(await createdOption.json());
  const selection = `${base}/${decision.id}/selection`;
  expect((await call(selection, { expectedRevision: 0, optionId: option.id }, 'PUT')).status).toBe(
    409
  );
  expect(
    (await call(selection, { expectedRevision: 1, optionId: option.id + 1 }, 'PUT')).status
  ).toBe(404);
  const selected = await call(selection, { expectedRevision: 1, optionId: option.id }, 'PUT');
  expect(selected.status).toBe(200);
  expect(await selected.json()).toMatchObject({ selectedOptionId: option.id, revision: 2 });
  const workspace = await fetch(origin + `${base}/${decision.id}/workspace`, {
    headers: { 'x-api-key': 'scoped' },
  });
  expect(workspace.status).toBe(200);
  expect(await workspace.json()).toMatchObject({
    decision: { selectedOptionId: option.id, revision: 2 },
    options: [{ id: option.id }],
  });
  expect((await call(`${options}/${option.id}`, { expectedRevision: 2 }, 'DELETE')).status).toBe(
    204
  );
  const removedWorkspace = await fetch(origin + `${base}/${decision.id}/workspace`, {
    headers: { 'x-api-key': 'scoped' },
  });
  expect(await removedWorkspace.json()).toMatchObject({
    decision: { selectedOptionId: null, revision: 3 },
    options: [],
  });
  expect((await call(`${options}/${option.id}/restore`, { expectedRevision: 3 })).status).toBe(400);
  expect(
    (await call(`${options}/${option.id}/restore`, { expectedRevision: 3, select: true })).status
  ).toBe(200);
  expect((await call(`${base}/${decision.id}`, { expectedRevision: 4 }, 'DELETE')).status).toBe(
    204
  );
});
