/**
 * Puts a test in the one environment where the registry verifies a Cloudflare
 * Access token: production, with a team name. The dev and tunnel fallbacks
 * answer before the token is read everywhere else.
 */
import { vi } from 'vitest';

import { createAccessJwtFixture, type AccessJwtFixture } from '@pops/pillar-sdk/testing';

export const OPERATOR_EMAIL = 'owner@example.com';
export const GUEST_EMAIL = 'rosane@example.com';

export function createAccessFixture(teamName: string): AccessJwtFixture {
  return createAccessJwtFixture({ teamName });
}

/**
 * Stub production Access for the current test. `operators` is the raw
 * `POPS_OPERATOR_EMAILS` value; omit it to leave the list unset. Undo with
 * `vi.unstubAllEnvs()` and `vi.unstubAllGlobals()`.
 */
export function stubProductionAccess(fixture: AccessJwtFixture, operators?: string): void {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', fixture.teamName);
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', '');
  vi.stubEnv('POPS_OPERATOR_EMAILS', operators ?? '');
  vi.stubGlobal('fetch', fixture.fetchImpl);
}

/** The header Access forwards a signed-in session in, for `email`. */
export function accessHeaders(fixture: AccessJwtFixture, email: string): Record<string, string> {
  return { 'cf-access-jwt-assertion': fixture.signForEmail(email) };
}
