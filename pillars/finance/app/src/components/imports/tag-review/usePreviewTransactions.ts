import { useMemo } from 'react';

import { hasManualEdit } from './tagReviewUtils';

import type { ConfirmedTransaction, SuggestedTag } from '@pops/finance';

/**
 * A confirmed row projected for the tag-rule impact preview.
 *
 * `userTags` is present only for a hand-edited row: the backend reads its
 * presence as "the user has decided this row" and leaves the row out of the
 * impact set, matching the skip `applyAffectedToLocalTags` makes when a rule
 * is actually applied. Presence, not length — a row edited down to no tags is
 * a decision too, so it carries an empty array rather than nothing.
 */
export interface PreviewTransaction {
  checksum: string;
  description: string;
  entityId: string | null;
  userTags?: string[];
}

/**
 * Project the confirmed rows for the tag-rule preview, marking the ones the
 * user has hand-edited. "Edited" is derived from the row's current tags
 * against its suggestions — the same test the rest of Tag Review uses — so a
 * row edited back to its suggestion set stops counting as edited.
 */
export function usePreviewTransactions(args: {
  confirmedTransactions: ConfirmedTransaction[];
  localTags: Record<string, string[]>;
  suggestedTagMeta: Record<string, SuggestedTag[]>;
}): PreviewTransaction[] {
  const { confirmedTransactions, localTags, suggestedTagMeta } = args;
  return useMemo(
    () =>
      confirmedTransactions.map((t) => {
        const tags = localTags[t.checksum] ?? [];
        const edited = hasManualEdit(tags, suggestedTagMeta[t.checksum] ?? []);
        return {
          checksum: t.checksum,
          description: t.description,
          entityId: t.entityId ?? null,
          ...(edited ? { userTags: tags } : {}),
        };
      }),
    [confirmedTransactions, localTags, suggestedTagMeta]
  );
}
