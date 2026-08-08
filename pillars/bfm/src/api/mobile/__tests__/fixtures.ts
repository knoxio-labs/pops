/**
 * Registry-shaped fixtures for the mobile bootstrap tests.
 *
 * The SDK's own discovery fixtures live inside `libs/sdk/src/__tests__/` and
 * are not part of its published surface, so these are built here from the
 * manifest builder bfm already ships. Nothing under `src/api/mobile/` reads a
 * manifest — the field exists because `PillarSnapshot` requires it — so the
 * cheapest honest one is bfm's own.
 */
import { buildBfmManifest } from '../../manifest.js';

import type { PillarSnapshot, RegistrySnapshot } from '@pops/pillar-sdk/discovery';

export function pillarSnapshot(
  pillarId: string,
  overrides: Partial<PillarSnapshot> = {}
): PillarSnapshot {
  return {
    pillarId,
    baseUrl: `http://${pillarId}-api:3000`,
    manifest: { ...buildBfmManifest('1.0.0'), pillar: pillarId },
    registered: true,
    lastSeenAt: new Date('2026-08-08T00:00:00.000Z'),
    status: 'healthy',
    ...overrides,
  };
}

export function registrySnapshot(
  pillars: readonly PillarSnapshot[],
  source: RegistrySnapshot['source'] = 'fresh'
): RegistrySnapshot {
  return {
    pillars: [...pillars],
    fetchedAt: new Date('2026-08-08T00:00:00.000Z'),
    ttlMs: 30_000,
    source,
  };
}

/** A pillar answering `/openapi` the way every pillar in the fleet does. */
export function contractResponse(): Response {
  return new Response(JSON.stringify({ openapi: '3.0.2', paths: {} }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * A `fetch` that answers each base URL from `byOrigin`, and rejects for any
 * URL not in it — a probe aimed somewhere unexpected fails loudly rather than
 * quietly reading as an unreachable pillar.
 */
export function fakeFetch(byOrigin: Record<string, () => Response | Promise<Response>>): {
  fetchImpl: typeof fetch;
  requested: string[];
} {
  const requested: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    const answer = byOrigin[url];
    if (answer === undefined) throw new Error(`unexpected probe: ${url}`);
    return answer();
  };
  return { fetchImpl, requested };
}
