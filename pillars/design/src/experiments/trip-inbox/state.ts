import { useCallback, useState } from 'react';

import { createInboxState } from './fixture';
import {
  captureInboxHistory,
  changeInboxHistory,
  createInboxHistory,
  undoInboxHistory,
  updateInboxDraft,
} from './history';

import type { InboxHistory } from './history';
import type { CaptureDraft, InboxScenario, InboxState } from './model';

type InboxSession = { history: InboxHistory; error: string | null };

/** Keep typed capture and organisation history while protecting a material in-progress composer draft. */
export function useInboxState(scenario: InboxScenario) {
  const [session, setSession] = useState<InboxSession>(() => ({
    history: createInboxHistory(createInboxState(scenario)),
    error: null,
  }));
  const change = useCallback((next: InboxState) => {
    setSession((previous) => ({
      history: changeInboxHistory(previous.history, next),
      error: null,
    }));
  }, []);
  const changeDraft = useCallback((draft: CaptureDraft) => {
    setSession((previous) => ({ history: updateInboxDraft(previous.history, draft), error: null }));
  }, []);
  const capture = useCallback(() => {
    const id = crypto.randomUUID();
    setSession((previous) => captureInboxHistory(previous.history, id));
  }, []);
  const undo = useCallback(() => {
    setSession((previous) => undoInboxHistory(previous.history));
  }, []);
  return {
    state: session.history.state,
    error: session.error,
    canUndo: session.history.entries.length > 0,
    change,
    changeDraft,
    capture,
    undo,
  };
}
