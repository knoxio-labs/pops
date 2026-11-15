import { UploadFilePicker } from './UploadFilePicker';
import { UploadLinkAction, UploadOwnerLookup, UploadProblem } from './UploadStates';
import { UploadTaskStatus } from './UploadTaskStatus';

import type { ReactElement } from 'react';

import type { DurableUploadInput } from './durable-upload-api';
import type { PaperlessTask, PaperlessUploadPolicy } from './types';

/** Render file selection, upload status and linking actions for one upload. */
export function UploadControls(props: {
  policy: PaperlessUploadPolicy | null;
  file: File | null;
  verifiedInput?: DurableUploadInput | null;
  task: PaperlessTask | undefined;
  taskError: boolean;
  taskRefetch: () => void;
  error: string | null;
  unavailable: boolean;
  uncertain: boolean;
  uploadRejected: boolean;
  uploadPending: boolean;
  taskId: string | null;
  documentId: number | undefined;
  associationPending: boolean;
  onRemoveFile?: () => void;
  onUpload: () => void;
  onSearchOwner: () => void;
  onAssociate: () => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <UploadFilePicker
        {...props}
        rejected={props.uploadRejected}
        submitted={props.taskId !== null}
        disabled={props.uploadPending || props.taskId !== null || props.uncertain}
      />
      <UploadStateActions {...props} />
    </div>
  );
}

function UploadStateActions(props: Parameters<typeof UploadControls>[0]): ReactElement {
  return (
    <>
      {props.taskId === null ? null : (
        <UploadTaskStatus task={props.task} error={props.taskError} onRetry={props.taskRefetch} />
      )}
      <UploadOwnerLookup
        uncertain={props.uncertain}
        file={props.file}
        onSearch={props.onSearchOwner}
        pending={props.uploadPending}
      />
      <UploadLinkAction
        task={props.task}
        documentId={props.documentId}
        pending={props.associationPending}
        error={props.error}
        onAssociate={props.onAssociate}
      />
      <UploadProblem message={props.error} />
    </>
  );
}
