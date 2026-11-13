import { useSyncExternalStore } from 'react';

import { Button, ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { useConflictReload } from './use-conflict-reload';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { CaptureIdentity } from './types';
import type { CaptureWorkspaceReadScope } from './workspace-read';

/** Resolve a definite revision conflict by reading its original owner; only explicit row discard drops edits. */
export function CaptureOperationProblem({
  session,
  scope,
  identity,
}: {
  session: CaptureBrowserSession;
  scope: CaptureWorkspaceReadScope;
  identity: CaptureIdentity;
}): JSX.Element | null {
  const editor = session.editor;
  const state = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const read = useConflictReload({ session, scope, identity, failure: state.failure });
  if (state.failure === null) return null;
  return (
    <section aria-label={`${state.failure.label} failed`} className="space-y-2">
      <ErrorState error={requestProblem(read.error)} />
      {state.failure.canRetry && (
        <Button variant="outline" disabled={state.busy} onClick={() => void editor.retry()}>
          Retry {state.failure.label}
        </Button>
      )}
      {!state.failure.canRetry && state.failure.reloadSource && (
        <Button
          variant="outline"
          disabled={state.busy || read.loading}
          onClick={() => void read.reload()}
        >
          Reload source
        </Button>
      )}
    </section>
  );
}
