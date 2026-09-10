import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { FinanceApiError, unwrap } from '../../../finance-api-helpers.js';
import {
  importDraftsCreate,
  importDraftsRelease,
  importDraftsWrite,
} from '../../../finance-api/index.js';
import { ownerToken } from '../../../store/import-draft-owner';
import {
  draftCountsOf,
  draftPayloadChanged,
  hasDraftWorthyState,
  toDraftPayload,
} from '../../../store/import-draft-payload';
import { useImportStore } from '../../../store/importStore';

import type { ImportStore } from '../../../store/importStore';

export const DRAFT_WRITE_DEBOUNCE_MS = 2000;

/** Query key for the pending-imports list; invalidated by anything that changes a card. */
export const IMPORT_DRAFTS_LIST_KEY = ['finance', 'import-drafts', 'list'] as const;

function writeBody(state: ImportStore, release: boolean) {
  const payload = toDraftPayload(state);
  return { ...draftCountsOf(payload), payload, ownerToken: ownerToken(), release };
}

function isOwnedElsewhere(error: unknown): boolean {
  return error instanceof FinanceApiError && error.code === 'DraftOwnedElsewhere';
}

function releaseDraft(keepalive: boolean): Promise<void> {
  const { draftId } = useImportStore.getState();
  if (draftId === null) return Promise.resolve();
  return importDraftsRelease({
    path: { id: draftId },
    body: { ownerToken: ownerToken() },
    keepalive,
  }).then(
    () => undefined,
    () => undefined
  );
}

/** Create the draft for a fresh run and put its id in the store. */
async function createDraft(state: ImportStore, accountId: string): Promise<void> {
  const payload = toDraftPayload(state);
  const result = await importDraftsCreate({
    body: {
      accountId,
      dialectId: state.dialectId,
      fileNames: state.sourceFileNames.length > 0 ? state.sourceFileNames : ['untitled'],
      payload,
      ...draftCountsOf(payload),
      ownerToken: ownerToken(),
    },
  });
  useImportStore.getState().setDraftId(unwrap(result).data.id);
}

interface WriteThroughCallbacks {
  onOwnedElsewhere: () => void;
  onSaveFailed: () => void;
  onDraftCreated: () => void;
}

/**
 * One subscription over the store that mirrors it into the server draft
 * (finance ADR-005). Extracted from the hook so the scheduling can be
 * tested with fake timers and no React.
 *
 * - No draft yet: the first snapshot with an account and parsed rows
 *   creates one; anything that changed while the create was in flight is
 *   written as soon as the id is known.
 * - A step change writes at once; any other change waits two seconds for
 *   the next one, so a run of edits on Review costs one request.
 * - `pagehide` flushes whatever is pending with `keepalive` and releases
 *   the lease in the same request. Stopping does the same, then releases.
 * - A 409 `DraftOwnedElsewhere` stops every further write: the draft is
 *   another tab's now, and writing on would overwrite its decisions.
 */
export function startDraftWriteThrough(callbacks: WriteThroughCallbacks): () => void {
  const writer = new DraftWriter(callbacks);

  const unsubscribe = useImportStore.subscribe((state, prev) => {
    if (writer.stopped()) return;
    if (state.draftId === null) {
      if (hasDraftWorthyState(state)) writer.create(state);
      return;
    }
    if (prev.draftId === null) return;
    if (!draftPayloadChanged(state, prev)) return;
    writer.schedule(state.currentStep !== prev.currentStep);
  });

  const onHide = () => {
    if (writer.pending()) void writer.write({ release: true, keepalive: true });
    else void writer.release(true);
  };
  window.addEventListener('pagehide', onHide);

  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', onHide);
    if (writer.pending()) {
      void writer.write({ release: true });
      return;
    }
    void writer.settled().then(() => writer.release(false));
  };
}

interface WriteOptions {
  release: boolean;
  keepalive?: boolean;
}

/** The requests behind {@link startDraftWriteThrough}, with the debounce and the lease-lost latch. */
class DraftWriter {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lost = false;
  private creating = false;
  private dirty = false;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(private readonly callbacks: WriteThroughCallbacks) {}

  stopped(): boolean {
    return this.lost;
  }

  pending(): boolean {
    return this.dirty || this.timer !== null;
  }

  settled(): Promise<void> {
    return this.inFlight;
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private readonly failed = (error: unknown): void => {
    if (isOwnedElsewhere(error)) {
      this.lost = true;
      this.clearTimer();
      this.callbacks.onOwnedElsewhere();
      return;
    }
    this.callbacks.onSaveFailed();
  };

  write({ release, keepalive = false }: WriteOptions): Promise<void> {
    this.clearTimer();
    const state = useImportStore.getState();
    if (this.lost || state.draftId === null) return Promise.resolve();
    this.dirty = false;
    this.inFlight = importDraftsWrite({
      path: { id: state.draftId },
      body: writeBody(state, release),
      keepalive,
    })
      .then((result) => {
        unwrap(result);
      })
      .catch(this.failed);
    return this.inFlight;
  }

  schedule(immediate: boolean): void {
    this.dirty = true;
    if (immediate) {
      void this.write({ release: false });
      return;
    }
    this.timer ??= setTimeout(() => void this.write({ release: false }), DRAFT_WRITE_DEBOUNCE_MS);
  }

  create(state: ImportStore): void {
    if (this.creating || this.lost || state.accountId === null) return;
    this.creating = true;
    this.inFlight = createDraft(state, state.accountId)
      .then(() => {
        this.callbacks.onDraftCreated();
        if (draftPayloadChanged(useImportStore.getState(), state)) {
          void this.write({ release: false });
        }
      })
      .catch(this.failed)
      .finally(() => {
        this.creating = false;
      });
  }

  release(keepalive: boolean): Promise<void> {
    return this.lost ? Promise.resolve() : releaseDraft(keepalive);
  }
}

/**
 * Mirror the wizard store into its server draft while `enabled`. Mount it
 * once the page knows which draft it is on (or that it is on none yet).
 */
export function useDraftWriteThrough(enabled: boolean): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const invalidate = () =>
      void queryClient.invalidateQueries({ queryKey: IMPORT_DRAFTS_LIST_KEY });
    let warned = false;
    return startDraftWriteThrough({
      onDraftCreated: invalidate,
      onOwnedElsewhere: () =>
        toast.error('This import was taken over in another tab. Nothing here is saved.'),
      onSaveFailed: () => {
        if (warned) return;
        warned = true;
        toast.warning('Your progress could not be saved to the server. It still works here.');
      },
    });
  }, [enabled, queryClient]);
}
