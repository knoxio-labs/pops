import { TripDocumentLinks } from '../documents/TripDocumentLinks';
import { TripDocumentUpload } from '../documents/TripDocumentUpload';

import type { JSX } from 'react';

import type { DocumentAssociationTarget, TripDocumentsWorkspaceProps } from '../documents/types';

/** Embed real owner files for one persisted source without joining its editor's save or Undo state. */
export function SourceDocuments(
  props: Omit<TripDocumentsWorkspaceProps, 'target'> & { target: DocumentAssociationTarget }
): JSX.Element {
  return (
    <section aria-label="Source documents" className="space-y-4">
      <TripDocumentUpload {...props} />
      <TripDocumentLinks {...props} />
    </section>
  );
}
