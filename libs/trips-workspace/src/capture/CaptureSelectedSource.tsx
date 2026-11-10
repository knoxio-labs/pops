import { CaptureInboxRow, useInboxContactReads } from './CaptureInbox';
import { IdeaFields } from './IdeaFields';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { CaptureSourceSelection, CaptureWorkspaceProps } from './types';
import type { CaptureContext } from './use-capture-context';

/** Open an exact current source through its existing editor without creating membership or another draft owner. */
export function CaptureSelectedSource({
  selected,
  session,
  context,
  tripId,
  documentsClient,
}: {
  selected: CaptureSourceSelection;
  session: CaptureBrowserSession;
  context: CaptureContext;
  tripId: number;
  documentsClient?: CaptureWorkspaceProps['documentsClient'];
}): JSX.Element {
  const { source, busy } = session.editor.getState();
  useInboxContactReads(session, source);
  const capture =
    selected.kind === 'capture' &&
    source.captures.find(
      (row) => row.id === selected.id && row.tripId === tripId && row.removedAt === null
    );
  if (capture)
    return (
      <CaptureInboxRow
        capture={capture}
        source={source}
        session={session}
        busy={busy}
        documentsClient={documentsClient}
        expanded
      />
    );
  const idea =
    selected.kind === 'idea' &&
    source.ideas.find(
      (row) => row.id === selected.id && row.tripId === tripId && row.removedAt === null
    );
  return idea ? (
    <article aria-label={`Idea ${idea.id}`}>
      <IdeaFields session={session} row={idea} busy={busy} context={context} expanded />
    </article>
  ) : (
    <p role="status">
      The selected {selected.kind} {selected.id} is unavailable.
    </p>
  );
}
