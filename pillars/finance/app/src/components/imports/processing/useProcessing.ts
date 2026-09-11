import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  importsGetImportProgress,
  importsProcessImport,
  type ImportsGetImportProgressResponses,
  type ImportsProcessImportData,
} from '../../../finance-api/index.js';
import { useImportStore } from '../../../store/importStore';
import { isBlockingImportWarning } from '../import-warnings';

import type { ProcessImportOutput } from '@pops/finance';

type ProcessImportBody = NonNullable<ImportsProcessImportData['body']>;
type ProgressResponse = NonNullable<ImportsGetImportProgressResponses[200]>;
interface ImportProgressShape {
  sessionId: string;
  status: ProgressResponse['status'];
  result?: ProcessImportOutput;
  errors?: ProgressResponse['errors'];
  currentStep?: ProgressResponse['currentStep'];
  totalTransactions: number;
  processedCount: number;
  currentBatch: ProgressResponse['currentBatch'];
}

function toProgressShape(res: ImportsGetImportProgressResponses[200]): ImportProgressShape | null {
  if (!res) return null;
  const result = res.result && 'matched' in res.result ? res.result : undefined;
  return {
    sessionId: res.sessionId,
    status: res.status,
    result,
    errors: res.errors,
    currentStep: res.currentStep,
    totalTransactions: res.totalTransactions,
    processedCount: res.processedCount,
    currentBatch: res.currentBatch,
  };
}

export function useHasAlreadyProcessed(): boolean {
  const { processedTransactions, processedForFingerprint, parsedTransactionsFingerprint } =
    useImportStore();
  const hasProcessedResults =
    processedTransactions.matched.length +
      processedTransactions.uncertain.length +
      processedTransactions.failed.length +
      processedTransactions.skipped.length >
    0;
  return (
    hasProcessedResults &&
    processedForFingerprint !== null &&
    processedForFingerprint === parsedTransactionsFingerprint
  );
}

export function useProcessingMutations() {
  const { setProcessSessionId, processSessionId } = useImportStore();
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const queryClient = useQueryClient();
  const processImportMutation = useMutation({
    mutationFn: async (vars: ProcessImportBody) =>
      unwrap(await importsProcessImport({ body: vars })),
    onSuccess: (data) => {
      setProcessSessionId(data.sessionId);
      setPollingEnabled(true);
    },
    onError: (error: Error) => console.error('Processing error:', error),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['finance', 'imports'] }),
  });
  const sessionId = processSessionId ?? '';
  const progressQuery = useQuery({
    queryKey: ['finance', 'imports', 'getImportProgress', sessionId],
    queryFn: async (): Promise<ImportProgressShape | null> => {
      const res = await importsGetImportProgress({ query: { sessionId } });
      return toProgressShape(unwrap(res));
    },
    enabled: pollingEnabled && !!processSessionId,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
  });
  return { pollingEnabled, setPollingEnabled, processImportMutation, progressQuery };
}

export type ProcessingState = ReturnType<typeof useProcessingMutations>;

export function useCompletionHandler(state: ProcessingState): void {
  const { setProcessedTransactions, nextStep } = useImportStore();
  const { progressQuery, setPollingEnabled } = state;
  useEffect(() => {
    if (progressQuery.data?.status === 'completed' && progressQuery.data.result) {
      setPollingEnabled(false);
      const result = progressQuery.data.result;
      setProcessedTransactions(result);
      const hasCriticalError = result.warnings?.some(isBlockingImportWarning);
      if (hasCriticalError) {
        console.error('[Import] Processing completed with critical errors - review warnings');
        return;
      }
      nextStep();
    }
    if (progressQuery.data?.status === 'failed') setPollingEnabled(false);
  }, [progressQuery.data, setProcessedTransactions, nextStep, setPollingEnabled]);
}

/**
 * Whether a stored session is one to follow rather than replace: still running,
 * or finished with a result the completion handler can take.
 *
 * Anything else starts a new run, which is what a resume always did: a session
 * the server no longer knows (`null`), one that failed — including one a
 * restart of the finance service marked failed mid-flight — and a progress read
 * that itself errors. Falling back to a fresh run is never worse than before;
 * following a dead session would leave the step waiting on nothing.
 */
async function canReattach(sessionId: string): Promise<boolean> {
  try {
    const progress = toProgressShape(
      unwrap(await importsGetImportProgress({ query: { sessionId } }))
    );
    if (progress === null) return false;
    return (
      progress.status === 'processing' ||
      (progress.status === 'completed' && progress.result !== undefined)
    );
  } catch {
    return false;
  }
}

export function useAutoStart(state: ProcessingState, hasAlreadyProcessed: boolean): void {
  const { parsedTransactions, processSessionId } = useImportStore();
  const { mutate, isPending, isSuccess } = state.processImportMutation;
  const { setPollingEnabled } = state;

  // The guard must always see this render's latest transactions/mutation
  // status, but the effect itself must only re-fire on the real trigger
  // (transaction count) — not on every isPending/isSuccess flip (that would
  // immediately re-trigger a just-failed mutation, looping) nor on
  // `parsedTransactions`' array identity (the import store hands back a new
  // array reference on every read, so depending on it directly would
  // re-fire — and re-mutate — on every render). A ref lets the effect read
  // fresh values without either watching them.
  const latestRef = useRef({ parsedTransactions, isPending, isSuccess, processSessionId });
  useEffect(() => {
    latestRef.current = { parsedTransactions, isPending, isSuccess, processSessionId };
  });

  useEffect(() => {
    const latest = latestRef.current;
    if (
      latest.parsedTransactions.length === 0 ||
      hasAlreadyProcessed ||
      latest.isPending ||
      latest.isSuccess
    ) {
      return;
    }
    const startRun = () => mutate({ transactions: latest.parsedTransactions });

    // A stored session always belongs to these rows: `downstreamReset` clears
    // it whenever the parsed set changes. So a resumed draft's session is worth
    // asking about before paying for a second AI pass over the same rows
    // (POPS-19).
    const stored = latest.processSessionId;
    if (stored === null) {
      startRun();
      return;
    }
    let cancelled = false;
    void canReattach(stored).then((reattach) => {
      if (cancelled) return;
      if (reattach) setPollingEnabled(true);
      else startRun();
    });
    return () => {
      cancelled = true;
    };
  }, [parsedTransactions.length, hasAlreadyProcessed, mutate, setPollingEnabled]);
}
