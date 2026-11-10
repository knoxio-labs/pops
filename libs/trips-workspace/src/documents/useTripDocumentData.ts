import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

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
  const associationsQuery = useQuery({
    queryKey: documentQueryKeys.associations(tripsClient, tripId),
    queryFn: () => loadDocumentAssociations(tripId, tripsClient),
    retry: false,
  });
  const routeVisitsQuery = useQuery({
    queryKey: documentQueryKeys.routeVisits(tripsClient, tripId),
    queryFn: () => loadTripRouteVisitIds(tripId, tripsClient),
    enabled: target === undefined,
    retry: false,
  });
  const targetNamesQuery = useQuery({
    queryKey: [...documentQueryKeys.routeVisits(tripsClient, tripId), 'targetNames'],
    queryFn: () => loadTripDocumentTargets(tripId, tripsClient),
    enabled: target === undefined,
    retry: false,
  });
  const associations = selectedAssociations(associationsQuery.data ?? [], tripId, target);
  const visitOrder = routeVisitsQuery.data ?? [];
  const targetNames = targetNamesQuery.data ?? new Map();
  const groups = groupDocumentAssociations(associations, visitOrder, targetNames);
  const originals = useQueries({
    queries: associations.map((item) => originalQuery(item.documentId, documentsClient)),
  });
  const unlinkMutation = useMutation({
    meta: { errorHandled: true },
    mutationFn: (associationId: number) =>
      unlinkPaperlessDocument(tripId, associationId, tripsClient),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.associations(tripsClient, tripId),
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
