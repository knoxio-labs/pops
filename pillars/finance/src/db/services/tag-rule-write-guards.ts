/**
 * The checks every `transaction_tag_rules` create and update passes through.
 *
 * They sit in the service layer, not in a handler, because a rule reaches the
 * table by four routes — `POST /tag-rules/apply`, `PATCH /tag-rules/:id`, the
 * import commit's ChangeSet phase and anything calling the service directly —
 * and a check on any one of them leaves the other three open. The REST apply
 * route is exactly such a route: it never ran the commit's temp-id resolution.
 */
import { parseTagFacet, tagFacetKind } from '../tag-facets.js';
import { MarkerFacetTagRuleError, PlaceholderEntityScopeError } from '../tag-rule-errors.js';

/**
 * Reserved namespace for any commit-time placeholder id. Real contact ids are
 * v4 UUIDs, so nothing legitimate written to an `entity_id` column ever starts
 * with `temp:`; the import wizard's `temp:entity:{uuid}` is the one well-formed
 * placeholder, and it must be resolved before it is stored.
 *
 * `pending:contact:{uuid}` (see `entity-precreate-outbox.ts`) is a different
 * namespace and deliberately not covered: it is the one placeholder meant to be
 * persisted while contacts is unreachable, tracked by an outbox row until the
 * reconciler resolves it.
 */
export const PLACEHOLDER_ENTITY_ID_PREFIX = 'temp:';

/** True when `entityId` is an unresolved `temp:` placeholder. */
export function isPlaceholderEntityId(entityId: string | null | undefined): entityId is string {
  return entityId?.startsWith(PLACEHOLDER_ENTITY_ID_PREFIX) === true;
}

/**
 * The tags in `tags` whose facet is a `marker`, in order.
 *
 * The facet is compared trimmed and lower-cased: the vocabulary compares tags
 * case-insensitively, so `FLAG:needs-review` is the same tag to every reader
 * and must not be a way past the check.
 */
export function markerFacetTags(tags: readonly string[]): string[] {
  return tags.filter(
    (tag) => tagFacetKind(parseTagFacet(tag.trim()).facet?.toLowerCase() ?? null) === 'marker'
  );
}

/**
 * Refuse a tag-rule write that would store a marker tag or a placeholder scope.
 *
 * Fields left `undefined` are not being written and are not checked, so an
 * update that touches neither passes.
 *
 * @throws {MarkerFacetTagRuleError}
 * @throws {PlaceholderEntityScopeError}
 */
export function assertTagRuleWritable(input: {
  tags?: readonly string[];
  entityId?: string | null;
}): void {
  if (input.tags !== undefined) {
    const markers = markerFacetTags(input.tags);
    if (markers.length > 0) throw new MarkerFacetTagRuleError(markers);
  }
  if (isPlaceholderEntityId(input.entityId)) {
    throw new PlaceholderEntityScopeError(input.entityId);
  }
}
