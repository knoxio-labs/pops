import { once } from 'node:events';

import { afterEach, describe, expect, it } from 'vitest';

import { createAccessJwtFixture } from '@pops/pillar-sdk/testing';

import { openTripsDb } from '../../db/index.js';
import { createTripsApiApp } from '../app.js';

import type { Server } from 'node:http';

const audience = 'trips-api-test';
const operator = 'owner@pops.test';
const guest = 'guest@example.test';
const access = createAccessJwtFixture({ audience });

describe('Trips verified Access operator gate', () => {
  let server: Server;
  let closeDb: (() => void) | undefined;
  let origin: string;

  afterEach(async () => {
    if (server !== undefined) {
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
    closeDb?.();
    closeDb = undefined;
  });

  it('admits verified operators while preserving JWT and presented-key refusals', async () => {
    const opened = openTripsDb(':memory:');
    closeDb = () => opened.raw.close();
    server = createTripsApiApp({
      tripsDb: opened,
      version: 'test',
      selfBaseUrl: 'http://localhost:3018',
      accessIdentity: {
        env: {
          POPS_OPERATOR_EMAILS: operator,
          CLOUDFLARE_ACCESS_TEAM_NAME: access.teamName,
          CLOUDFLARE_ACCESS_AUD: audience,
        },
        fetchImpl: access.fetchImpl,
      },
      serviceAccountVerifier: async (key) =>
        key === 'valid'
          ? {
              outcome: 'authenticated',
              principal: { id: 'test', name: 'test', scopes: ['trips'] },
            }
          : { outcome: 'rejected' },
    }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
    origin = `http://127.0.0.1:${address.port}`;

    const call = (path: string, method = 'GET', token?: string, key?: string, body?: string) =>
      fetch(`${origin}${path}`, {
        method,
        headers: {
          ...(token === undefined ? {} : { 'cf-access-jwt-assertion': token }),
          ...(key === undefined ? {} : { 'x-api-key': key }),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body }),
      });

    const read = await call('/trips', 'GET', access.signForEmail(operator));
    const create = await call('/trips', 'POST', access.signForEmail(operator), undefined, '{}');
    const missing = await call('/trips');
    const invalid = await call('/trips', 'GET', 'invalid');
    const refusedGuest = await call('/trips', 'GET', access.signForEmail(guest));
    const refusedKey = await call('/trips', 'GET', access.signForEmail(operator), 'invalid');
    const refusedWrite = await call('/trips', 'POST', undefined, undefined, '{}');
    const refusedGuestWrite = await call(
      '/trips',
      'POST',
      access.signForEmail(guest),
      undefined,
      '{}'
    );
    const service = await call('/trips', 'GET', undefined, 'valid');

    expect([
      read.status,
      create.status,
      missing.status,
      invalid.status,
      refusedGuest.status,
    ]).toEqual([200, 201, 401, 401, 403]);
    expect(refusedKey.status).toBe(401);
    expect(refusedWrite.status).toBe(401);
    expect(refusedGuestWrite.status).toBe(403);
    expect(service.status).toBe(200);
    const trips = await (await call('/trips', 'GET', access.signForEmail(operator))).json();
    expect(trips).toMatchObject({ trips: [expect.objectContaining({ id: expect.any(Number) })] });
  });
});
