/**
 * The state one entity group in Tag Review owns: whether it is expanded, the
 * tags staged for a bulk merge, and the two apply actions. Split out of
 * `EntityGroup` so the component file stays about rendering.
 */
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { unionTags } from './tagReviewUtils';

import type { EntityGroupProps } from './EntityGroup';

function pluralizeTransactions(count: number): string {
  return `${count} transaction${count !== 1 ? 's' : ''}`;
}

export function useEntityGroupState(props: EntityGroupProps) {
  const { group, localTags, suggestedTagMeta, onApplyGroupTags, onUpdateTag } = props;
  const [expanded, setExpanded] = useState(true);
  const [groupStagedTags, setGroupStagedTags] = useState<string[]>([]);

  const currentUnion = unionTags(group.transactions.map((t) => localTags[t.checksum] ?? []));
  const suggestedUnion = useMemo(
    () =>
      unionTags(
        group.transactions.map((t) => (suggestedTagMeta[t.checksum] ?? []).map((s) => s.tag))
      ),
    [group.transactions, suggestedTagMeta]
  );

  const handleApplySuggestions = useCallback(() => {
    if (suggestedUnion.length === 0) return;
    let applied = 0;
    for (const tx of group.transactions) {
      const currentTags = localTags[tx.checksum] ?? [];
      const suggestions = (suggestedTagMeta[tx.checksum] ?? []).map((s) => s.tag);
      if (suggestions.length === 0) continue;
      const mergedTags = Array.from(new Set([...currentTags, ...suggestions]));
      if (mergedTags.length === currentTags.length) continue; // all suggestions already present
      onUpdateTag(tx.checksum, mergedTags);
      applied++;
    }
    if (applied > 0) toast.success(`Suggestions applied to ${pluralizeTransactions(applied)}`);
  }, [group.transactions, suggestedUnion, suggestedTagMeta, localTags, onUpdateTag]);
  const handleApplyStagedToGroup = useCallback(() => {
    if (groupStagedTags.length === 0) return;
    onApplyGroupTags(group, groupStagedTags);
    toast.success(`Tags merged into ${pluralizeTransactions(group.transactions.length)}`);
    setGroupStagedTags([]);
  }, [group, groupStagedTags, onApplyGroupTags]);

  const removeGroupStagedTag = useCallback(
    (tag: string) => setGroupStagedTags((prev) => prev.filter((t) => t !== tag)),
    []
  );
  const addGroupStagedTag = useCallback(
    (tag: string) => setGroupStagedTags((prev) => (prev.includes(tag) ? prev : [...prev, tag])),
    []
  );

  return {
    expanded,
    setExpanded,
    currentUnion,
    suggestedUnion,
    groupStagedTags,
    handleApplySuggestions,
    handleApplyStagedToGroup,
    addGroupStagedTag,
    removeGroupStagedTag,
  };
}
