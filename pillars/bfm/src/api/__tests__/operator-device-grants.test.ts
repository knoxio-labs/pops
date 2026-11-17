import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createAccessJwtFixture } from '@pops/pillar-sdk/testing';

import { DeviceGrantSchema } from '../../contract/device-grant-schemas.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices, refreshTokens } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { BFM_PAIRING_ISSUE_SCOPE } from '../middleware/service-account-pairing.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

const access = createAccessJwtFixture({ teamName: 'bfm-device-grants-suite' });
const apps: TestApp[] = [];
const env = {
  NODE_ENV: 'production',
  CLOUDFLARE_ACCESS_TEAM_NAME: access.teamName,
  POPS_OPERATOR_EMAILS: 'owner@example.test',
};
beforeEach(() => {
  vi.stubGlobal('fetch', access.fetchImpl);
});
afterEach(() => {
  while (apps.length) apps.pop()?.cleanup();
  vi.unstubAllGlobals();
});
function open() {
  const app = createTestApp({
    env,
    serviceAccountVerifier: async () => ({
      outcome: 'authenticated',
      principal: { id: 'test-pairing-account', name: 'pairing', scopes: [BFM_PAIRING_ISSUE_SCOPE] },
    }),
  });
  apps.push(app);
  const row = deviceRow({ capabilities: '["session.read"]' });
  app.db.insert(devices).values(row).run();
  return { app, id: row.id };
}
function read(app: TestApp, id: string, email = 'owner@example.test') {
  return requestOn(app.app, (r) =>
    r
      .get(`/operator/devices/${id}/capabilities`)
      .set('cf-access-jwt-assertion', access.signForEmail(email))
  );
}
function write(app: TestApp, id: string, body: object, email = 'owner@example.test') {
  return requestOn(app.app, (r) =>
    r
      .put(`/operator/devices/${id}/capabilities`)
      .set('cf-access-jwt-assertion', access.signForEmail(email))
      .send(body)
  );
}
function snapshot(app: TestApp) {
  return {
    devices: app.db.select().from(devices).all(),
    tokens: app.db.select().from(refreshTokens).all(),
  };
}
it('verified human selection persists exact explicit grants, then immediately narrows the actual mobile perimeter', async () => {
  const { app, id } = open();
  const current = await read(app, id);
  expect(current.status).toBe(200);
  const state = DeviceGrantSchema.parse(current.body);
  const body = {
    expectedRevision: state.revision,
    expectedPolicyToken: state.policyToken,
    capabilities: ['session.read', 'trips.write', 'trips.capture.write'],
  };
  const result = await write(app, id, body);
  expect(result.status).toBe(200);
  expect(result.body.stored).toEqual(body.capabilities);
  expect(result.body.mode).toBe('explicit');
  expect(result.body.revision).toBe(state.revision + 1);
  const { token } = mintAccessToken(id, app.accessTokenSigningKey);
  const before = await requestOn(app.app, (r) =>
    r.get('/mobile/bootstrap').set('Authorization', `Bearer ${token}`)
  );
  expect(before.status).toBe(200);
  const next = DeviceGrantSchema.parse(result.body);
  expect(
    (
      await write(app, id, {
        expectedRevision: next.revision,
        expectedPolicyToken: next.policyToken,
        capabilities: ['trips.write'],
      })
    ).status
  ).toBe(200);
  const after = await requestOn(app.app, (r) =>
    r.get('/mobile/bootstrap').set('Authorization', `Bearer ${token}`)
  );
  expect(after.status).toBe(403);
  expect(after.body.capability).toBe('session.read');
});
it('anonymous, mobile bearer, forged Access and pairing-scoped machine credentials cannot administer grants', async () => {
  const { app, id } = open();
  const current = DeviceGrantSchema.parse((await read(app, id)).body);
  const body = {
    expectedRevision: current.revision,
    expectedPolicyToken: current.policyToken,
    capabilities: ['trips.write'],
  };
  const before = snapshot(app);
  const { token } = mintAccessToken(id, app.accessTokenSigningKey);
  const headers: Record<string, string>[] = [
    {},
    { Authorization: `Bearer ${token}` },
    { 'cf-access-jwt-assertion': 'fixture-invalid-jwt' },
    { 'x-api-key': 'fixture-pairing-only' },
  ];
  for (const header of headers) {
    const result = await requestOn(app.app, (r) =>
      r.put(`/operator/devices/${id}/capabilities`).set(header).send(body)
    );
    expect(result.status).toBe(401);
    expect(snapshot(app)).toEqual(before);
  }
  expect((await write(app, id, body, 'guest@example.test')).status).toBe(403);
  expect(snapshot(app)).toEqual(before);
});
it.each([
  {},
  { expectedRevision: -1 },
  { capabilities: ['unknown.capability'] },
  { capabilities: ['trips.write', 'trips.write'] },
  { extra: true },
  { expectedRevision: 0.5 },
  { expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
  { expectedPolicyToken: 'bad' },
])('malformed complete selection leaves all device/token rows unchanged: %j', async (override) => {
  const { app, id } = open();
  const state = DeviceGrantSchema.parse((await read(app, id)).body);
  const valid = {
    expectedRevision: state.revision,
    expectedPolicyToken: state.policyToken,
    capabilities: ['session.read'],
  };
  const body = Object.keys(override).length === 0 ? {} : { ...valid, ...override };
  const before = snapshot(app);
  expect((await write(app, id, body)).status).toBe(400);
  expect(snapshot(app)).toEqual(before);
});
it('stale revisions and another device revision cannot overwrite the selected device', async () => {
  const { app, id } = open();
  const state = DeviceGrantSchema.parse((await read(app, id)).body);
  const body = {
    expectedRevision: state.revision,
    expectedPolicyToken: state.policyToken,
    capabilities: ['trips.write'],
  };
  expect((await write(app, id, body)).status).toBe(200);
  const before = snapshot(app);
  expect((await write(app, id, body)).status).toBe(409);
  expect(snapshot(app)).toEqual(before);
  const other = deviceRow({ capabilities: '["session.read"]' });
  app.db.insert(devices).values(other).run();
  const complete = snapshot(app);
  expect((await write(app, other.id, body)).status).toBe(409);
  expect(snapshot(app)).toEqual(complete);
  expect((await write(app, crypto.randomUUID(), body)).status).toBe(404);
  expect(snapshot(app)).toEqual(complete);
});
