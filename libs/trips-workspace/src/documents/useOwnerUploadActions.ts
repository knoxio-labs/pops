import { useMutation } from '@tanstack/react-query';

import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { receiveDurableUpload } from './durable-upload-receipt';
import { submitSelectedFile } from './upload-actions';
import { useUploadMutation } from './useUploadMutations';

import type { UseMutationResult } from '@tanstack/react-query';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { DocumentUploadController } from './document-upload-controller-types';
import type { PaperlessUploadPolicy } from './types';
import type { UploadFields } from './useUploadFields';

function useRecoveryMutation(
  client: DocumentsClient | undefined,
  beforeRequest: (() => void) | undefined
): UseMutationResult<void, Error, UploadFields, unknown> {
  return useMutation({
    retry: false,
    meta: { errorHandled: true },
    mutationFn: async (origin: UploadFields) => {
      const record = await origin.durable.recover({
        client: client ?? defaultDocumentsClient,
        beforeRequest: () => beforeRequest?.(),
      });
      receiveDurableUpload(record, origin);
      origin.setUploadRejected(false);
      origin.setUploadError(
        record?.state === 'outcome_unknown'
          ? 'Documents cannot confirm whether this upload was accepted. Its operation is retained; it will not be resent.'
          : null
      );
    },
    onError: (error: Error, origin: UploadFields) => origin.setUploadError(error.message),
    onSettled: (_data, _error, origin) => origin.setUploadPending(false),
  });
}

/** Bind upload, GET recovery and verified reattachment actions to their originating fields. */
export function useOwnerUploadActions({
  fields,
  policy,
  client,
  beforeRequest,
  persistenceProblem,
}: {
  fields: UploadFields;
  policy: PaperlessUploadPolicy | undefined;
  client: DocumentsClient | undefined;
  beforeRequest: (() => void) | undefined;
  persistenceProblem: string | null;
}): DocumentUploadController['actions'] {
  const uploadMutation = useUploadMutation(client, beforeRequest);
  const recovery = useRecoveryMutation(client, beforeRequest);
  const submitUpload = (): void => {
    if (persistenceProblem !== null) {
      fields.setUploadError(persistenceProblem);
      return;
    }
    if (!fields.canStartUpload()) return;
    submitSelectedFile({
      file: fields.file,
      verifiedInput: fields.metadata,
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
    recoverSelection: () => {
      if (persistenceProblem !== null) {
        fields.setUploadError(persistenceProblem);
        return;
      }
      if (fields.claimRecovery()) recovery.mutate(fields);
    },
    reattachFile: (file) => reattachFile(file, fields, persistenceProblem),
    searchCompleted: fields.setOwnerLookupCount,
  };
}

function reattachFile(file: File, fields: UploadFields, persistenceProblem: string | null): void {
  if (persistenceProblem !== null) {
    fields.setUploadError(persistenceProblem);
    return;
  }
  if (!fields.claimRecovery()) return;
  void fields
    .reattachFile(file)
    .catch((error: unknown) =>
      fields.setUploadError(
        error instanceof Error ? error.message : 'The file could not be verified.'
      )
    )
    .finally(() => fields.setUploadPending(false));
}
