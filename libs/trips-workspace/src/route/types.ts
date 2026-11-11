import type { SourceOwner } from '../arrangements/source-owner';
import type { Client } from '../trips-api/client';
import type {
  RouteGetResponses,
  RouteOperateData,
  RouteOperateResponses,
} from '../trips-api/types.gen';

/** Generated authoritative route read, including separately proven missing references. */
export type TripRouteRead = RouteGetResponses[200];
/** Exact immutable UUID/revision request supported by the owning Trips producer. */
export type RouteOperation = NonNullable<RouteOperateData['body']>;
/** Explicit placement operation; source dates and booking facts are outside this contract. */
export type RouteCommand = RouteOperation['command'];
/** New explicit placement intent; Undo is available only through confirmed own controller history. */
export type RouteEditCommand = Exclude<RouteCommand, { kind: 'undo' }>;
/** Own response proof, distinct from its potentially newer current route. */
export type RouteOperationResult = RouteOperateResponses[200];
/** Canonical mixed order and complete paths at one aggregate revision. */
export type TripRoute = RouteOperationResult['current'];
/** Canonical Visit or Journey reference, never a place identity. */
export type RouteSource = TripRouteRead['missingSources'][number];
/** Explicit root item, including persisted insertion gaps. */
export type RouteItem = TripRoute['order'][number];
/** Complete ordered alternative or historical applied path. */
export type RoutePath = TripRoute['paths'][number];
/** Immutable producer receipt belonging to one UUID. */
export type RouteReceipt = RouteOperationResult['receipt'];
/** Host's exact generated transport and trip; omission uses the actual default client. */
export interface RouteIdentity {
  tripId: number;
  client?: Client;
}
/** Captured transport, origin and trip remain independent of later client configuration. */
export type RouteOwner = SourceOwner;
/** Source availability is unknown after a POST until an actual GET supplies it. */
export interface RouteView {
  route: TripRoute;
  missingSources: readonly RouteSource[] | undefined;
}
