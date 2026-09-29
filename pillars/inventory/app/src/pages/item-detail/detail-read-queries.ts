import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { buildWorld } from '../../foundation/model/placement-model';
import { unwrap } from '../../inventory-api-helpers.js';
import {
  connectionsGraph,
  documentsListForItem,
  fixturesList,
  fixturesListForItem,
  paperlessStatus,
} from '../../inventory-api/index.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { relatedItemIds } from './detail-model';

import type { PickerSubject } from '../../foundation/model/contracts';
import type { WebGetResponse } from '../../inventory-api/types.gen.js';

function primarySubject(id: string): PickerSubject {
  return { kind: 'items', ids: id.length === 0 ? [] : [id] };
}

function relatedSubject(ids: readonly string[]): PickerSubject {
  return { kind: 'items', ids };
}

function useGraphQuery(id: string) {
  return useQuery({
    queryKey: ['inventory', 'connections', 'graph', { itemId: id }],
    queryFn: async () =>
      unwrap(await connectionsGraph({ path: { itemId: id }, query: { maxDepth: 10 } })),
    enabled: id.length > 0,
  });
}

/** Reads the primary and related placement worlds plus the connection graph. */
export function useConnectionSources(id: string, webItem: WebGetResponse['item'] | null) {
  const primary = usePlacementSources(useMemo(() => primarySubject(id), [id]));
  const graphQuery = useGraphQuery(id);
  const webRelatedIds = useMemo(() => relatedItemIds(id, null, webItem), [id, webItem]);
  const graphRelatedIds = useMemo(
    () => relatedItemIds(id, graphQuery.data?.data ?? null, webItem),
    [graphQuery.data?.data, id, webItem]
  );
  const relatedIds = useMemo(
    () => [...new Set([...webRelatedIds, ...graphRelatedIds])].toSorted(),
    [graphRelatedIds, webRelatedIds]
  );
  const related = usePlacementSources(useMemo(() => relatedSubject(relatedIds), [relatedIds]));
  const relatedWorld = useMemo(
    () =>
      buildWorld(
        [...primary.world.items.values(), ...related.world.items.values()],
        [...primary.world.locations.values(), ...related.world.locations.values()]
      ),
    [primary.world, related.world]
  );
  return { primary, graphQuery, related, relatedWorld };
}

/** Reads the detail sections that do not gate the primary placement state. */
export function useAuxiliaryQueries(id: string) {
  const documentsQuery = useQuery({
    queryKey: ['inventory', 'documents', 'listForItem', { itemId: id, limit: 500 }],
    queryFn: async () =>
      unwrap(await documentsListForItem({ path: { itemId: id }, query: { limit: 500 } })),
    enabled: id.length > 0,
  });
  const paperlessQuery = useQuery({
    queryKey: ['inventory', 'paperless', 'status'],
    queryFn: async () => unwrap(await paperlessStatus()),
    enabled: id.length > 0,
  });
  const fixtureLinksQuery = useQuery({
    queryKey: ['inventory', 'fixtures', 'listForItem', { itemId: id, limit: 500 }],
    queryFn: async () =>
      unwrap(await fixturesListForItem({ path: { itemId: id }, query: { limit: 500 } })),
    enabled: id.length > 0,
  });
  const fixturesQuery = useQuery({
    queryKey: ['inventory', 'fixtures', 'list', { limit: 60 }],
    queryFn: async () => unwrap(await fixturesList({ query: { limit: 60 } })),
    enabled: id.length > 0,
  });
  return { documentsQuery, paperlessQuery, fixtureLinksQuery, fixturesQuery };
}

/** Return shape for the primary, related, and graph detail reads. */
export type ConnectionSources = ReturnType<typeof useConnectionSources>;

/** Return shape for document, Paperless, and fixture detail reads. */
export type AuxiliaryQueries = ReturnType<typeof useAuxiliaryQueries>;
