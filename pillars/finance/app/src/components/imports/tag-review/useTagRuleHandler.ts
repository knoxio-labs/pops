import { useCallback } from 'react';
import { toast } from 'sonner';

import { applyAffectedToLocalTags, applyAffectedToSuggested } from './useTagReviewActions';

import type { EntityIdentities } from '@pops/finance';
import type { SuggestedTag, TagRuleChangeSet, TagRuleImpactItem } from '@pops/finance';

import type { ImportStore as ImportStoreType } from '../../../store/import-store-types';

interface TagRuleHandlerArgs {
  identities?: EntityIdentities;
  addPendingTagRuleChangeSet: ImportStoreType['addPendingTagRuleChangeSet'];
  dialogGroupNameRef: React.MutableRefObject<string | null>;
  dialogSourceChecksumsRef: React.MutableRefObject<string[]>;
  setLocalTags: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setSuggestedTagMeta: React.Dispatch<React.SetStateAction<Record<string, SuggestedTag[]>>>;
  suggestedTagMeta: Record<string, SuggestedTag[]>;
}

/**
 * Stages an applied tag-rule proposal and folds its effect into the step's
 * working tags.
 *
 * The staged rule records the rows its tags came from, so that a later edit to
 * those rows narrows it rather than leaving the two to disagree (POPS-3106).
 */
export function useTagRuleHandler(args: TagRuleHandlerArgs) {
  const {
    addPendingTagRuleChangeSet,
    dialogGroupNameRef,
    dialogSourceChecksumsRef,
    setLocalTags,
    setSuggestedTagMeta,
    suggestedTagMeta,
  } = args;
  return useCallback(
    (changeSet: TagRuleChangeSet, affected: TagRuleImpactItem[], acceptedNewTags: string[]) => {
      if (!args.identities) {
        toast.error('Contact identities are unavailable; retry before staging a rule.');
        return;
      }
      addPendingTagRuleChangeSet(
        {
          changeSet,
          source: `tag-review:${dialogGroupNameRef.current ?? 'unknown'}`,
          acceptedNewTags,
          sourceChecksums: dialogSourceChecksumsRef.current,
        },
        args.identities
      );
      if (affected.length === 0) return;
      setLocalTags((prev) => applyAffectedToLocalTags(prev, affected, suggestedTagMeta));
      setSuggestedTagMeta((prev) => applyAffectedToSuggested(prev, affected));
    },
    [
      addPendingTagRuleChangeSet,
      args.identities,
      dialogGroupNameRef,
      dialogSourceChecksumsRef,
      setLocalTags,
      setSuggestedTagMeta,
      suggestedTagMeta,
    ]
  );
}
