import { runUploadContextAction } from './upload-context';
import { UploadControls } from './UploadControls';
import { UploadRecovery } from './UploadRecovery';

import type { ReactElement } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type { DocumentAssociationTarget } from './types';
import type { useTripDocumentUpload } from './useTripDocumentUpload';

/** Render one selected file's independent task, retry and UUID recovery controls. */
export function UploadContent({
  workflow,
  beforeRequest,
}: {
  workflow: ReturnType<typeof useTripDocumentUpload>;
  tripId: number;
  target: DocumentAssociationTarget;
  tripsClient?: TripsClient;
  documentsClient?: DocumentsClient;
  active: boolean;
  beforeRequest?: () => void;
}): ReactElement {
  return (
    <>
      <UploadRecovery workflow={workflow} />
      <ActiveUploadControls workflow={workflow} beforeRequest={beforeRequest} />
    </>
  );
}

function ActiveUploadControls({
  workflow,
  beforeRequest,
}: {
  workflow: ReturnType<typeof useTripDocumentUpload>;
  beforeRequest?: () => void;
}): ReactElement {
  const fields = workflow.fields;
  const actions = workflow.actions;
  const removeAllowed = workflow.taskFailed || (fields.taskId === null && !fields.uncertain);
  return (
    <UploadControls
      policy={workflow.policy}
      file={fields.file}
      verifiedInput={fields.metadata}
      task={workflow.taskQuery.data}
      taskError={workflow.taskQuery.isError}
      taskRefetch={() => void workflow.taskQuery.refetch()}
      error={workflow.error}
      unavailable={workflow.unavailable}
      uncertain={fields.uncertain}
      uploadRejected={fields.uploadRejected}
      uploadPending={fields.uploadPending}
      taskId={fields.taskId}
      documentId={workflow.documentId}
      associationPending={actions.associationMutation.isPending}
      onRemoveFile={
        removeAllowed
          ? () => runUploadContextAction(fields, beforeRequest, fields.clearSelectedFile)
          : undefined
      }
      onUpload={actions.submitUpload}
      onSearchOwner={actions.recoverSelection}
      onAssociate={() => {
        if (workflow.documentId !== undefined)
          actions.associationMutation.mutate(workflow.documentId);
      }}
    />
  );
}
