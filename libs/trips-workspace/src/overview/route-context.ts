import { dateRange } from './model';

import type {
  ProjectedRouteItem,
  ProjectedRouteSource,
  RouteProjection,
} from '../route/projection';
import type { Visit } from '../stay/types';
import type { OverviewViewProps } from './types';

/** The shared projector pairs a resolved Visit only with its explicit Visit discriminant. */
export function resolvedVisit(
  item: ProjectedRouteItem
): item is Extract<ProjectedRouteSource, { state: 'resolved'; reference: { kind: 'visit' } }> {
  return item.state === 'resolved' && item.reference.kind === 'visit';
}
/** The shared projector pairs a resolved Journey only with its explicit Journey discriminant. */
export function resolvedJourney(
  item: ProjectedRouteItem
): item is Extract<ProjectedRouteSource, { state: 'resolved'; reference: { kind: 'journey' } }> {
  return item.state === 'resolved' && item.reference.kind === 'journey';
}
/** Independent facts have buckets at actual sources or active canonical references; applied history is not active placement. */
export function renderedVisitReferences(props: OverviewViewProps): readonly Pick<Visit, 'id'>[] {
  return [
    ...(props.sources.visits ?? []).filter((visit) => visit.tripId === props.tripId),
    ...(props.projection?.order ?? []).flatMap((item) =>
      item.reference.kind === 'visit' ? [item.reference] : []
    ),
    ...(props.projection?.paths ?? [])
      .filter(({ path }) => path.state === 'alternative')
      .flatMap(({ members }) =>
        members.flatMap((item) => (item.reference.kind === 'visit' ? [item.reference] : []))
      ),
  ];
}

/** Only actual canonical boundary Visits supply header bounds; unavailable boundaries remain unknown. */
export function routeDateRange(
  projection: RouteProjection | undefined,
  locale: string
): string | undefined {
  const visits = projection?.order.filter((item) => item.reference.kind === 'visit');
  const first = visits?.[0];
  const last = visits?.at(-1);
  return dateRange(
    first && resolvedVisit(first) ? first.source.timing.arrival : undefined,
    last && resolvedVisit(last) ? last.source.timing.departure : undefined,
    locale
  );
}
