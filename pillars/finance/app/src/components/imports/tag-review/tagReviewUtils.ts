import { entityIdentity, type EntityIdentities } from '@pops/finance';

import type { ConfirmedTransaction, SuggestedTag } from '@pops/finance';

/** Group of confirmed transactions sharing the same entity */
export interface ConfirmedGroup {
  identityKey: string;
  entityName: string;
  transactions: ConfirmedTransaction[];
}

/** Group by canonical identity, preserving homonyms as separate groups and every historical row id. */
export function groupByEntity(
  transactions: ConfirmedTransaction[],
  identities?: EntityIdentities
): ConfirmedGroup[] {
  const map = new Map<string, ConfirmedTransaction[]>();
  for (const t of transactions) {
    const key =
      entityIdentity(t.entityId ?? null, identities) ?? `unassigned:${t.entityName ?? 'No Entity'}`;
    const existing = map.get(key);
    if (existing) {
      existing.push(t);
    } else {
      map.set(key, [t]);
    }
  }
  return [...map.entries()]
    .map(([identityKey, txns]) => ({
      identityKey,
      entityName: txns[0]?.entityName ?? 'No Entity',
      transactions: txns,
    }))
    .toSorted((a, b) => a.entityName.localeCompare(b.entityName));
}

/** Union of all distinct tags across an array of tag lists */
export function unionTags(tagLists: string[][]): string[] {
  return [...new Set(tagLists.flat())].toSorted();
}

/**
 * True when a row's current tags differ, as a set, from the tags currently
 * suggested for it — i.e. the user has manually added or removed something.
 *
 * Derived rather than tracked so that a row edited back to exactly its
 * suggestion set stops counting as edited, and so no bulk action can leave a
 * stale "edited" mark behind.
 */
export function hasManualEdit(tags: string[], suggested: SuggestedTag[]): boolean {
  const current = new Set(tags);
  const baseline = new Set(suggested.map((s) => s.tag));
  if (current.size !== baseline.size) return true;
  for (const tag of current) if (!baseline.has(tag)) return true;
  return false;
}
