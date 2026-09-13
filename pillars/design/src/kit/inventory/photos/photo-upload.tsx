import { useValidatedFileSelection } from '@/kit/inventory/use-validated-file-selection';
import { Camera } from 'lucide-react';
import { useRef } from 'react';

import { Button, cn } from '@pops/ui';

import { DropZone } from './drop-zone';
import { UploadedFileRow } from './uploaded-file-row';

import type { UploadedFile } from './uploaded-file';

interface PhotoUploadProps {
  /** Called when files are selected. Parent handles the actual upload. */
  onFilesSelected: (files: File[]) => void;
  /** Currently tracked files with their upload status */
  files?: UploadedFile[];
  /** Remove a file from the queue */
  onRemove?: (localId: string) => void;
  /** Max file size in MB (default: 10) */
  maxSizeMb?: number;
  /** Accepted file types (default: image/*) */
  accept?: string;
  /** Whether uploads are currently in progress */
  disabled?: boolean;
  className?: string;
}

const DEFAULT_MAX_SIZE_MB = 10;
// HEIC/HEIF are listed by extension alongside the MIME wildcard because some
// browsers report an empty `file.type` for them, which a MIME-only pattern
// can't match.
const DEFAULT_ACCEPT = 'image/*,.heic,.heif';

function CameraButton({
  disabled,
  cameraRef,
}: {
  disabled: boolean;
  cameraRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => !disabled && cameraRef.current?.click()}
      disabled={disabled}
      className="w-full"
      type="button"
    >
      <Camera className="h-4 w-4 mr-1.5" />
      Take Photo
    </Button>
  );
}

export function PhotoUpload({
  onFilesSelected,
  files = [],
  onRemove,
  maxSizeMb = DEFAULT_MAX_SIZE_MB,
  accept = DEFAULT_ACCEPT,
  disabled = false,
  className,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const { handleFiles, validationError } = useValidatedFileSelection(
    accept,
    maxSizeMb,
    onFilesSelected
  );

  return (
    <div className={cn('space-y-3', className)}>
      <DropZone
        disabled={disabled}
        maxSizeMb={maxSizeMb}
        onClick={() => !disabled && inputRef.current?.click()}
        onFiles={handleFiles}
      />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        data-testid="photo-upload-input"
        onChange={(e) => {
          handleFiles(e.target.files);
          if (inputRef.current) inputRef.current.value = '';
        }}
        className="hidden"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          handleFiles(e.target.files);
          if (cameraRef.current) cameraRef.current.value = '';
        }}
        className="hidden"
      />
      <CameraButton disabled={disabled} cameraRef={cameraRef} />
      {validationError && <p className="text-sm text-destructive">{validationError}</p>}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <UploadedFileRow key={f.localId} f={f} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

export type { UploadedFile } from './uploaded-file';
