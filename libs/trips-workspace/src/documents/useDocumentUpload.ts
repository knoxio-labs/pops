import { useQuery } from '@tanstack/react-query';

import { loadPaperlessTask, loadPaperlessUploadPolicy } from './api';
import { uploadFileProblem } from './model';
import { documentQueryKeys } from './query-keys';
import { recoverAmbiguousUpload, submitSelectedFile } from './upload-actions';
import { useUploadFields } from './useUploadFields';
import { useUploadMutation } from './useUploadMutations';

import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { PaperlessTask, PaperlessUploadPolicy } from './types';
import type { DocumentUploadSession, UploadFields } from './useUploadFields';

/** Controlled session storage must outlive conditional file views and preserve each distinct File identity. */
export interface DocumentUploadOptions {
  session: DocumentUploadSession;
  onSessionChange: Dispatch<SetStateAction<DocumentUploadSession>>;
  documentsClient?: DocumentsClient;
}

/** The owner upload task and canonical result, without any Trips route association. */
export interface DocumentUploadController {
  fields: UploadFields;
  actions: {
    uploadMutation: UseMutationResult<string, Error, { file: File; fields: UploadFields }, unknown>;
    submitUpload: () => void;
    recoverSelection: () => void;
    searchCompleted: (count: number | null) => void;
  };
  policyQuery: UseQueryResult<PaperlessUploadPolicy, Error>;
  taskQuery: UseQueryResult<PaperlessTask, Error>;
  policy: PaperlessUploadPolicy | null;
  unavailable: boolean;
  documentId: number | undefined;
  taskFailed: boolean;
  error: string | null;
}

/** Upload one controlled File once; accepted tasks and uncertain responses block duplicate POSTs across remounts. */
export function useDocumentUpload({
  session,
  onSessionChange,
  documentsClient,
}: DocumentUploadOptions): DocumentUploadController {
  const fields = useUploadFields(session, onSessionChange);
  const policyQuery = useUploadPolicy(documentsClient);
  const taskQuery = useUploadTask(fields.taskId, documentsClient);
  const actions = useOwnerUploadActions(fields, policyQuery.data, documentsClient);
  return {
    fields,
    actions,
    policyQuery,
    taskQuery,
    policy: policyQuery.data ?? null,
    unavailable: policyQuery.isError || policyUnavailable(policyQuery.data),
    documentId: completedDocumentId(taskQuery.data),
    taskFailed: taskQuery.data?.state === 'failed',
    error: uploadProblem(fields, policyQuery.data),
  };
}

function useOwnerUploadActions(
  fields: UploadFields,
  policy: PaperlessUploadPolicy | undefined,
  client: DocumentsClient | undefined
): DocumentUploadController['actions'] {
  const uploadMutation = useUploadMutation(client);
  const submitUpload = (): void => {
    if (!fields.canStartUpload()) return;
    submitSelectedFile({
      file: fields.file,
      policy,
      upload: (file) => {
        if (!fields.claimUpload()) return;
        uploadMutation.mutate({ file, fields });
      },
      setError: fields.setUploadError,
      setRejected: fields.setUploadRejected,
    });
  };
  return {
    uploadMutation,
    submitUpload,
    recoverSelection: () => recoverAmbiguousUpload(fields),
    searchCompleted: fields.setOwnerLookupCount,
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

function completedDocumentId(task: PaperlessTask | undefined): number | undefined {
  if (task?.state !== 'done' && task?.state !== 'duplicate') return undefined;
  return task.documentId ?? undefined;
}
