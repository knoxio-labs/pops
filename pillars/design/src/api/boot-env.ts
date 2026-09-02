/**
 * Every boot decision the design API makes, lifted out of `server.ts` so it
 * can be tested without binding a port.
 */
import { dirname, join } from 'node:path';

import { resolveSelfBaseUrl as resolveFleetSelfBaseUrl } from '@pops/pillar-sdk/pillar-env';

/** The port the API listens on. Next free slot after bfm's 3014. */
export const DEFAULT_PORT = 3015;

const DEFAULT_SQLITE_PATH = './data/design.db';

export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['PORT'];
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`PORT must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

export function resolveVersion(env: NodeJS.ProcessEnv = process.env): string {
  const version = env['BUILD_VERSION'];
  return version === undefined || version.trim() === '' ? 'dev' : version;
}

/**
 * Whether to register with the `registry` pillar on boot.
 *
 * Off by default and on in the fleet, exactly like every other pillar: a
 * developer running the API against a local SQLite file has no registry to
 * talk to, and a failed registration there would be noise rather than news.
 */
export function shouldSelfRegister(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['POPS_REGISTRY_ENABLED'] === 'true';
}

/**
 * The URL the registry should hand callers for this pillar — and, through the
 * shell's dynamic nginx render, the upstream its `/design-api/` block proxies
 * to when the pillar is not one of the curated ones.
 */
export function resolveSelfBaseUrl(port: number, env: NodeJS.ProcessEnv = process.env): string {
  return resolveFleetSelfBaseUrl({
    envVar: 'DESIGN_SELF_BASE_URL',
    port,
    processLabel: 'design-api',
    env,
  });
}

/**
 * Own var first, then the shared base directory hint, then a local default —
 * the same three-step ladder every pillar uses (see `.env.example`).
 */
export function resolveSqlitePath(env: NodeJS.ProcessEnv = process.env): string {
  const own = env['DESIGN_SQLITE_PATH'];
  if (own !== undefined && own.trim() !== '') return own;
  const shared = env['SQLITE_PATH'];
  if (shared !== undefined && shared.trim() !== '') return join(dirname(shared), 'design.db');
  return DEFAULT_SQLITE_PATH;
}
