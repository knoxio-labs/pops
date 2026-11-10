import { TripDocumentLinks } from '../documents/TripDocumentLinks';
import { TripDocumentUpload } from '../documents/TripDocumentUpload';

import type { JSX } from 'react';

import type { TripDocumentUploadSession } from '../documents/trip-document-upload-session';

/** Embed only the owning target's canonical document controls and retained upload queue. */
export function ArrangementDocuments({
  session,
}: {
  session: TripDocumentUploadSession;
}): JSX.Element {
  return (
    <section className="min-w-0 space-y-4 border-t border-border pt-4">
      <TripDocumentLinks {...session.context} />
      <TripDocumentUpload {...session.context} session={session} />
    </section>
  );
}
