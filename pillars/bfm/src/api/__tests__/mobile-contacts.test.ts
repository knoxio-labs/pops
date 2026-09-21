/**
 * The mobile contacts surface (ADR-053) — a merchant's addresses, end to end
 * through the real app, the real gateway shape and the real wire validation,
 * with only the contacts leg replaced.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type { MobileAddress } from '../../contract/rest-schemas.js';
import type { MobileContactsClient } from '../contacts/client.js';
import type { GatewayOutcome, GatewayFailure } from '../pillars/gateway.js';

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
});

function openWith(contacts: MobileContactsClient): { app: Express; token: string } {
  const created = createTestApp({ contacts });
  apps.push(created);

  const row = deviceRow();
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token };
}

function fakeContacts(over: Partial<MobileContactsClient> = {}): MobileContactsClient {
  return {
    lookupEntities: () => Promise.resolve({ kind: 'ok', value: new Map() }),
    getMerchantAddresses: () => Promise.resolve({ kind: 'ok', value: [] }),
    createMerchantAddress: () => Promise.resolve({ kind: 'ok', value: { id: 'a1', value: 'x' } }),
    ...over,
  };
}

describe('GET /mobile/contacts/merchants/:id/addresses', () => {
  it('lists a merchant’s addresses', async () => {
    const addresses: MobileAddress[] = [{ id: 'a1', value: '12 Example St, Sydney' }];
    const { app, token } = openWith(
      fakeContacts({
        getMerchantAddresses: () => Promise.resolve({ kind: 'ok', value: addresses }),
      })
    );

    const response = await requestOn(app, (r) =>
      r.get('/mobile/contacts/merchants/ent-1/addresses').set('Authorization', `Bearer ${token}`)
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(addresses);
  });

  it('surfaces an unknown merchant as a 404, not a crash', async () => {
    const failure: GatewayOutcome<readonly MobileAddress[]> = {
      kind: 'not-found',
      pillar: 'contacts',
      status: 404,
    } satisfies GatewayFailure;
    const { app, token } = openWith(
      fakeContacts({ getMerchantAddresses: () => Promise.resolve(failure) })
    );

    const response = await requestOn(app, (r) =>
      r.get('/mobile/contacts/merchants/unknown/addresses').set('Authorization', `Bearer ${token}`)
    );

    expect(response.status).toBe(404);
  });

  it('refuses an unauthenticated request', async () => {
    const { app } = openWith(fakeContacts());

    const response = await requestOn(app, (r) =>
      r.get('/mobile/contacts/merchants/ent-1/addresses')
    );

    expect(response.status).toBe(401);
  });
});

describe('POST /mobile/contacts/merchants/:id/addresses', () => {
  it('creates a new address', async () => {
    const created: MobileAddress = { id: 'a2', value: '99 New St, Melbourne' };
    const { app, token } = openWith(
      fakeContacts({ createMerchantAddress: () => Promise.resolve({ kind: 'ok', value: created }) })
    );

    const response = await requestOn(app, (r) =>
      r
        .post('/mobile/contacts/merchants/ent-1/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ value: '99 New St, Melbourne' })
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(created);
  });

  it('rejects an empty value before it ever reaches contacts', async () => {
    const { app, token } = openWith(fakeContacts());

    const response = await requestOn(app, (r) =>
      r
        .post('/mobile/contacts/merchants/ent-1/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ value: '   ' })
    );

    expect(response.status).toBe(400);
  });

  it('surfaces an unknown merchant as a 404', async () => {
    const failure: GatewayOutcome<MobileAddress> = {
      kind: 'not-found',
      pillar: 'contacts',
      status: 404,
    } satisfies GatewayFailure;
    const { app, token } = openWith(
      fakeContacts({ createMerchantAddress: () => Promise.resolve(failure) })
    );

    const response = await requestOn(app, (r) =>
      r
        .post('/mobile/contacts/merchants/unknown/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ value: '12 Example St' })
    );

    expect(response.status).toBe(404);
  });
});
