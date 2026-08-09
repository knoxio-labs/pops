/**
 * Unit tests for `resolvePrincipal`'s production Cloudflare Access
 * resolution — the two branches that matter: without
 * `CLOUDFLARE_ACCESS_TEAM_NAME` set, every production request resolves to
 * the tunnel user and the JWT-verification branch below it is unreachable;
 * with it set, a `cf-access-jwt-assertion` is actually verified.
 *
 * These only prove the code branches correctly given the environment — they
 * cannot prove the deployed container ever sees `CLOUDFLARE_ACCESS_TEAM_NAME`
 * set. That half is `infra/docker-compose.yml` wiring it through, verified by
 * `scripts/ci/__tests__/check-compose-cloudflare-access-env.test.ts`, plus an
 * operator step to set the value in the deployed environment.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { resolvePrincipal } from '../middleware/identity.js';

import type { Request } from 'express';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-identity-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function req(headers: Record<string, string> = {}): Pick<Request, 'headers'> {
  return { headers };
}

describe('resolvePrincipal in production', () => {
  it('falls back to the tunnel user when CLOUDFLARE_ACCESS_TEAM_NAME is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');

    await expect(resolvePrincipal(coreDb.db, req())).resolves.toEqual({
      user: { email: 'tunnel-authenticated@pops.local' },
      serviceAccount: null,
    });
  });

  it('still falls back to the tunnel user even when a JWT assertion is presented', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');

    await expect(
      resolvePrincipal(coreDb.db, req({ 'cf-access-jwt-assertion': 'not-a-jwt' }))
    ).resolves.toEqual({
      user: { email: 'tunnel-authenticated@pops.local' },
      serviceAccount: null,
    });
  });

  it('reaches the JWT-verification branch once CLOUDFLARE_ACCESS_TEAM_NAME is set, and rejects a bad assertion', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', 'pops-registry-test-team');

    await expect(
      resolvePrincipal(coreDb.db, req({ 'cf-access-jwt-assertion': 'not-a-jwt' }))
    ).resolves.toEqual({ user: null, serviceAccount: null });
  });

  it('is anonymous, never the tunnel user, when Access is configured but no assertion is presented', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', 'pops-registry-test-team');

    await expect(resolvePrincipal(coreDb.db, req())).resolves.toEqual({
      user: null,
      serviceAccount: null,
    });
  });
});
