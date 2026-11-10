import { useQuery } from '@tanstack/react-query';
import { useCallback, useState, useSyncExternalStore } from 'react';

import { loadPaperlessUploadPolicy } from './api';
import { documentQueryKeys } from './query-keys';
import { createTripDocumentUploadSession } from './trip-document-upload-session';
import { uploadSessionKey } from './upload-context';
import { UploadContent } from './UploadContent';
import { UploadEntry } from './UploadEntry';
import { useTripDocumentUpload } from './useTripDocumentUpload';

import type { ReactElement, SetStateAction } from 'react';

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
  const contextKey = uploadSessionKey(tripId, target, tripsClient, documentsClient);
  const [localSessions] = useState(() => new Map<string, TripDocumentUploadSession>());
  let activeSession = session ?? localSessions.get(contextKey);
  if (activeSession === undefined) {
    activeSession = createTripDocumentUploadSession(props);
    localSessions.set(contextKey, activeSession);
  }
  activeSession.assertContext(props);
  const policy = useQuery({
    queryKey: documentQueryKeys.status(documentsClient),
    queryFn: () => {
      activeSession.assertCurrentContext();
      return loadPaperlessUploadPolicy(documentsClient);
    },
    retry: false,
  });
  return (
    <section aria-label="Add files" className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Add files</h2>
      <UploadEntry
        {...props}
        policy={policy.data}
        onFilesSelected={activeSession.addFiles}
        beforeRequest={activeSession.assertCurrentContext}
      />
      {!policy.isError && policy.data?.available && policy.data.configured ? null : (
        <p role="status" className="text-sm text-muted-foreground">
          {policy.isFetching
            ? 'Checking Documents availability…'
            : 'Documents is unavailable. Existing links remain visible.'}
        </p>
      )}
      <UploadQueue session={activeSession} />
    </section>
  );
}

function UploadQueue({ session }: { session: TripDocumentUploadSession }): ReactElement {
  const intents = useSyncExternalStore(session.subscribe, session.read, session.read);
  return (
    <div className="flex flex-col gap-3">
      {intents.map((intent) => (
        <UploadIntent key={intent.id} intent={intent} session={session} />
      ))}
    </div>
  );
}

function UploadIntent({
  intent,
  session,
}: {
  intent: TripDocumentFileIntent;
  session: TripDocumentUploadSession;
}): ReactElement | null {
  const onSessionChange = useCallback(
    (update: SetStateAction<DocumentUploadSession>) => session.updateFile(intent.id, update),
    [intent.id, session]
  );
  const workflow = useTripDocumentUpload({
    ...session.context,
    storage: { session: intent.upload, onSessionChange },
    beforeRequest: session.assertCurrentContext,
  });
  if (workflow.fields.file === null) return null;
  return (
    <article aria-label={`Selected file ${intent.file.name}`}>
      <UploadContent
        {...session.context}
        workflow={workflow}
        active
        beforeRequest={session.assertCurrentContext}
      />
    </article>
  );
}
