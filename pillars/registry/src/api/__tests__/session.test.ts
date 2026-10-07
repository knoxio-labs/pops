/**
 * Integration tests for `GET /session`, driven through the real Express app.
 *
 * The route is the shell's answer to "who is signed in", and the only
 * identity-gated registry route a guest may call.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import {
  accessHeaders,
  createAccessFixture,
  GUEST_EMAIL,
  OPERATOR_EMAIL,
  stubProductionAccess,
} from './access-session.js';
import { createTestTransport } from './test-http.js';
import { makeClient } from './test-utils.js';

const { requestOn } = createTestTransport();
const access = createAccessFixture('pops-registry-session-test');

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-session-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function app(): ReturnType<typeof createCoreApiApp> {
  return createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' });
}

describe('GET /session', () => {
  it('reports the operator with their verified email', async () => {
    stubProductionAccess(access, OPERATOR_EMAIL);

    const res = await requestOn(app()).get('/session').set(accessHeaders(access, OPERATOR_EMAIL));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'operator', email: OPERATOR_EMAIL });
  });

  it('answers a guest, with their verified email', async () => {
    stubProductionAccess(access, OPERATOR_EMAIL);

    const res = await requestOn(app()).get('/session').set(accessHeaders(access, GUEST_EMAIL));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'guest', email: GUEST_EMAIL });
  });

  it('reports every verified user as the operator while POPS_OPERATOR_EMAILS is unset', async () => {
    stubProductionAccess(access);

    const res = await requestOn(app()).get('/session').set(accessHeaders(access, GUEST_EMAIL));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'operator', email: GUEST_EMAIL });
  });

  it('reports the LAN fallback as the operator with no email', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');
    vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR_EMAIL);

    const res = await requestOn(app()).get('/session');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'operator', email: null });
  });

  it('reports the dev fallback as the operator with no email', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR_EMAIL);

    const res = await requestOn(app()).get('/session');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'operator', email: null });
  });

  it('is 401 for an anonymous caller', async () => {
    stubProductionAccess(access, OPERATOR_EMAIL);

    const res = await requestOn(app()).get('/session');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'registry.auth.unauthorized' });
  });

  it('is 401 for a token that does not verify', async () => {
    stubProductionAccess(access, OPERATOR_EMAIL);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const impostor = createAccessFixture(access.teamName);

    const res = await requestOn(app()).get('/session').set(accessHeaders(impostor, OPERATOR_EMAIL));

    expect(res.status).toBe(401);
  });

  it('is 401 for a service account, which is neither kind of person', async () => {
    stubProductionAccess(access, OPERATOR_EMAIL);
    const operator = makeClient(app(), accessHeaders(access, OPERATOR_EMAIL));
    const created = await operator.serviceAccounts.create({
      name: 'machine',
      scopes: ['core.session'],
    });

    const res = await requestOn(app()).get('/session').set('x-api-key', created.plaintextKey);

    expect(res.status).toBe(401);
  });
});
