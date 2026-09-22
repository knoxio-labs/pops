import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { InventoryApiError, unwrap } from '../inventory-api-helpers';
import { typesManageReadDraft, typesReadCatalogue } from '../inventory-api/index.js';
import { DRAFT_KEY, PUBLISHED_KEY, useCatalogueMutations } from './useCatalogueMutations';

import type { CatalogueCompatibility, CatalogueDescriptor } from './types';

async function readCurrentDraft(): Promise<CatalogueDescriptor | null> {
  try {
    return unwrap(await typesManageReadDraft());
  } catch (error) {
    if (error instanceof InventoryApiError && error.status === 404) return null;
    throw error;
  }
}

/** Loads and mutates the persisted catalogue draft while keeping its published base visible. */
export function useCatalogueEditor() {
  const queryClient = useQueryClient();
  const [compatibility, setCompatibility] = useState<CatalogueCompatibility | null>(null);
  const publishedQuery = useQuery({
    queryKey: PUBLISHED_KEY,
    queryFn: async () => unwrap(await typesReadCatalogue()),
  });
  const draftQuery = useQuery({
    queryKey: DRAFT_KEY,
    queryFn: readCurrentDraft,
  });

  const { abandonDraft, createDraft, patchDraft, publishDraft } = useCatalogueMutations(
    queryClient,
    publishedQuery.data,
    setCompatibility
  );

  const catalogue =
    draftQuery.error === null ? (draftQuery.data ?? publishedQuery.data) : undefined;
  const error =
    publishedQuery.error ??
    draftQuery.error ??
    createDraft.error ??
    patchDraft.error ??
    publishDraft.error ??
    abandonDraft.error;

  return {
    abandonDraft,
    catalogue,
    compatibility,
    error,
    isLoading: publishedQuery.isLoading || draftQuery.isLoading,
    isPending:
      createDraft.isPending ||
      patchDraft.isPending ||
      publishDraft.isPending ||
      abandonDraft.isPending,
    patchDraft,
    published: publishedQuery.data,
    publishDraft,
    reload: async () => {
      await Promise.all([publishedQuery.refetch(), draftQuery.refetch()]);
    },
  };
}
