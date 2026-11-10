import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import { captureQueryKey, performCaptureRequest } from './api';

import type { CaptureBrowserSession } from './browser-session';
import type { CaptureEditorState } from './editor-types';
import type { CaptureIdentity, CaptureSource } from './types';

/** Bind the retained session to the host transport and refresh owner caches only after confirmed mutations. */
export function useCaptureEditor(
  session: CaptureBrowserSession,
  { client, tripId }: CaptureIdentity,
  read: { source: CaptureSource; generation: number } | undefined
): CaptureEditorState {
  const cache = useQueryClient();
  const editor = session.editor;
  const state = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  useEffect(() => {
    session.bindPerformer({ client, tripId }, (request) =>
      performCaptureRequest({ client, tripId }, request)
    );
  }, [session, client, tripId]);
  useEffect(() => {
    if (read) editor.receive(read.source, read.generation);
  }, [editor, read]);
  useEffect(() => {
    if (state.generation > 0)
      void cache.invalidateQueries({ queryKey: captureQueryKey({ client, tripId }).slice(0, 3) });
  }, [cache, client, tripId, state.generation]);
  return state;
}
