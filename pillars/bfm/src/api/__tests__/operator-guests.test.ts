/**
 * A verified Cloudflare Access user who is not the operator.
 *
 * Access admits guests as well as the owner, and bfm's hostname bypasses it
 * altogether, so "the token verifies" stopped being the same statement as
 * "this is the operator". Every case here signs a real token with the shared
 * fixture: the property under test is what a verified email is allowed to do,
 * and a stubbed verifier would assert only that the stub was called.
 *
 * Two layers refuse a guest, and they read different environments in a test:
 * the identity middleware reads the `env` the app was built with, and the
 * pairing route's scope gate reads `process.env`. The first two blocks leave
 * `process.env` alone so the gate stays off and the identity middleware is
 * the only thing under test; the last block turns both on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAccessJwtFixture, generateAccessKeyPair } from '@pops/pillar-sdk/testing';

import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices, pairingCodes } from '../../db/index.js';
import { BFM_PAIRING_ISSUE_SCOPE } from '../middleware/service-account-pairing.js';
import { createTestApp, type TestApp, type TestAppOptions } from './harness.js';
import { requestOn } from './test-http.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const access = createAccessJwtFixture({ teamName: 'bfm-operator-guests-suite' });

const OPERATOR_EMAIL = 'owner@example.com';
const GUEST_EMAIL = 'rosane@example.com';

/** Production, Access configured, no operator list: what is deployed today. */
const WITHOUT_OPERATOR_LIST: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  CLOUDFLARE_ACCESS_TEAM_NAME: access.teamName,
};

/** The list is written in mixed case with stray spaces on purpose. */
const WITH_OPERATOR_LIST: NodeJS.ProcessEnv = {
  ...WITHOUT_OPERATOR_LIST,
  POPS_OPERATOR_EMAILS: ' Owner@Example.com , second-owner@example.com',
};

const PAIRING_CREDENTIAL = 'test-pairing-credential';

const acceptPairingCredential: ServiceAccountVerifier = () =>
  Promise.resolve({
    outcome: 'authenticated',
    principal: { id: 'sa-mcp-pairing', name: 'mcp pairing', scopes: [BFM_PAIRING_ISSUE_SCOPE] },
  });

const apps: TestApp[] = [];

function open(options: TestAppOptions): TestApp {
  const created = createTestApp(options);
  apps.push(created);
  return created;
}

function pairDevice(app: TestApp): string {
  const row = deviceRow();
  app.opened.db.insert(devices).values(row).run();
  return row.id;
}

function issueCode(app: TestApp, token: string | null, apiKey?: string) {
  return requestOn(app.app, (r) => {
    let request = r.post('/operator/pairing/codes');
    if (token !== null) request = request.set('cf-access-jwt-assertion', token);
    if (apiKey !== undefined) request = request.set('x-api-key', apiKey);
    return request.send({});
  });
}

function listDevices(app: TestApp, token: string) {
  return requestOn(app.app, (r) =>
    r.get('/operator/devices').set('cf-access-jwt-assertion', token)
  );
}

