/**
 * The app's first authenticated call, assembled.
 *
 * Three things happen here and the order matters. The device is recorded as
 * having checked in FIRST, because that is true regardless of how the rest of
 * the call goes — a federation that turns out to be entirely unreachable does
 * not make the handset's contact any less real, and writing afterwards would
 * lose it to the one code path where knowing a phone still calls home is worth
 * most. Then the registry is read, then every pillar it named is probed.
 *
 * The registry is read through `@pops/pillar-sdk/discovery`, whose cache is
 * TTL'd process-wide, so a launching app costs at most one registry fetch per
 * TTL window no matter how many devices launch inside it.
 *
 * **This route never fails because the federation did.** A registry that
 * cannot be reached at all yields an empty pillar list, a feature list that is
 * uniformly unavailable, and `registry.source: 'unavailable'` — a `200` the
 * app can render as "cannot reach home right now". The alternative, a `500`,
 * is a phone that cannot get past its splash screen because a sibling
 * container blinked, and that is strictly worse than a stale or empty feature
 * list. The SDK's own stale-fallback does the rest of the work: as long as the
 * cache holds anything, a failed refresh serves last-known-good rather than
 * nothing.
 *
 * An error that is NOT a registry outage propagates. The SDK folds every
 * reachability failure into a value, so an exception arriving here is a fault
 * in this process and must not be dressed up as an unhealthy federation.
 */
import { pillarRegistry, RegistryUnreachableError } from '@pops/pillar-sdk/discovery';

import { touchDevice } from '../../db/index.js';
import { deriveFeatures } from './features.js';
import { defaultProbeDeps, probeFederation, type ReachabilityProbeDeps } from './reachability.js';

import type { PillarSnapshot, RegistrySnapshot } from '@pops/pillar-sdk/discovery';

import type { MobileBootstrapResponse, RegistrySource } from '../../contract/rest-schemas.js';
import type { BfmDb, DeviceRow } from '../../db/index.js';

export interface MobileBootstrapDeps {
  db: BfmDb;
  /** The registry read. Defaults to the SDK's TTL'd discovery cache. */
  readRegistry: () => Promise<RegistrySnapshot>;
  probe: ReachabilityProbeDeps;
  /** Injected so the timestamp written and the one returned are one value. */
  now: () => Date;
}

export function defaultMobileBootstrapDeps(
  db: BfmDb,
  baseUrlOverrides: Readonly<Record<string, string>>
): MobileBootstrapDeps {
  return {
    db,
    readRegistry: pillarRegistry,
    probe: defaultProbeDeps(baseUrlOverrides),
    now: () => new Date(),
  };
}

export async function buildMobileBootstrap(
  device: DeviceRow,
  deps: MobileBootstrapDeps
): Promise<MobileBootstrapResponse> {
  const seenAt = deps.now().toISOString();
  touchDevice(deps.db, device.id, seenAt);

  const registry = await readRegistry(deps.readRegistry);
  const pillars = await probeFederation(registry.pillars, deps.probe);

  return {
    device: { id: device.id, name: device.name, lastSeenAt: seenAt },
    registry: { source: registry.source },
    pillars,
    features: deriveFeatures(pillars),
  };
}

async function readRegistry(read: () => Promise<RegistrySnapshot>): Promise<{
  source: RegistrySource;
  pillars: readonly PillarSnapshot[];
}> {
  try {
    const snapshot = await read();
    return { source: snapshot.source, pillars: snapshot.pillars };
  } catch (error) {
    if (!(error instanceof RegistryUnreachableError)) throw error;
    // Worth logging where a 401 is not: this route is behind the perimeter, so
    // an unauthenticated caller cannot provoke the line, and a federation the
    // phone cannot see is exactly what an operator wants told.
    console.warn(
      `[bfm-api] bootstrap served with no registry snapshot after ${error.attempts} attempt(s): ${error.message}`
    );
    return { source: 'unavailable', pillars: [] };
  }
}
