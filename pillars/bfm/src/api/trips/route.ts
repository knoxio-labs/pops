import { MobileTripRouteSchema } from '../../contract/mobile-trip-route-schemas.js';
import { isGatewayOk } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { tripsContractMismatch } from './references.js';

import type { MobileTripRoute } from '../../contract/mobile-trip-route-schemas.js';
import type { GatewayOutcome, PillarGateway } from '../pillars/gateway.js';

type RouteRouter = { route: { get: (input: { tripId: number }) => Promise<unknown> } };
type RouteIdentity = MobileTripRoute['order'][number];

function identity(value: RouteIdentity): string {
  return `${value.kind}/${value.id}`;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function validMembership(route: MobileTripRoute): boolean {
  const gaps = new Set(route.order.filter((item) => item.kind === 'gap').map((item) => item.id));
  const active = [
    ...route.order.filter((item) => item.kind !== 'gap'),
    ...route.paths.filter((path) => path.state === 'alternative').flatMap((path) => path.members),
  ];
  const sources = new Set([
    ...route.order.filter((item) => item.kind !== 'gap').map(identity),
    ...route.paths.flatMap((path) => path.members.map(identity)),
  ]);
  return (
    unique(route.order.map(identity)) &&
    unique(route.paths.map((path) => String(path.id))) &&
    unique(active.map(identity)) &&
    route.paths.every((path) => gaps.has(path.gapId) && unique(path.members.map(identity))) &&
    unique(route.missingSources.map(identity)) &&
    route.missingSources.every((source) => sources.has(identity(source)))
  );
}

/** Reads canonical placement directly; absent source records remain explicit missing identities, not dropped rows. */
export async function readMobileTripRoute(
  gateway: PillarGateway,
  tripId: number
): Promise<GatewayOutcome<MobileTripRoute>> {
  const response = await gateway.call<RouteRouter, unknown>('trips', (handle) =>
    handle.route.get({ tripId })
  );
  const parsed = parseOrMismatch('trips', response, MobileTripRouteSchema, 'route.get');
  if (!isGatewayOk(parsed)) return parsed;
  if (parsed.value.tripId !== tripId || !validMembership(parsed.value)) {
    return tripsContractMismatch('Trips route contained inconsistent ownership or membership');
  }
  return parsed;
}
