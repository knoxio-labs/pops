import { dirname, join } from 'node:path';

import { resolveSelfBaseUrl as resolveFleetSelfBaseUrl } from '@pops/pillar-sdk/pillar-env';

/** Default HTTP port for the trips pillar. */
export const DEFAULT_PORT = 3018;

/** Fallback database path when no pillar-specific or shared path is set. */
export const DEFAULT_SQLITE_PATH = './data/trips.db';

/** Error raised for invalid process configuration at boot. */
export class BootEnvError extends Error {
  override readonly name = 'BootEnvError' as const;
}

/** Resolve `PORT`, rejecting values that cannot be a TCP port. */
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['PORT'];
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new BootEnvError(`[trips-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

/** Return whether this process should attempt registry self-registration. */
export function shouldSelfRegister(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['POPS_REGISTRY_ENABLED'] === 'true';
}

/** Resolve the build version used by health and manifest payloads. */
export function resolveVersion(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env['BUILD_VERSION'];
  return raw === undefined || raw === '' ? 'dev' : raw;
}

/** Resolve the origin this pillar advertises to the registry. */
export function resolveSelfBaseUrl(port: number, env: NodeJS.ProcessEnv = process.env): string {
  return resolveFleetSelfBaseUrl({
    envVar: 'TRIPS_SELF_BASE_URL',
    port,
    processLabel: 'trips-api',
    env,
  });
}

/** Resolve the trips database path, preferring the pillar-specific variable. */
export function resolveTripsSqlitePath(env: NodeJS.ProcessEnv = process.env): string {
  const own = env['TRIPS_SQLITE_PATH'];
  if (own !== undefined && own.trim() !== '') return own;
  const shared = env['SQLITE_PATH'];
  if (shared !== undefined && shared.trim() !== '') return join(dirname(shared), 'trips.db');
  return DEFAULT_SQLITE_PATH;
}