function revokeDevice(app: TestApp, id: string, token: string) {
  return requestOn(app.app, (r) =>
    r.delete(`/operator/devices/${id}`).set('cf-access-jwt-assertion', token)
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', access.fetchImpl);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('with an operator list', () => {
  it('refuses a guest on pairing-code issuance, and mints nothing', async () => {
    const app = open({ env: WITH_OPERATOR_LIST });

    const res = await issueCode(app, access.signForEmail(GUEST_EMAIL));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('bfm.auth.operator_forbidden');
    expect(app.opened.db.select().from(pairingCodes).all()).toHaveLength(0);
  });

  it('refuses a guest on the device list', async () => {
    const app = open({ env: WITH_OPERATOR_LIST });
    pairDevice(app);

    const res = await listDevices(app, access.signForEmail(GUEST_EMAIL));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('bfm.auth.operator_forbidden');
    expect(res.body.devices).toBeUndefined();
  });

  it('refuses a guest on revocation, and the device stays trusted', async () => {
    const app = open({ env: WITH_OPERATOR_LIST });
    const id = pairDevice(app);

    const res = await revokeDevice(app, id, access.signForEmail(GUEST_EMAIL));

    expect(res.status).toBe(403);
    expect(app.opened.db.select().from(devices).all()[0]?.revokedAt).toBeNull();
  });

  it('does not tell a guest who the route is open to', async () => {
    const app = open({ env: WITH_OPERATOR_LIST });

    const res = await issueCode(app, access.signForEmail(GUEST_EMAIL));

    expect(JSON.stringify(res.body)).not.toMatch(/owner@example\.com|operator list|POPS_/i);
  });

  it('accepts the operator on every operator route', async () => {
    const app = open({ env: WITH_OPERATOR_LIST });
    const id = pairDevice(app);
    const token = access.signForEmail(OPERATOR_EMAIL);

    const issued = await issueCode(app, token);
    const listed = await listDevices(app, token);
    const revoked = await revokeDevice(app, id, token);

    expect([issued.status, listed.status, revoked.status]).toEqual([201, 200, 200]);
  });

  it('matches the operator whatever case Access reports the email in', async () => {
    const app = open({ env: WITH_OPERATOR_LIST });

    const res = await listDevices(app, access.signForEmail('OWNER@example.COM'));

    expect(res.status).toBe(200);
  });

  /** A near miss is a different mailbox, and must not be folded into the owner's. */
  it.each(['owner+guest@example.com', 'owner@example.com.evil.test', 'o.wner@example.com'])(
    'treats %s as a guest',
    async (email) => {
      const app = open({ env: WITH_OPERATOR_LIST });

      const res = await listDevices(app, access.signForEmail(email));

      expect(res.status).toBe(403);
    }
  );

  it('still answers 401, not 403, to a token signed by somebody else', async () => {
    const app = open({ env: WITH_OPERATOR_LIST });
    const impostor = generateAccessKeyPair();

    const res = await issueCode(
      app,
      access.signForEmail(OPERATOR_EMAIL, { key: impostor.privateKey })
    );

    expect(res.status).toBe(401);
  });

  it('still answers 401 to an expired operator token', async () => {
    const app = open({ env: WITH_OPERATOR_LIST });

    const res = await issueCode(app, access.signForEmail(OPERATOR_EMAIL, { expiresIn: -60 }));

    expect(res.status).toBe(401);
  });

  it('still answers 401 to a caller with no token', async () => {
    const app = open({ env: WITH_OPERATOR_LIST });

    const res = await issueCode(app, null);

    expect(res.status).toBe(401);
  });

  it('lets a scoped service account mint a code while a guest session rides along', async () => {
    const app = open({ env: WITH_OPERATOR_LIST, serviceAccountVerifier: acceptPairingCredential });

    const res = await issueCode(app, access.signForEmail(GUEST_EMAIL), PAIRING_CREDENTIAL);

    expect(res.status).toBe(201);
  });

  it('does not let that service account open the device list for the guest', async () => {
    const app = open({ env: WITH_OPERATOR_LIST, serviceAccountVerifier: acceptPairingCredential });

    const res = await requestOn(app.app, (r) =>
      r
        .get('/operator/devices')
        .set('cf-access-jwt-assertion', access.signForEmail(GUEST_EMAIL))
        .set('x-api-key', PAIRING_CREDENTIAL)
    );

    expect(res.status).toBe(403);
  });

  it('does not warn at startup', () => {
    open({ env: WITH_OPERATOR_LIST });

    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('POPS_OPERATOR_EMAILS'));
  });
});

