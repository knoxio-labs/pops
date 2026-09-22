import { useMutation } from '@tanstack/react-query';

import { unwrap } from '../inventory-api-helpers';
import {
  typesManageAbandonDraft,
  typesManageCreateDraft,
  typesManagePatchDraft,
  typesManagePublishDraft,
} from '../inventory-api/index.js';

import type { QueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';

import type { CatalogueCompatibility, CatalogueDescriptor, CatalogueOperation } from './types';

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

function draftBaseRevision(draft: CatalogueDescriptor): number {
  const baseRevision = draft.revision.baseRevision;
  if (baseRevision === null) throw new Error('Draft does not name a published base revision');
  return baseRevision;
}

function useDraftCreation(queryClient: QueryClient, published?: CatalogueDescriptor) {
  const createDraft = useMutation({
    mutationFn: async (baseRevision: number) =>
      unwrap(await typesManageCreateDraft({ body: { baseRevision } })),
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
  setCompatibility: Dispatch<SetStateAction<CatalogueCompatibility | null>>
) {
  return useMutation({
    mutationFn: async (operations: readonly CatalogueOperation[]) => {
      const draft = await ensureDraft();
      return unwrap(
        await typesManagePatchDraft({
          path: { revision: draft.revision.revision },
          body: { baseRevision: draftBaseRevision(draft), operations: [...operations] },
        })
      );
    },
    onSuccess: (result) => {
      queryClient.setQueryData(DRAFT_KEY, result.draft);
      setCompatibility(result.compatibility);
    },
  });
}

function useDraftPublication(
  queryClient: QueryClient,
  ensureDraft: () => Promise<CatalogueDescriptor>,
  setCompatibility: Dispatch<SetStateAction<CatalogueCompatibility | null>>
) {
  return useMutation({
    mutationFn: async (input: PublishInput) => {
      const draft = await ensureDraft();
      return unwrap(
        await typesManagePublishDraft({
          path: { revision: draft.revision.revision },
          body: { baseRevision: draftBaseRevision(draft), ...input },
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
  setCompatibility: Dispatch<SetStateAction<CatalogueCompatibility | null>>
) {
  return useMutation({
    mutationFn: async () => {
      const draft = await ensureDraft();
      return unwrap(
        await typesManageAbandonDraft({
          path: { revision: draft.revision.revision },
          body: { baseRevision: draftBaseRevision(draft) },
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
  setCompatibility: Dispatch<SetStateAction<CatalogueCompatibility | null>>
) {
  const { createDraft, ensureDraft } = useDraftCreation(queryClient, published);
  return {
    createDraft,
    patchDraft: useDraftPatching(queryClient, ensureDraft, setCompatibility),
    publishDraft: useDraftPublication(queryClient, ensureDraft, setCompatibility),
    abandonDraft: useDraftAbandonment(queryClient, ensureDraft, setCompatibility),
  };
}

export { DRAFT_KEY, PUBLISHED_KEY };
