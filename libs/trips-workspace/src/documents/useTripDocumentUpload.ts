import { useQuery, useQueryClient } from '@tanstack/react-query';

import { loadPaperlessTask, loadPaperlessUploadPolicy } from './api';
import { uploadFileProblem } from './model';
import { documentQueryKeys } from './query-keys';
import { recoverAmbiguousUpload, submitSelectedFile } from './upload-actions';
import { useUploadFields } from './useUploadFields';
import { useAssociationMutation, useUploadMutation } from './useUploadMutations';

import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type {
  DocumentAssociationTarget,
  PaperlessTask,
  PaperlessUploadPolicy,
  TripDocumentAssociation,
} from './types';
import type { UploadFields } from './useUploadFields';

interface UploadActions {
  uploadMutation: UseMutationResult<string, Error, { file: File; fields: UploadFields }, unknown>;
  associationMutation: UseMutationResult<TripDocumentAssociation, Error, number, unknown>;
  submitUpload: () => void;
  recoverAssociation: () => void;
  searchCompleted: (count: number | null) => void;
}

/** Own Documents upload state, task polling and explicit Trips association actions. */
export function useTripDocumentUpload({
  tripId,
  target,
  tripsClient,
  documentsClient,
  file,
}: {
  tripId: number;
  target: DocumentAssociationTarget;
  tripsClient?: TripsClient;
  documentsClient?: DocumentsClient;
  file?: File;
}): {
  fields: UploadFields;
  actions: UploadActions;
  policyQuery: UseQueryResult<PaperlessUploadPolicy, Error>;
  taskQuery: UseQueryResult<PaperlessTask, Error>;
  policy: PaperlessUploadPolicy | null;
  unavailable: boolean;
  documentId: number | undefined;
  taskFailed: boolean;
  error: string | null;
} {
  const fields = useUploadFields(file ?? null);
  const policyQuery = useUploadPolicy(documentsClient);
  const taskQuery = useUploadTask(fields.taskId, documentsClient);
  const actions = useUploadActions({
    tripId,
    target,
    tripsClient,
    documentsClient,
    fields,
    policy: policyQuery.data,
  });
  const taskDocumentId = taskQuery.data?.documentId;
  return {
    fields,
    actions,
    policyQuery,
    taskQuery,
    policy: policyQuery.data ?? null,
    unavailable: policyQuery.isError || policyUnavailable(policyQuery.data),
    documentId: taskDocumentId ?? undefined,
    taskFailed: taskQuery.data?.state === 'failed',
    error: uploadProblem(fields, policyQuery.data),
  };
}

function useUploadPolicy(
  documentsClient: DocumentsClient | undefined
): UseQueryResult<PaperlessUploadPolicy, Error> {
  return useQuery({
    queryKey: documentQueryKeys.status(documentsClient),
    queryFn: () => loadPaperlessUploadPolicy(documentsClient),
    retry: false,
  });
}

function useUploadTask(
  taskId: string | null,
  documentsClient: DocumentsClient | undefined
): UseQueryResult<PaperlessTask, Error> {
  return useQuery({
    queryKey: documentQueryKeys.task(documentsClient, taskId ?? ''),
    queryFn: () => loadPaperlessTask(taskId ?? '', documentsClient),
    enabled: taskId !== null,
    retry: false,
    refetchInterval: (query) => (query.state.data?.state === 'pending' ? 1500 : false),
  });
}

function useUploadActions({
  tripId,
  target,
  tripsClient,
  documentsClient,
  fields,
  policy,
}: {
  tripId: number;
  target: DocumentAssociationTarget;
  tripsClient: TripsClient | undefined;
  documentsClient: DocumentsClient | undefined;
  fields: UploadFields;
  policy: PaperlessUploadPolicy | undefined;
}): UploadActions {
  const queryClient = useQueryClient();
  const uploadMutation = useUploadMutation(documentsClient);
  const associationMutation = useAssociationMutation({
    tripId,
    target,
    tripsClient,
    fields,
    queryClient,
  });
  const submitUpload = (): void =>
    submitSelectedFile({
      file: fields.file,
      policy,
      upload: (selected) => uploadMutation.mutate({ file: selected, fields }),
      setError: fields.setUploadError,
      setRejected: fields.setUploadRejected,
    });
  const recoverAssociation = (): void => recoverAmbiguousUpload(fields);
  return {
    uploadMutation,
    associationMutation,
    submitUpload,
    recoverAssociation,
    searchCompleted: fields.setOwnerLookupCount,
  };
}

function policyUnavailable(policy: PaperlessUploadPolicy | undefined): boolean {
  return policy === undefined || !policy.configured || !policy.available;
}

function uploadProblem(
  fields: UploadFields,
  policy: PaperlessUploadPolicy | undefined
): string | null {
  if (fields.uploadError !== null) return fields.uploadError;
  if (fields.file === null || fields.taskId !== null) return null;
  return uploadFileProblem(fields.file, policy ?? null) ?? null;
}
