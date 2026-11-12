import { Button } from '@pops/ui';

import { CaptureAttachments } from './CaptureAttachments';
import { CaptureFields } from './CaptureFields';
import { CaptureMembershipRemove } from './CaptureMembershipRemove';
import { IdeaFields } from './IdeaFields';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { ExploreRow } from './explore-model';
import type { CaptureWorkspaceProps } from './types';
import type { CaptureContext } from './use-capture-context';

type Props = {
  row: ExploreRow;
  session: CaptureBrowserSession;
  busy: boolean;
  context: CaptureContext;
  onViewEvent?: (id: number) => void;
  documentsClient?: CaptureWorkspaceProps['documentsClient'];
};

/** Open the recorded source itself; collection removal changes only this revisioned membership. */
export function ExploreSourceRow(props: Props): JSX.Element {
  const { row, session, busy } = props;
  return (
    <article
      className="space-y-2 rounded-lg border border-border p-4"
      aria-label={`${row.source.kind} ${row.source.id}`}
    >
      <h3 className="font-medium">{row.label ?? `${row.source.kind} ${row.source.id}`}</h3>
      {row.text !== null ? <p className="whitespace-pre-wrap break-words">{row.text}</p> : null}
      {row.unavailable ? (
        <p role="status">The recorded source is unavailable.</p>
      ) : (
        <SourceEditor {...props} />
      )}
      <CaptureMembershipRemove
        membership={{ id: row.membershipId, revision: row.membershipRevision }}
        session={session}
        busy={busy}
      />
    </article>
  );
}
function SourceEditor({
  row,
  session,
  busy,
  context,
  onViewEvent,
  documentsClient,
}: Props): JSX.Element | null {
  const source = session.editor.getState().source;
  if (row.source.kind === 'idea') {
    const idea = source.ideas.find((candidate) => candidate.id === row.source.id);
    return idea ? <IdeaFields session={session} row={idea} busy={busy} context={context} /> : null;
  }
  if (row.source.kind === 'capture') {
    const capture = source.captures.find((candidate) => candidate.id === row.source.id);
    return capture ? (
      <>
        <CaptureAttachments
          capture={capture}
          editor={session.editor}
          busy={busy}
          documentsClient={documentsClient}
        />
        <CaptureFields session={session} capture={capture} busy={busy} />
      </>
    ) : null;
  }
  return onViewEvent ? (
    <Button variant="outline" onClick={() => onViewEvent(row.source.id)}>
      Open Event {row.source.id}
    </Button>
  ) : null;
}
