/**
 * The operator principal resolver.
 *
 * Two of these cases exist because bfm's chain deliberately differs from the
 * registry's, and a future edit that "restores parity" would reopen a hole:
 * there is no service-account leg, and no trust-the-tunnel fallback.
 */
import { describe, expect, it } from 'vitest';

import {
  DEV_OPERATOR_EMAIL,
  readPrincipal,
  requireOperator,
  resolveOperator,
} from '../middleware/identity.js';
import { UnauthorizedError } from '../shared/errors.js';

import type { Request, Response } from 'express';

function req(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function res(locals: Record<string, unknown> = {}): Response {
  return { locals } as unknown as Response;
}

const PROD_WITH_ACCESS: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  CLOUDFLARE_ACCESS_TEAM_NAME: 'pops-test-team',
};

describe('resolveOperator', () => {
  it.each(['development', 'test', undefined])(
    'falls back to the dev operator when NODE_ENV is %s',
    async (nodeEnv) => {
      const env = nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv };

      await expect(resolveOperator(req(), env)).resolves.toEqual({ email: DEV_OPERATOR_EMAIL });
    }
  );

  it('is anonymous in production when no Access assertion is presented', async () => {
    await expect(resolveOperator(req(), PROD_WITH_ACCESS)).resolves.toBeNull();
  });

  it('is anonymous in production when the assertion does not verify', async () => {
    await expect(
      resolveOperator(req({ 'cf-access-jwt-assertion': 'not-a-jwt' }), PROD_WITH_ACCESS)
    ).resolves.toBeNull();
  });

  /**
   * The registry resolves this to `tunnel-authenticated@pops.local` on the
   * reasoning that it is only reachable through an Access-protected tunnel.
   * bfm's own hostname bypasses Access so the phone can pair, so carrying that
   * leg over would hand every caller on the internet an operator session.
   */
  it('is anonymous in production when Access is unconfigured — never a tunnel user', async () => {
    await expect(resolveOperator(req(), { NODE_ENV: 'production' })).resolves.toBeNull();
    await expect(
      resolveOperator(req(), { NODE_ENV: 'production', CLOUDFLARE_ACCESS_TEAM_NAME: '' })
    ).resolves.toBeNull();
  });

  /**
   * There is nothing for bfm to authenticate a key against — it holds no
   * service-accounts table, and the registry exposes no verify endpoint. An
   * `x-api-key` must therefore buy nothing rather than appear to work.
   */
  it('ignores an x-api-key header entirely', async () => {
    await expect(
      resolveOperator(req({ 'x-api-key': 'pops_sa_abcdefgh.some-secret' }), PROD_WITH_ACCESS)
    ).resolves.toBeNull();
  });

  it('ignores an empty assertion header', async () => {
    await expect(
      resolveOperator(req({ 'cf-access-jwt-assertion': '' }), PROD_WITH_ACCESS)
    ).resolves.toBeNull();
  });
});

describe('readPrincipal', () => {
  it('returns the principal the middleware attached', () => {
    expect(readPrincipal(res({ operator: { email: 'operator@pops.local' } }))).toEqual({
      email: 'operator@pops.local',
    });
  });

  /** A middleware that was never mounted must fail closed, not open. */
  it('reads an unmounted middleware as anonymous', () => {
    expect(readPrincipal(res())).toBeNull();
  });

  it('reads an explicitly anonymous resolution as anonymous', () => {
    expect(readPrincipal(res({ operator: null }))).toBeNull();
  });
});

describe('requireOperator', () => {
  it('passes a resolved operator through', () => {
    expect(requireOperator({ email: 'operator@pops.local' })).toEqual({
      email: 'operator@pops.local',
    });
  });

  it('throws a 401 for an anonymous caller', () => {
    expect(() => requireOperator(null)).toThrow(UnauthorizedError);
    try {
      requireOperator(null);
    } catch (err) {
      expect((err as UnauthorizedError).statusCode).toBe(401);
    }
  });
});
