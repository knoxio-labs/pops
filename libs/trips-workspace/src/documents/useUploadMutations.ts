import { useMutation } from '@tanstack/react-query';

import { ApiError } from '@pops/pillar-sdk/client';

import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { associatePaperlessDocument } from './api';
import { acceptedDurableTask, receiveDurableUpload } from './durable-upload-receipt';
import { documentQueryKeys } from './query-keys';
import { TripDocumentUploadContextError } from './upload-context';

import type { QueryClient } from '@tanstack/react-query';
import type { MutateOptions, QueryKey, UseMutationResult } from '@tanstack/react-query';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type { DocumentAssociationTarget, TripDocumentAssociation } from './types';
import type { UploadFields } from './useUploadFields';

/** Start one original upload through Documents. */
export function useUploadMutation(
  documentsClient: DocumentsClient | undefined,
  beforeRequest?: () => void
): UseMutationResult<string, Error, { file: File | null; fields: UploadFields }, unknown> {
  return useMutation({
    meta: { errorHandled: true },
    retry: false,
    mutationFn: async ({ fields }) => {
      const record = await fields.durable.start({
        client: documentsClient ?? defaultDocumentsClient,
        beforeRequest: () => beforeRequest?.(),
      });
      receiveDurableUpload(record, fields);
      return acceptedDurableTask(record);
    },
    onSuccess: (id, variables) => {
      variables.fields.setTaskId(id);
      variables.fields.setUploadPending(false);
      variables.fields.setUploadError(null);
    },
    onError: (error, variables) => setUploadFailure(error, variables.fields),
  });
}

interface AssociationIntent {
  readonly documentId: number;
  readonly tripId: number;
  readonly target: Readonly<DocumentAssociationTarget>;
  readonly tripsClient: TripsClient | undefined;
  readonly fields: UploadFields;
  readonly queryClient: QueryClient;
  readonly key: QueryKey;
  readonly beforeRequest: (() => void | Promise<void>) | undefined;
  readonly isCurrent: (() => boolean) | undefined;
}
type AssociationOptions = MutateOptions<TripDocumentAssociation, Error, number, unknown>;

/** Capture the originating upload authority and target at invocation; async preparation cannot retarget a saved link callback. */
export function useAssociationMutation({
  tripId,
  target,
  tripsClient,
  fields,
  queryClient,
  beforeRequest,
  isCurrent,
}: {
  tripId: number;
  target: DocumentAssociationTarget;
  tripsClient: TripsClient | undefined;
  fields: UploadFields;
  queryClient: QueryClient;
  beforeRequest?: () => void | Promise<void>;
  isCurrent?: () => boolean;
}): UseMutationResult<TripDocumentAssociation, Error, number, unknown> {
  const key = documentQueryKeys.associations(tripsClient, tripId);
  const mutation = useMutation<TripDocumentAssociation, Error, AssociationIntent, unknown>({
    meta: { errorHandled: true },
    retry: false,
    mutationFn: async (intent) => {
      await intent.beforeRequest?.();
      if (intent.isCurrent?.() === false) throw new TripDocumentUploadContextError();
      return associatePaperlessDocument(
        intent.tripId,
        intent.documentId,
        intent.target,
        intent.tripsClient
      );
    },
    onSuccess: (_result, intent) => finishAssociation(intent),
    onError: (error, intent) => handleAssociationFailure(error, intent),
  });
  const capture = (documentId: number): AssociationIntent =>
    Object.freeze({
      documentId,
      tripId,
      target: Object.freeze({ ...target }),
      tripsClient,
      fields,
      queryClient,
      key,
      beforeRequest,
      isCurrent,
    });
  const actions: Pick<
    UseMutationResult<TripDocumentAssociation, Error, number, unknown>,
    'mutate' | 'mutateAsync'
  > = {
    mutate: (documentId, options) =>
      mutation.mutate(capture(documentId), associationOptions(options)),
    mutateAsync: (documentId, options) =>
      mutation.mutateAsync(capture(documentId), associationOptions(options)),
  };
  if (mutation.isIdle) return { ...mutation, ...actions, variables: undefined };
  return { ...mutation, ...actions, variables: mutation.variables.documentId };
}

function associationOptions(
  options: AssociationOptions | undefined
): MutateOptions<TripDocumentAssociation, Error, AssociationIntent, unknown> | undefined {
  if (options === undefined) return;
  return {
    onSuccess: (data, intent, result, context) =>
      options.onSuccess?.(data, intent.documentId, result, context),
    onError: (error, intent, result, context) =>
      options.onError?.(error, intent.documentId, result, context),
    onSettled: (...[data, error, intent, result, context]) =>
      options.onSettled?.(data, error, intent.documentId, result, context),
  };
}

function setUploadFailure(error: Error, fields: UploadFields): void {
  if (error instanceof TripDocumentUploadContextError) {
    fields.setUploadError(error.message);
    fields.setUploadPending(false);
    return;
  }
  const uncertain = fields.durable.needsRecovery();
  fields.setUncertain(uncertain);
  let message = error.message;
  if (error instanceof ApiError) message = `Documents rejected this request: ${error.message}`;
  if (uncertain)
    message =
      'The upload outcome is not confirmed. Check upload status; do not upload this file again.';
  fields.setUploadError(message);
  fields.setUploadRejected(!uncertain && error instanceof ApiError);
  fields.setUploadPending(false);
}

function handleAssociationFailure(error: Error, intent: AssociationIntent): void {
  if (error instanceof TripDocumentUploadContextError) {
    intent.fields.setUploadError(error.message);
    return;
  }
  if (error instanceof ApiError && error.code === 'trips.document.association_exists') {
    finishAssociation(intent);
    return;
  }
  intent.fields.setUploadError(
    'The original is safe in Documents, but its trip link failed. Retry linking below.'
  );
}

function finishAssociation(intent: AssociationIntent): void {
  intent.fields.clearSelectedFile();
  void intent.queryClient.invalidateQueries({
    queryKey: intent.key,
    refetchType: intent.isCurrent?.() === false ? 'none' : 'active',
  });
}
