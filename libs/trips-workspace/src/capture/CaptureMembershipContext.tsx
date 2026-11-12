import { useSyncExternalStore } from 'react';

import { Button, ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { CaptureMembershipRemove } from './CaptureMembershipRemove';
import { CaptureOperationProblem } from './CaptureOperationProblem';
import { CaptureSessionBoundary } from './CaptureSessionBoundary';
import { useCaptureEditor } from './use-capture-editor';

import type { JSX } from 'react';

import type { CaptureSessionView } from './CaptureSessionBoundary';
import type { CaptureTimelineSource } from './timeline-filters';
import type { CaptureWorkspaceProps } from './types';

type Props = Pick<CaptureWorkspaceProps, 'tripId' | 'client' | 'contacts'> & {
  source: CaptureTimelineSource;
};

/** Exact-source collection action shares Capture's retained owner, history, lock and immutable retry. */
export function CaptureMembershipContext(props: Props): JSX.Element {
  return (
    <CaptureSessionBoundary {...props}>
      {(view) => <Membership {...props} {...view} />}
    </CaptureSessionBoundary>
  );
}

function Membership({ session, query, scope, ...props }: Props & CaptureSessionView): JSX.Element {
  const state = useCaptureEditor(session, props, query.data, scope.key);
  return (
    <section aria-label="Source collection membership" className="space-y-2">
      {query.isError && (
        <ErrorState error={requestProblem(query.error)} onRetry={() => void query.refetch()} />
      )}
      <CaptureOperationProblem session={session} scope={scope} identity={props} />
      <CaptureMembershipAction session={session} source={props.source} tripId={props.tripId} />
      <Button
        variant="ghost"
        disabled={state.busy || state.undoCount === 0}
        onClick={() => void session.editor.undo()}
      >
        Undo
      </Button>
    </section>
  );
}

/** Share the exact membership action inside an already-mounted owning source editor. */
export function CaptureMembershipAction({
  session,
  source,
  tripId,
}: {
  session: CaptureSessionView['session'];
  source: CaptureTimelineSource;
  tripId: number;
}): JSX.Element | null {
  const state = useSyncExternalStore(
    session.editor.subscribe,
    session.editor.getState,
    session.editor.getState
  );
  const membership = state.source.memberships.find(
    (row) =>
      row.tripId === tripId &&
      row.removedAt === null &&
      row.source.kind === source.kind &&
      row.source.id === source.id
  );
  return membership ? (
    <CaptureMembershipRemove session={session} membership={membership} busy={state.busy} />
  ) : null;
}
