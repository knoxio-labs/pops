import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { loadPaperlessUploadPolicy } from './api';
import { documentQueryKeys } from './query-keys';
import { uploadSessionKey } from './upload-context';
import { UploadContent } from './UploadContent';
import { UploadEntry } from './UploadEntry';
import { useTripDocumentUpload } from './useTripDocumentUpload';

import type { ReactElement } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type { DocumentAssociationTarget } from './types';

/** An explicit Trips target and optional authenticated transports for original uploads. */
export interface TripDocumentUploadProps {
  tripId: number;
  target: DocumentAssociationTarget;
  tripsClient?: TripsClient;
  documentsClient?: DocumentsClient;
}

interface FileIntent extends TripDocumentUploadProps {
  id: string;
  contextKey: string;
  file: File;
}

/** Queue distinct browser files and retain each captured target until its owner task is linked. */
export function TripDocumentUpload(props: TripDocumentUploadProps): ReactElement {
  const { tripId, target, tripsClient, documentsClient } = props;
  const contextKey = uploadSessionKey(tripId, target, tripsClient, documentsClient);
  const [intents, setIntents] = useState<FileIntent[]>([]);
  const policy = useQuery({
    queryKey: documentQueryKeys.status(documentsClient),
    queryFn: () => loadPaperlessUploadPolicy(documentsClient),
    retry: false,
  });
  const addFiles = (files: File[]): void => {
    setIntents((current) => [
      ...current,
      ...files.map((file) => ({ ...props, id: crypto.randomUUID(), contextKey, file })),
    ]);
  };
  return (
    <section aria-label="Add files" className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Add files</h2>
      <UploadEntry {...props} policy={policy.data} onFilesSelected={addFiles} />
      {!policy.isError && policy.data?.available && policy.data.configured ? null : (
        <p role="status" className="text-sm text-muted-foreground">
          {policy.isFetching
            ? 'Checking Documents availability…'
            : 'Documents is unavailable. Existing links remain visible.'}
        </p>
      )}
      {intents.map((intent) => (
        <div key={intent.id} hidden={intent.contextKey !== contextKey}>
          <UploadIntent intent={intent} active={intent.contextKey === contextKey} />
        </div>
      ))}
    </section>
  );
}

function UploadIntent({
  intent,
  active,
}: {
  intent: FileIntent;
  active: boolean;
}): ReactElement | null {
  const workflow = useTripDocumentUpload(intent);
  if (workflow.fields.file === null) return null;
  return (
    <article aria-label={`Selected file ${intent.file.name}`}>
      <UploadContent {...intent} workflow={workflow} active={active} />
    </article>
  );
}
