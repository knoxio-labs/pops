/**
 * Port of
 * `pillars/inventory/app/src/pages/item-form-page/photo-upload-helpers.ts`.
 *
 * The source's failure path also calls `sonner`'s `toast.error`, which the
 * playground may not import; the per-file `status: 'error'` entry these
 * functions already write is what the row itself renders the failure from,
 * so the toast is dropped rather than replaced.
 */
import { blobToBase64 } from './upload-helpers';

import type { UploadedFile } from '@/kit/inventory/photos/photo-upload';

export { blobToBase64 };

export interface PhotoUploadMutation {
  mutateAsync: (input: {
    itemId: string;
    fileBase64: string;
    sortOrder: number;
  }) => Promise<unknown>;
}

export function patchFile(
  prev: UploadedFile[],
  localId: string,
  patch: Partial<UploadedFile>
): UploadedFile[] {
  return prev.map((f) => (f.localId === localId ? { ...f, ...patch } : f));
}

export interface ProcessedFile {
  original: File;
  processed: Blob;
  previewUrl: string;
  originalSize: number;
  processedSize: number;
}

export function applyProcessedToPending(
  prev: UploadedFile[],
  pending: UploadedFile[],
  processed: ProcessedFile[]
): UploadedFile[] {
  return prev.map((f) => {
    const idx = pending.findIndex((p) => p.localId === f.localId);
    const match = idx >= 0 ? processed[idx] : undefined;
    if (!match) return f;
    return {
      ...f,
      previewUrl: match.previewUrl,
      originalSize: match.originalSize,
      processedSize: match.processedSize,
      status: 'uploading' as const,
      progress: 0,
    };
  });
}

interface UploadOnePhotoArgs {
  pendingEntry: UploadedFile;
  processed: ProcessedFile;
  isEditMode: boolean;
  id: string | undefined;
  existingPhotosLength: number;
  index: number;
  uploadMutation: PhotoUploadMutation;
  setUploadFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
}

export async function uploadOnePhoto(args: UploadOnePhotoArgs): Promise<void> {
  const {
    pendingEntry,
    processed,
    isEditMode,
    id,
    existingPhotosLength,
    index,
    uploadMutation,
    setUploadFiles,
  } = args;
  const { localId } = pendingEntry;
  setUploadFiles((prev) => patchFile(prev, localId, { progress: 50 }));
  try {
    if (isEditMode && id) {
      await uploadMutation.mutateAsync({
        itemId: id,
        fileBase64: await blobToBase64(processed.processed),
        sortOrder: existingPhotosLength + index,
      });
    }
    setUploadFiles((prev) => patchFile(prev, localId, { status: 'done', progress: 100 }));
  } catch (err: unknown) {
    setUploadFiles((prev) =>
      patchFile(prev, localId, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      })
    );
  }
}

interface ProcessAndUploadArgs {
  files: File[];
  pending: UploadedFile[];
  processFiles: (files: File[]) => Promise<ProcessedFile[]>;
  setUploadFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  isEditMode: boolean;
  id: string | undefined;
  existingPhotosLength: number;
  uploadMutation: PhotoUploadMutation;
}

export async function processAndUpload(args: ProcessAndUploadArgs): Promise<void> {
  const {
    files,
    pending,
    processFiles,
    setUploadFiles,
    isEditMode,
    id,
    existingPhotosLength,
    uploadMutation,
  } = args;
  try {
    const processed = await processFiles(files);
    setUploadFiles((prev) => applyProcessedToPending(prev, pending, processed));
    for (let i = 0; i < processed.length; i++) {
      const pendingEntry = pending[i];
      const p = processed[i];
      if (!pendingEntry || !p) continue;
      await uploadOnePhoto({
        pendingEntry,
        processed: p,
        isEditMode,
        id,
        existingPhotosLength,
        index: i,
        uploadMutation,
        setUploadFiles,
      });
    }
  } catch {
    setUploadFiles((prev) =>
      prev.map((f) =>
        pending.some((p) => p.localId === f.localId)
          ? { ...f, status: 'error' as const, error: 'Image processing failed' }
          : f
      )
    );
  }
}
