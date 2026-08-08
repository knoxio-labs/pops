/**
 * Registry-backed {@link ServiceAccountVerifier}.
 *
 * The registry pillar owns the `service_accounts` table, so it is the only
 * party that can decide whether a presented key is live and what it is granted.
 * This verifier asks it over {@link REGISTRY_SERVICE_ACCOUNT_SELF_PATH},
 * presenting the key under verification as its own credential.
 *
 * **The cache is what makes this affordable.** A registry round-trip per
 * inbound request would put the registry on the critical path of every
 * cross-pillar call. Authenticated results are cached by key for a short TTL —
 * long enough that a busy caller pays one lookup per window, short enough that
 * a revocation takes effect within it. That TTL is the revocation lag, and it
 * is the deliberate trade: the alternative is either a per-request round-trip
 * or a revocation that never lands.
 *
 * Keys are cached under their SHA-256 digest, so the plaintext credential does
 * not sit in a long-lived map. Rejections are cached far more briefly and the
 * cache is size-capped, so a flood of invented keys cannot grow it without
 * bound. `unavailable` is never cached: it is the absence of an answer, not an
 * answer.
 */
import { createHash } from 'node:crypto';

import { REGISTRY_SERVICE_ACCOUNT_SELF_PATH } from '../registry-paths.js';

import type {
  ServiceAccountPrincipal,
  ServiceAccountVerification,
  ServiceAccountVerifier,
} from './service-account-auth.js';

const DEFAULT_REGISTRY_URL = 'http://registry-api:3001';
const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_CACHE_TTL_MS = 30_000;
const DEFAULT_REJECTION_TTL_MS = 5_000;
const DEFAULT_MAX_CACHE_ENTRIES = 512;

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

export interface RegistryServiceAccountVerifierOptions {
  /** Registry origin. Defaults to `POPS_REGISTRY_URL`, then the docker name. */
  readonly registryUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  /** How long an authenticated principal is reused. Also the revocation lag. */
  readonly cacheTtlMs?: number;
  /** How long a rejected key is remembered. Short: keys are re-minted. */
  readonly rejectionTtlMs?: number;
  /** Cap on cached digests, so unknown keys cannot grow the map unbounded. */
  readonly maxCacheEntries?: number;
  /** Injectable clock, for tests. */
  readonly now?: () => number;
}

function defaultRegistryUrl(): string {
  if (typeof process === 'undefined') return DEFAULT_REGISTRY_URL;
  const fromEnv = process.env['POPS_REGISTRY_URL'];
  return fromEnv === undefined || fromEnv === '' ? DEFAULT_REGISTRY_URL : fromEnv;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse the registry's self-introspection body. Anything that is not a
 * well-formed principal is treated as no answer rather than as a rejection —
 * a registry serving a shape this SDK cannot read is a broken registry, not
 * proof that the key is bad.
 */
function parsePrincipal(body: unknown): ServiceAccountPrincipal | undefined {
  if (!isRecord(body)) return undefined;
  const { id, name, scopes } = body;
  if (typeof id !== 'string' || id === '') return undefined;
  if (typeof name !== 'string' || name === '') return undefined;
  if (!Array.isArray(scopes) || scopes.some((s) => typeof s !== 'string')) return undefined;
  return { id, name, scopes: scopes as string[] };
}

function describe(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

interface RegistryQuery {
  readonly url: string;
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs: number;
}

async function fetchSelf(query: RegistryQuery, apiKey: string): Promise<Response | string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), query.timeoutMs);
  try {
    return await query.fetchImpl(query.url, {
      method: 'GET',
      headers: { accept: 'application/json', 'x-api-key': apiKey },
      signal: controller.signal,
    });
  } catch (cause) {
    return describe(cause, 'registry fetch failed');
  } finally {
    clearTimeout(timer);
  }
}

/** One registry round-trip, mapped onto the three verification outcomes. */
async function askRegistry(
  query: RegistryQuery,
  apiKey: string
): Promise<ServiceAccountVerification> {
  if (typeof query.fetchImpl !== 'function') {
    return { outcome: 'unavailable', detail: 'no fetch implementation available' };
  }

  const response = await fetchSelf(query, apiKey);
  if (typeof response === 'string') return { outcome: 'unavailable', detail: response };

  if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN) {
    return { outcome: 'rejected' };
  }
  if (!response.ok) {
    // Includes 404 from a registry image that predates this route: unknown,
    // not disproven, so callers keep failing closed until it rolls forward.
    return { outcome: 'unavailable', detail: `registry returned HTTP ${response.status}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    return { outcome: 'unavailable', detail: describe(cause, 'registry returned non-JSON body') };
  }
  const principal = parsePrincipal(body);
  return principal === undefined
    ? { outcome: 'unavailable', detail: 'registry returned an unreadable principal' }
    : { outcome: 'authenticated', principal };
}

interface CacheEntry {
  readonly expiresAt: number;
  readonly verification: ServiceAccountVerification;
}

/**
 * Insertion-ordered TTL cache keyed by the digest of a presented key. Evicts
 * the oldest entry at capacity, which is enough: the working set is the fleet's
 * handful of live accounts, and everything else is noise that expires fast.
 */
class VerificationCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly cacheTtlMs: number,
    private readonly rejectionTtlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number
  ) {}

  read(key: string): ServiceAccountVerification | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt > this.now()) return entry.verification;
    this.entries.delete(key);
    return undefined;
  }

  write(key: string, verification: ServiceAccountVerification): void {
    if (verification.outcome === 'unavailable') return;
    const ttl = verification.outcome === 'authenticated' ? this.cacheTtlMs : this.rejectionTtlMs;
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { expiresAt: this.now() + ttl, verification });
  }
}

/**
 * Build a verifier bound to a registry origin.
 *
 * @returns A {@link ServiceAccountVerifier} safe to share across requests; it
 *   holds the cache.
 */
export function createRegistryServiceAccountVerifier(
  options: RegistryServiceAccountVerifierOptions = {}
): ServiceAccountVerifier {
  const origin = (options.registryUrl ?? defaultRegistryUrl()).replace(/\/$/, '');
  const query: RegistryQuery = {
    url: `${origin}${REGISTRY_SERVICE_ACCOUNT_SELF_PATH}`,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
  const cache = new VerificationCache(
    options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    options.rejectionTtlMs ?? DEFAULT_REJECTION_TTL_MS,
    options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES,
    options.now ?? Date.now
  );

  return async function verify(apiKey: string): Promise<ServiceAccountVerification> {
    const digest = createHash('sha256').update(apiKey).digest('hex');
    const cached = cache.read(digest);
    if (cached !== undefined) return cached;

    const verification = await askRegistry(query, apiKey);
    cache.write(digest, verification);
    return verification;
  };
}
