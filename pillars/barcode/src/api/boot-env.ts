import { dirname, join } from 'node:path';

import { resolveSelfBaseUrl as resolveFleetSelfBaseUrl } from '@pops/pillar-sdk/pillar-env';

/** Default HTTP port for the barcode pillar. */
export const DEFAULT_PORT = 3016;

/** Fallback database path when no pillar-specific or shared path is set. */
export const DEFAULT_SQLITE_PATH = './data/barcode.db';

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
    throw new BootEnvError(
      `[barcode-api] PORT must be a positive integer in 1-65535; got '${raw}'`
    );
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

/** Resolve the bare origin this pillar advertises to the registry. */
export function resolveSelfBaseUrl(port: number, env: NodeJS.ProcessEnv = process.env): string {
  return resolveFleetSelfBaseUrl({
    envVar: 'BARCODE_SELF_BASE_URL',
    port,
    processLabel: 'barcode-api',
    env,
  });
}

/**
 * Resolve the barcode database path.
 *
 * `BARCODE_SQLITE_PATH` wins, then a shared `SQLITE_PATH` contributes its
 * directory, and the local `./data/barcode.db` path is the final fallback.
 */
export function resolveBarcodeSqlitePath(env: NodeJS.ProcessEnv = process.env): string {
  const own = env['BARCODE_SQLITE_PATH'];
  if (own !== undefined && own.trim() !== '') return own;
  const shared = env['SQLITE_PATH'];
  if (shared !== undefined && shared.trim() !== '') return join(dirname(shared), 'barcode.db');
  return DEFAULT_SQLITE_PATH;
}
