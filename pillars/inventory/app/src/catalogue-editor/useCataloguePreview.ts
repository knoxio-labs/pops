import { useCallback, useEffect, useRef, useState } from 'react';

import { unwrap } from '../inventory-api-helpers';
import { catalogueApi } from './catalogue-api';
import { draftBaseRevision } from './catalogue-draft';
import { DRAFT_KEY } from './useCatalogueMutations';

import type { QueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';

import type { CatalogueCompatibility, CatalogueDescriptor, CatalogueOperation } from './types';

const PREVIEW_DELAY_MS = 250;

/** Debounces non-mutating draft previews and ignores responses superseded by newer edits. */
export function useCataloguePreview(
  queryClient: QueryClient,
  setCompatibility: Dispatch<SetStateAction<CatalogueCompatibility | null>>
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
      const requestSequence = sequence.current + 1;
      sequence.current = requestSequence;
      if (timer.current !== null) clearTimeout(timer.current);
      setError(null);
      timer.current = setTimeout(() => {
        timer.current = null;
        const draft = queryClient.getQueryData<CatalogueDescriptor | null>(DRAFT_KEY);
        if (draft === undefined || draft === null) return;
        void (async () => {
          try {
            const result = unwrap(
              await catalogueApi.previewDraft({
                path: { revision: draft.revision.revision },
                body: {
                  baseRevision: draftBaseRevision(draft),
                  operations: [operation],
                },
              })
            );
            if (sequence.current === requestSequence) setCompatibility(result.compatibility);
          } catch (previewError) {
            if (sequence.current === requestSequence) setError(previewError);
          }
        })();
      }, PREVIEW_DELAY_MS);
    },
    [queryClient, setCompatibility]
  );

  useEffect(
    () => () => {
      sequence.current += 1;
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );

  return { cancel, error, preview };
}
