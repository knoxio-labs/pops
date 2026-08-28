/**
 * Re-deriving a row's tag suggestions after the user assigns the entity by
 * hand (POPS-2595).
 *
 * `suggestedTags` is computed once, during import processing, against whatever
 * entity the pipeline had resolved at that moment. When the user resolves an
 * uncertain row in Review, the entity is rewritten and the tag set is not — so
 * the row reaches Tag Review carrying a set computed while `entityId` was
 * `null`, which structurally excludes the entity-default pass and the
 * entity-scoped half of the tag-rule pass. This module holds the pure half of
 * the fix: what a freshly computed set and the row's existing one merge into.
 */
import { TX_BUCKETS, type LocalTxState } from './local-tx-reconcile';

import type { SuggestedTag } from '@pops/finance';

/**
 * Prefix of an entity id the wizard minted locally and has not committed yet
 * (`useEntities`/`addPendingEntity`). No contact carries this id, so it has no
 * default tags and no tag rule can be scoped to it.
 */
const PENDING_ENTITY_PREFIX = 'temp:entity:';

/**
 * Whether `entityId` names a contact the server can actually look up, and so
 * whether re-deriving suggestions for it is worth a round-trip.
 *
 * A locally-pending entity contributes nothing the row does not already have:
 * its default tags do not exist yet, and an entity-scoped rule cannot name it.
 * The stale-tag half of the recompute still applies to it — see
 * {@link mergeRecomputedTags} with an empty `fresh`.
 */
export function isPersistedEntityId(entityId: string): boolean {
  return !entityId.startsWith(PENDING_ENTITY_PREFIX);
}

function dedupeByTag(tags: readonly SuggestedTag[]): SuggestedTag[] {
  const seen = new Set<string>();
  const result: SuggestedTag[] = [];
  for (const suggestion of tags) {
    if (seen.has(suggestion.tag)) continue;
    seen.add(suggestion.tag);
    result.push(suggestion);
  }
  return result;
}

/**
 * Merge a freshly computed suggestion set into the one a row already carries.
 *
 * `fresh` comes from `GET /transactions/suggest-tags`, which runs the
 * correction, tag-rule and entity-default passes for `(description, entityId)`
 * — but not the AI pass, which the endpoint has no input for. So the merge
 * rules are:
 *
 * - every fresh suggestion is taken, since it was derived from the entity the
 *   user just picked;
 * - `source: 'entity'` suggestions already on the row are dropped: they are the
 *   *previous* entity's defaults, and a row cannot legitimately carry two
 *   merchants' defaults at once;
 * - everything else on the row survives — the AI pass (entity-independent),
 *   anything the user typed by hand, and rule tags the endpoint cannot
 *   reproduce because they came from a correction ChangeSet still pending
 *   client-side.
 *
 * Rule tags are deliberately *not* stripped wholesale. The prose case for it —
 * that a rule scoped to the old entity is now stale — is real, but the client
 * has no way to tell an entity-scoped rule's pattern from a global one, and
 * dropping every rule tag to catch it would also discard the pending-ChangeSet
 * tags above. Over-keeping a tag the user can remove beats silently losing one.
 *
 * Ordering reproduces the server's own priority (rule > ai > entity) so a
 * recomputed row reads the same as one the matcher resolved itself.
 */
export function mergeRecomputedTags(
  existing: readonly SuggestedTag[] | undefined,
  fresh: readonly SuggestedTag[]
): SuggestedTag[] {
  const kept = (existing ?? []).filter((s) => s.source !== 'entity');
  const freshNonEntity = fresh.filter((s) => s.source !== 'entity');
  const freshEntity = fresh.filter((s) => s.source === 'entity');
  return dedupeByTag([...freshNonEntity, ...kept, ...freshEntity]);
}

/**
 * Rewrite `suggestedTags` on every row whose checksum appears in `fresh`,
 * wherever that row currently sits.
 *
 * Reads each row's *live* suggestions rather than a snapshot taken when the
 * recompute was kicked off: the fetch is asynchronous, so a server
 * re-evaluation can have replaced the row object in between. Buckets with no
 * affected row are returned by reference, so React sees no spurious change.
 */
export function applyRecomputedTags(
  prev: LocalTxState,
  fresh: ReadonlyMap<string, readonly SuggestedTag[]>
): LocalTxState {
  if (fresh.size === 0) return prev;
  const next = { ...prev };
  for (const bucket of TX_BUCKETS) {
    const list = prev[bucket];
    if (!list.some((t) => fresh.has(t.checksum))) continue;
    next[bucket] = list.map((t) => {
      const suggestions = fresh.get(t.checksum);
      if (!suggestions) return t;
      return { ...t, suggestedTags: mergeRecomputedTags(t.suggestedTags, suggestions) };
    });
  }
  return next;
}
