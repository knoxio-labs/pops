import { FileText } from 'lucide-react';

import { Chip, FileUpload, formatBytes } from '@pops/ui';

import type { ReactElement } from 'react';

import type { DocumentUploadController } from './useDocumentUpload';

/** Render recovered metadata in the existing file controls; selecting bytes explicitly verifies the retained fingerprint. */
export function UploadRecovery({
  workflow,
}: {
  workflow: DocumentUploadController;
}): ReactElement | null {
  const { fields } = workflow;
  if (fields.file !== null || fields.metadata === null) return null;
  const input = fields.metadata;
  return (
    <div className="flex flex-col gap-2">
      <Chip prefix={<FileText className="size-4" aria-hidden />}>
        {input.fileName} · {formatBytes(input.byteLength)}
      </Chip>
      {fields.ownerRecord?.state === 'awaiting_content' ||
      fields.ownerRecord?.state === 'admitted' ||
      (fields.ownerRecord === null && !fields.uncertain) ? (
        <FileUpload
          multiple={false}
          prompt="Select the original file to resume"
          disabled={fields.uploadPending}
          acceptHint={null}
          onFilesSelected={(files) => {
            const file = files[0];
            if (file !== undefined) workflow.actions.reattachFile(file);
          }}
          onError={() =>
            fields.setUploadError(
              'Select the original file matching this retained upload fingerprint.'
            )
          }
        />
      ) : null}
    </div>
  );
}