describe('with no operator list', () => {
  it('treats every verified email as the operator, as it did before guests existed', async () => {
    const app = open({ env: WITHOUT_OPERATOR_LIST });
    const id = pairDevice(app);
    const token = access.signForEmail(GUEST_EMAIL);

    const issued = await issueCode(app, token);
    const listed = await listDevices(app, token);
    const revoked = await revokeDevice(app, id, token);

    expect([issued.status, listed.status, revoked.status]).toEqual([201, 200, 200]);
  });

  it.each(['', ' , ,'])('reads a list of %j as no list', async (list) => {
    const app = open({ env: { ...WITHOUT_OPERATOR_LIST, POPS_OPERATOR_EMAILS: list } });

    const res = await listDevices(app, access.signForEmail(GUEST_EMAIL));

    expect(res.status).toBe(200);
  });

  it('still refuses an unverifiable token and a missing one', async () => {
    const app = open({ env: WITHOUT_OPERATOR_LIST });

    const garbage = await issueCode(app, 'not-a-jwt');
    const absent = await issueCode(app, null);

    expect([garbage.status, absent.status]).toEqual([401, 401]);
  });

  it('warns once when the app is built, and not again per request', async () => {
    const app = open({ env: WITHOUT_OPERATOR_LIST });
    const token = access.signForEmail(GUEST_EMAIL);

    await listDevices(app, token);
    await listDevices(app, token);

    const warnings = vi
      .mocked(console.warn)
      .mock.calls.filter(([message]) => String(message).includes('POPS_OPERATOR_EMAILS'));
    expect(warnings).toHaveLength(1);
  });

  /** Unchanged: bfm never trusts the tunnel, list or no list. */
  it('stays dark in production with no Access team, even with a list set', async () => {
    const app = open({
      env: { NODE_ENV: 'production', POPS_OPERATOR_EMAILS: OPERATOR_EMAIL },
    });

    const res = await issueCode(app, access.signForEmail(OPERATOR_EMAIL));

    expect(res.status).toBe(401);
  });

  it('keeps the dev operator outside production, list or no list', async () => {
    const app = open({ env: { NODE_ENV: 'development', POPS_OPERATOR_EMAILS: OPERATOR_EMAIL } });

    const res = await issueCode(app, null);

    expect(res.status).toBe(201);
  });
});

/**
 * `service-account-pairing.ts` builds the shared scope gate over the pairing
 * route alone and mounts it on the whole app, so once classification is on in
 * `process.env` the gate answers a guest before the identity middleware runs.
 * These cases pin that the two layers reach the same verdict.
 */
describe('with the pairing scope gate classifying too', () => {
  beforeEach(() => {
    vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', access.teamName);
    vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR_EMAIL);
  });

  it('refuses a guest on every operator route', async () => {
    const app = open({ env: WITH_OPERATOR_LIST });
    const id = pairDevice(app);
    const token = access.signForEmail(GUEST_EMAIL);

    const issued = await issueCode(app, token);
    const listed = await listDevices(app, token);
    const revoked = await revokeDevice(app, id, token);

    expect([issued.status, listed.status, revoked.status]).toEqual([403, 403, 403]);
    // The gate's own code, which proves it answered rather than the handler.
    expect([issued.body.code, listed.body.code, revoked.body.code]).toEqual([
      'bfm.auth.forbidden',
      'bfm.auth.forbidden',
      'bfm.auth.forbidden',
    ]);
    expect(app.opened.db.select().from(pairingCodes).all()).toHaveLength(0);
    expect(app.opened.db.select().from(devices).all()[0]?.revokedAt).toBeNull();
  });

  it('accepts the operator on every operator route', async () => {
    const app = open({ env: WITH_OPERATOR_LIST });
    const id = pairDevice(app);
    const token = access.signForEmail(OPERATOR_EMAIL);

    const issued = await issueCode(app, token);
    const listed = await listDevices(app, token);
    const revoked = await revokeDevice(app, id, token);

    expect([issued.status, listed.status, revoked.status]).toEqual([201, 200, 200]);
  });

  it('answers 401 to a forged token on both layers', async () => {
    const app = open({ env: WITH_OPERATOR_LIST });
    const impostor = generateAccessKeyPair();

    const res = await issueCode(
      app,
      access.signForEmail(OPERATOR_EMAIL, { key: impostor.privateKey })
    );

    expect(res.status).toBe(401);
  });

  it('still lets a scoped service account mint a code', async () => {
    const app = open({ env: WITH_OPERATOR_LIST, serviceAccountVerifier: acceptPairingCredential });

    const res = await issueCode(app, null, PAIRING_CREDENTIAL);

    expect(res.status).toBe(201);
  });

  it('leaves the liveness probe open to a guest', async () => {
    const app = open({ env: WITH_OPERATOR_LIST });

    const res = await requestOn(app.app, (r) =>
      r.get('/health').set('cf-access-jwt-assertion', access.signForEmail(GUEST_EMAIL))
    );

    expect(res.status).toBe(200);
  });
});
