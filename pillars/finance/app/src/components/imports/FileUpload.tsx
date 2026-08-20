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
  acceptedTypes: string;
  maxSizeMB: number;
  maxTotalSizeMB: number;
  initialFiles: File[];
  onFilesSelect: (files: File[]) => void;
}

function useFileSelection({
  acceptedTypes,
  maxSizeMB,
  maxTotalSizeMB,
  initialFiles,
  onFilesSelect,
}: SelectionLimits) {
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>(initialFiles);

  // Side effects stay out of the state updaters: React may invoke an updater
  // more than once (StrictMode does, and the shell enables it), which would
  // fire onFilesSelect twice per selection.
  const handleFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      const result = acceptFiles({
        incoming,
        existing: selectedFiles,
        acceptedTypes,
        maxSizeBytes: maxSizeMB * 1024 * 1024,
        maxSizeMB,
        maxTotalSizeBytes: maxTotalSizeMB * 1024 * 1024,
        maxTotalSizeMB,
      });
      setSelectedFiles(result.accepted);
      setErrors(result.errors);
      onFilesSelect(result.accepted);
    },
    [selectedFiles, acceptedTypes, maxSizeMB, maxTotalSizeMB, onFilesSelect]
  );

  const handleRemove = useCallback(
    (file: File) => {
      const next = selectedFiles.filter((f) => !isSameFile(f, file));
      setSelectedFiles(next);
      setErrors([]);
      onFilesSelect(next);
    },
    [selectedFiles, onFilesSelect]
  );

  return { errors, selectedFiles, handleFiles, handleRemove };
}

/**
 * Drag-and-drop upload for one or more files of the accepted types.
 */
export function FileUpload({
  onFilesSelect,
  acceptedTypes = '.csv',
  maxSizeMB = 25,
  maxTotalSizeMB = 100,
  initialFiles = NO_FILES,
}: FileUploadProps) {
  const { errors, selectedFiles, handleFiles, handleRemove } = useFileSelection({
    acceptedTypes,
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
