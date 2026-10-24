import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { resolveCanonicalIds } from '@pops/pillar-sdk/client';

import { unwrap } from '../contacts-api-helpers.js';
import { entitiesResolve } from '../contacts-api/index.js';

import type { EntityIdentities } from '@pops/finance';

const EMPTY_IDENTITIES: EntityIdentities = new Map();

/** Resolve complete ordered contact batches; transport or malformed responses never become missing ids. */
export async function fetchCanonicalContacts(ids: readonly string[]): Promise<EntityIdentities> {
  return resolveCanonicalIds(ids, async (batch) => ({
    kind: 'ok',
    value: unwrap(await entitiesResolve({ body: { ids: batch } })),
  }));
}

function resolvedSnapshot(wanted: readonly string[], query: UseQueryResult<EntityIdentities>) {
  if (wanted.length === 0) return EMPTY_IDENTITIES;
  if (query.isError || query.isFetching) return undefined;
  if (!wanted.every((id) => query.data?.has(id))) return undefined;
  return query.data;
}

function snapshotStatus(identities: EntityIdentities | undefined, failed: boolean) {
  if (failed) return 'unavailable' as const;
  if (identities) return 'ready' as const;
  return 'checking' as const;
}

/** A fresh canonical snapshot for explicit historical references, with unavailable and checking states kept distinct. */
export function useCanonicalContacts(ids: readonly string[]) {
  const wanted = [...new Set(ids)]
    .filter((id) => !id.startsWith('temp:') && !id.startsWith('pending:contact:'))
    .toSorted();
  const query = useQuery({
    queryKey: ['contacts', 'canonical-identities', wanted],
    queryFn: () => fetchCanonicalContacts(wanted),
    enabled: wanted.length > 0,
    staleTime: 0,
  });
  const identities = resolvedSnapshot(wanted, query);
  return { identities, status: snapshotStatus(identities, query.isError), retry: query.refetch };
}
