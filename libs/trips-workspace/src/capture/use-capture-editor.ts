import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import { performCaptureRequest } from './api';

import type { CaptureBrowserSession } from './browser-session';
import type { CaptureEditorState } from './editor-types';
import type { CaptureIdentity, CaptureSource } from './types';

/** Bind the host transport and refresh only the immutable originating cache scope after confirmed mutations. */
export function useCaptureEditor(
  session: CaptureBrowserSession,
  { client, tripId }: CaptureIdentity,
  read: { source: CaptureSource; generation: number } | undefined,
  ownerKey: readonly ['trips', string, number, 'capture_workspace']
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
    if (state.generation > 0) void cache.invalidateQueries({ queryKey: ownerKey.slice(0, 3) });
  }, [cache, ownerKey, state.generation]);
  return state;
}
