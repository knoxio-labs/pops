import type { ConfirmedTransaction, SuggestedTag } from '@pops/finance';

import type { TagMetaEntry } from '../../tag-editor/utils';

/**
 * Every distinct source that suggested each tag across a group's rows, keyed by
 * tag. A tag a rule supplied on one row and the AI on another carries both, so
 * the group header can say where each of its tags came from (POPS-252).
 */
export function groupTagSources(
  transactions: readonly ConfirmedTransaction[],
  suggestedTagMeta: Record<string, SuggestedTag[]>
): Map<string, TagMetaEntry[]> {
  const byTag = new Map<string, TagMetaEntry[]>();
  for (const transaction of transactions) {
    for (const suggestion of suggestedTagMeta[transaction.checksum] ?? []) {
      const entries = byTag.get(suggestion.tag) ?? [];
      const seen = entries.some(
        (entry) => entry.source === suggestion.source && entry.pattern === suggestion.pattern
      );
      if (!seen) {
        entries.push({
          source: suggestion.source,
          pattern: suggestion.pattern,
          isNew: suggestion.isNew,
        });
      }
      byTag.set(suggestion.tag, entries);
    }
  }
  return byTag;
}
