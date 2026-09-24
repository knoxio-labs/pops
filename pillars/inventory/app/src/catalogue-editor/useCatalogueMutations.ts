import { useMutation } from '@tanstack/react-query';

import { unwrap } from '../inventory-api-helpers';
import { catalogueApi } from './catalogue-api';
import { draftPreconditions } from './catalogue-draft';

import type { QueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';

import type { CatalogueDescriptor, CatalogueOperation, CompatibilitySnapshot } from './types';

const PUBLISHED_KEY = ['inventory', 'type-catalogue', 'published'] as const;
const DRAFT_KEY = ['inventory', 'type-catalogue', 'draft'] as const;

interface PublishInput {
  readonly note: string | null;
  readonly minimumProtocol?: number;
  readonly migrationName?: string;
  readonly migration?: {
    readonly name: string;
    readonly fromRevision: number;
    readonly toRevision: number;
    readonly affectedTypeIds: string[];
    readonly affectedFieldIds: string[];
    readonly steps: Array<{ kind: 'drop_value'; fieldId: string }>;
  };
}

function useDraftCreation(
  queryClient: QueryClient,
  published: CatalogueDescriptor | undefined,
  cancelPreview: () => void
) {
  const createDraft = useMutation({
    onMutate: cancelPreview,
    mutationFn: async (baseRevision: number) =>
      unwrap(await catalogueApi.createDraft({ body: { baseRevision } })),
    onSuccess: (draft) => queryClient.setQueryData(DRAFT_KEY, draft),
  });
  return {
    createDraft,
    ensureDraft: async (): Promise<CatalogueDescriptor> => {
      const existing = queryClient.getQueryData<CatalogueDescriptor | null>(DRAFT_KEY);
      if (existing !== undefined && existing !== null) return existing;
      if (published === undefined) throw new Error('Published catalogue is not loaded');
      return createDraft.mutateAsync(published.revision.revision);
    },
  };
}

function useDraftPatching(
  queryClient: QueryClient,
  ensureDraft: () => Promise<CatalogueDescriptor>,
  setCompatibility: Dispatch<SetStateAction<CompatibilitySnapshot>>,
  cancelPreview: () => void
) {
  return useMutation({
    onMutate: cancelPreview,
    mutationFn: async (operations: readonly CatalogueOperation[]) => {
      const draft = await ensureDraft();
      return unwrap(
        await catalogueApi.patchDraft({
          path: { revision: draft.revision.revision },
          body: { ...draftPreconditions(draft), operations: [...operations] },
        })
      );
    },
    onSuccess: (result, operations) => {
      queryClient.setQueryData(DRAFT_KEY, result.draft);
      setCompatibility({
        compatibility: result.compatibility,
        draftVersion: result.draft.revision.draftVersion,
        isLivePreview: false,
        operations,
      });
    },
  });
}

function useDraftPublication(
  queryClient: QueryClient,
  ensureDraft: () => Promise<CatalogueDescriptor>,
  setCompatibility: Dispatch<SetStateAction<CompatibilitySnapshot>>,
  cancelPreview: () => void
) {
  return useMutation({
    onMutate: cancelPreview,
    mutationFn: async (input: PublishInput) => {
      const draft = await ensureDraft();
      return unwrap(
        await catalogueApi.publishDraft({
          path: { revision: draft.revision.revision },
          body: { ...draftPreconditions(draft), ...input },
        })
      );
    },
    onSuccess: async (published) => {
      queryClient.setQueryData(PUBLISHED_KEY, published);
      queryClient.setQueryData(DRAFT_KEY, null);
      setCompatibility(null);
      await queryClient.invalidateQueries({ queryKey: PUBLISHED_KEY });
    },
  });
}

function useDraftAbandonment(
  queryClient: QueryClient,
  ensureDraft: () => Promise<CatalogueDescriptor>,
  setCompatibility: Dispatch<SetStateAction<CompatibilitySnapshot>>,
  cancelPreview: () => void
) {
  return useMutation({
    onMutate: cancelPreview,
    mutationFn: async () => {
      const draft = await ensureDraft();
      return unwrap(
        await catalogueApi.abandonDraft({
          path: { revision: draft.revision.revision },
          body: draftPreconditions(draft),
        })
      );
    },
    onSuccess: () => {
      queryClient.setQueryData(DRAFT_KEY, null);
      setCompatibility(null);
    },
  });
}

/** Creates the draft mutation set shared by the production catalogue editor. */
export function useCatalogueMutations(
  queryClient: QueryClient,
  published: CatalogueDescriptor | undefined,
  setCompatibility: Dispatch<SetStateAction<CompatibilitySnapshot>>,
  cancelPreview: () => void
) {
  const { createDraft, ensureDraft } = useDraftCreation(queryClient, published, cancelPreview);
  return {
    createDraft,
    patchDraft: useDraftPatching(queryClient, ensureDraft, setCompatibility, cancelPreview),
    publishDraft: useDraftPublication(queryClient, ensureDraft, setCompatibility, cancelPreview),
    abandonDraft: useDraftAbandonment(queryClient, ensureDraft, setCompatibility, cancelPreview),
  };
}

export { DRAFT_KEY, PUBLISHED_KEY };
