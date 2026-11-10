import { useMutation } from '@tanstack/react-query';

import { ApiError } from '@pops/pillar-sdk/client';

import { associatePaperlessDocument, uploadPaperlessDocument } from './api';
import { documentQueryKeys } from './query-keys';
import { TripDocumentUploadContextError } from './upload-context';

import type { QueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type { DocumentAssociationTarget, TripDocumentAssociation } from './types';
import type { UploadFields } from './useUploadFields';

/** Start one original upload through Documents. */
export function useUploadMutation(
  documentsClient: DocumentsClient | undefined,
  beforeRequest?: () => void
): UseMutationResult<string, Error, { file: File; fields: UploadFields }, unknown> {
  return useMutation({
    meta: { errorHandled: true },
    retry: false,
    mutationFn: ({ file }) => {
      beforeRequest?.();
      return uploadPaperlessDocument(file, documentsClient);
    },
    onSuccess: (id, variables) => {
      variables.fields.setTaskId(id);
      variables.fields.setUploadPending(false);
      variables.fields.setUploadError(null);
    },
    onError: (error, variables) => setUploadFailure(error, variables.fields),
  });
}

/** Add the completed owner identity to a selected Trips target. */
export function useAssociationMutation({
  tripId,
  target,
  tripsClient,
  fields,
  queryClient,
  beforeRequest,
}: {
  tripId: number;
  target: DocumentAssociationTarget;
  tripsClient: TripsClient | undefined;
  fields: UploadFields;
  queryClient: QueryClient;
  beforeRequest?: () => void;
}): UseMutationResult<TripDocumentAssociation, Error, number, unknown> {
  return useMutation({
    meta: { errorHandled: true },
    retry: false,
    mutationFn: (documentId: number) => {
      beforeRequest?.();
      return associatePaperlessDocument(tripId, documentId, target, tripsClient);
    },
    onSuccess: () => finishAssociation(fields, queryClient, tripsClient, tripId),
    onError: (error) =>
      handleAssociationFailure({ error, fields, queryClient, tripsClient, tripId }),
  });
}

function setUploadFailure(error: Error, fields: UploadFields): void {
  if (error instanceof TripDocumentUploadContextError) {
    fields.setUploadError(error.message);
    fields.setUploadPending(false);
    return;
  }
  const uncertain =
    !(error instanceof ApiError) || error.status === undefined || error.status >= 500;
  fields.setUncertain(uncertain);
  fields.setUploadError(
    uncertain
      ? 'The upload response was interrupted. Search Documents for this filename before deciding whether to upload again.'
      : `Documents rejected this file: ${error.message}`
  );
  fields.setUploadRejected(!uncertain);
  fields.setUploadPending(false);
}

function handleAssociationFailure({
  error,
  fields,
  queryClient,
  tripsClient,
  tripId,
}: {
  error: Error;
  fields: UploadFields;
  queryClient: QueryClient;
  tripsClient: TripsClient | undefined;
  tripId: number;
}): void {
  if (error instanceof TripDocumentUploadContextError) {
    fields.setUploadError(error.message);
    return;
  }
  if (error instanceof ApiError && error.code === 'trips.document.association_exists') {
    void finishAssociation(fields, queryClient, tripsClient, tripId);
    return;
  }
  fields.setUploadError(
    'The original is safe in Documents, but its trip link failed. Retry linking below.'
  );
}

function finishAssociation(
  fields: UploadFields,
  queryClient: QueryClient,
  tripsClient: TripsClient | undefined,
  tripId: number
): void {
  fields.clearSelectedFile();
  void queryClient.invalidateQueries({
    queryKey: documentQueryKeys.associations(tripsClient, tripId),
  });
}
