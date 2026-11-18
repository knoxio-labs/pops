import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { loadPaperlessUploadPolicy } from './api';
import { DurableUploadRecoveryRequired } from './durable-upload-operation';
import { durableUploadTask, receiveDurableUpload } from './durable-upload-receipt';
import { retainOwnerOriginal } from './owner-task-receipt';

import type { UseQueryResult } from '@tanstack/react-query';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { PaperlessTask, PaperlessUploadPolicy } from './types';
import type { UploadFields } from './useUploadFields';

/** Read availability only after checking the intent's captured owner authority. */
export function useUploadPolicy(
  documentsClient: DocumentsClient | undefined,
  beforeRequest: (() => void) | undefined,
  taskScope: readonly [string, string]
): UseQueryResult<PaperlessUploadPolicy, Error> {
  return useQuery({
    queryKey: ['documents-status', taskScope[1]],
    queryFn: () => {
      beforeRequest?.();
      return loadPaperlessUploadPolicy(documentsClient);
    },
    retry: false,
  });
}

/** Poll accepted operations through GET only and retain their independently verified owner receipt. */
export function useUploadTask({
  fields,
  documentsClient,
  beforeRequest,
  taskScope,
}: {
  fields: UploadFields;
  documentsClient: DocumentsClient | undefined;
  beforeRequest: (() => void) | undefined;
  taskScope: readonly [string, string];
}): UseQueryResult<PaperlessTask, Error> {
  const { taskId, taskReceipt, setTaskReceipt } = fields;
  const query = useQuery({
    queryKey: [taskScope[0], taskScope[1], fields.durable.persistenceBinding(), taskId ?? ''],
    queryFn: async () => {
      const record = await fields.durable.recover({
        client: documentsClient ?? defaultDocumentsClient,
        beforeRequest: () => beforeRequest?.(),
      });
      receiveDurableUpload(record, fields);
      const result = record === null ? undefined : durableUploadTask(record);
      if (result === undefined) throw new DurableUploadRecoveryRequired();
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
