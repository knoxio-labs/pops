import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { loadPaperlessTask, loadPaperlessUploadPolicy } from './api';
import { uploadFileProblem } from './model';
import { completedDocumentId, retainOwnerOriginal } from './owner-task-receipt';
import { documentQueryKeys } from './query-keys';
import { recoverAmbiguousUpload, submitSelectedFile } from './upload-actions';
import { runUploadContextAction } from './upload-context';
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
  /** Revalidate a retaining parent's captured context immediately before owner operations. */
  beforeRequest?: () => void;
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
  beforeRequest,
}: DocumentUploadOptions): DocumentUploadController {
  const fields = useUploadFields(session, onSessionChange);
  const policyQuery = useUploadPolicy(documentsClient, beforeRequest);
  const taskQuery = useUploadTask(fields, documentsClient, beforeRequest);
  const actions = useOwnerUploadActions({
    fields,
    policy: policyQuery.data,
    client: documentsClient,
    beforeRequest,
  });
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

function useOwnerUploadActions({
  fields,
  policy,
  client,
  beforeRequest,
}: {
  fields: UploadFields;
  policy: PaperlessUploadPolicy | undefined;
  client: DocumentsClient | undefined;
  beforeRequest: (() => void) | undefined;
}): DocumentUploadController['actions'] {
  const uploadMutation = useUploadMutation(client, beforeRequest);
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
    recoverSelection: () =>
      runUploadContextAction(fields, beforeRequest, () => recoverAmbiguousUpload(fields)),
    searchCompleted: fields.setOwnerLookupCount,
  };
}

function useUploadPolicy(
  documentsClient: DocumentsClient | undefined,
  beforeRequest: (() => void) | undefined
): UseQueryResult<PaperlessUploadPolicy, Error> {
  return useQuery({
    queryKey: documentQueryKeys.status(documentsClient),
    queryFn: () => {
      beforeRequest?.();
      return loadPaperlessUploadPolicy(documentsClient);
    },
    retry: false,
  });
}

function useUploadTask(
  fields: UploadFields,
  documentsClient: DocumentsClient | undefined,
  beforeRequest: (() => void) | undefined
): UseQueryResult<PaperlessTask, Error> {
  const { taskId, taskReceipt, setTaskReceipt } = fields;
  const query = useQuery({
    queryKey: documentQueryKeys.task(documentsClient, taskId ?? ''),
    queryFn: async () => {
      beforeRequest?.();
      const result = await loadPaperlessTask(taskId ?? '', documentsClient);
      if (taskId !== null) setTaskReceipt(taskId, result);
      return result;
    },
    initialData: taskReceipt?.taskId === taskId ? taskReceipt.result : undefined,
    select: (result) =>
      retainOwnerOriginal(taskReceipt?.taskId === taskId ? taskReceipt.result : undefined, result),
    enabled: taskId !== null,
    retry: false,
    refetchInterval: (query) => (query.state.data?.state === 'pending' ? 1500 : false),
  });
  useEffect(() => {
    if (taskId !== null && query.data !== undefined) setTaskReceipt(taskId, query.data);
  }, [query.data, setTaskReceipt, taskId]);
  return query;
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
