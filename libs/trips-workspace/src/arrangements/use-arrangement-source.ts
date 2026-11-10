import { useState } from 'react';

import { useArrangementDocuments } from './use-arrangement-documents';

import type { TripDocumentUploadSession } from '../documents/trip-document-upload-session';
import type { ArrangementTarget, ArrangementsWorkspaceProps } from './types';

type Selection = { target: ArrangementTarget; documents?: TripDocumentUploadSession };

/** Exact source selection and owner upload queues outlive each conditional source editor. */
export function useArrangementSource(identity: ArrangementsWorkspaceProps): {
  selection: Selection | undefined;
  open: (target: ArrangementTarget) => void;
  close: () => void;
} {
  const [selection, setSelection] = useState<Selection>();
  const documents = useArrangementDocuments(identity);
  return {
    selection,
    open: (target): void => setSelection({ target, documents: documents(target) }),
    close: (): void => setSelection(undefined),
  };
}
