import { useQueryClient } from '@tanstack/react-query';

import { useUploadJournal } from '../documents/DocumentUploadProvider';
import { TripDocumentLinks } from '../documents/TripDocumentLinks';
import { TripDocumentUpload } from '../documents/TripDocumentUpload';
import { sourceUploadSession } from './source-upload-sessions';

import type { JSX } from 'react';

import type { DocumentAssociationTarget, TripDocumentsWorkspaceProps } from '../documents/types';

/** Embed real owner files for one persisted source without joining its editor's save or Undo state. */
export function SourceDocuments(
  props: Omit<TripDocumentsWorkspaceProps, 'target'> & { target: DocumentAssociationTarget }
): JSX.Element {
  const persistence = useUploadJournal(props.target);
  const session = sourceUploadSession(useQueryClient(), props, persistence.journal?.bindingKey());
  return (
    <section aria-label="Source documents" className="space-y-4">
      <TripDocumentUpload {...props} session={session} />
      <TripDocumentLinks {...props} />
    </section>
  );
}
