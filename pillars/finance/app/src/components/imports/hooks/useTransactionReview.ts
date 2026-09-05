import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { groupTransactionsByEntity } from '../../../lib/transaction-utils';
import { useImportStore } from '../../../store/importStore';
import { collectChangedChecksums, mergeReevaluatedResult } from './local-tx-reconcile';
import { useReevaluatePending } from './useReevaluatePending';

import type { Dispatch, SetStateAction } from 'react';

import type { LocalTxState } from './local-tx-reconcile';

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
 * The resolved set is mirrored into the store's persisted
 * `manuallyResolvedChecksums` (and seeded back from it on mount) so the
 * protection also survives a refresh and dead-session recovery.
 */
function useSyncedLocalTransactions(processedTransactions: ProcessedTxState) {
  const [localTransactions, setLocalTransactionsRaw] = useState(processedTransactions);
  const [seededResolvedChecksums] = useState(
    () => new Set(useImportStore.getState().manuallyResolvedChecksums)
  );
  const resolvedChecksumsRef = useRef<Set<string>>(seededResolvedChecksums);

  const setLocalTransactions = useCallback<Dispatch<SetStateAction<LocalTxState>>>((update) => {
    setLocalTransactionsRaw((prev) => {
      const next = typeof update === 'function' ? update(prev) : update;
      const changed = collectChangedChecksums(prev, next);
      for (const checksum of changed) {
        resolvedChecksumsRef.current.add(checksum);
      }
      if (changed.length > 0) useImportStore.getState().markChecksumsResolved(changed);
      useImportStore.getState().setProcessedTransactions(next);
      return next;
    });
  }, []);

  const applyReevaluatedResult = useCallback((result: ProcessedTxState) => {
    setLocalTransactionsRaw((prevLocal) => {
      const merged = mergeReevaluatedResult(prevLocal, result, resolvedChecksumsRef.current);
      useImportStore.getState().setProcessedTransactions(merged);
      return merged;
    });
  }, []);

  return {
    localTransactions,
    setLocalTransactions,
    setLocalTransactionsRaw,
    applyReevaluatedResult,
    resolvedChecksumsRef,
  };
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
  applyReevaluatedResult: (result: ProcessedTxState) => void,
  pendingChangeSets: ReturnType<typeof useImportStore.getState>['pendingChangeSets'],
  sessionId: string | null
) {
  const prevChangeSetsRef = useRef(pendingChangeSets);
  const { runReevaluate, isReevaluating } = useReevaluatePending();
  // Accepting several suggestions in quick succession leaves overlapping
  // re-evaluations in flight, and they do not necessarily resolve in the order
  // they were issued — a slow early response would otherwise land last and
  // overwrite the newer result, silently reverting the later accepts. Only the
  // most recently issued run may apply its outcome.
  const latestRunRef = useRef(0);
  useEffect(() => {
    if (prevChangeSetsRef.current === pendingChangeSets) return;
    prevChangeSetsRef.current = pendingChangeSets;
    if (!sessionId) return;

    latestRunRef.current += 1;
    const runId = latestRunRef.current;
    void runReevaluate().then((outcome) => {
      if (!outcome || runId !== latestRunRef.current) return;
      applyReevaluatedResult(outcome.result);
    });
  }, [pendingChangeSets, sessionId, applyReevaluatedResult, runReevaluate]);
  return { isReevaluating };
}

/**
 * Manages local transaction state, view mode, scroll tracking, active tab,
 * unresolved count, and entity grouping for the ReviewStep.
 */
export function useTransactionReview() {
  const processedTransactions = useImportStore((s) => s.processedTransactions);
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const processSessionId = useImportStore((s) => s.processSessionId);
  const { localTransactions, setLocalTransactions, applyReevaluatedResult } =
    useSyncedLocalTransactions(processedTransactions);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const initialTab = localTransactions.uncertain.length > 0 ? 'uncertain' : 'matched';
  const { activeTab, handleTabChange } = useTabWithScrollMemory(initialTab);

  const { isReevaluating } = useReevalOnChangeSets(
    applyReevaluatedResult,
    pendingChangeSets,
    processSessionId
  );

  const unresolvedCount = useMemo(
    () => localTransactions.uncertain.length + localTransactions.failed.length,
    [localTransactions]
  );
  const matchedGroups = useMemo(
    () => groupTransactionsByEntity(localTransactions.matched, 'size'),
    [localTransactions.matched]
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
    applyReevaluatedResult,
    viewMode,
    setViewMode,
    activeTab,
    handleTabChange,
    unresolvedCount,
    matchedGroups,
    uncertainGroups,
    failedGroups,
    isReevaluating,
  };
}
