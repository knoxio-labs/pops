import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../../../contacts-api-helpers.js';
import { entitiesLookup } from '../../../contacts-api/index.js';
import { computeMergedEntities } from '../../../lib/merged-state';
import { useImportStore } from '../../../store/importStore';

/**
 * The entity set every import surface picks from: every DB entity from the
 * contacts pillar merged with the locally-created (`temp:entity:*`) ones still
 * pending in the import store, so a merchant invented earlier in the same
 * session is selectable before it is committed.
 *
 * The source is `entities.lookup`, not `entities.list`: list is paginated and
 * hard-caps a page at 200, and these pickers have no pagination, so the tail of
 * a larger contact set was simply invisible — an existing merchant looked
 * absent, and accepting it minted a duplicate. Lookup returns the whole set's
 * match columns, already sorted by name, in one round-trip. Callers may
 * therefore read "not in `entities`" as "does not exist" — but only once
 * `entities` is defined; it is `undefined` while the fetch is in flight.
 */
export function useEntities() {
  const { data: lookup } = useQuery({
    queryKey: ['contacts', 'entities', 'lookup'],
    queryFn: async () => unwrap(await entitiesLookup({ body: {} })),
  });
  const pendingEntities = useImportStore((s) => s.pendingEntities);
  const addPendingEntity = useImportStore((s) => s.addPendingEntity);
  const dbEntities = lookup?.entities;
  const entities = useMemo(
    () => (dbEntities ? computeMergedEntities(dbEntities, pendingEntities) : undefined),
    [dbEntities, pendingEntities]
  );
  return { entities, dbEntities, addPendingEntity };
}
