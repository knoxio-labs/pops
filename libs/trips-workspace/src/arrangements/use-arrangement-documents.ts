import { useQueryClient } from '@tanstack/react-query';

import { sourceUploadSession } from '../shared/source-upload-sessions';
import { arrangementDocumentContext } from './document-context';

import type { TripDocumentUploadSession } from '../documents/trip-document-upload-session';
import type { ArrangementTarget, ArrangementsWorkspaceProps } from './types';

/** Resolve the same owner queue as the canonical source editor; query eviction and dialog unmount preserve its exact context and receipts. */
export function useArrangementDocuments(
  identity: ArrangementsWorkspaceProps
): (target: ArrangementTarget) => TripDocumentUploadSession | undefined {
  const queryClient = useQueryClient();
  return (target): TripDocumentUploadSession | undefined => {
    const context = arrangementDocumentContext(identity, target);
    if (!context) return undefined;
    return sourceUploadSession(queryClient, context);
  };
}
