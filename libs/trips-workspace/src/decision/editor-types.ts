import type { AppliedDecisionChange, DecisionCommand, DecisionSource, UndoCommand } from './types';

/** Retained failed intent; retries keep the original precondition and never rebase an inverse. */
export interface DecisionFailure {
  key: string;
  label: string;
  error: unknown;
  command: UndoCommand;
  expectedRevision: number;
  undo: boolean;
}
/** Observable source state and semantic string drafts retained independently of mounted fields. */
export interface DecisionEditorState {
  source: DecisionSource;
  busy: boolean;
  dirty: boolean;
  conflict: boolean;
  undoCount: number;
  failures: DecisionFailure[];
  drafts: Readonly<Record<string, string>>;
}
/** Execute at the exact source revision; recheck the action guard after preparation and before dispatch. */
export type DecisionPerformer = (
  source: DecisionSource,
  command: UndoCommand,
  assertCurrent?: () => void
) => Promise<AppliedDecisionChange>;
/** Serialized source editor; action guards belong to each invocation and never rebind retained mutation proof. */
export interface DecisionEditor {
  getState: () => DecisionEditorState;
  subscribe: (listener: () => void) => () => void;
  commit: (command: DecisionCommand, label: string, assertCurrent?: () => void) => Promise<boolean>;
  undo: (assertCurrent?: () => void) => Promise<boolean>;
  retry: (failure: DecisionFailure, assertCurrent?: () => void) => Promise<boolean>;
  receive: (source: DecisionSource) => void;
  reload: (source: DecisionSource) => void;
  setDirty: (key: string, dirty: boolean) => void;
  setDraft: (key: string, value: string | undefined) => void;
}
