import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { UploadJournal } from './durable-upload-journal';
import type { TripDocumentUploadSession } from './trip-document-upload-session';
import type { UploadRestorationSnapshot } from './upload-restoration';

/** Observe this queue's own exact-journal outcome while restoring actual retained entries on every admission. */
export function useTripUploadRestoration(
  session: TripDocumentUploadSession,
  journal: UploadJournal | null
): UploadRestorationSnapshot {
  const binding = journal?.bindingKey() ?? null;
  const read = useCallback(() => session.uploadRestoration.readFor(binding), [session, binding]);
  const snapshot = useSyncExternalStore(session.subscribe, read, read);
  useEffect(() => {
    if (journal === null) return;
    try {
      session.restore(journal);
    } catch {
      return;
    }
  }, [session, journal]);
  return snapshot;
}
