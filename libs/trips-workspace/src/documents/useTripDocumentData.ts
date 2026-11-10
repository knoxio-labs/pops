import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';

import { assertSourceOwner } from '../shared/retained-session-store';
import { useSourceQuery } from '../shared/use-source-query';
import {
  loadDocumentAssociations,
  loadPaperlessDocument,
  loadTripRouteVisitIds,
  loadTripDocumentTargets,
  unlinkPaperlessDocument,
} from './api';
import { groupDocumentAssociations } from './model';
import { documentQueryKeys } from './query-keys';

import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { SourceQuery } from '../shared/use-source-query';
import type { Client as TripsClient } from '../trips-api/client';
import type { TripDocumentTargetRecord } from './api';
import type {
  DocumentAssociationTarget,
  PaperlessDocument,
  TripDocumentAssociation,
} from './types';

/** Resolved source links and their owner metadata, including independent failure state. */
export interface TripDocumentData {
  associationsQuery: UseQueryResult<TripDocumentAssociation[], Error>;
  routeVisitsQuery: UseQueryResult<number[], Error>;
  targetNamesQuery: UseQueryResult<Map<string, TripDocumentTargetRecord>, Error>;
  associations: TripDocumentAssociation[];
  visitOrder: number[];
  targetNames: Map<string, TripDocumentTargetRecord>;
  groups: ReturnType<typeof groupDocumentAssociations>;
  originalRows: { document: PaperlessDocument | undefined; failed: boolean }[];
  unlinkMutation: UseMutationResult<void, Error, number, unknown>;
}

/** Load typed associations, route membership and owner originals without clearing cached links. */
export function useTripDocumentData(
  tripId: number,
  tripsClient: TripsClient | undefined,
  documentsClient: DocumentsClient | undefined,
  target?: DocumentAssociationTarget
): TripDocumentData {
  const queryClient = useQueryClient();
  const { associationsQuery, routeVisitsQuery, targetNamesQuery } = useAssociationSources(
    tripId,
    tripsClient,
    target
  );
  const associations = selectedAssociations(associationsQuery.data ?? [], tripId, target);
  const visitOrder = routeVisitsQuery.data ?? [];
  const targetNames = targetNamesQuery.data ?? new Map();
  const groups = groupDocumentAssociations(associations, visitOrder, targetNames);
  const originals = useQueries({
    queries: associations.map((item) => originalQuery(item.documentId, documentsClient)),
  });
  const unlinkMutation = useMutation({
    meta: { errorHandled: true },
    mutationFn: (associationId: number) => {
      assertSourceOwner(associationsQuery.owner);
      return unlinkPaperlessDocument(
        associationsQuery.owner.tripId,
        associationId,
        associationsQuery.owner.client
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: associationsQuery.queryKey,
      }),
  });
  const originalRows = originals.map((query) => ({ document: query.data, failed: query.isError }));
  return {
    associationsQuery,
    routeVisitsQuery,
    targetNamesQuery,
    associations,
    visitOrder,
    groups,
    targetNames,
    originalRows,
    unlinkMutation,
  };
}

interface AssociationSources {
  associationsQuery: SourceQuery<TripDocumentAssociation[]>;
  routeVisitsQuery: SourceQuery<number[]>;
  targetNamesQuery: SourceQuery<Map<string, TripDocumentTargetRecord>>;
}
function useAssociationSources(
  tripId: number,
  tripsClient: TripsClient | undefined,
  target: DocumentAssociationTarget | undefined
): AssociationSources {
  const associationsQuery = useSourceQuery(
    { client: tripsClient, tripId, kind: 'document-associations', sourceId: 0 },
    (owner) => ({
      queryKey: documentQueryKeys.associations(owner.client, owner.tripId),
      load: () => loadDocumentAssociations(owner.tripId, owner.client),
    })
  );
  const routeVisitsQuery = useSourceQuery(
    { client: tripsClient, tripId, kind: 'document-route-visits', sourceId: 0 },
    (owner) => ({
      queryKey: documentQueryKeys.routeVisits(owner.client, owner.tripId),
      load: () => loadTripRouteVisitIds(owner.tripId, owner.client),
    }),
    { enabled: target === undefined }
  );
  const targetNamesQuery = useSourceQuery(
    { client: tripsClient, tripId, kind: 'document-target-names', sourceId: 0 },
    (owner) => ({
      queryKey: [...documentQueryKeys.routeVisits(owner.client, owner.tripId), 'targetNames'],
      load: () =>
        loadTripDocumentTargets(owner.tripId, owner.client, () => assertSourceOwner(owner)),
    }),
    { enabled: target === undefined }
  );
  return { associationsQuery, routeVisitsQuery, targetNamesQuery };
}

function originalQuery(
  documentId: number,
  client?: DocumentsClient
): {
  queryKey: readonly [string, string, number];
  queryFn: () => Promise<PaperlessDocument>;
  retry: false;
} {
  return {
    queryKey: documentQueryKeys.document(client, documentId),
    queryFn: () => loadPaperlessDocument(documentId, client),
    retry: false,
  };
}

function selectedAssociations(
  associations: TripDocumentAssociation[],
  tripId: number,
  target: DocumentAssociationTarget | undefined
): TripDocumentAssociation[] {
  if (target === undefined) return associations;
  return associations.filter(
    (association) =>
      association.tripId === tripId &&
      association.targetKind === target.kind &&
      association.targetId === target.id
  );
}
