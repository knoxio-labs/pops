import { useState } from 'react';

import { uploadSessionKey } from '../documents/upload-context';

import type { TripDocumentUploadSession } from '../documents/trip-document-upload-session';
import type { ArrangementTarget, ArrangementsWorkspaceProps } from './types';
import type { useArrangementDocuments } from './use-arrangement-documents';

type Selection = { target: ArrangementTarget; documents?: TripDocumentUploadSession };
type ActiveSource = {
  selection: Selection;
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
  const [active, setActive] = useState<ActiveSource>();
  const scope = uploadSessionKey(
    identity.tripId,
    { kind: 'trip', id: identity.tripId },
    identity.client,
    identity.documentsClient
  );
  const current =
    active?.scope === scope &&
    active.client === identity.client &&
    active.documentsClient === identity.documentsClient
      ? active.selection
      : undefined;
  if (active && !current) setActive(undefined);
  return {
    selection: current,
    open: (target): void =>
      setActive({
        scope,
        client: identity.client,
        documentsClient: identity.documentsClient,
        selection: { target, documents: documents(target) },
      }),
    close: (): void => setActive(undefined),
  };
}
