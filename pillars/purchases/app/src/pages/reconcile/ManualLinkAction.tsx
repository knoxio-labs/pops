import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, SearchPickerDialog } from '@pops/ui';

import { unwrap } from '../../purchases-api-helpers.js';
import { reconcileManual } from '../../purchases-api/index.js';
import { useManualCandidateSearch } from './useManualCandidateSearch.js';
import { RECONCILE_QUEUE_QUERY_KEY } from './useReconcileQueue.js';

import type { ReactElement } from 'react';

import type { QueueEntry } from './types.js';
import type { Candidate } from './useManualCandidateSearch.js';

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
  const mutation = useMutation({
    meta: { errorHandled: true },
    mutationFn: async (candidate: Candidate) =>
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
      results={candidates.results}
      isLoading={candidates.isFetching || mutation.isPending}
      searchError={candidates.error}
      linkError={mutation.error}
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
  results: Candidate[];
  isLoading: boolean;
  searchError: unknown;
  linkError: unknown;
  onSelect: (candidate: Candidate) => void;
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
  onSelect,
}: ManualLinkDialogProps): ReactElement {
  const { t } = useTranslation('purchases');
  const linkMessage = errorMessage(linkError);
  const searchMessage = errorMessage(searchError);

  return (
    <SearchPickerDialog<Candidate>
      trigger={
        <Button size="sm" variant="outline" disabled={disabled}>
          {t('reconcile.action.linkManually')}
        </Button>
      }
      open={open}
      onOpenChange={onOpenChange}
      title={t('reconcile.manual.title')}
      description={
        linkMessage === undefined
          ? t('reconcile.manual.description')
          : t('reconcile.manual.linkFailed', { message: linkMessage })
      }
      searchPlaceholder={t('reconcile.manual.searchPlaceholder')}
      search={search}
      onSearchChange={onSearchChange}
      isLoading={isLoading}
      results={results}
      renderResult={(candidate) => (
        <ManualCandidateResult
          candidate={candidate}
          disabled={isLoading}
          onSelect={() => onSelect(candidate)}
        />
      )}
      getResultKey={(candidate) => candidate.transactionUri}
      minChars={2}
      minCharsMessage={t('reconcile.manual.typeToSearch')}
      emptyMessage={
        searchMessage === undefined
          ? t('reconcile.manual.noResults')
          : t('reconcile.manual.searchFailed', { message: searchMessage })
      }
    />
  );
}

interface ManualCandidateResultProps {
  candidate: Candidate;
  disabled: boolean;
  onSelect: () => void;
}

function ManualCandidateResult({
  candidate,
  disabled,
  onSelect,
}: ManualCandidateResultProps): ReactElement {
  return (
    <Button
      type="button"
      variant="ghost"
      size="lg"
      disabled={disabled}
      className="h-auto min-h-11 w-full justify-start whitespace-normal py-2 text-left"
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{candidate.description}</span>
        <span className="text-muted-foreground block text-xs">
          {candidate.date}
          {candidate.payee === null ? '' : ` · ${candidate.payee}`}
          {' · '}
          {formatCandidateAmount(candidate)}
        </span>
      </span>
    </Button>
  );
}

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

function formatCandidateAmount(candidate: Candidate): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: candidate.settlementCurrency,
  }).format(candidate.amountCents / 100);
}
