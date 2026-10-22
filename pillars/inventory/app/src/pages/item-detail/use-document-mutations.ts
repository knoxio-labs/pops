import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { toastError } from '@pops/ui';

import { inventoryApiErrorOf, unwrap } from '../../inventory-api-helpers.js';
import {
  documentsDismissIngestion,
  documentsUnlink,
  documentsUpdate,
} from '../../inventory-api/index.js';
import { uploadItemDocument } from './document-upload-api';

import type { DocumentsUpdateData } from '../../inventory-api/types.gen.js';
import type { DocumentUploadInput } from './document-upload-api';

/** The keys a document edit changes; only the ones the user changed are sent. */
export type DocumentChanges = NonNullable<DocumentsUpdateData['body']>;

function failed(fallback: string): (error: Error) => void {
  return (error) => toastError(inventoryApiErrorOf(error, fallback));
}

/**
 * The item-detail document writes: upload, edit, unlink and dismissing a
 * failed upload. Each refreshes the item's documents through `onChanged`.
 */
export function useDocumentMutations(onChanged: () => void) {
  const upload = useMutation({
    meta: { errorHandled: true },
    mutationFn: (input: DocumentUploadInput) => uploadItemDocument(input),
    onSuccess: () => {
      toast.success('Sent to Paperless. It appears here once processed.');
      onChanged();
    },
    onError: failed('Failed to upload the document'),
  });
  const update = useMutation({
    meta: { errorHandled: true },
    mutationFn: async ({ id, changes }: { id: number; changes: DocumentChanges }) =>
      unwrap(await documentsUpdate({ path: { id }, body: changes })),
    onSuccess: () => {
      toast.success('Document updated');
      onChanged();
    },
    onError: failed('Failed to update the document'),
  });
  const unlink = useMutation({
    meta: { errorHandled: true },
    mutationFn: async (id: number) => unwrap(await documentsUnlink({ path: { id } })),
    onSuccess: () => {
      toast.success('Document unlinked');
      onChanged();
    },
    onError: failed('Failed to unlink the document'),
  });
  const dismiss = useMutation({
    meta: { errorHandled: true },
    mutationFn: async (id: number) => unwrap(await documentsDismissIngestion({ path: { id } })),
    onSuccess: onChanged,
    onError: failed('Failed to dismiss the upload'),
  });
  return { upload, update, unlink, dismiss };
}

/** Return shape of {@link useDocumentMutations}. */
export type DocumentMutations = ReturnType<typeof useDocumentMutations>;
