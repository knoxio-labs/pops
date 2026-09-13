import { useCallback, useRef, useState } from 'react';

import { processAndUploadDocuments, type DocumentUploadMutation } from './document-upload-helpers';
import { type ItemFormOpening } from './item-form-opening';
import { delay, SIMULATED_DELETE_MS, SIMULATED_UPLOAD_MS } from './simulated-delay';

import type { DocumentItem } from '@/kit/inventory/documents/document-list';
import type { PendingDocumentFile } from '@/kit/inventory/documents/document-upload';

export function useDocumentsState(opening: ItemFormOpening, isEditMode: boolean) {
  const [existingDocuments, setExistingDocuments] = useState<DocumentItem[]>(
    opening.documents ?? []
  );
  const [documentUploadFiles, setDocumentUploadFiles] = useState<PendingDocumentFile[]>(
    opening.documentUploadFiles ?? []
  );
  const [documentDeleteConfirmId, setDocumentDeleteConfirmId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const uploadMutation = useRef<DocumentUploadMutation>({
    mutateAsync: async () => {
      await delay(SIMULATED_UPLOAD_MS);
      return { id: Date.now() };
    },
  }).current;

  const handleDocumentFilesSelected = useCallback(
    async (files: File[]) => {
      const pending: PendingDocumentFile[] = files.map((file, i) => ({
        localId: `${Date.now()}-${i}`,
        file,
        status: 'pending' as const,
      }));
      setDocumentUploadFiles((prev) => [...prev, ...pending]);
      await processAndUploadDocuments({
        pending,
        setUploadFiles: setDocumentUploadFiles,
        isEditMode,
        id: opening.id,
        uploadMutation,
      });
    },
    [isEditMode, opening.id, uploadMutation]
  );

  const handleDocumentRemoveUpload = useCallback((localId: string) => {
    setDocumentUploadFiles((prev) => prev.filter((f) => f.localId !== localId));
  }, []);

  const confirmDeleteDocument = useCallback(() => {
    if (documentDeleteConfirmId === null) return;
    setIsDeleting(true);
    void delay(SIMULATED_DELETE_MS).then(() => {
      setExistingDocuments((prev) => prev.filter((d) => d.id !== documentDeleteConfirmId));
      setIsDeleting(false);
      setDocumentDeleteConfirmId(null);
    });
  }, [documentDeleteConfirmId]);

  return {
    existingDocuments,
    documentUploadFiles,
    documentDeleteConfirmId,
    setDocumentDeleteConfirmId,
    isDeletingDocument: isDeleting,
    handleDocumentFilesSelected,
    handleDocumentRemoveUpload,
    handleDeleteDocument: setDocumentDeleteConfirmId,
    confirmDeleteDocument,
  };
}
