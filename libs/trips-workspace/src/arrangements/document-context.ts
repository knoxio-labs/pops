import type { TripDocumentUploadContext } from '../documents/trip-document-upload-session';
import type { ArrangementTarget, ArrangementsWorkspaceProps } from './types';

/** Derive only published document targets from the current host's actual trip and owner connections. */
export function arrangementDocumentContext(
  identity: ArrangementsWorkspaceProps,
  target: ArrangementTarget
): TripDocumentUploadContext | undefined {
  if (target.targetKind === 'rental') return undefined;
  return {
    tripId: identity.tripId,
    target: { kind: target.targetKind, id: target.targetId },
    tripsClient: identity.client,
    documentsClient: identity.documentsClient,
  };
}
