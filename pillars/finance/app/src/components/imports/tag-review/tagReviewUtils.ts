import type { ConfirmedTransaction, SuggestedTag } from '@pops/finance';

import type { TagMetaEntry } from '../../TagEditor';

/** Group of confirmed transactions sharing the same entity */
export interface ConfirmedGroup {
  entityName: string;
  transactions: ConfirmedTransaction[];
}

/** Group confirmed transactions by entity name, sorting alphabetically */
export function groupByEntity(transactions: ConfirmedTransaction[]): ConfirmedGroup[] {
  const map = new Map<string, ConfirmedTransaction[]>();
  for (const t of transactions) {
    const key = t.entityName ?? 'No Entity';
    const existing = map.get(key);
    if (existing) {
      existing.push(t);
    } else {
      map.set(key, [t]);
    }
  }
  return [...map.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([entityName, txns]) => ({ entityName, transactions: txns }));
}

/** Union of all distinct tags across an array of tag lists */
export function unionTags(tagLists: string[][]): string[] {
  return [...new Set(tagLists.flat())].toSorted();
}

/** Build a tagMeta Map from a SuggestedTag array for the TagEditor */
export function buildTagMetaMap(suggestedTags: SuggestedTag[]): Map<string, TagMetaEntry> {
  const map = new Map<string, TagMetaEntry>();
  for (const s of suggestedTags) {
    map.set(s.tag, { source: s.source, pattern: s.pattern });
  }
  return map;
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
