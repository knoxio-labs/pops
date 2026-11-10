import { useRef } from 'react';

import { createTripDocumentUploadSession } from '../documents/trip-document-upload-session';
import { uploadSessionKey } from '../documents/upload-context';
import { arrangementDocumentContext } from './document-context';

import type { TripDocumentUploadSession } from '../documents/trip-document-upload-session';
import type { ArrangementTarget, ArrangementsWorkspaceProps } from './types';

type Queue = { key: string; session: TripDocumentUploadSession };

/** Retain the owner's exact target-bound upload queue above conditional source dialogs, without copying its controller or form. */
export function useArrangementDocuments(
  identity: ArrangementsWorkspaceProps
): (target: ArrangementTarget) => TripDocumentUploadSession | undefined {
  const queues = useRef<Queue[]>([]);
  return (target): TripDocumentUploadSession | undefined => {
    const context = arrangementDocumentContext(identity, target);
    if (!context) return undefined;
    const key = uploadSessionKey(
      context.tripId,
      context.target,
      context.tripsClient,
      context.documentsClient
    );
    const retained = queues.current.find(
      (queue) =>
        queue.key === key &&
        queue.session.context.tripsClient === context.tripsClient &&
        queue.session.context.documentsClient === context.documentsClient
    );
    if (retained) return retained.session;
    const session = createTripDocumentUploadSession(context);
    queues.current.push({ key, session });
    return session;
  };
}
