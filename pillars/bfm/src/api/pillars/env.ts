/**
 * The federation half of bfm's boot environment: where peers are discovered,
 * and which discovered base URLs to override.
 *
 * `../boot-env.ts` covers what this pillar's own HTTP surface needs; this
 * covers what the cross-pillar SDK needs. Both carry the same bias — crash on
 * a malformed value rather than start and fail every outbound call afterwards,
 * where the symptom is an indistinguishable `unavailable` rather than
 * something with a variable name in it.
 *
 * Neither parser is bfm's. Both come from `@pops/pillar-sdk/pillar-env`, which
 * is the fleet's single definition of what a pillar base URL may look like.
 */
import { parseBareOrigin, parsePillarsEnv } from '@pops/pillar-sdk/pillar-env';

import { BootEnvError } from '../boot-env.js';

/** Where the discovery cache's per-fetch abort deadline is overridden, if it is at all. */
export const DISCOVERY_FETCH_TIMEOUT_MS_ENV = 'POPS_DISCOVERY_FETCH_TIMEOUT_MS';

/** Where discovery reads the pillar snapshot from. */
export const REGISTRY_URL_ENV = 'POPS_REGISTRY_URL';

/**
 * Per-pillar base-URL overrides, in the fleet's `id:baseUrl[,…]` shape.
 *
 * Deliberately NOT `POPS_PILLARS`, which shares the shape but not the meaning:
 * production stopped plumbing it when the registry became the source of truth
 * (ADR-039 E25), while `infra/docker-compose.dev.yml` still sets a static
 * six-pillar roster on every service. Reading that as overrides would bypass
 * discovery for six pillars in dev and nowhere else — a routing seam that
 * disagrees with production is the one shape of bug this fleet has already
 * paid for.
 */
export const INTERNAL_BASE_URLS_ENV = 'POPS_INTERNAL_BASE_URLS';

/** In-cluster registry host, matching the compose service name. */
export const DEFAULT_REGISTRY_URL = 'http://registry-api:3001';

/**
 * Resolve the registry origin used for DISCOVERY.
 *
 * The same variable `bootstrapPillar` reads to decide where to REGISTER, so a
 * deployment cannot register in one place and discover from another — a split
 * that produces a pillar which joins the fleet correctly and then fails every
 * cross-pillar call.
 *
 * @throws {BareOriginParseError} If the value is not a bare http(s) origin.
 */
export function resolveRegistryUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[REGISTRY_URL_ENV];
  // A Compose interpolation that resolved to nothing leaves `VAR=` behind;
  // that is an unset variable, not an instruction to discover from nowhere.
  if (raw === undefined || raw.trim() === '') return DEFAULT_REGISTRY_URL;
  return parseBareOrigin(REGISTRY_URL_ENV, raw.trim());
}

/**
 * Resolve the per-pillar base-URL overrides handed to `configureServerSdk`.
 *
 * The escape hatch for running bfm outside Docker: the registry publishes each
 * pillar's in-network `baseUrl`, which does not resolve from a laptop. An
 * override replaces the discovered URL for that id and nothing else — an id
 * absent from the map still resolves through the registry, which stays the
 * source of truth. There is deliberately no compiled roster of pillar ids;
 * the map is whatever the operator names.
 *
 * @returns The override map, or `undefined` when nothing is configured — which
 *   is what the SDK wants for "no overrides", an empty object being a
 *   different and pointlessly wrapped way to say it.
 * @throws {BootEnvError} If an entry is malformed or an id repeats. The SDK
 *   parser labels its own errors `POPS_PILLARS`, so the wrapper names the
 *   variable actually being read and carries the parser's complaint as
 *   `cause` — an operator told to fix the wrong variable fixes nothing.
 */
export function resolveInternalBaseUrls(
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> | undefined {
  const raw = env[INTERNAL_BASE_URLS_ENV];
  // Derived rather than restated: the entry shape is the SDK parser's to
  // change, and a local copy of it would be one more thing to keep in step.
  let entries: ReturnType<typeof parsePillarsEnv>;
  try {
    entries = parsePillarsEnv(raw);
  } catch (cause) {
    throw new BootEnvError(`[bfm-api] ${INTERNAL_BASE_URLS_ENV} is malformed: "${raw ?? ''}"`, {
      cause,
    });
  }
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map((entry) => [entry.id, entry.baseUrl]));
}

/**
 * Resolve the discovery cache's per-fetch abort deadline from
 * `POPS_DISCOVERY_FETCH_TIMEOUT_MS`, in milliseconds.
 *
 * `undefined` when unset — the SDK's own default (`DEFAULT_FETCH_TIMEOUT_MS`,
 * 5s) stands, which is what every real deployment gets: a routed registry on
 * the same Docker network answers well inside that. This exists to raise it
 * for exactly one caller: `scripts/ios-e2e/run.mjs`, whose registry stub is a
 * loopback Node server sharing a three-core CI runner with `xcodebuild`, the
 * simulator and Maestro's own driver. Under that contention the fetch, not the
 * stub's handler, is what misses a 5s deadline — the same class of starvation
 * that forced `-j 1` on the SwiftLint-analyzer step, and it recurs for as long
 * as the discovery cache's background refresh keeps polling, not just at boot.
 *
 * @throws {BootEnvError} If set to something other than a positive integer.
 */
export function resolveDiscoveryFetchTimeoutMs(
  env: NodeJS.ProcessEnv = process.env
): number | undefined {
  const raw = env[DISCOVERY_FETCH_TIMEOUT_MS_ENV];
  if (raw === undefined || raw.trim() === '') return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BootEnvError(
      `[bfm-api] ${DISCOVERY_FETCH_TIMEOUT_MS_ENV} must be a positive integer; got '${raw}'`
    );
  }
  return parsed;
}
