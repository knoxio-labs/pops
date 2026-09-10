import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { FinanceApiError, unwrap } from '../../../finance-api-helpers.js';
import {
  importDraftsClaim,
  importDraftsDiscard,
  importDraftsGet,
} from '../../../finance-api/index.js';
import { ownerToken } from '../../../store/import-draft-owner';
import { clampResumeStep, isDraftPayload } from '../../../store/import-draft-payload';
import { initialState } from '../../../store/import-store-types';
import { useImportStore } from '../../../store/importStore';
import { firstImportStep } from '../step-labels';
import { IMPORT_DRAFTS_LIST_KEY } from './useDraftWriteThrough';

import type { ImportStore } from '../../../store/import-store-types';

export type DraftGate =
  | { status: 'loading' }
  /** The wizard can mount. `draftId` is what the URL should carry, or null for a fresh run. */
  | { status: 'ready' }
  /** The draft exists but this build cannot resume it; the one action is discard. */
  | { status: 'unusable'; reason: string }
  /** Another tab holds it; the person can take it over here. */
  | { status: 'owned-elsewhere' }
  /** Discarded, committed or never there: the page should drop `?draft` and start fresh. */
  | { status: 'gone' };

function codeOf(error: unknown): string | undefined {
  return error instanceof FinanceApiError ? error.code : undefined;
}

function statusOf(error: unknown): number | undefined {
  return error instanceof FinanceApiError ? error.status : undefined;
}

/** Drops a store holding a run with nothing saved to resume it as, so a bare `/import` starts fresh. */
function resetStoreIfAbandoned(store: ImportStore): void {
  if (store.draftId !== null) return;
  const hasUnsavedRun =
    store.commitResult !== null || store.rows.length > 0 || store.parsedTransactions.length > 0;
  if (hasUnsavedRun) store.reset();
}

/** Take the lease as this tab; `force` is the person's "Take over" / "Take it back". */
export async function claimDraft(draftId: string, force: boolean): Promise<void> {
  unwrap(
    await importDraftsClaim({ path: { id: draftId }, body: { ownerToken: ownerToken(), force } })
  );
}

async function loadInto(draftId: string, force: boolean): Promise<DraftGate> {
  let draft;
  try {
    draft = unwrap(await importDraftsGet({ path: { id: draftId } })).data;
  } catch (error) {
    if (codeOf(error) === 'DraftUnusable') {
      return { status: 'unusable', reason: error instanceof Error ? error.message : '' };
    }
    if (statusOf(error) === 404) return { status: 'gone' };
    throw error;
  }
  try {
    await claimDraft(draftId, force);
  } catch (error) {
    if (codeOf(error) === 'DraftOwnedElsewhere') return { status: 'owned-elsewhere' };
    if (statusOf(error) === 404) return { status: 'gone' };
    throw error;
  }
  if (!isDraftPayload(draft.payload))
    return { status: 'unusable', reason: 'Saved in a shape this version cannot read.' };
  useImportStore.setState({
    ...initialState,
    ...draft.payload,
    draftId,
    draftSource: draft.source,
    draftBalanceCents: draft.balanceReportedCents,
    files: [],
    currentStep: Math.max(clampResumeStep(draft.payload), firstImportStep(draft.source)),
  });
  return { status: 'ready' };
}

/**
 * Put the wizard on the draft the URL names (finance ADR-005). Same-session
 * navigation back onto the draft the store already holds costs nothing;
 * anything else is read from the server, claimed, and put into the store
 * with the step clamped to what the payload can support. With no draft in
 * the URL the store is reset unless it holds a run that has a draft, which
 * the page then puts back into the URL.
 */
export function useDraftHydration(requestedId: string | null): {
  gate: DraftGate;
  takeOver: () => void;
  discard: () => Promise<void>;
} {
  const [gate, setGate] = useState<DraftGate>({ status: 'loading' });
  const [attempt, setAttempt] = useState<{ force: boolean; n: number }>({ force: false, n: 0 });
  const queryClient = useQueryClient();

  // The `gate` transition itself is pure React state, safe to derive during
  // render for both no-fetch-needed cases (no `?draft=`, or the store
  // already holds the requested draft). The store reset that sometimes goes
  // with the first case is a mutation of an EXTERNAL system (the zustand
  // store), which render purity forbids: calling it from the render body
  // would run it again on any render React discards or repeats (Strict
  // Mode's dev double-invocation, a concurrent-mode speculative render).
  // That stays in its own effect below, with no `setState` in it at all, so
  // it does not need to derive anything — only synchronize.
  const [resolvedFor, setResolvedFor] = useState<{
    requestedId: string | null;
    attempt: typeof attempt;
  }>();
  const isUnresolved =
    resolvedFor === undefined ||
    resolvedFor.requestedId !== requestedId ||
    resolvedFor.attempt !== attempt;
  if (isUnresolved) {
    const store = useImportStore.getState();
    setResolvedFor({ requestedId, attempt });
    setGate(
      requestedId === null || requestedId === store.draftId
        ? { status: 'ready' }
        : { status: 'loading' }
    );
  }

  useEffect(() => {
    if (requestedId !== null) return;
    resetStoreIfAbandoned(useImportStore.getState());
  }, [requestedId]);

  useEffect(() => {
    let cancelled = false;
    const store = useImportStore.getState();
    if (requestedId === null || requestedId === store.draftId) return;
    loadInto(requestedId, attempt.force)
      .then((next) => {
        if (!cancelled) setGate(next);
      })
      .catch(() => {
        if (!cancelled) setGate({ status: 'gone' });
      });
    return () => {
      cancelled = true;
    };
  }, [requestedId, attempt]);

  const takeOver = useCallback(() => setAttempt((a) => ({ force: true, n: a.n + 1 })), []);

  const discard = useCallback(async () => {
    if (requestedId === null) return;
    await importDraftsDiscard({ path: { id: requestedId } });
    await queryClient.invalidateQueries({ queryKey: IMPORT_DRAFTS_LIST_KEY });
    useImportStore.getState().reset();
    setGate({ status: 'gone' });
  }, [requestedId, queryClient]);

  return { gate, takeOver, discard };
}
