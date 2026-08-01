import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../../../contacts-api-helpers.js';
import { entitiesList } from '../../../contacts-api/index.js';
import { computeMergedEntities } from '../../../lib/merged-state';
import { useImportStore } from '../../../store/importStore';

/**
 * The contacts pillar caps `limit` at 200 and defaults it to 50. These pickers
 * have no pagination, so ask for the cap: an omitted limit silently reduced
 * every entity picker (and the accept-all name→id resolution) to the first 50
 * merchants, making an existing entity look absent.
 */
const ENTITIES_LIST_INPUT = { limit: 200 } as const;

/**
 * The entity set every import surface picks from: DB entities from the contacts
 * pillar merged with the locally-created (`temp:entity:*`) ones still pending in
 * the import store, so a merchant invented earlier in the same session is
 * selectable before it is committed.
 *
 * `truncated` is true when the contacts pillar holds more entities than one
 * capped page returns — the list is then an incomplete view, so callers must not
 * treat "not in `entities`" as "does not exist".
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
  const truncated = dbEntitiesData
    ? dbEntitiesData.pagination.total > dbEntitiesData.data.length
    : false;
  return { entities, truncated, addPendingEntity, dbEntitiesData };
}
