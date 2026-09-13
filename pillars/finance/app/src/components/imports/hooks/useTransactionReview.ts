import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { groupTransactionsByEntity } from '../../../lib/transaction-utils';
import { useImportStore } from '../../../store/importStore';
import { collectChangedChecksums, mergeReevaluatedResult } from './local-tx-reconcile';
import { reevaluateVia, type ReevaluateVia, useReevaluatePending } from './useReevaluatePending';

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

  /**
   * The latest local state, readable outside a render.
   *
   * The store write below used to live inside the `useState` updater, which
   * React invokes during the NEXT render — so every local mutation wrote to
   * the store while `ReviewStep` was rendering, and React said so: "Cannot
   * update a component (`ReviewStep`) while rendering a different component
   * (`ReviewStep`)" (POPS-3367). Not fatal, but it is the class of bug that
   * produces missed updates and, under concurrent rendering, inconsistent
   * trees.
   *
   * Resolving `prev` from a ref instead keeps the whole sequence in the
   * caller's own context — an event handler or an effect — and keeps it
   * SYNCHRONOUS, which deferring the store write to an effect would not: a
   * caller that reads the store straight after setting would see the previous
   * value. The ref is re-synced after every commit, so a state change made by
   * any other path is picked up before the next call reads it.
   */
  const latestRef = useRef(localTransactions);
  useEffect(() => {
    latestRef.current = localTransactions;
  }, [localTransactions]);

  const setLocalTransactions = useCallback<Dispatch<SetStateAction<LocalTxState>>>((update) => {
    const prev = latestRef.current;
    const next = typeof update === 'function' ? update(prev) : update;
    latestRef.current = next;
    const changed = collectChangedChecksums(prev, next);
    for (const checksum of changed) {
      resolvedChecksumsRef.current.add(checksum);
    }
    if (changed.length > 0) useImportStore.getState().markChecksumsResolved(changed);
    useImportStore.getState().setProcessedTransactions(next);
    setLocalTransactionsRaw(next);
  }, []);

  const applyReevaluatedResult = useCallback((result: ProcessedTxState) => {
    const merged = mergeReevaluatedResult(latestRef.current, result, resolvedChecksumsRef.current);
    latestRef.current = merged;
    useImportStore.getState().setProcessedTransactions(merged);
    setLocalTransactionsRaw(merged);
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
 * When pendingChangeSets changes, ask the API to re-evaluate the import
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
  via: ReevaluateVia
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
    if (!via) return;

    latestRunRef.current += 1;
    const runId = latestRunRef.current;
    void runReevaluate().then((outcome) => {
      if (!outcome || runId !== latestRunRef.current) return;
      applyReevaluatedResult(outcome.result);
    });
  }, [pendingChangeSets, via, applyReevaluatedResult, runReevaluate]);
  return { isReevaluating };
}

/**
 * Manages local transaction state, view mode, scroll tracking, active tab,
 * unresolved count, and entity grouping for the ReviewStep.
 */
export function useTransactionReview() {
  const processedTransactions = useImportStore((s) => s.processedTransactions);
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const via = useImportStore(reevaluateVia);
  const { localTransactions, setLocalTransactions, applyReevaluatedResult } =
    useSyncedLocalTransactions(processedTransactions);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [blockedOnly, setBlockedOnly] = useState(false);
  const initialTab = localTransactions.uncertain.length > 0 ? 'uncertain' : 'matched';
  const { activeTab, handleTabChange } = useTabWithScrollMemory(initialTab);

  /**
   * Put the rows that will not commit in front of the user: the Matched tab,
   * ungrouped (a blocked row is invisible inside a collapsed group) and
   * filtered to them alone. What the drop notice points at (POPS-3659).
   */
  const showBlockedRows = useCallback(() => {
    setViewMode('list');
    setBlockedOnly(true);
    handleTabChange('matched');
  }, [handleTabChange]);

  const { isReevaluating } = useReevalOnChangeSets(applyReevaluatedResult, pendingChangeSets, via);

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
    blockedOnly,
    setBlockedOnly,
    showBlockedRows,
    activeTab,
    handleTabChange,
    unresolvedCount,
    matchedGroups,
    uncertainGroups,
    failedGroups,
    isReevaluating,
    reevaluateVia: via,
  };
}
