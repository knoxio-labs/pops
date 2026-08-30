import { applyChangeSetToRules, correctionToRow, toCorrection } from '@pops/finance';

import type { Correction, CorrectionRow } from '@pops/finance';

import type { PendingChangeSet, PendingEntity } from '../store/importStore';

/**
 * An entity as the pickers consume it. Deliberately narrower than the contract
 * `Entity`: every picker references an entity by id and name only, and the
 * merged list carries pending entities that have neither aliases nor an edit
 * time to report.
 */
export interface PickableEntity {
  id: string;
  name: string;
}

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
 * Merge the pending entities into the DB entities. When a pending entity's
 * name matches a DB entity's name (case-insensitive), the pending version
 * replaces the DB entry.
 * The merged list is sorted alphabetically by name (case-insensitive) so
 * newly-added pending entities appear in their natural position rather than
 * appended at the end.
 *
 * Pure — no internal caching (CF082/#3670); see {@link computeMergedRules}.
 */
export function computeMergedEntities(
  dbEntities: PickableEntity[],
  pendingEntities: PendingEntity[]
): PickableEntity[] {
  if (pendingEntities.length === 0) {
    // DB list is already sorted server-side; nothing to merge in.
    return dbEntities;
  }

  const byName = (a: PickableEntity, b: PickableEntity) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

  const pendingNameSet = new Set(pendingEntities.map((pe) => pe.name.toLowerCase()));

  const adaptedPending: PickableEntity[] = pendingEntities.map((pe) => ({
    id: pe.tempId,
    name: pe.name,
  }));

  const filteredDb = dbEntities.filter((e) => !pendingNameSet.has(e.name.toLowerCase()));

  return [...filteredDb, ...adaptedPending].toSorted(byName);
}
