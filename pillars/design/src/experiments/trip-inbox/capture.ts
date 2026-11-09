import {
  addDocumentFiles,
  removeDocumentFile,
  type DocumentLinkingState,
} from '../trip-document-linking/model';
import { captureItem, hasCapture } from '../trip-quick-capture/model';

import type { InboxState } from './types';

function fileSelection(files: File[]): DocumentLinkingState {
  return { documents: [], targets: [], links: [], targetId: '', selectedIds: [], query: '', files };
}

/** Captures verbatim D08 material without requiring classification; stale source identifiers cannot be silently rebound. */
export function captureInboxItem(
  state: InboxState,
  id: string
): { state: InboxState; error: string | null } {
  if (!hasCapture(state.capture.draft))
    return { state, error: 'Add source text, a link or a file.' };
  if (
    !id.trim() ||
    state.capture.items.some((item) => item.id === id) ||
    state.associations.some((entry) => entry.sourceId === id)
  )
    return { state, error: 'Choose a distinct source identifier.' };
  return { state: { ...state, capture: captureItem(state.capture, id) }, error: null };
}

/** Adds actual browser File objects using approved pending-file semantics, without uploading or creating target records. */
export function addInboxFiles(state: InboxState, files: File[]): InboxState {
  const pending = addDocumentFiles(fileSelection(state.capture.draft.files), files);
  return {
    ...state,
    capture: { ...state.capture, draft: { ...state.capture.draft, files: pending.files } },
  };
}

/** Removes one indexed pending file occurrence; captured original file handles remain unchanged. */
export function removeInboxFile(state: InboxState, index: number): InboxState {
  const current = fileSelection(state.capture.draft.files);
  const next = removeDocumentFile(current, index);
  return next === current
    ? state
    : {
        ...state,
        capture: { ...state.capture, draft: { ...state.capture.draft, files: next.files } },
      };
}
