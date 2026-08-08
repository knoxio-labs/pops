/**
 * The federation half of bfm's boot environment: where peers are discovered,
 * and which discovered base URLs to override.
 *
 * `../boot-env.ts` covers what the HTTP server itself needs; this covers what
 * the cross-pillar SDK needs. Both carry the same bias — crash on a malformed
 * value rather than start and fail every outbound call afterwards, where the
 * symptom is an indistinguishable `unavailable` rather than a stack trace.
 */
import { BootEnvError, parseBareOrigin } from '../boot-env.js';

/** Where discovery reads the pillar snapshot from. */
export const REGISTRY_URL_ENV = 'POPS_REGISTRY_URL';

/** Per-pillar base-URL overrides, `id:baseUrl[,id:baseUrl…]`. */
export const INTERNAL_BASE_URLS_ENV = 'POPS_INTERNAL_BASE_URLS';

/** In-cluster registry host, matching the compose service name. */
export const DEFAULT_REGISTRY_URL = 'http://registry-api:3001';

const PILLAR_ID_RE = /^[a-z0-9-]+$/;

/**
 * Resolve the registry origin used for DISCOVERY.
 *
 * The same variable `bootstrapPillar` reads to decide where to REGISTER, so a
 * deployment cannot register in one place and discover from another — a split
 * that produces a pillar which joins the fleet correctly and then fails every
 * cross-pillar call.
 */
export function resolveRegistryUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[REGISTRY_URL_ENV];
  if (raw === undefined || raw.trim() === '') return DEFAULT_REGISTRY_URL;
  return parseBareOrigin(REGISTRY_URL_ENV, raw.trim());
}

/**
 * Parse the per-pillar base-URL override map.
 *
 * The escape hatch for running bfm outside Docker: the registry publishes each
 * pillar's in-network `baseUrl`, which does not resolve from a laptop. An
 * override replaces the discovered URL for that id and nothing else — an id
 * absent from the map still resolves through the registry, which stays the
 * source of truth. There is deliberately no compiled roster of pillar ids
 * here; the map is whatever the operator names.
 *
 * @returns The override map, or `undefined` when the variable is unset or
 *   blank — which the SDK reads as "no overrides" rather than "override
 *   nothing", the two being the same thing but only one being expressible.
 */
export function parseInternalBaseUrls(raw: string | undefined): Record<string, string> | undefined {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return undefined;

  const overrides: Record<string, string> = {};
  for (const rawPair of trimmed.split(',')) {
    const [id, baseUrl] = parseOverride(rawPair);
    if (Object.hasOwn(overrides, id)) {
      throw new BootEnvError(`${INTERNAL_BASE_URLS_ENV}: duplicate pillar id "${id}"`);
    }
    overrides[id] = baseUrl;
  }
  return overrides;
}

function parseOverride(rawPair: string): [string, string] {
  const pair = rawPair.trim();
  const colon = pair.indexOf(':');
  if (colon === -1) {
    throw new BootEnvError(
      `${INTERNAL_BASE_URLS_ENV}: entry "${pair}" is missing a colon — expected id:baseUrl`
    );
  }
  const id = pair.slice(0, colon).trim();
  if (!PILLAR_ID_RE.test(id)) {
    throw new BootEnvError(
      `${INTERNAL_BASE_URLS_ENV}: id "${id}" is not lowercase kebab-case ([a-z0-9-]+)`
    );
  }
  const baseUrl = parseBareOrigin(
    `${INTERNAL_BASE_URLS_ENV} entry "${id}"`,
    pair.slice(colon + 1).trim()
  );
  return [id, baseUrl];
}
