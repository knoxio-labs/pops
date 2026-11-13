import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { CaptureFailure } from './editor-types';
import type { CaptureIdentity } from './types';
import type { CaptureWorkspaceReadScope } from './workspace-read';

type ReloadView = { session: CaptureBrowserSession; scope: CaptureWorkspaceReadScope };
interface ReloadOptions extends ReloadView {
  identity: CaptureIdentity;
  failure: CaptureFailure | null;
}
interface ReloadState {
  loading: boolean;
  error: unknown;
  reload: () => Promise<void>;
}

function sameView(
  view: ReloadView | null,
  session: CaptureBrowserSession,
  scope: CaptureWorkspaceReadScope
): boolean {
  return view !== null && view.session === session && view.scope === scope;
}

/** Explicit owner-fenced conflict reads are canceled with their view and cannot admit stale or foreign results. */
export function useConflictReload({
  session,
  scope,
  identity,
  failure,
}: ReloadOptions): ReloadState {
  const cache = useQueryClient();
  const active = useRef<ReloadView | null>(null);
  const inflight = useRef<{ view: ReloadView; controller: AbortController } | null>(null);
  const [pending, setPending] = useState<ReloadView | null>(null);
  const [readError, setReadError] = useState<{
    view: ReloadView;
    failure: CaptureFailure | null;
    error: unknown;
  } | null>(null);
  useEffect(() => {
    const view = { session, scope };
    active.current = view;
    return () => {
      if (active.current === view) active.current = null;
      if (inflight.current?.view === view) {
        inflight.current.controller.abort();
        inflight.current = null;
      }
    };
  }, [session, scope]);
  const reload = async (): Promise<void> => {
    const view = active.current;
    if (view === null || inflight.current !== null) return;
    const token = view.session.editor.beginConflictReload();
    if (token === null) return;
    const attempt = { view, controller: new AbortController() };
    const current = (): boolean => active.current === view && !attempt.controller.signal.aborted;
    inflight.current = attempt;
    setPending(view);
    setReadError(null);
    try {
      const read = await view.scope.load(cache, identity, attempt.controller.signal);
      if (!current() || read.generation !== token.generation) return;
      view.scope.owner.assert(identity);
      if (view.session.editor.completeConflictReload(token, read.source))
        cache.setQueryData(view.scope.key, read);
    } catch (error) {
      if (current()) setReadError({ view, failure, error });
    } finally {
      if (inflight.current === attempt) inflight.current = null;
      if (active.current === view) setPending(null);
    }
  };
  return {
    loading: sameView(pending, session, scope),
    error:
      readError !== null &&
      sameView(readError.view, session, scope) &&
      readError.failure === failure
        ? readError.error
        : failure?.error,
    reload,
  };
}
