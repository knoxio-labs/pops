import { TripDocumentLinks } from '../documents/TripDocumentLinks';
import { TripDocumentUpload } from '../documents/TripDocumentUpload';
import { arrangementDocumentContext } from './document-context';

import type { JSX } from 'react';

import type { TripDocumentUploadSession } from '../documents/trip-document-upload-session';
import type { ArrangementTarget, ArrangementsWorkspaceProps } from './types';

/** Embed only the owning target's canonical document controls and retained upload queue. */
export function ArrangementDocuments({
  session,
  identity,
  target,
}: {
  session: TripDocumentUploadSession;
  identity: ArrangementsWorkspaceProps;
  target: ArrangementTarget;
}): JSX.Element {
  const context = arrangementDocumentContext(identity, target);
  if (!context) throw new Error('This source has no document association target');
  session.assertContext(context);
  return (
    <section className="min-w-0 space-y-4 border-t border-border pt-4">
      <TripDocumentLinks {...context} />
      <TripDocumentUpload {...context} session={session} />
    </section>
  );
}
