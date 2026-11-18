import { useQuery } from '@tanstack/react-query';
import { useCallback, useState, useSyncExternalStore } from 'react';

import { ErrorState } from '@pops/ui';

import { loadPaperlessUploadPolicy } from './api';
import { useUploadJournal } from './DocumentUploadProvider';
import { documentQueryKeys } from './query-keys';
import {
  createTripDocumentUploadSession,
  TripDocumentUploadContextError,
} from './trip-document-upload-session';
import { uploadSessionKey } from './upload-context';
import { UploadContent } from './UploadContent';
import { UploadEntry } from './UploadEntry';
import { useTripUploadRestoration } from './use-trip-upload-restoration';
import { useTripDocumentUpload } from './useTripDocumentUpload';

import type { ReactElement, SetStateAction } from 'react';

import type { UploadJournal } from './durable-upload-journal';
import type {
  TripDocumentFileIntent,
  TripDocumentUploadContext,
  TripDocumentUploadSession,
} from './trip-document-upload-session';
import type { DocumentUploadSession } from './useUploadFields';

/** Explicit upload context; retain session above conditional views to preserve files and owner receipts. */
export interface TripDocumentUploadProps extends TripDocumentUploadContext {
  session?: TripDocumentUploadSession;
}

/** Queue distinct browser files; an optional retained session must match this exact target and owners. */
export function TripDocumentUpload(props: TripDocumentUploadProps): ReactElement {
  const { tripId, target, tripsClient, documentsClient, session } = props;
  const persistence = useUploadJournal(target);
  const contextKey = JSON.stringify([
    uploadSessionKey(tripId, target, tripsClient, documentsClient),
    persistence.journal?.bindingKey(),
  ]);
  const [localSessions] = useState(() => new Map<string, TripDocumentUploadSession>());
  let activeSession = session ?? localSessions.get(contextKey);
  if (activeSession === undefined) {
    activeSession = createTripDocumentUploadSession(props);
    localSessions.set(contextKey, activeSession);
  }
  const problem = contextProblem(activeSession, props);
  if (problem)
    return (
      <ErrorState error={{ code: problem.code, message: problem.message, retryable: false }} />
    );
  return <BoundUpload {...props} session={activeSession} />;
}

function contextProblem(
  session: TripDocumentUploadSession,
  context: TripDocumentUploadContext
): TripDocumentUploadContextError | undefined {
  try {
    session.assertContext(context);
  } catch (error) {
    if (error instanceof TripDocumentUploadContextError) return error;
    throw error;
  }
  return undefined;
}

function BoundUpload(
  props: TripDocumentUploadProps & { session: TripDocumentUploadSession }
): ReactElement {
  const { session: activeSession, documentsClient } = props;
  const persistence = useUploadJournal(props.target);
  const restoration = useTripUploadRestoration(activeSession, persistence.journal);
  const policy = useQuery({
    queryKey: documentQueryKeys.status(documentsClient),
    queryFn: () => {
      activeSession.assertCurrentContext();
      return loadPaperlessUploadPolicy(documentsClient);
    },
    retry: false,
  });
  const recoveryReady =
    persistence.journal !== null &&
    restoration.binding === persistence.journal.bindingKey() &&
    restoration.error === null;
  return (
    <section aria-label="Add files" className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Add files</h2>
      <UploadEntry
        {...props}
        policy={policy.data}
        uploadsBlocked={!recoveryReady}
        onFilesSelected={(files) => {
          if (recoveryReady) activeSession.addFiles(files);
        }}
        beforeRequest={activeSession.assertCurrentContext}
      />
      {!policy.isError && policy.data?.available && policy.data.configured ? null : (
        <p role="status" className="text-sm text-muted-foreground">
          {policy.isFetching
            ? 'Checking Documents availability…'
            : 'Documents is unavailable. Existing links remain visible.'}
        </p>
      )}
      {recoveryReady && persistence.journal !== null ? (
        <UploadQueue session={activeSession} journal={persistence.journal} />
      ) : (
        <ErrorState
          error={{
            code: 'trips.documents.recovery_unavailable',
            message:
              restoration.error ?? persistence.problem ?? 'Verifying upload recovery storage…',
            retryable: true,
          }}
          onRetry={persistence.retry}
        />
      )}
    </section>
  );
}

function UploadQueue({
  session,
  journal,
}: {
  session: TripDocumentUploadSession;
  journal: UploadJournal;
}): ReactElement {
  const intents = useSyncExternalStore(session.subscribe, session.read, session.read);
  return (
    <div className="flex flex-col gap-3">
      {intents.map((intent) => (
        <UploadIntent key={intent.id} intent={intent} session={session} journal={journal} />
      ))}
    </div>
  );
}

function UploadIntent({
  intent,
  session,
  journal,
}: {
  intent: TripDocumentFileIntent;
  journal: UploadJournal;
  session: TripDocumentUploadSession;
}): ReactElement | null {
  const onSessionChange = useCallback(
    (update: SetStateAction<DocumentUploadSession>) => session.updateFile(intent.id, update),
    [intent.id, session]
  );
  const workflow = useTripDocumentUpload({
    ...session.context,
    storage: { session: intent.upload, onSessionChange, taskScope: session.taskScope, journal },
    beforeRequest: session.assertCurrentContext,
  });
  if (!workflow.persistenceReady)
    return (
      <ErrorState
        error={{
          code: 'trips.documents.recovery_unavailable',
          message: workflow.error ?? 'Upload recovery identity changed.',
          retryable: false,
        }}
      />
    );
  if (workflow.fields.file === null && workflow.fields.metadata === null) return null;
  return (
    <article aria-label={`Selected file ${intent.name}`}>
      <UploadContent
        {...session.context}
        workflow={workflow}
        active
        beforeRequest={session.assertCurrentContext}
      />
    </article>
  );
}
