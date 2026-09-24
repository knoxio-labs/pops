import { useCallback, useEffect, useRef, useState } from 'react';

import { unwrap } from '../inventory-api-helpers';
import { catalogueApi } from './catalogue-api';
import { draftPreconditions } from './catalogue-draft';
import { DRAFT_KEY } from './useCatalogueMutations';

import type { QueryClient } from '@tanstack/react-query';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { CatalogueDescriptor, CatalogueOperation, CompatibilitySnapshot } from './types';

const PREVIEW_DELAY_MS = 250;

interface PreviewRunState {
  readonly queryClient: QueryClient;
  readonly sequence: MutableRefObject<number>;
  readonly setCompatibility: Dispatch<SetStateAction<CompatibilitySnapshot>>;
  readonly setError: Dispatch<SetStateAction<unknown>>;
}

/**
 * Sends one preview request for the current persisted draft and, unless a
 * later call has already superseded it, applies its result. `operations`
 * may be empty: a catalogue preview accepts that and re-checks the draft as
 * it stands, which is how `recheck` re-validates it against live item data
 * with no edit of its own.
 */
function runCataloguePreview(
  state: PreviewRunState,
  operations: readonly CatalogueOperation[],
  isLivePreview: boolean
): void {
  const requestSequence = state.sequence.current + 1;
  state.sequence.current = requestSequence;
  const draft = state.queryClient.getQueryData<CatalogueDescriptor | null>(DRAFT_KEY);
  if (draft === undefined || draft === null) return;
  void (async () => {
    try {
      const result = unwrap(
        await catalogueApi.previewDraft({
          path: { revision: draft.revision.revision },
          body: { ...draftPreconditions(draft), operations: [...operations] },
        })
      );
      if (state.sequence.current === requestSequence)
        state.setCompatibility({
          compatibility: result.compatibility,
          draftVersion: draft.revision.draftVersion,
          isLivePreview,
        });
    } catch (previewError) {
      if (state.sequence.current === requestSequence) state.setError(previewError);
    }
  })();
}

/** Debounces non-mutating draft previews and ignores responses superseded by newer edits. */
export function useCataloguePreview(
  queryClient: QueryClient,
  setCompatibility: Dispatch<SetStateAction<CompatibilitySnapshot>>
) {
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<unknown>(null);

  const cancel = useCallback(() => {
    sequence.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setError(null);
  }, []);

  const preview = useCallback(
    (operation: CatalogueOperation) => {
      sequence.current += 1;
      if (timer.current !== null) clearTimeout(timer.current);
      setError(null);
      timer.current = setTimeout(() => {
        timer.current = null;
        runCataloguePreview(
          { queryClient, sequence, setCompatibility, setError },
          [operation],
          true
        );
      }, PREVIEW_DELAY_MS);
    },
    [queryClient, setCompatibility]
  );

  /** Re-validates the persisted draft against live item data, immediately and with no edit of its own. */
  const recheck = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setError(null);
    runCataloguePreview({ queryClient, sequence, setCompatibility, setError }, [], false);
  }, [queryClient, setCompatibility]);

  useEffect(
    () => () => {
      sequence.current += 1;
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );

  return { cancel, error, preview, recheck };
}
