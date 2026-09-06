import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '../contacts-api-helpers.js';
import { entitiesList } from '../contacts-api/index.js';
import { fetchAllPages, type PaginatedResult } from './fetch-all-pages';

import type { Entity } from '../contacts-api/index.js';

/** The page size to request. Contacts clamps anything larger to its own cap. */
const PAGE_SIZE = 200;

/**
 * Every contact, paged to completion.
 *
 * `entities.list` is paginated and clamps `limit` server-side, so a single
 * request stopped being "everything" the moment the contact set outgrew the
 * cap — and none of the entity pickers paginate, so the tail was simply
 * missing from every dropdown that fed off one request. Callers may read
 * "absent from this list" as "does not exist"; while the fetch is in flight
 * the query has no data at all, which is a different state.
 *
 * The full `Entity` is returned rather than `entities.lookup`'s match columns
 * because these surfaces render the entity type alongside the name.
 *
 * `type`, when given, narrows the server-side filter (e.g. `'bank'` for the
 * account form's issuer picker, POPS-3063) — folded into the same paged
 * fetch rather than a second hook, since the pagination logic is identical.
 */
export function useAllEntities(
  options: {
    type?: string;
  } = {}
): UseQueryResult<PaginatedResult<Entity>> {
  const { type } = options;
  return useQuery({
    queryKey: ['contacts', 'entities', 'list', 'all', type ?? null],
    queryFn: async () =>
      fetchAllPages(
        async (page) => unwrap(await entitiesList({ query: { ...page, type } })),
        PAGE_SIZE
      ),
  });
}
