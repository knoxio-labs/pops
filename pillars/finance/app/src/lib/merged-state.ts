import { applyChangeSetToRules, correctionToRow, toCorrection } from '@pops/finance';

import type { Correction, CorrectionRow, Entity } from '@pops/finance';

import type { PendingChangeSet, PendingEntity } from '../store/importStore';

/**
 * Stable placeholder edit-time for adapted pending entities. The rule-form
 * entity picker references pending entities by id/name only and never reads
 * this field, so it must be a fixed constant rather than a wall-clock read —
 * a `new Date()` here made {@link computeMergedEntities} impure, so two calls
 * with identical input diverged whenever they straddled a millisecond boundary.
 */
const PENDING_ENTITY_PLACEHOLDER_TIME = '1970-01-01T00:00:00.000Z';

/**
 * Fold `applyChangeSetToRules` over each pending ChangeSet in insertion order,
 * starting from the DB rules as the base.
 *
 * Pure — no internal caching (CF082/#3670). Callers that need memoization
 * across renders should wrap the call in `useMemo` keyed on
 * `[dbRules, pendingChangeSets]`, so concurrent call sites with different
 * in-flight inputs don't thrash a single shared cache slot.
 *
 * Operates on the API `Correction` shape (tags: string[]) at the boundary so
 * the frontend never has to juggle the DB's JSON-encoded tags string.
 */
export function computeMergedRules(
  dbRules: Correction[],
  pendingChangeSets: PendingChangeSet[]
): Correction[] {
  if (pendingChangeSets.length === 0) return dbRules;

  const baseRows = dbRules.map(correctionToRow);
  const mergedRows = pendingChangeSets.reduce<CorrectionRow[]>(
    (acc, pcs) => applyChangeSetToRules(acc, pcs.changeSet),
    baseRows
  );
  return mergedRows.map(toCorrection);
}

/**
 * Adapt pending entities to the `Entity` interface and merge them with DB
 * entities. When a pending entity's name matches a DB entity's name
 * (case-insensitive), the pending version replaces the DB entry.
 * The merged list is sorted alphabetically by name (case-insensitive) so
 * newly-added pending entities appear in their natural position rather than
 * appended at the end.
 *
 * Pure — no internal caching (CF082/#3670); see {@link computeMergedRules}.
 */
export function computeMergedEntities(
  dbEntities: Entity[],
  pendingEntities: PendingEntity[]
): Entity[] {
  if (pendingEntities.length === 0) {
    // DB list is already sorted server-side; nothing to merge in.
    return dbEntities;
  }

  const byName = (a: Entity, b: Entity) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

  const pendingNameSet = new Set(pendingEntities.map((pe) => pe.name.toLowerCase()));

  // The merged list feeds the rule-form entity picker, which references entities
  // by id/name only, so aliases/lastEditedTime are placeholders.
  const adaptedPending: Entity[] = pendingEntities.map((pe) => ({
    id: pe.tempId,
    name: pe.name,
    aliases: [],
    lastEditedTime: PENDING_ENTITY_PLACEHOLDER_TIME,
  }));

  const filteredDb = dbEntities.filter((e) => !pendingNameSet.has(e.name.toLowerCase()));

  return [...filteredDb, ...adaptedPending].toSorted(byName);
}
