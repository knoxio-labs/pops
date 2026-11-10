import { FileUpload, formatBytes } from '@pops/ui';

import { DocumentAssociationPicker } from './DocumentAssociationPicker';

import type { ReactElement } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type { DocumentAssociationTarget, PaperlessUploadPolicy } from './types';

/** Present the always-visible multi-file drop area beside the existing-original picker. */
export function UploadEntry({
  policy,
  onFilesSelected,
  ...context
}: {
  tripId: number;
  target: DocumentAssociationTarget;
  tripsClient?: TripsClient;
  documentsClient?: DocumentsClient;
  policy: PaperlessUploadPolicy | undefined;
  onFilesSelected: (files: File[]) => void;
}): ReactElement {
  const available = policy?.configured === true && policy.available;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <FileUpload
          className="min-w-0 flex-1"
          multiple
          prompt="Upload a file"
          accept={policy?.allowedMimeTypes.join(',')}
          maxSize={policy?.maxUploadBytes}
          acceptHint={null}
          disabled={!available}
          onFilesSelected={onFilesSelected}
          onError={(reason) => {
            if ('file' in reason) onFilesSelected([reason.file]);
          }}
        />
        <DocumentAssociationPicker {...context} />
      </div>
      {policy ? (
        <p className="text-xs text-muted-foreground">
          {policy.allowedMimeTypes.join(', ')} · up to {formatBytes(policy.maxUploadBytes)} per file
        </p>
      ) : null}
    </div>
  );
}
