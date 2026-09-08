/**
 * The state one entity group in Tag Review owns: whether it is expanded, the
 * tags staged for a bulk merge, and the two apply actions. Split out of
 * `EntityGroup` so the component file stays about rendering.
 */
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { unionTags } from './tagReviewUtils';

import type { SuggestedTag } from '@pops/finance';

import type { ConfirmedGroup } from './tagReviewUtils';

/**
 * What the hook needs, which is less than the component takes — declared here
 * rather than imported from `EntityGroup` so the dependency runs one way.
 */
export interface EntityGroupStateInput {
  group: ConfirmedGroup;
  localTags: Record<string, string[]>;
  suggestedTagMeta: Record<string, SuggestedTag[]>;
  onUpdateTag: (checksum: string, tags: string[]) => void;
  onApplyGroupTags: (group: ConfirmedGroup, tags: string[]) => void;
  onRemoveGroupTag: (group: ConfirmedGroup, tag: string) => void;
}

function pluralizeTransactions(count: number): string {
  return `${count} transaction${count !== 1 ? 's' : ''}`;
}

/** Applies each transaction's own outstanding suggestions, skipping rows with none pending. */
function applySuggestionsToGroup(
  group: ConfirmedGroup,
  localTags: Record<string, string[]>,
  suggestedTagMeta: Record<string, SuggestedTag[]>,
  onUpdateTag: (checksum: string, tags: string[]) => void
): number {
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
  return applied;
}

function countTaggedTransactions(
  group: ConfirmedGroup,
  localTags: Record<string, string[]>,
  tag: string
): number {
  return group.transactions.filter((t) => (localTags[t.checksum] ?? []).includes(tag)).length;
}

export function useEntityGroupState(props: EntityGroupStateInput) {
  const { group, localTags, suggestedTagMeta, onApplyGroupTags, onRemoveGroupTag, onUpdateTag } =
    props;
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
    const applied = applySuggestionsToGroup(group, localTags, suggestedTagMeta, onUpdateTag);
    if (applied > 0) toast.success(`Suggestions applied to ${pluralizeTransactions(applied)}`);
  }, [group, suggestedUnion, suggestedTagMeta, localTags, onUpdateTag]);
  const handleApplyStagedToGroup = useCallback(() => {
    if (groupStagedTags.length === 0) return;
    onApplyGroupTags(group, groupStagedTags);
    toast.success(`Tags merged into ${pluralizeTransactions(group.transactions.length)}`);
    setGroupStagedTags([]);
  }, [group, groupStagedTags, onApplyGroupTags]);

  const handleRemoveCurrentTag = useCallback(
    (tag: string) => {
      const affected = countTaggedTransactions(group, localTags, tag);
      if (affected === 0) return;
      onRemoveGroupTag(group, tag);
      toast.success(`Tag removed from ${pluralizeTransactions(affected)}`);
    },
    [group, localTags, onRemoveGroupTag]
  );

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
    handleRemoveCurrentTag,
    addGroupStagedTag,
    removeGroupStagedTag,
  };
}
