import { useState } from 'react';

import { uploadSessionKey } from '../documents/upload-context';

import type { TripDocumentUploadSession } from '../documents/trip-document-upload-session';
import type { ArrangementTarget, ArrangementsWorkspaceProps } from './types';
import type { useArrangementDocuments } from './use-arrangement-documents';

type Selection = { target: ArrangementTarget; documents?: TripDocumentUploadSession };
type ActiveSource = {
  selection?: Selection;
  generation: number;
  scope: string;
  client: ArrangementsWorkspaceProps['client'];
  documentsClient: ArrangementsWorkspaceProps['documentsClient'];
};

/** Close active selection on host-context changes; the parent's exact owner queues remain available for explicit reopening. */
export function useArrangementSource(
  identity: ArrangementsWorkspaceProps,
  documents: ReturnType<typeof useArrangementDocuments>
): {
  selection: Selection | undefined;
  open: (target: ArrangementTarget) => void;
  close: () => void;
} {
  const scope = sourceScope(identity);
  const [active, setActive] = useState<ActiveSource>({
    scope,
    generation: 0,
    client: identity.client,
    documentsClient: identity.documentsClient,
  });
  const current =
    active.scope === scope &&
    active.client === identity.client &&
    active.documentsClient === identity.documentsClient
      ? active
      : {
          scope,
          generation: active.generation + 1,
          client: identity.client,
          documentsClient: identity.documentsClient,
        };
  if (active !== current) setActive(current);
  return {
    selection: current.selection,
    open: (target): void => {
      if (sourceScope(identity) !== current.scope) return;
      const selection = { target, documents: documents(target) };
      setActive((latest) =>
        latest.generation === current.generation
          ? { ...latest, generation: latest.generation + 1, selection }
          : latest
      );
    },
    close: (): void =>
      setActive((latest) =>
        latest.generation === current.generation
          ? { ...latest, generation: latest.generation + 1, selection: undefined }
          : latest
      ),
  };
}
function sourceScope(identity: ArrangementsWorkspaceProps): string {
  return uploadSessionKey(
    identity.tripId,
    { kind: 'trip', id: identity.tripId },
    identity.client,
    identity.documentsClient
  );
}
