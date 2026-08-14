/**
 * How bfm decides what to tell the phone about one member of the federation.
 *
 * Two signals compose, in this order, and the order is the whole design:
 *
 * 1. **What the registry says.** A pillar the registry reports as unregistered
 *    or unhealthy is `unavailable`, and one it is mid-reconcile about is
 *    `degraded` — without a probe. Not because probing would be expensive, but
 *    because `pillar()` refuses those calls on exactly this basis
 *    (`guardAvailability` in the SDK's client factory). Probing past the veto
 *    would let bootstrap answer `healthy` for a pillar every subsequent call
 *    then fails on, which is worse than no answer at all.
 *
 * 2. **What the pillar says right now.** Everything the registry has not
 *    vetoed gets one live `GET ${baseUrl}/openapi`.
 *
 * `/openapi` rather than `/health` is deliberate. `/health` proves a process
 * is up; `/openapi` proves the thing a cross-pillar call actually needs, since
 * the SDK builds its route map from that document and a pillar serving none is
 * uncallable however alive it is. One request answers both questions:
 *
 * - the request never completed (refused, DNS, timeout) → nobody answered →
 *   `unavailable`;
 * - it completed with anything other than 2xx JSON → answering, but not with a
 *   contract → `contract-mismatch`. That arm covers the fleet's own history: a
 *   misrouted proxy answering `200 text/html` for an API path looks identical
 *   to a healthy pillar until something reads the content type.
 *
 * The body is never read. Pillar OpenAPI documents run to hundreds of
 * kilobytes each and app launch is not the moment to move megabytes across the
 * network to learn a fact the response headers already carry.
 */
import type { PillarSnapshot } from '@pops/pillar-sdk/discovery';

import type { BootstrapPillar, Reachability } from '../../contract/rest-schemas.js';

/**
 * Per-pillar deadline. Short because it is spent while a phone waits on a
 * splash screen, and a pillar that cannot answer a static document from inside
 * the same network in this long is not one the app should be told to render.
 */
export const DEFAULT_PROBE_TIMEOUT_MS = 2_000;

export interface ReachabilityProbeDeps {
  fetchImpl: typeof fetch;
  /** Applies to each pillar independently, never to the fan-out as a whole. */
  timeoutMs: number;
  /**
   * `pillarId → baseUrl`, applied before probing. The same map
   * `configureServerSdk` hands `InternalBaseUrlTransport`, and it has to be the
   * same map: a probe against the registry-advertised hostname while calls go
   * to an override would report a federation nobody is talking to. Ids absent
   * from it keep the URL the registry advertised.
   */
  baseUrlOverrides: Readonly<Record<string, string>>;
}

export function defaultProbeDeps(
  baseUrlOverrides: Readonly<Record<string, string>> = {},
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS
): ReachabilityProbeDeps {
  return { fetchImpl: fetch, timeoutMs, baseUrlOverrides };
}

/**
 * Probe every pillar the registry reported, concurrently.
 *
 * Concurrent rather than sequential so the wall-clock cost is the slowest
 * single pillar rather than the sum — a fleet of a dozen pillars with one
 * black-holed host would otherwise add a full deadline per member to every app
 * launch.
 *
 * Sorted by id on the way out: the registry's own ordering is incidental, and
 * a response that reorders itself between two identical launches is one nobody
 * can diff.
 */
export async function probeFederation(
  entries: readonly PillarSnapshot[],
  deps: ReachabilityProbeDeps
): Promise<BootstrapPillar[]> {
  const probed = await Promise.all(
    entries.map(async (entry) => ({
      id: entry.pillarId,
      reachability: await probePillar(entry, deps),
    }))
  );
  return probed.toSorted((left, right) => left.id.localeCompare(right.id));
}

/**
 * Never rejects. A probe is a question about somebody else's health, and an
 * exception escaping it would turn one unreachable pillar into a failed app
 * launch — the exact outcome this endpoint exists to prevent.
 */
export async function probePillar(
  entry: PillarSnapshot,
  deps: ReachabilityProbeDeps
): Promise<Reachability> {
  const veto = registryVeto(entry);
  if (veto !== null) return veto;
  return probeContractRoute(deps.baseUrlOverrides[entry.pillarId] ?? entry.baseUrl, deps);
}

function registryVeto(entry: PillarSnapshot): Reachability | null {
  if (!entry.registered) return 'unavailable';
  if (entry.status === 'unavailable') return 'unavailable';
  if (entry.status === 'unknown') return 'degraded';
  return null;
}

async function probeContractRoute(
  baseUrl: string,
  deps: ReachabilityProbeDeps
): Promise<Reachability> {
  let response: Response;
  try {
    response = await deps.fetchImpl(`${baseUrl.replace(/\/$/, '')}/openapi`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(deps.timeoutMs),
    });
  } catch {
    // Includes the timeout. The distinction between "refused" and "too slow"
    // is real but not one the phone can act on differently, and inventing a
    // fifth state to carry it would cost the app a branch it cannot use.
    return 'unavailable';
  }

  await discardBody(response);

  if (!response.ok) return 'contract-mismatch';
  return isJson(response) ? 'healthy' : 'contract-mismatch';
}

/**
 * Release the connection without downloading the document. Undici holds the
 * socket open until a response body is consumed or cancelled, so skipping this
 * would leak one connection per pillar per app launch.
 */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A body that cannot be cancelled has already ended. Nothing to recover,
    // and nothing about it changes what the headers already said.
  }
}

function isJson(response: Response): boolean {
  return response.headers.get('content-type')?.toLowerCase().includes('json') === true;
}
