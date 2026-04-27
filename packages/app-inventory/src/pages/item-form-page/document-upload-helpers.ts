import { toast } from 'sonner';

import { blobToBase64 } from './upload-helpers';

import type { trpc } from '@pops/api-client';

import type { PendingDocumentFile } from '../../components/DocumentUpload';

/** Patch a single tracked file by `localId`. */
export function patchDocumentFile(
  prev: PendingDocumentFile[],
  localId: string,
  patch: Partial<PendingDocumentFile>
): PendingDocumentFile[] {
  return prev.map((f) => (f.localId === localId ? { ...f, ...patch } : f));
}

interface UploadOneDocumentArgs {
  pendingEntry: PendingDocumentFile;
  isEditMode: boolean;
  id: string | undefined;
  uploadMutation: ReturnType<typeof trpc.inventory.documentFiles.upload.useMutation>;
  setUploadFiles: React.Dispatch<React.SetStateAction<PendingDocumentFile[]>>;
}

/** Upload one document via the tRPC mutation, updating local progress as it goes. */
export async function uploadOneDocument(args: UploadOneDocumentArgs): Promise<void> {
  const { pendingEntry, isEditMode, id, uploadMutation, setUploadFiles } = args;
  const { localId, file } = pendingEntry;

  setUploadFiles((prev) => patchDocumentFile(prev, localId, { status: 'uploading', progress: 25 }));

  try {
    if (!isEditMode || !id) {
      // On create mode the parent has no item ID yet; we just leave the entry
      // as 'pending' and rely on the parent re-running uploads after save.
      setUploadFiles((prev) => patchDocumentFile(prev, localId, { status: 'pending' }));
      return;
    }

    const fileBase64 = await blobToBase64(file);
    setUploadFiles((prev) => patchDocumentFile(prev, localId, { progress: 60 }));

    await uploadMutation.mutateAsync({
      itemId: id,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileBase64,
    });

    setUploadFiles((prev) => patchDocumentFile(prev, localId, { status: 'done', progress: 100 }));
  } catch (err: unknown) {
    setUploadFiles((prev) =>
      patchDocumentFile(prev, localId, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      })
    );
    toast.error(`Failed to upload ${file.name}`);
  }
}

interface ProcessAndUploadDocumentsArgs {
  pending: PendingDocumentFile[];
  setUploadFiles: React.Dispatch<React.SetStateAction<PendingDocumentFile[]>>;
  isEditMode: boolean;
  id: string | undefined;
  uploadMutation: ReturnType<typeof trpc.inventory.documentFiles.upload.useMutation>;
}

/** Sequentially upload each pending document. */
export async function processAndUploadDocuments(
  args: ProcessAndUploadDocumentsArgs
): Promise<void> {
  const { pending, setUploadFiles, isEditMode, id, uploadMutation } = args;
  for (const entry of pending) {
    await uploadOneDocument({
      pendingEntry: entry,
      isEditMode,
      id,
      uploadMutation,
      setUploadFiles,
    });
  }
}
