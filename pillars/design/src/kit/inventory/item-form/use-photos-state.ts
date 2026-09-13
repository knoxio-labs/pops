import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { type ItemFormOpening } from './item-form-opening';
import {
  processAndUpload,
  type PhotoUploadMutation,
  type ProcessedFile,
} from './photo-upload-helpers';
import { delay, SIMULATED_DELETE_MS, SIMULATED_UPLOAD_MS } from './simulated-delay';

import type { PhotoItem } from '@/kit/inventory/photos/photo-gallery';
import type { UploadedFile } from '@/kit/inventory/photos/photo-upload';

/** Stands in for `useImageProcessor`'s `processFiles`: no real compression, just a preview URL. */
async function simulateProcessFiles(files: File[]): Promise<ProcessedFile[]> {
  return files.map((file) => ({
    original: file,
    processed: file,
    previewUrl: URL.createObjectURL(file),
    originalSize: file.size,
    processedSize: file.size,
  }));
}

function usePhotoUploads(
  opening: ItemFormOpening,
  isEditMode: boolean,
  existingPhotosLength: number
) {
  const [uploadFiles, setUploadFiles] = useState<UploadedFile[]>(opening.uploadFiles ?? []);
  const uploadMutation = useRef<PhotoUploadMutation>({
    mutateAsync: async () => {
      await delay(SIMULATED_UPLOAD_MS);
      return { id: Date.now() };
    },
  }).current;

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      const pending: UploadedFile[] = files.map((file, i) => ({
        localId: `${Date.now()}-${i}`,
        file,
        previewUrl: '',
        status: 'pending' as const,
      }));
      setUploadFiles((prev) => [...prev, ...pending]);
      await processAndUpload({
        files,
        pending,
        processFiles: simulateProcessFiles,
        setUploadFiles,
        isEditMode,
        id: opening.id,
        existingPhotosLength,
        uploadMutation,
      });
    },
    [isEditMode, opening.id, existingPhotosLength, uploadMutation]
  );

  const handleRemoveUpload = useCallback((localId: string) => {
    setUploadFiles((prev) => {
      const file = prev.find((f) => f.localId === localId);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter((f) => f.localId !== localId);
    });
  }, []);

  return { uploadFiles, handleFilesSelected, handleRemoveUpload };
}

function usePhotoDeletion(opening: ItemFormOpening) {
  const [existingPhotos, setExistingPhotos] = useState<PhotoItem[]>(opening.photos ?? []);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDeletePhoto = useCallback(() => {
    if (deleteConfirmId === null) return;
    setIsDeleting(true);
    void delay(SIMULATED_DELETE_MS).then(() => {
      setExistingPhotos((prev) => prev.filter((p) => p.id !== deleteConfirmId));
      setIsDeleting(false);
      setDeleteConfirmId(null);
    });
  }, [deleteConfirmId]);

  return {
    existingPhotos,
    setExistingPhotos,
    deleteConfirmId,
    setDeleteConfirmId,
    isDeleting,
    confirmDeletePhoto,
  };
}

function usePhotoReorder(setExistingPhotos: Dispatch<SetStateAction<PhotoItem[]>>) {
  const [isReordering, setIsReordering] = useState(false);

  const onReorder = useCallback(
    (orderedIds: number[]) => {
      setIsReordering(true);
      void delay(SIMULATED_DELETE_MS).then(() => {
        setExistingPhotos((prev) =>
          orderedIds
            .map((id, sortOrder) => {
              const existing = prev.find((p) => p.id === id);
              return existing ? { ...existing, sortOrder } : undefined;
            })
            .filter((p): p is PhotoItem => p !== undefined)
        );
        setIsReordering(false);
      });
    },
    [setExistingPhotos]
  );

  return { isReordering, onReorder };
}

export function usePhotosState(opening: ItemFormOpening, isEditMode: boolean) {
  const deletion = usePhotoDeletion(opening);
  const uploads = usePhotoUploads(opening, isEditMode, deletion.existingPhotos.length);
  const reorder = usePhotoReorder(deletion.setExistingPhotos);

  return {
    existingPhotos: deletion.existingPhotos,
    uploadFiles: uploads.uploadFiles,
    deleteConfirmId: deletion.deleteConfirmId,
    setDeleteConfirmId: deletion.setDeleteConfirmId,
    isDeleting: deletion.isDeleting,
    isReordering: reorder.isReordering,
    imageProcessing: false,
    handleFilesSelected: uploads.handleFilesSelected,
    handleRemoveUpload: uploads.handleRemoveUpload,
    handleDeletePhoto: deletion.setDeleteConfirmId,
    confirmDeletePhoto: deletion.confirmDeletePhoto,
    onReorder: reorder.onReorder,
  };
}
