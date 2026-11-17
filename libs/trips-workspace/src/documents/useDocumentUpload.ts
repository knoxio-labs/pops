import { useCallback, useEffect } from 'react';

import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { documentOwnerUrl } from './document-owner-url';
import { useUploadJournal } from './DocumentUploadProvider';
import { uploadFileProblem } from './model';
import { completedDocumentId } from './owner-task-receipt';
import { uploadPolicyFile } from './upload-actions';
import { useOwnerUploadActions } from './useOwnerUploadActions';
import { useUploadFields } from './useUploadFields';
import { useUploadPolicy, useUploadTask } from './useUploadOwnerQueries';

import type {
  DocumentUploadOptions,
  DocumentUploadController,
} from './document-upload-controller-types';
import type { PaperlessUploadPolicy } from './types';
import type { UploadFields } from './useUploadFields';

export type {
  DocumentUploadOptions,
  DocumentUploadController,
} from './document-upload-controller-types';

/** Upload one controlled File once; accepted tasks and uncertain responses block duplicate POSTs across remounts. */
export function useDocumentUpload(options: DocumentUploadOptions): DocumentUploadController {
  const { session, onSessionChange, documentsClient } = options;
  const fields = useUploadFields(session, onSessionChange);
  const { taskScope, assertOwner, persistenceProblem } = useOwnerScope(options);
  const policyQuery = useUploadPolicy(documentsClient, assertOwner, taskScope);
  const taskQuery = useUploadTask({
    fields,
    documentsClient,
    beforeRequest: assertOwner,
    taskScope,
  });
  const actions = useOwnerUploadActions({
    fields,
    policy: policyQuery.data,
    client: documentsClient,
    beforeRequest: assertOwner,
    persistenceProblem,
  });
  const { recoverSelection } = actions;
  useEffect(() => {
    if (persistenceProblem === null && fields.durable.takeRestoredRead()) recoverSelection();
  }, [fields.durable, persistenceProblem, recoverSelection]);
  return {
    assertOwnerContext: assertOwner,
    fields,
    persistenceReady: persistenceProblem === null,
    actions,
    policyQuery,
    taskQuery,
    policy: policyQuery.data ?? null,
    unavailable: policyQuery.isError || policyUnavailable(policyQuery.data),
    documentId:
      persistenceProblem === null && fields.ownerMatches !== false
        ? completedDocumentId(taskQuery.data)
        : undefined,
    taskFailed: taskQuery.data?.state === 'failed',
    error:
      persistenceProblem ??
      fields.durable.storageProblem() ??
      (fields.ownerMatches === false
        ? 'Restore the original Documents archive before opening or linking this upload.'
        : uploadProblem(fields, policyQuery.data)),
  };
}

function useOwnerScope({
  session,
  documentsClient,
  beforeRequest,
  taskScope: retainedTaskScope,
  journal,
}: DocumentUploadOptions): {
  taskScope: readonly [string, string];
  assertOwner: () => void;
  persistenceProblem: string | null;
} {
  const intent = session.intent;
  const fallbackPersistence = useUploadJournal(null);
  const persistence = journal ?? fallbackPersistence.journal;
  let persistenceProblem = persistence === null ? fallbackPersistence.problem : null;
  if (persistence !== null) {
    try {
      persistence.assertDocumentsOwner(
        documentOwnerUrl((documentsClient ?? defaultDocumentsClient).getConfig().baseUrl)
      );
      intent.durable.bindJournal(persistence);
    } catch (error) {
      persistenceProblem =
        error instanceof Error ? error.message : 'Upload recovery context changed.';
    }
  }
  const taskScope = intent.bindOwner(documentsClient, retainedTaskScope);
  const assertOwner = useCallback(() => {
    intent.assertOwner(documentsClient);
    if (persistence === null || intent.durable.persistenceBinding() !== persistence.bindingKey())
      throw new Error('Restore the original upload account and source before continuing.');
    persistence.assertDocumentsOwner(
      documentOwnerUrl((documentsClient ?? defaultDocumentsClient).getConfig().baseUrl)
    );
    beforeRequest?.();
    intent.assertOwner(documentsClient);
  }, [intent, documentsClient, beforeRequest, persistence]);
  return { taskScope, assertOwner, persistenceProblem };
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
  return uploadFileProblem(uploadPolicyFile(fields.file, fields.metadata), policy ?? null) ?? null;
}
