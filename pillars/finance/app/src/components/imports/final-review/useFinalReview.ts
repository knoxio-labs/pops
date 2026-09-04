import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  importsCommitImport,
  type ImportsCommitImportData,
  type ImportsCommitImportResponses,
} from '../../../finance-api/index.js';
import { buildCommitPayload } from '../../../lib/commit-payload';
import { toRestCorrectionChangeSet } from '../../../lib/rest-changeset';
import { clearPersistedImport } from '../../../store/import-store-lifecycle';
import { useImportStore } from '../../../store/importStore';

type CommitResponse = ImportsCommitImportResponses[200];
type CommitBody = NonNullable<ImportsCommitImportData['body']>;

function useStoreSlice() {
  return {
    pendingEntities: useImportStore((s) => s.pendingEntities),
    pendingChangeSets: useImportStore((s) => s.pendingChangeSets),
    pendingTagRuleChangeSets: useImportStore((s) => s.pendingTagRuleChangeSets),
    confirmedTransactions: useImportStore((s) => s.confirmedTransactions),
    processedTransactions: useImportStore((s) => s.processedTransactions),
    accountName: useImportStore((s) => s.accountName),
    prevStep: useImportStore((s) => s.prevStep),
    nextStep: useImportStore((s) => s.nextStep),
    setCommitResult: useImportStore((s) => s.setCommitResult),
  };
}

function useDerivedCounts(slice: ReturnType<typeof useStoreSlice>) {
  const {
    processedTransactions,
    confirmedTransactions,
    pendingChangeSets,
    pendingTagRuleChangeSets,
  } = slice;
  const txnBreakdown = useMemo(
    () => ({
      matched: processedTransactions.matched.length,
      corrected: processedTransactions.uncertain.length,
      manual: processedTransactions.failed.length,
      skipped: processedTransactions.skipped.length,
      total: confirmedTransactions.length,
    }),
    [processedTransactions, confirmedTransactions]
  );
  const tagAssignmentCount = useMemo(
    () => confirmedTransactions.reduce((sum, txn) => sum + (txn.tags?.length ?? 0), 0),
    [confirmedTransactions]
  );
  const taggedTxnCount = useMemo(
    () => confirmedTransactions.filter((t) => (t.tags?.length ?? 0) > 0).length,
    [confirmedTransactions]
  );
  const totalOps = useMemo(
    () => pendingChangeSets.reduce((sum, pcs) => sum + pcs.changeSet.ops.length, 0),
    [pendingChangeSets]
  );
  const totalTagRuleOps = useMemo(
    () => pendingTagRuleChangeSets.reduce((sum, pcs) => sum + pcs.changeSet.ops.length, 0),
    [pendingTagRuleChangeSets]
  );
  return { txnBreakdown, tagAssignmentCount, taggedTxnCount, totalOps, totalTagRuleOps };
}

/**
 * A commit key is minted once per Final Review visit — a fresh instance of
 * this hook, i.e. a fresh mount of `FinalReviewStep` (leaving and re-entering
 * the wizard step unmounts it) — and stays fixed across re-renders and
 * retries within that visit. It rides along on `commitMutation` as the
 * server-side idempotency key (#3640/#3642): a resubmit under the same key
 * (a double-click racing the `isCommitting` guard, or a manual retry after a
 * network error) replays the first call's result instead of re-applying the
 * whole commit a second time.
 */
export function useFinalReview() {
  const slice = useStoreSlice();
  const counts = useDerivedCounts(slice);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [commitKey] = useState(() => crypto.randomUUID());
  const queryClient = useQueryClient();
  const commitMutation = useMutation({
    mutationFn: async (vars: CommitBody): Promise<CommitResponse> =>
      unwrap(await importsCommitImport({ body: vars })),
    onSuccess: (response) => {
      slice.setCommitResult(response.data);
      setCommitError(null);
      setConfirmOpen(false);
      // SummaryStep owns the post-commit UI; auto-advance there instead of
      // showing an inline panel + manual Continue click.
      slice.nextStep();
      // Broadcast so a second tab still holding this now-committed import is
      // reset — commit has no server-side checksum dedup, so a resumed copy
      // could otherwise be imported twice.
      clearPersistedImport(true);
      // Commit is the only write path for staged tag rules and their accepted
      // vocabulary tags (POPS-2597), so their caches go stale here, not in the
      // tag-rule dialog.
      void queryClient.invalidateQueries({ queryKey: ['finance', 'tagRules'] });
      void queryClient.invalidateQueries({
        queryKey: ['finance', 'transactions', 'availableTags'],
      });
    },
    onError: (err: Error) => setCommitError(err.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['finance', 'imports'] }),
  });
  const openConfirm = () => {
    setCommitError(null);
    setConfirmOpen(true);
  };
  const cancelConfirm = () => setConfirmOpen(false);
  const confirmCommit = () => {
    const payload = buildCommitPayload(
      slice.pendingEntities,
      slice.pendingChangeSets,
      slice.pendingTagRuleChangeSets,
      slice.confirmedTransactions
    );
    commitMutation.mutate({
      ...payload,
      changeSets: payload.changeSets.map(toRestCorrectionChangeSet),
      commitKey,
    });
  };
  return {
    pendingEntities: slice.pendingEntities,
    pendingChangeSets: slice.pendingChangeSets,
    pendingTagRuleChangeSets: slice.pendingTagRuleChangeSets,
    accountName: slice.accountName,
    ...counts,
    commitError,
    isCommitting: commitMutation.isPending,
    confirmOpen,
    openConfirm,
    cancelConfirm,
    confirmCommit,
    prevStep: slice.prevStep,
  };
}
