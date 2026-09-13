import { DropZone } from '@/kit/inventory/photos/drop-zone';
import { useValidatedFileSelection } from '@/kit/inventory/use-validated-file-selection';
import { useRef } from 'react';

import { cn } from '@pops/ui';

import { PendingDocumentRow } from './pending-document-row';

import type { PendingDocumentFile } from './pending-document-file';

/**
 * Pending in-flight upload entry tracked client-side. Distinct from
 * `UploadedFile` (used by `PhotoUpload`) because document uploads have no
 * thumbnail preview / pre-compression sizes: just the raw File and its
 * progress.
 */

interface DocumentUploadProps {
  /** Called when files are selected. Parent handles the actual upload. */
  onFilesSelected: (files: File[]) => void;
  /** Currently tracked files with their upload status. */
  files?: PendingDocumentFile[];
  /** Remove a file from the queue. */
  onRemove?: (localId: string) => void;
  /** Max file size in MB (default: 10). */
  maxSizeMb?: number;
  /** Accepted file types (default: PDF + image + plain text). */
  accept?: string;
  /** Whether uploads are currently in progress. */
  disabled?: boolean;
  className?: string;
}

const DEFAULT_MAX_SIZE_MB = 10;
// Wildcards (`image/*`, `text/*`) match any MIME subtype the browser reports;
// the extensions alongside them cover browsers that report an empty `type`
// for these files instead.
const DEFAULT_ACCEPT =
  'application/pdf,image/*,text/*,.pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.txt,.md,.csv';

export function DocumentUpload({
  onFilesSelected,
  files = [],
  onRemove,
  maxSizeMb = DEFAULT_MAX_SIZE_MB,
  accept = DEFAULT_ACCEPT,
  disabled = false,
  className,
}: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
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
        ariaLabel="Upload documents"
        helperText={`PDF, images, or text up to ${maxSizeMb}MB`}
      />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        data-testid="document-upload-input"
        onChange={(e) => {
          handleFiles(e.target.files);
          if (inputRef.current) inputRef.current.value = '';
        }}
        className="hidden"
      />
      {validationError && <p className="text-sm text-destructive">{validationError}</p>}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <PendingDocumentRow key={f.localId} f={f} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

export type { PendingDocumentFile } from './pending-document-file';
