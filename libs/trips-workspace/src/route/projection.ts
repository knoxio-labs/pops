import type { Journey } from '../journey/types';
import type { Visit } from '../stay/types';
import type { RouteItem, RoutePath, RouteSource, RouteView } from './types';

/** Independently loaded source collections; absent or failed context is not evidence of deletion. */
export interface RouteSourceContext {
  visits?: readonly Visit[];
  journeys?: readonly Journey[];
}
/** An explicit source with its own independently available canonical record. */
export type ProjectedRouteSource =
  | { reference: RouteSource; state: 'missing' | 'unavailable' }
  | { reference: Extract<RouteSource, { kind: 'visit' }>; state: 'resolved'; source: Visit }
  | { reference: Extract<RouteSource, { kind: 'journey' }>; state: 'resolved'; source: Journey };
/** Root gaps remain structural items rather than fabricated transport or sources. */
export type ProjectedRouteItem =
  | ProjectedRouteSource
  | { reference: Extract<RouteItem, { kind: 'gap' }>; state: 'gap' };
/** Complete path identity and state retain the producer's ordered source membership. */
export interface ProjectedRoutePath {
  path: RoutePath;
  members: ProjectedRouteSource[];
}
/** Ordered route and paths, plus canonical sources without an active placement. */
export interface RouteProjection {
  order: ProjectedRouteItem[];
  paths: ProjectedRoutePath[];
  unplaced: { visits: Visit[]; journeys: Journey[] };
}
/** Resolve only exact kind/ID/trip matches; dates, labels and endpoints never create membership. */
export function projectTripRoute(view: RouteView, context: RouteSourceContext): RouteProjection {
  const { route } = view;
  const resolve = (reference: RouteSource): ProjectedRouteSource => {
    if (view.missingSources?.some((missing) => sameReference(missing, reference)))
      return { reference, state: 'missing' };
    if (reference.kind === 'visit') {
      const source = context.visits?.find(
        (visit) => visit.id === reference.id && visit.tripId === route.tripId
      );
      return source
        ? { reference, state: 'resolved', source }
        : { reference, state: 'unavailable' };
    }
    const source = context.journeys?.find(
      (journey) => journey.id === reference.id && journey.tripId === route.tripId
    );
    return source ? { reference, state: 'resolved', source } : { reference, state: 'unavailable' };
  };
  const active = [
    ...route.order,
    ...route.paths.filter((path) => path.state === 'alternative').flatMap((path) => path.members),
  ];
  return {
    order: route.order.map((reference) =>
      reference.kind === 'gap' ? { reference, state: 'gap' } : resolve(reference)
    ),
    paths: route.paths.map((path) => ({ path, members: path.members.map(resolve) })),
    unplaced: {
      visits: (context.visits ?? []).filter(
        (source) =>
          source.tripId === route.tripId &&
          !active.some((ref) => ref.kind === 'visit' && ref.id === source.id)
      ),
      journeys: (context.journeys ?? []).filter(
        (source) =>
          source.tripId === route.tripId &&
          !active.some((ref) => ref.kind === 'journey' && ref.id === source.id)
      ),
    },
  };
}
function sameReference(first: RouteSource, second: RouteSource): boolean {
  return first.kind === second.kind && first.id === second.id;
}
