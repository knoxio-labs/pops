import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  LOCATION_TREE_QUERY_KEY,
  PUBLISHED_CATALOGUE_QUERY_KEY,
  webItemDetailQueryKey,
} from '../../inventory-web/queryKeys.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { useWebItemDetail } from '../../inventory-web/useWebItemDetail.js';
import { formTypesOf } from './field-model';

import type { PickerSubject } from '../../foundation/model/contracts';
import type { PlacementWorld } from '../../foundation/model/placement-model';
import type { WebGetResponses } from '../../inventory-api/types.gen.js';
import type { CatalogueDescriptor } from '../../inventory-web/useCatalogueLookups.js';
import type { FormTypeDef } from './field-model';

type WebItem = WebGetResponses[200]['item'];

function sourceStatus(
  cataloguePending: boolean,
  placementPending: boolean,
  itemPending: boolean,
  error: unknown | null
): FormSources['status'] {
  if (cataloguePending || placementPending || itemPending) return 'pending';
  if (error !== null) return 'error';
  return 'success';
}

/** Source state required by a create or edit item-form session. */
export interface FormSources {
  readonly catalogue: CatalogueDescriptor | undefined;
  readonly types: readonly FormTypeDef[];
  readonly world: PlacementWorld;
  readonly recents: ReturnType<typeof usePlacementSources>['recents'];
  readonly createLocation: (name: string, parentId: string | null) => Promise<void>;
  readonly typeLabel: (typeId: string) => string | null;
  readonly revision: number | null;
  readonly item: WebItem | null;
  readonly status: 'pending' | 'error' | 'success';
  readonly error: unknown | null;
  readonly retry: () => void;
}

/** Loads the catalogue, placement world and optional item needed by the form. */
export function useFormSources(itemId: string | undefined): FormSources {
  const queryClient = useQueryClient();
  const catalogueLookups = useCatalogueLookups();
  const subject: PickerSubject = useMemo(
    () => ({ kind: 'items', ids: itemId === undefined ? [] : [itemId] }),
    [itemId]
  );
  const placement = usePlacementSources(subject);
  const itemQuery = useWebItemDetail(itemId, 1);
  const catalogue = catalogueLookups.catalogue;
  const types = useMemo(() => formTypesOf(catalogue), [catalogue]);
  const createLocation = useCallback(
    async (name: string, parentId: string | null): Promise<void> => {
      await placement.createLocation.mutateAsync({ name, parentId });
    },
    [placement.createLocation]
  );
  const retry = useCallback((): void => {
    void queryClient.refetchQueries({ queryKey: PUBLISHED_CATALOGUE_QUERY_KEY });
    void queryClient.refetchQueries({ queryKey: LOCATION_TREE_QUERY_KEY });
    if (itemId !== undefined)
      void queryClient.refetchQueries({ queryKey: webItemDetailQueryKey(itemId) });
  }, [itemId, queryClient]);
  const itemPending = itemId !== undefined && itemQuery.isPending;
  const error = catalogueLookups.error ?? placement.error ?? itemQuery.error ?? null;
  return {
    catalogue,
    types,
    world: placement.world,
    recents: placement.recents,
    createLocation,
    typeLabel: (typeId) => catalogueLookups.typeNameForId(typeId),
    revision: catalogue?.revision.revision ?? null,
    item: itemQuery.data?.item ?? null,
    status: sourceStatus(catalogueLookups.isPending, placement.isLoading, itemPending, error),
    error,
    retry,
  };
}
