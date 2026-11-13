import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { client as defaultTripsClient } from '../trips-api/client.gen';
import { documentOwnerUrl } from './document-owner-url';
import { useUploadJournal } from './DocumentUploadProvider';
import { TripDocumentUploadContextError } from './upload-context-error';
import { useDocumentUpload } from './useDocumentUpload';
import { createDocumentUploadSession } from './useUploadFields';
import { useAssociationMutation } from './useUploadMutations';

import type { UseMutationResult } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type { UploadJournal } from './durable-upload-journal';
import type { DocumentAssociationTarget, TripDocumentAssociation } from './types';
import type { DocumentUploadController } from './useDocumentUpload';
import type { DocumentUploadSession } from './useUploadFields';

/** A Documents owner upload composed with the route's explicit association action. */
export interface TripDocumentUploadController extends Omit<DocumentUploadController, 'actions'> {
  actions: DocumentUploadController['actions'] & {
    associationMutation: UseMutationResult<TripDocumentAssociation, Error, number, unknown>;
    recoverAssociation: () => void;
  };
}

type TripDocumentUploadOptions = {
  tripId: number;
  target: DocumentAssociationTarget;
  tripsClient?: TripsClient;
  documentsClient?: DocumentsClient;
  file?: File;
  storage?: {
    session: DocumentUploadSession;
    onSessionChange: Dispatch<SetStateAction<DocumentUploadSession>>;
    taskScope?: readonly [string, string];
    journal?: UploadJournal;
  };
  beforeRequest?: () => void;
};

/** Keep per-file route session storage while delegating upload and task polling to the shared owner controller. */
export function useTripDocumentUpload({
  tripId,
  target,
  tripsClient,
  documentsClient,
  file,
  storage,
  beforeRequest,
}: TripDocumentUploadOptions): TripDocumentUploadController {
  const [session, setSession] = useState(() => createDocumentUploadSession(file ?? null));
  const contextual = useUploadJournal(target);
  const journal = storage?.journal ?? contextual.journal ?? undefined;
  const upload = useDocumentUpload({
    session: storage?.session ?? session,
    onSessionChange: storage?.onSessionChange ?? setSession,
    documentsClient,
    beforeRequest: () => {
      journal?.assertTarget(
        tripId,
        target,
        documentOwnerUrl((tripsClient ?? defaultTripsClient).getConfig().baseUrl)
      );
      beforeRequest?.();
    },
    taskScope: storage?.taskScope,
    journal,
  });
  const queryClient = useQueryClient();
  const associationMutation = useAssociationMutation({
    tripId,
    target,
    tripsClient,
    fields: upload.fields,
    queryClient,
    isCurrent: () => {
      try {
        upload.assertOwnerContext();
        return upload.fields.durable.ownerMatches() !== false;
      } catch {
        return false;
      }
    },
    beforeRequest: async () => {
      if (journal !== undefined) await journal.verify();
      upload.assertOwnerContext();
      if (upload.fields.durable.ownerMatches() === false)
        throw new TripDocumentUploadContextError();
    },
  });
  return {
    ...upload,
    actions: {
      ...upload.actions,
      associationMutation,
      recoverAssociation: upload.actions.recoverSelection,
    },
  };
}
