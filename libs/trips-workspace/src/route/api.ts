import { unwrap } from '@pops/pillar-sdk/client';

import { currentSourceOwner } from '../arrangements/source-owner';
import { routeGet, routeOperate } from '../trips-api/sdk.gen';

import type { RouteOperation, RouteOperationResult, RouteOwner, TripRouteRead } from './types';

/** A retained route transport cannot be rebound to a different configured origin. */
export class RouteContextError extends Error {
  constructor() {
    super('The route transport no longer matches its captured owner');
    this.name = 'RouteContextError';
  }
}
/** Fence every actual request, including retries, against mutable transport configuration. */
export function assertRouteOwner(owner: RouteOwner): void {
  if (!currentSourceOwner(owner, owner)) throw new RouteContextError();
}
/** Read the explicit mixed route without deriving placement from independent source facts. */
export async function loadTripRoute(
  owner: RouteOwner,
  signal?: AbortSignal
): Promise<TripRouteRead> {
  assertRouteOwner(owner);
  const read = await unwrap(
    routeGet({ client: owner.client, path: { tripId: owner.tripId }, signal })
  );
  if (read.tripId !== owner.tripId) throw new Error('Foreign route response');
  return read;
}
/** Submit only the supplied pinned UUID, revision and command through the generated transport. */
export async function applyRouteOperation(
  owner: RouteOwner,
  body: RouteOperation
): Promise<RouteOperationResult> {
  assertRouteOwner(owner);
  return unwrap(routeOperate({ client: owner.client, path: { tripId: owner.tripId }, body }));
}
