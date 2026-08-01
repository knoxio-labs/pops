import { useCallback, useState } from 'react';

import { isSameFile } from '../../store/import-store-types';
import { acceptFiles } from './file-upload/accept';
import { FileUploadView } from './file-upload/FileUploadView';

const NO_FILES: File[] = [];

interface FileUploadProps {
  onFilesSelect: (files: File[]) => void;
  acceptedTypes?: string;
  maxSizeMB?: number;
  maxTotalSizeMB?: number;
  initialFiles?: File[];
}

function useDragHandlers(handleFiles: (files: File[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      handleFiles(Array.from(e.dataTransfer.files));
    },
    [handleFiles]
  );
  return { isDragging, onDragEnter, onDragLeave, onDragOver, onDrop };
}

interface SelectionLimits {
  maxSizeMB: number;
  maxTotalSizeMB: number;
  initialFiles: File[];
  onFilesSelect: (files: File[]) => void;
}

function useFileSelection({
  maxSizeMB,
  maxTotalSizeMB,
  initialFiles,
  onFilesSelect,
}: SelectionLimits) {
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>(initialFiles);

  const handleFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      setSelectedFiles((existing) => {
        const result = acceptFiles({
          incoming,
          existing,
          maxSizeBytes: maxSizeMB * 1024 * 1024,
          maxSizeMB,
          maxTotalSizeBytes: maxTotalSizeMB * 1024 * 1024,
          maxTotalSizeMB,
        });
        setErrors(result.errors);
        onFilesSelect(result.accepted);
        return result.accepted;
      });
    },
    [maxSizeMB, maxTotalSizeMB, onFilesSelect]
  );

  const handleRemove = useCallback(
    (file: File) => {
      setSelectedFiles((existing) => {
        const next = existing.filter((f) => !isSameFile(f, file));
        setErrors([]);
        onFilesSelect(next);
        return next;
      });
    },
    [onFilesSelect]
  );

  return { errors, selectedFiles, handleFiles, handleRemove };
}

/**
 * Drag-and-drop upload for one or more CSV files.
 */
export function FileUpload({
  onFilesSelect,
  acceptedTypes = '.csv',
  maxSizeMB = 25,
  maxTotalSizeMB = 100,
  initialFiles = NO_FILES,
}: FileUploadProps) {
  const { errors, selectedFiles, handleFiles, handleRemove } = useFileSelection({
    maxSizeMB,
    maxTotalSizeMB,
    initialFiles,
    onFilesSelect,
  });
  const dragHandlers = useDragHandlers(handleFiles);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(Array.from(e.target.files ?? []));
      // Allow re-selecting a file that was removed without an intervening change.
      e.target.value = '';
    },
    [handleFiles]
  );

  return (
    <FileUploadView
      {...dragHandlers}
      selectedFiles={selectedFiles}
      errors={errors}
      acceptedTypes={acceptedTypes}
      maxSizeMB={maxSizeMB}
      onRemove={handleRemove}
      onFileInput={handleFileInput}
    />
  );
}
