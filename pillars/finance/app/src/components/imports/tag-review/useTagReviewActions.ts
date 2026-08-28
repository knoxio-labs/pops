import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { hasManualEdit } from './tagReviewUtils';

import type { ConfirmedTransaction, SuggestedTag, TagRuleImpactItem } from '@pops/finance';

import type { ConfirmedGroup } from './tagReviewUtils';

/**
 * Merge a newly saved rule's tags into the rows it affects, skipping rows the
 * user has manually edited so a rule never overwrites hand-made decisions.
 *
 * "Edited" is derived from `suggestedTagMeta` against `prev`, so it always
 * reflects the rows that actually differ from their suggestions right now.
 */
export function applyAffectedToLocalTags(
  prev: Record<string, string[]>,
  affected: TagRuleImpactItem[],
  suggestedTagMeta: Record<string, SuggestedTag[]>
): Record<string, string[]> {
  const next = { ...prev };
  for (const item of affected) {
    const checksum = item.transactionId;
    const existingTags = prev[checksum] ?? [];
    if (!hasManualEdit(existingTags, suggestedTagMeta[checksum] ?? [])) {
      const newRuleTags = item.after.suggestedTags.map((s) => s.tag);
      next[checksum] = [...new Set([...existingTags, ...newRuleTags])];
    }
  }
  return next;
}

export function applyAffectedToSuggested(
  prev: Record<string, SuggestedTag[]>,
  affected: TagRuleImpactItem[]
): Record<string, SuggestedTag[]> {
  const next = { ...prev };
  for (const item of affected) {
    const checksum = item.transactionId;
    const ruleSuggestedTags = item.after.suggestedTags.map((s) => ({
      tag: s.tag,
      source: s.source,
      pattern: s.pattern,
    }));
    const ruleSuggestedTagSet = new Set(ruleSuggestedTags.map((s) => s.tag));
    const existingMeta = prev[checksum] ?? [];
    next[checksum] = [
      ...existingMeta.filter((entry) => !ruleSuggestedTagSet.has(entry.tag)),
      ...ruleSuggestedTags,
    ];
  }
  return next;
}

/**
 * Rows whose suggested tags are not all already present in their current tags —
 * exactly the rows an accept-all would change.
 */
export function rowsMissingSuggestions(
  confirmedTransactions: ConfirmedTransaction[],
  localTags: Record<string, string[]>,
  suggestedTagMeta: Record<string, SuggestedTag[]>
): string[] {
  const missing: string[] = [];
  for (const t of confirmedTransactions) {
    const current = new Set(localTags[t.checksum] ?? []);
    const suggested = suggestedTagMeta[t.checksum] ?? [];
    if (suggested.some((s) => !current.has(s.tag))) missing.push(t.checksum);
  }
  return missing;
}

interface TagActionsDeps {
  localTags: Record<string, string[]>;
  setLocalTags: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  suggestedTagMeta: Record<string, SuggestedTag[]>;
  confirmedTransactions: ConfirmedTransaction[];
}

export function useTagActions(deps: TagActionsDeps) {
  const { localTags, setLocalTags, suggestedTagMeta, confirmedTransactions } = deps;

  const updateTag = useCallback(
    (checksum: string, tags: string[]) => {
      setLocalTags((prev) => ({ ...prev, [checksum]: tags }));
    },
    [setLocalTags]
  );

  const unappliedSuggestionCount = useMemo(
    () => rowsMissingSuggestions(confirmedTransactions, localTags, suggestedTagMeta).length,
    [confirmedTransactions, localTags, suggestedTagMeta]
  );

  const handleAcceptAll = useCallback(() => {
    const pending = rowsMissingSuggestions(confirmedTransactions, localTags, suggestedTagMeta);
    if (pending.length === 0) return;
    setLocalTags((prev) => {
      const next = { ...prev };
      for (const checksum of pending) {
        const suggested = (suggestedTagMeta[checksum] ?? []).map((s) => s.tag);
        next[checksum] = [...new Set([...(prev[checksum] ?? []), ...suggested])];
      }
      return next;
    });
    toast.success(
      `Suggested tags applied to ${pending.length} transaction${pending.length === 1 ? '' : 's'}`
    );
  }, [confirmedTransactions, localTags, suggestedTagMeta, setLocalTags]);

  const handleApplyGroupTags = useCallback(
    (group: ConfirmedGroup, newTags: string[]) => {
      setLocalTags((prev) => {
        const next = { ...prev };
        for (const t of group.transactions) {
          const existing = prev[t.checksum] ?? [];
          next[t.checksum] = Array.from(new Set([...existing, ...newTags]));
        }
        return next;
      });
    },
    [setLocalTags]
  );

  return { updateTag, handleAcceptAll, handleApplyGroupTags, unappliedSuggestionCount };
}
