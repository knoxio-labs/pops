import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../../../contacts-api-helpers.js';
import { entitiesList, entitiesLookup } from '../../../contacts-api/index.js';
import { computeMergedEntities } from '../../../lib/merged-state';
import { useImportStore } from '../../../store/importStore';

import type { EntityVerification } from '../entity-existence';

const ENTITY_LIST_FALLBACK_INPUT = { limit: 200 } as const;

async function fetchEntities() {
  try {
    return unwrap(await entitiesLookup({ body: {} })).entities;
  } catch {
    const page = unwrap(await entitiesList({ query: ENTITY_LIST_FALLBACK_INPUT }));
    return page.data;
  }
}

function classifyVerification(lookup: unknown, isError: boolean): EntityVerification {
  if (lookup) return 'ready';
  return isError ? 'unavailable' : 'checking';
}

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
 * match columns, already sorted by name, in one round-trip. During a rolling
 * deployment, an older contacts service may not expose that endpoint yet, so
 * the picker falls back to its largest supported list page instead of showing
 * no entities at all. Callers may therefore read "not in `entities`" as "does
 * not exist" — but only once `entities` is defined; it is `undefined` while
 * the fetch is in flight.
 */
export function useEntities() {
  const entityQuery = useQuery({
    queryKey: ['contacts', 'entities', 'lookup'],
    queryFn: fetchEntities,
  });
  const { data: lookup } = entityQuery;
  const pendingEntities = useImportStore((s) => s.pendingEntities);
  const addPendingEntity = useImportStore((s) => s.addPendingEntity);
  const dbEntities = lookup;
  const entities = useMemo(
    () => (dbEntities ? computeMergedEntities(dbEntities, pendingEntities) : undefined),
    [dbEntities, pendingEntities]
  );
  const entityVerification = classifyVerification(lookup, entityQuery.isError);
  return {
    entities,
    dbEntities,
    addPendingEntity,
    entityVerification,
    retryEntityLookup: entityQuery.refetch,
  };
}
