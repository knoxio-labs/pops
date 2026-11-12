import { useSyncExternalStore } from 'react';

import { Button, ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';

/** Present the retained operation failure and its original request retry. */
export function CaptureOperationProblem({
  session,
}: {
  session: CaptureBrowserSession;
}): JSX.Element | null {
  const editor = session.editor;
  const state = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  return state.failure ? (
    <section aria-label={`${state.failure.label} failed`} className="space-y-2">
      <ErrorState error={requestProblem(state.failure.error)} />
      {state.failure.canRetry ? (
        <Button variant="outline" disabled={state.busy} onClick={() => void editor.retry()}>
          Retry {state.failure.label}
        </Button>
      ) : null}
    </section>
  ) : null;
}
