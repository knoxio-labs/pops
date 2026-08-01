import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../../../contacts-api-helpers.js';
import { entitiesList } from '../../../contacts-api/index.js';
import { computeMergedEntities } from '../../../lib/merged-state';
import { useImportStore } from '../../../store/importStore';

const ENTITIES_LIST_INPUT = {} as const;

/**
 * The entity set every import surface picks from: DB entities from the contacts
 * pillar merged with the locally-created (`temp:entity:*`) ones still pending in
 * the import store, so a merchant invented earlier in the same session is
 * selectable before it is committed.
 */
export function useEntities() {
  const { data: dbEntitiesData } = useQuery({
    queryKey: ['contacts', 'entities', 'list', ENTITIES_LIST_INPUT],
    queryFn: async () => unwrap(await entitiesList({ query: ENTITIES_LIST_INPUT })),
  });
  const pendingEntities = useImportStore((s) => s.pendingEntities);
  const addPendingEntity = useImportStore((s) => s.addPendingEntity);
  const entities = useMemo(
    () =>
      dbEntitiesData?.data
        ? computeMergedEntities(dbEntitiesData.data, pendingEntities)
        : undefined,
    [dbEntitiesData?.data, pendingEntities]
  );
  return { entities, addPendingEntity, dbEntitiesData };
}
