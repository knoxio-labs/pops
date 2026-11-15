import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { ErrorState } from '@pops/ui';

import { useUploadJournal } from '../documents/DocumentUploadProvider';
import { UploadFilePicker } from '../documents/UploadFilePicker';
import { UploadRecovery } from '../documents/UploadRecovery';
import { UploadOwnerLookup, UploadProblem } from '../documents/UploadStates';
import { UploadTaskStatus } from '../documents/UploadTaskStatus';
import { useDocumentUpload } from '../documents/useDocumentUpload';

import type { Dispatch, JSX, SetStateAction } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { DocumentUploadController } from '../documents/useDocumentUpload';
import type { DocumentUploadSession } from '../documents/useUploadFields';
import type { CaptureBrowserSession } from './browser-session';
import type { CaptureSelection } from './types';

type UploadProps = {
  session: CaptureBrowserSession;
  selection: CaptureSelection;
  documentsClient?: DocumentsClient;
  locked: boolean;
};

/** Compose the actual Documents per-file controller; pending, accepted and uncertain uploads never restart on remount. */
export function CaptureUpload(props: UploadProps): JSX.Element {
  const { session, selection, documentsClient } = props;
  useSyncExternalStore(session.subscribe, session.getVersion, session.getVersion);
  const onSessionChange = useCallback<Dispatch<SetStateAction<DocumentUploadSession>>>(
    (update) => session.updateUpload(selection.id)(update),
    [session, selection.id]
  );
  const retained = session.upload(selection.id);
  if (retained === undefined) throw new Error('Missing upload session');
  const persistence = useUploadJournal(null);
  const workflow = useDocumentUpload({ session: retained, onSessionChange, documentsClient });
  const { fields, documentId } = workflow;
  useEffect(() => {
    if (documentId !== undefined && fields.taskId !== null)
      session.editor.acceptAttachment(selection.id, {
        kind: 'document',
        documentId,
        taskId: fields.taskId,
      });
  }, [session, selection.id, documentId, fields.taskId]);
  return persistence.journal === null || !workflow.persistenceReady ? (
    <ErrorState
      error={{
        code: 'trips.documents.recovery_unavailable',
        message: workflow.error ?? persistence.problem ?? 'Verify upload recovery identity.',
        retryable: true,
      }}
      onRetry={persistence.retry}
    />
  ) : (
    <CaptureUploadBody {...props} workflow={workflow} />
  );
}
function CaptureUploadBody({
  session,
  selection,
  locked,
  workflow,
}: UploadProps & { workflow: DocumentUploadController }): JSX.Element {
  const { fields, actions } = workflow;
  return (
    <section
      aria-label={`Upload ${selection.name}`}
      className="space-y-2 rounded-md border border-border p-3"
    >
      <UploadRecovery workflow={workflow} />
      <UploadFilePicker
        file={fields.file}
        verifiedInput={fields.metadata}
        policy={workflow.policy}
        rejected={false}
        disabled={locked || fields.uploadPending || fields.taskId !== null || fields.uncertain}
        unavailable={workflow.unavailable}
        uploadPending={fields.uploadPending}
        submitted={fields.taskId !== null}
        onUpload={actions.submitUpload}
        onRemoveFile={
          locked || fields.uploadPending || fields.uncertain
            ? undefined
            : () => session.editor.removeSelection(selection.id)
        }
      />
      {fields.uploadRejected ? (
        <p role="alert">Documents rejected this upload. You can retry the same selected file.</p>
      ) : null}
      {fields.taskId !== null ? (
        <UploadTaskStatus
          task={workflow.taskQuery.data}
          error={workflow.taskQuery.isError}
          onRetry={() => void workflow.taskQuery.refetch()}
        />
      ) : null}
      <UploadProblem message={workflow.error} />
      <UploadOwnerLookup
        uncertain={fields.uncertain}
        file={fields.file}
        pending={fields.uploadPending}
        onSearch={actions.recoverSelection}
      />
    </section>
  );
}
