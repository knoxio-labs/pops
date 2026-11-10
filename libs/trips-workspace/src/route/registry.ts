import { sameSourceOwner, sourceOwner } from '../arrangements/source-owner';
import { RouteSession } from './session';

import type { QueryClient } from '@tanstack/react-query';

import type { RouteIdentity, RouteOwner } from './types';

/** A captured cache namespace and retained command controller share one immutable owner scope. */
export interface RouteBinding {
  readonly owner: RouteOwner;
  readonly session: RouteSession;
  readonly queryKey: readonly ['trips', string, number, 'route', number];
}
const registries = new WeakMap<QueryClient, RouteBinding[]>();

/** Retain per-client/origin/trip controllers outside cache eviction for the supplied host QueryClient lifetime. */
export function routeSession(scope: QueryClient, identity: RouteIdentity): RouteBinding {
  const owner = sourceOwner(identity);
  let entries = registries.get(scope);
  if (!entries) {
    entries = [];
    registries.set(scope, entries);
  }
  const existing = entries.find((entry) => sameSourceOwner(entry.owner, owner));
  if (existing) return existing;
  const binding: RouteBinding = Object.freeze({
    owner,
    session: new RouteSession(owner),
    queryKey: Object.freeze([
      'trips',
      owner.origin,
      owner.tripId,
      'route',
      entries.length,
    ] as const),
  });
  entries.push(binding);
  return binding;
}
