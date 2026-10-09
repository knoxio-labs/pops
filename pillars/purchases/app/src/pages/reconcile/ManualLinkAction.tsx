import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, SearchPickerDialog } from '@pops/ui';

import { unwrap } from '../../purchases-api-helpers.js';
import { reconcileManual } from '../../purchases-api/index.js';
import { mergeCandidates, type ManualCandidateOption } from './manual-link-options.js';
import { ManualCandidateResult } from './ManualCandidateResult.js';
import { useManualCandidateSearch } from './useManualCandidateSearch.js';
import { RECONCILE_QUEUE_QUERY_KEY } from './useReconcileQueue.js';

import type { ReactElement } from 'react';

import type { QueueEntry } from './types.js';

interface ManualLinkActionProps {
  entry: QueueEntry;
  disabled: boolean;
  onLinked: (entry: QueueEntry) => void;
}

/** Searches Finance and pins the selected transaction to the active unexplained charge. */
export function ManualLinkAction({
  entry,
  disabled,
  onLinked,
}: ManualLinkActionProps): ReactElement {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const candidates = useManualCandidateSearch(open);
  const results = mergeCandidates(entry.reviewCandidates, candidates.results);
  const mutation = useMutation({
    meta: { errorHandled: true },
    mutationFn: async (candidate: ManualCandidateOption) =>
      unwrap(
        await reconcileManual({
          body: { chargeId: entry.chargeId, transactionUri: candidate.transactionUri },
        })
      ),
    onSuccess: async () => {
      onLinked(entry);
      setOpen(false);
      candidates.clear();
      await queryClient.invalidateQueries({ queryKey: RECONCILE_QUEUE_QUERY_KEY });
    },
  });

  function updateOpen(nextOpen: boolean): void {
    setOpen(nextOpen);
    if (!nextOpen) {
      candidates.clear();
      mutation.reset();
    }
  }

  return (
    <ManualLinkDialog
      disabled={disabled}
      open={open}
      onOpenChange={updateOpen}
      search={candidates.search}
      onSearchChange={candidates.setSearch}
      results={results}
      isLoading={
        mutation.isPending || (candidates.isFetching && entry.reviewCandidates.length === 0)
      }
      searchError={candidates.error}
      linkError={mutation.error}
      hasReviewCandidates={entry.reviewCandidates.length > 0}
      fallbackCurrency={entry.currency}
      onSelect={(candidate) => mutation.mutate(candidate)}
    />
  );
}

interface ManualLinkDialogProps {
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  results: ManualCandidateOption[];
  isLoading: boolean;
  searchError: unknown;
  linkError: unknown;
  hasReviewCandidates: boolean;
  fallbackCurrency: string;
  onSelect: (candidate: ManualCandidateOption) => void;
}

function ManualLinkDialog({
  disabled,
  open,
  onOpenChange,
  search,
  onSearchChange,
  results,
  isLoading,
  searchError,
  linkError,
  hasReviewCandidates,
  fallbackCurrency,
  onSelect,
}: ManualLinkDialogProps): ReactElement {
  const { t } = useTranslation('purchases');
  const localizedSearchError = localizeErrorMessage(searchError, (message) =>
    t('reconcile.manual.searchFailed', { message })
  );
  const description = manualLinkDescription(
    localizeErrorMessage(linkError, (message) => t('reconcile.manual.linkFailed', { message })),
    hasReviewCandidates,
    localizeErrorMessage(searchError, (message) =>
      t('reconcile.manual.reviewSearchFailed', { message })
    ),
    {
      review: t('reconcile.manual.reviewDescription'),
      fallback: t('reconcile.manual.description'),
    }
  );
  return (
    <SearchPickerDialog<ManualCandidateOption>
      trigger={
        <Button size="sm" variant="outline" disabled={disabled}>
          {t('reconcile.action.linkManually')}
        </Button>
      }
      open={open}
      onOpenChange={onOpenChange}
      title={t('reconcile.manual.title')}
      description={description}
      searchPlaceholder={t('reconcile.manual.searchPlaceholder')}
      search={search}
      onSearchChange={onSearchChange}
      isLoading={isLoading}
      results={results}
      renderResult={(candidate) =>
        renderManualCandidate(candidate, isLoading, fallbackCurrency, onSelect)
      }
      getResultKey={(candidate) => candidate.transactionUri}
      minChars={hasReviewCandidates ? 0 : 2}
      minCharsMessage={t('reconcile.manual.typeToSearch')}
      emptyMessage={t('reconcile.manual.noResults')}
      errorMessage={hasReviewCandidates ? undefined : localizedSearchError}
    />
  );
}

function localizeErrorMessage(
  error: unknown,
  localize: (message: string) => string
): string | undefined {
  if (!(error instanceof Error)) return undefined;
  return localize(error.message);
}

function renderManualCandidate(
  candidate: ManualCandidateOption,
  disabled: boolean,
  fallbackCurrency: string,
  onSelect: (candidate: ManualCandidateOption) => void
): ReactElement {
  return (
    <ManualCandidateResult
      candidate={candidate}
      disabled={disabled}
      fallbackCurrency={fallbackCurrency}
      onSelect={() => onSelect(candidate)}
    />
  );
}

function manualLinkDescription(
  linkFailure: string | undefined,
  hasReviewCandidates: boolean,
  searchFailure: string | undefined,
  descriptions: { review: string; fallback: string }
): string {
  if (linkFailure !== undefined) return linkFailure;
  if (!hasReviewCandidates) return descriptions.fallback;
  return [descriptions.review, searchFailure]
    .filter((message): message is string => message !== undefined)
    .join(' ');
}
