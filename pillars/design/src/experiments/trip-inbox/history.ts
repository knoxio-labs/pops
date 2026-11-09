import { hasCapture, type CaptureDraft } from '../trip-quick-capture/model';
import { captureInboxItem } from './capture';

import type { InboxState } from './types';

/** Capture entries retain a verbatim draft separately from ordinary organisation snapshots. */
export type InboxHistoryEntry =
  | { readonly kind: 'capture'; readonly before: InboxState; readonly draft: CaptureDraft }
  | { readonly kind: 'organisation'; readonly before: InboxState };

/** Local immutable history; composer edits do not create organisation entries or discard source snapshots. */
export interface InboxHistory {
  readonly state: InboxState;
  readonly entries: readonly InboxHistoryEntry[];
}

/** Starts a local history around the existing source state without copying browser File objects. */
export function createInboxHistory(state: InboxState): InboxHistory {
  return { state, entries: [] };
}

/** Updates only the current composer draft; changes do not consume or add undo entries. */
export function updateInboxDraft(history: InboxHistory, draft: CaptureDraft): InboxHistory {
  return draft === history.state.capture.draft
    ? history
    : {
        ...history,
        state: { ...history.state, capture: { ...history.state.capture, draft } },
      };
}

/** Records an actual organisation mutation; unchanged model results leave history untouched. */
export function changeInboxHistory(history: InboxHistory, nextState: InboxState): InboxHistory {
  return nextState === history.state
    ? history
    : {
        state: nextState,
        entries: [...history.entries, { kind: 'organisation', before: history.state }],
      };
}

/** Captures through D08 semantics and saves the original draft, including actual File handles, for a safe undo. */
export function captureInboxHistory(
  history: InboxHistory,
  id: string
): { history: InboxHistory; error: string | null } {
  const result = captureInboxItem(history.state, id);
  if (result.error || result.state === history.state) return { history, error: result.error };
  const draft = history.state.capture.draft;
  return {
    history: {
      state: result.state,
      entries: [
        ...history.entries,
        { kind: 'capture', before: history.state, draft: { ...draft, files: [...draft.files] } },
      ],
    },
    error: null,
  };
}

/** Undoes one mutation; capture restores its source draft only when the current composer has no material to overwrite. */
export function undoInboxHistory(history: InboxHistory): {
  history: InboxHistory;
  error: string | null;
} {
  const entry = history.entries.at(-1);
  if (!entry) return { history, error: null };
  if (entry.kind === 'capture' && hasCapture(history.state.capture.draft))
    return { history, error: 'Finish or clear the current draft before undoing capture.' };
  const draft =
    entry.kind === 'capture'
      ? { ...entry.draft, files: [...entry.draft.files] }
      : history.state.capture.draft;
  return {
    history: {
      state: { ...entry.before, capture: { ...entry.before.capture, draft } },
      entries: history.entries.slice(0, -1),
    },
    error: null,
  };
}
