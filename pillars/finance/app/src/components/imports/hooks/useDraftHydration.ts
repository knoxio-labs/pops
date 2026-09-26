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
import { getImportStoreState, useImportStore } from '../../../store/importStore';
import { firstImportStep } from '../step-labels';
import { IMPORT_DRAFTS_LIST_KEY } from './useDraftWriteThrough';

export type DraftGate =
  | { status: 'loading' }
  /** The wizard can mount. `draftId` is what the URL should carry, or null for a fresh run. */
  | { status: 'ready' }
  /** The draft exists but this build cannot resume it; the one action is discard. */
  | { status: 'unusable'; reason: string }
  /** Another tab holds it; the person can take it over here. */
  | { status: 'owned-elsewhere' }
  /** The draft could not be loaded or claimed; keep it in the URL so retry remains possible. */
  | { status: 'error'; error: FinanceApiError }
  /** Discarded, committed or never there: the page should drop `?draft` and start fresh. */
  | { status: 'gone' };

interface HydrationAttempt {
  force: boolean;
  n: number;
}

function resetStoreIfAbandoned(): void {
  const store = getImportStoreState();
  if (store.draftId !== null) return;
  const hasUnsavedRun =
    store.commitResult !== null || store.rows.length > 0 || store.parsedTransactions.length > 0;
  if (hasUnsavedRun) store.reset();
}

function codeOf(error: unknown): string | undefined {
  return error instanceof FinanceApiError ? error.code : undefined;
}

function statusOf(error: unknown): number | undefined {
  return error instanceof FinanceApiError ? error.status : undefined;
}

/** Take the lease as this tab; `force` is the person's "Take over" / "Take it back". */
export async function claimDraft(draftId: string, force: boolean): Promise<void> {
  unwrap(
    await importDraftsClaim({ path: { id: draftId }, body: { ownerToken: ownerToken(), force } })
  );
}

async function loadInto(draftId: string, attempt: HydrationAttempt): Promise<DraftGate> {
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
    await claimDraft(draftId, attempt.force);
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

function toDraftError(error: unknown): FinanceApiError {
  return error instanceof FinanceApiError
    ? error
    : new FinanceApiError({
        code: 'web.client.unknown',
        kind: 'client',
        message: 'Something went wrong',
        retryable: false,
      });
}

function useDraftGate(requestedId: string | null, attempt: HydrationAttempt) {
  const [gate, setGate] = useState<DraftGate>({ status: 'loading' });
  const [resolvedFor, setResolvedFor] = useState<{
    requestedId: string | null;
    attempt: HydrationAttempt;
  }>();
  const isUnresolved =
    resolvedFor === undefined ||
    resolvedFor.requestedId !== requestedId ||
    resolvedFor.attempt !== attempt;
  if (isUnresolved) {
    const store = getImportStoreState();
    setResolvedFor({ requestedId, attempt });
    setGate(
      requestedId === null || requestedId === store.draftId
        ? { status: 'ready' }
        : { status: 'loading' }
    );
  }

  useEffect(() => {
    if (requestedId === null) resetStoreIfAbandoned();
  }, [requestedId]);

  useEffect(() => {
    let cancelled = false;
    if (requestedId === null || requestedId === getImportStoreState().draftId) return;
    loadInto(requestedId, attempt)
      .then((next) => {
        if (!cancelled) setGate(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) setGate({ status: 'error', error: toDraftError(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, requestedId]);

  return [gate, setGate] as const;
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
  retry: () => void;
  takeOver: () => void;
  discard: () => Promise<void>;
} {
  const [attempt, setAttempt] = useState<HydrationAttempt>({ force: false, n: 0 });
  const [gate, setGate] = useDraftGate(requestedId, attempt);
  const queryClient = useQueryClient();

  const retry = useCallback(() => setAttempt((a) => ({ force: false, n: a.n + 1 })), []);
  const takeOver = useCallback(() => setAttempt((a) => ({ force: true, n: a.n + 1 })), []);

  const discard = useCallback(async () => {
    if (requestedId === null) return;
    await importDraftsDiscard({ path: { id: requestedId } });
    await queryClient.invalidateQueries({ queryKey: IMPORT_DRAFTS_LIST_KEY });
    getImportStoreState().reset();
    setGate({ status: 'gone' });
  }, [queryClient, requestedId, setGate]);

  return { gate, retry, takeOver, discard };
}
