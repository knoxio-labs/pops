import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { InventoryApiError, unwrap } from '../inventory-api-helpers';
import { catalogueApi } from './catalogue-api';
import { DRAFT_KEY, PUBLISHED_KEY, useCatalogueMutations } from './useCatalogueMutations';
import { useCataloguePreview } from './useCataloguePreview';

import type { CatalogueDescriptor, CatalogueReadiness, CompatibilitySnapshot } from './types';

async function readCurrentDraft(): Promise<CatalogueDescriptor | null> {
  try {
    return unwrap(await catalogueApi.readDraft());
  } catch (error) {
    if (error instanceof InventoryApiError && error.status === 404) return null;
    throw error;
  }
}

function useCatalogueQueries() {
  const publishedQuery = useQuery({
    queryKey: PUBLISHED_KEY,
    queryFn: async () => unwrap(await catalogueApi.readCatalogue()),
  });
  const draftQuery = useQuery({ queryKey: DRAFT_KEY, queryFn: readCurrentDraft });
  return { draftQuery, publishedQuery };
}

/** Derives publish readiness by comparing a compatibility snapshot to the live draft version. */
function toReadiness(
  snapshot: CompatibilitySnapshot,
  catalogue: CatalogueDescriptor | undefined
): CatalogueReadiness {
  if (snapshot === null) return { status: 'not_previewed' };
  if (catalogue === undefined || snapshot.draftVersion !== catalogue.revision.draftVersion)
    return { status: 'stale' };
  if (snapshot.isLivePreview)
    return { status: 'live_preview', compatibility: snapshot.compatibility };
  return { status: 'ready', compatibility: snapshot.compatibility };
}

/** Loads and mutates the persisted catalogue draft while keeping its published base visible. */
export function useCatalogueEditor() {
  const queryClient = useQueryClient();
  const [compatibility, setCompatibility] = useState<CompatibilitySnapshot>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const { draftQuery, publishedQuery } = useCatalogueQueries();
  const cataloguePreview = useCataloguePreview(queryClient, setCompatibility);

  const { abandonDraft, createDraft, patchDraft, publishDraft } = useCatalogueMutations(
    queryClient,
    publishedQuery.data,
    setCompatibility,
    cataloguePreview.cancel
  );

  const catalogue =
    draftQuery.error === null ? (draftQuery.data ?? publishedQuery.data) : undefined;
  const error = [
    publishedQuery.error,
    draftQuery.error,
    cataloguePreview.error,
    createDraft.error,
    patchDraft.error,
    publishDraft.error,
    abandonDraft.error,
  ].find((candidate) => candidate !== null);
  const isPending = [
    createDraft.isPending,
    patchDraft.isPending,
    publishDraft.isPending,
    abandonDraft.isPending,
  ].some(Boolean);

  return {
    abandonDraft,
    catalogue,
    editorEpoch,
    error,
    readiness: toReadiness(compatibility, catalogue),
    isLoading: publishedQuery.isLoading || draftQuery.isLoading,
    isPending,
    patchDraft,
    previewOperation: cataloguePreview.preview,
    recheckCompatibility: cataloguePreview.recheck,
    published: publishedQuery.data,
    publishDraft,
    reload: async () => {
      cataloguePreview.cancel();
      setCompatibility(null);
      createDraft.reset();
      patchDraft.reset();
      publishDraft.reset();
      abandonDraft.reset();
      const [publishedResult, draftResult] = await Promise.all([
        publishedQuery.refetch(),
        draftQuery.refetch(),
      ]);
      if (publishedResult.isSuccess && draftResult.isSuccess)
        setEditorEpoch((current) => current + 1);
    },
  };
}
