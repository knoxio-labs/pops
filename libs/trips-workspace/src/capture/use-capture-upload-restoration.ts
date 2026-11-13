import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { UploadJournal } from '../documents/durable-upload-journal';
import type { CaptureBrowserSession } from './browser-session';
import type { CaptureEditorState } from './editor-types';

/** Observe the retained composer's own restore result and retry journal admission when its edit lock changes. */
export function useCaptureUploadRestoration(
  session: CaptureBrowserSession,
  journal: UploadJournal | null,
  state: CaptureEditorState
): string | null {
  const binding = journal?.bindingKey() ?? null;
  const read = useCallback(() => session.uploadRestoration.readFor(binding), [session, binding]);
  const snapshot = useSyncExternalStore(session.subscribe, read, read);
  const attempt = useMemo(
    () => ({ journal, busy: state.busy, locked: state.composerLocked }),
    [journal, state.busy, state.composerLocked]
  );
  useEffect(() => {
    if (attempt.journal === null) return;
    try {
      session.restoreUploads(attempt.journal);
    } catch {
      return;
    }
  }, [session, attempt]);
  return snapshot.error;
}
