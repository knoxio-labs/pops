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
  let entries: readonly { id: string; baseUrl: string }[];
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
