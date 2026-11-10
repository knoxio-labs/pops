import { Button } from '@pops/ui';

import { DocumentAssociationPicker } from './DocumentAssociationPicker';
import { UploadControls } from './UploadControls';

import type { ReactElement } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type { DocumentAssociationTarget } from './types';
import type { useTripDocumentUpload } from './useTripDocumentUpload';

/** Render one selected file's independent task, retry and owner-lookup controls. */
export function UploadContent({
  workflow,
  active,
  ...context
}: {
  workflow: ReturnType<typeof useTripDocumentUpload>;
  tripId: number;
  target: DocumentAssociationTarget;
  tripsClient?: TripsClient;
  documentsClient?: DocumentsClient;
  active: boolean;
}): ReactElement {
  const fields = workflow.fields;
  return (
    <>
      <ActiveUploadControls workflow={workflow} />
      {fields.uncertain ? (
        <DocumentAssociationPicker
          {...context}
          open={active && fields.pickerOpen}
          onOpenChange={fields.setPickerOpen}
          initialSearch={fields.file?.name}
          onSearchCompleted={workflow.actions.searchCompleted}
          onAssociated={workflow.actions.recoverAssociation}
          noResultsAction={
            fields.ownerLookupCount === 0 ? (
              <Button variant="ghost" onClick={fields.clearSelectedFile}>
                No original found; choose a different file
              </Button>
            ) : undefined
          }
          hideTrigger
        />
      ) : null}
    </>
  );
}

function ActiveUploadControls({
  workflow,
}: {
  workflow: ReturnType<typeof useTripDocumentUpload>;
}): ReactElement {
  const fields = workflow.fields;
  const actions = workflow.actions;
  const removeAllowed = workflow.taskFailed || (fields.taskId === null && !fields.uncertain);
  return (
    <UploadControls
      policy={workflow.policy}
      file={fields.file}
      task={workflow.taskQuery.data}
      taskError={workflow.taskQuery.isError}
      taskRefetch={() => void workflow.taskQuery.refetch()}
      error={workflow.error}
      unavailable={workflow.unavailable}
      uncertain={fields.uncertain}
      uploadRejected={fields.uploadRejected}
      uploadPending={actions.uploadMutation.isPending}
      taskId={fields.taskId}
      documentId={workflow.documentId}
      associationPending={actions.associationMutation.isPending}
      onRemoveFile={removeAllowed ? fields.clearSelectedFile : undefined}
      onUpload={actions.submitUpload}
      onSearchOwner={() => {
        fields.setOwnerLookupCount(null);
        fields.setPickerOpen(true);
      }}
      onAssociate={() => {
        if (workflow.documentId !== undefined)
          actions.associationMutation.mutate(workflow.documentId);
      }}
    />
  );
}
