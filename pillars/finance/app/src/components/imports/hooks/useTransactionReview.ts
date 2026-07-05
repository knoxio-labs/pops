import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  importsReevaluateWithPendingRules,
  type ImportsReevaluateWithPendingRulesData,
} from '../../../finance-api/index.js';
import { toRestCorrectionChangeSet } from '../../../lib/rest-changeset';
import { groupTransactionsByEntity } from '../../../lib/transaction-utils';
import { useImportStore } from '../../../store/importStore';
import { collectChangedChecksums, mergeReevaluatedResult } from './local-tx-reconcile';

import type { Dispatch, SetStateAction } from 'react';

import type { LocalTxState } from './local-tx-reconcile';

type ReevaluateInput = NonNullable<ImportsReevaluateWithPendingRulesData['body']>;
type ProcessedTxState = ReturnType<typeof useImportStore.getState>['processedTransactions'];

export type ViewMode = 'list' | 'grouped';

function useTabWithScrollMemory(initialTab: string) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const handleTabChange = useCallback(
    (value: string) => {
      scrollPositions.current.set(activeTab, window.scrollY);
      setActiveTab(value);
      requestAnimationFrame(() => {
        const saved = scrollPositions.current.get(value);
        window.scrollTo(0, saved ?? 0);
      });
    },
    [activeTab]
  );
  return { activeTab, handleTabChange };
}

/**
 * Wraps the raw `localTransactions` setter so every local mutation (edit,
 * entity pick, bulk accept, ...) is written back to the shared import store
 * immediately, and its checksums are remembered as "resolved by hand". Without
 * this, a Back-navigation remount reseeds `localTransactions` from the stale
 * pre-resolution store snapshot and silently drops the user's work (#3610).
 */
function useSyncedLocalTransactions(processedTransactions: ProcessedTxState) {
  const [localTransactions, setLocalTransactionsRaw] = useState(processedTransactions);
  const resolvedChecksumsRef = useRef<Set<string>>(new Set());

  const setLocalTransactions = useCallback<Dispatch<SetStateAction<LocalTxState>>>((update) => {
    setLocalTransactionsRaw((prev) => {
      const next = typeof update === 'function' ? update(prev) : update;
      for (const checksum of collectChangedChecksums(prev, next)) {
        resolvedChecksumsRef.current.add(checksum);
      }
      useImportStore.getState().setProcessedTransactions(next);
      return next;
    });
  }, []);

  return { localTransactions, setLocalTransactions, setLocalTransactionsRaw, resolvedChecksumsRef };
}

/**
 * When pendingChangeSets changes, ask the API to re-evaluate the session
 * against (DB rules + pending). Server-side merge avoids the case where a
 * pending edit targets a rule outside the client's paginated list.
 *
 * The server recomputes categorization from scratch and knows nothing about
 * rows the user has already resolved locally, so its response is reconciled
 * against `resolvedChecksumsRef` rather than applied verbatim (#3610).
 */
function useReevalOnChangeSets(
  setLocalTransactionsRaw: Dispatch<SetStateAction<ProcessedTxState>>,
  resolvedChecksumsRef: React.MutableRefObject<Set<string>>,
  pendingChangeSets: ReturnType<typeof useImportStore.getState>['pendingChangeSets'],
  sessionId: string | null
) {
  const prevChangeSetsRef = useRef(pendingChangeSets);
  const reevaluateMutation = useMutation({
    mutationFn: async (vars: ReevaluateInput) =>
      unwrap(await importsReevaluateWithPendingRules({ body: vars })),
    // A failing re-evaluation is surfaced once via onError; retrying would
    // replay the same request (and the same toast) several times over.
    retry: false,
  });
  useEffect(() => {
    if (prevChangeSetsRef.current === pendingChangeSets) return;
    prevChangeSetsRef.current = pendingChangeSets;
    if (!sessionId) return;

    reevaluateMutation.mutate(
      {
        sessionId,
        minConfidence: 0.7,
        pendingChangeSets: pendingChangeSets.map((pcs) => ({
          changeSet: toRestCorrectionChangeSet(pcs.changeSet),
        })),
      },
      {
        onSuccess: ({ result }) => {
          setLocalTransactionsRaw((prevLocal) => {
            const merged = mergeReevaluatedResult(prevLocal, result, resolvedChecksumsRef.current);
            useImportStore.getState().setProcessedTransactions(merged);
            return merged;
          });
        },
        onError: () => toast.error('Failed to re-evaluate transactions against updated rules'),
      }
    );
  }, [
    pendingChangeSets,
    sessionId,
    setLocalTransactionsRaw,
    resolvedChecksumsRef,
    reevaluateMutation,
  ]);
}

/**
 * Manages local transaction state, view mode, scroll tracking, active tab,
 * unresolved count, and entity grouping for the ReviewStep.
 */
export function useTransactionReview() {
  const processedTransactions = useImportStore((s) => s.processedTransactions);
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const processSessionId = useImportStore((s) => s.processSessionId);
  const { localTransactions, setLocalTransactions, setLocalTransactionsRaw, resolvedChecksumsRef } =
    useSyncedLocalTransactions(processedTransactions);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const initialTab = localTransactions.uncertain.length > 0 ? 'uncertain' : 'matched';
  const { activeTab, handleTabChange } = useTabWithScrollMemory(initialTab);

  useReevalOnChangeSets(
    setLocalTransactionsRaw,
    resolvedChecksumsRef,
    pendingChangeSets,
    processSessionId
  );

  const unresolvedCount = useMemo(
    () => localTransactions.uncertain.length + localTransactions.failed.length,
    [localTransactions]
  );
  const uncertainGroups = useMemo(
    () => groupTransactionsByEntity(localTransactions.uncertain),
    [localTransactions.uncertain]
  );
  const failedGroups = useMemo(
    () => groupTransactionsByEntity(localTransactions.failed),
    [localTransactions.failed]
  );

  return {
    localTransactions,
    setLocalTransactions,
    viewMode,
    setViewMode,
    activeTab,
    handleTabChange,
    unresolvedCount,
    uncertainGroups,
    failedGroups,
  };
}
