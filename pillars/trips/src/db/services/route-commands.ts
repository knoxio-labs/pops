import { routeGaps, routePaths } from '../schema/route.js';
import {
  insertRouteItems,
  requireAlternative,
  requireRoutePermutation,
  requireRouteSource,
  sameRouteItem,
} from './route-membership.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { RouteOperation, RouteSource, TripRoute } from '../../contract/route-schemas.js';
import type { TripsDb } from '../index.js';

function detach(route: TripRoute, source: RouteSource): TripRoute {
  return {
    ...route,
    order: route.order.filter((item) => !sameRouteItem(item, source)),
    paths: route.paths.map((path) =>
      path.state === 'alternative'
        ? { ...path, members: path.members.filter((item) => !sameRouteItem(item, source)) }
        : path
    ),
  };
}
function moveSource(
  db: TripsDb,
  route: TripRoute,
  command: Extract<RouteOperation['command'], { kind: 'source.move' }>
): TripRoute {
  requireRouteSource(db, route.tripId, command.source);
  if (
    command.destination.before !== null &&
    sameRouteItem(command.source, command.destination.before)
  )
    throw new TripsServiceError('route_membership_conflict');
  const next = detach(route, command.source);
  const destination = command.destination;
  if (destination.kind === 'route')
    return { ...next, order: insertRouteItems(next.order, [command.source], destination.before) };
  const path = requireAlternative(next, destination.pathId);
  const members = insertRouteItems(path.members, [command.source], destination.before);
  return {
    ...next,
    paths: next.paths.map((item) => (item.id === path.id ? { ...item, members } : item)),
  };
}
function createPath(
  db: TripsDb,
  route: TripRoute,
  command: Extract<RouteOperation['command'], { kind: 'path.create' }>
): TripRoute {
  if (!route.order.some((item) => item.kind === 'gap' && item.id === command.gapId))
    throw new TripsServiceError('route_membership_conflict');
  requireRoutePermutation(command.members, command.members);
  for (const member of command.members) {
    requireRouteSource(db, route.tripId, member);
    if (
      route.paths.some(
        (path) =>
          path.state === 'alternative' && path.members.some((item) => sameRouteItem(item, member))
      )
    )
      throw new TripsServiceError('route_membership_conflict');
  }
  const identity = requireOwnedRecord(
    db.insert(routePaths).values({ tripId: route.tripId }).returning().get()
  );
  return {
    ...route,
    order: route.order.filter(
      (item) => !command.members.some((member) => sameRouteItem(item, member))
    ),
    paths: [
      ...route.paths,
      {
        id: identity.id,
        title: command.title,
        gapId: command.gapId,
        state: 'alternative',
        members: command.members,
      },
    ],
  };
}
function applyPath(db: TripsDb, route: TripRoute, pathId: number): TripRoute {
  const path = route.paths.find((item) => item.id === pathId);
  if (path === undefined) throw new TripsServiceError('not_found');
  if (path.state === 'applied') return route;
  if (path.members.length === 0) throw new TripsServiceError('route_membership_conflict');
  requireRoutePermutation(path.members, path.members);
  for (const member of path.members) {
    requireRouteSource(db, route.tripId, member);
    if (
      route.order.some((item) => sameRouteItem(item, member)) ||
      route.paths.some(
        (other) =>
          other.id !== path.id &&
          other.state === 'alternative' &&
          other.members.some((item) => sameRouteItem(item, member))
      )
    )
      throw new TripsServiceError('route_membership_conflict');
  }
  return {
    ...route,
    order: insertRouteItems(route.order, path.members, { kind: 'gap', id: path.gapId }),
    paths: route.paths.map((item) => (item.id === path.id ? { ...item, state: 'applied' } : item)),
  };
}
/** Apply exclusive placement moves without touching source records; an applied path cannot insert twice. */
export function applyRouteCommand(
  db: TripsDb,
  route: TripRoute,
  command: Exclude<RouteOperation['command'], { kind: 'undo' }>
): TripRoute {
  switch (command.kind) {
    case 'gap.create': {
      const gap = requireOwnedRecord(
        db.insert(routeGaps).values({ tripId: route.tripId }).returning().get()
      );
      return {
        ...route,
        order: insertRouteItems(route.order, [{ kind: 'gap', id: gap.id }], command.before),
      };
    }
    case 'source.move':
      return moveSource(db, route, command);
    case 'route.reorder':
      requireRoutePermutation(route.order, command.order);
      return { ...route, order: command.order };
    case 'path.create':
      return createPath(db, route, command);
    case 'path.reorder': {
      const path = requireAlternative(route, command.pathId);
      requireRoutePermutation(path.members, command.members);
      return {
        ...route,
        paths: route.paths.map((item) =>
          item.id === path.id ? { ...item, members: command.members } : item
        ),
      };
    }
    case 'path.apply':
      return applyPath(db, route, command.pathId);
  }
}
