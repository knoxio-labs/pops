import type {
  RouteOperation,
  RouteOperationResult,
  RouteOwner,
  TripRoute,
  TripRouteRead,
} from './types';

/** Strip availability from the aggregate without fabricating metadata absent from mutation responses. */
export function routeWithoutAvailability(read: TripRouteRead): TripRoute {
  return { tripId: read.tripId, revision: read.revision, order: read.order, paths: read.paths };
}
/** Compare explicit persisted facts, independent of JSON object property order. */
export function sameRoute(first: TripRoute, second: TripRoute): boolean {
  return routeKey(first) === routeKey(second);
}
function routeKey(route: TripRoute): string {
  return JSON.stringify([
    route.tripId,
    route.revision,
    route.order.map((item) => [item.kind, item.id]),
    route.paths.map((path) => [
      path.id,
      path.title,
      path.gapId,
      path.state,
      path.members.map((member) => [member.kind, member.id]),
    ]),
  ]);
}
/** Require the exact own UUID, precondition, trip and Undo target before accepting application proof. */
export function requireOwnReceipt(
  owner: RouteOwner,
  operation: RouteOperation,
  result: RouteOperationResult
): void {
  const { receipt, current } = result;
  const expectedUndo =
    operation.command.kind === 'undo' ? operation.command.targetOperationId : null;
  if (
    receipt.operationId !== operation.operationId ||
    receipt.undoneOperationId !== expectedUndo ||
    receipt.before.tripId !== owner.tripId ||
    receipt.after.tripId !== owner.tripId ||
    current.tripId !== owner.tripId
  )
    throw new Error('Route response does not prove the submitted operation');
  requireReceiptRevisions(operation, result);
}
function requireReceiptRevisions(operation: RouteOperation, result: RouteOperationResult): void {
  const { receipt, current } = result;
  if (
    receipt.before.revision !== operation.expectedRevision ||
    receipt.after.revision < receipt.before.revision ||
    receipt.after.revision > receipt.before.revision + 1 ||
    current.revision < receipt.after.revision ||
    (current.revision === receipt.after.revision && !sameRoute(current, receipt.after)) ||
    (receipt.before.revision === receipt.after.revision &&
      !sameRoute(receipt.before, receipt.after))
  )
    throw new Error('Route response does not prove the submitted operation');
}
