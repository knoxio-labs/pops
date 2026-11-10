import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useDocumentUpload } from './useDocumentUpload';
import { createDocumentUploadSession } from './useUploadFields';
import { useAssociationMutation } from './useUploadMutations';

import type { UseMutationResult } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
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

/** Keep per-file route session storage while delegating upload and task polling to the shared owner controller. */
export function useTripDocumentUpload({
  tripId,
  target,
  tripsClient,
  documentsClient,
  file,
  storage,
  beforeRequest,
}: {
  tripId: number;
  target: DocumentAssociationTarget;
  tripsClient?: TripsClient;
  documentsClient?: DocumentsClient;
  file?: File;
  storage?: {
    session: DocumentUploadSession;
    onSessionChange: Dispatch<SetStateAction<DocumentUploadSession>>;
  };
  beforeRequest?: () => void;
}): TripDocumentUploadController {
  const [session, setSession] = useState(() => createDocumentUploadSession(file ?? null));
  const upload = useDocumentUpload({
    session: storage?.session ?? session,
    onSessionChange: storage?.onSessionChange ?? setSession,
    documentsClient,
    beforeRequest,
  });
  const queryClient = useQueryClient();
  const associationMutation = useAssociationMutation({
    tripId,
    target,
    tripsClient,
    fields: upload.fields,
    queryClient,
    beforeRequest,
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
