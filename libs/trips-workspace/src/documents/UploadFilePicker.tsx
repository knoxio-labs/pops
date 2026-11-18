import { FileImage, FileText } from 'lucide-react';

import { Button, Chip, formatBytes } from '@pops/ui';

import { uploadFileProblem } from './model';
import { uploadPolicyFile } from './upload-actions';

import type { ReactElement } from 'react';

import type { DurableUploadInput } from './durable-upload-api';
import type { PaperlessUploadPolicy } from './types';

/** Keep a selected file visible while its independent owner task is submitted or recovered. */
export function UploadFilePicker({
  policy,
  file,
  verifiedInput,
  rejected,
  disabled,
  unavailable,
  uploadPending,
  submitted,
  onRemoveFile,
  onUpload,
}: {
  policy: PaperlessUploadPolicy | null;
  file: File | null;
  verifiedInput?: DurableUploadInput | null;
  rejected: boolean;
  disabled: boolean;
  unavailable: boolean;
  uploadPending: boolean;
  submitted: boolean;
  onRemoveFile?: () => void;
  onUpload: () => void;
}): ReactElement | null {
  if (file === null) return null;
  const policyFile = uploadPolicyFile(file, verifiedInput);
  const TypeIcon = policyFile.type.startsWith('image/') ? FileImage : FileText;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Chip
        className="max-w-full"
        prefix={<TypeIcon className="size-4" />}
        removable={onRemoveFile !== undefined && !uploadPending}
        removeLabel={`Remove ${policyFile.name}`}
        onRemove={onRemoveFile}
      >
        {policyFile.name} · {formatBytes(policyFile.size)}
      </Chip>
      {submitted ? null : (
        <Button
          disabled={
            disabled ||
            unavailable ||
            rejected ||
            uploadFileProblem(policyFile, policy) !== undefined
          }
          onClick={onUpload}
        >
          {uploadPending ? 'Sending to Documents…' : 'Send to Documents'}
        </Button>
      )}
    </div>
  );
}
