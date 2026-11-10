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
/** Observable editor state; drafts remain in their fields while canonical source is guarded. */
export interface DecisionEditorState {
  source: DecisionSource;
  busy: boolean;
  dirty: boolean;
  conflict: boolean;
  undoCount: number;
  failures: DecisionFailure[];
}
/** Transport seam invoked once with the exact source revision being changed. */
export type DecisionPerformer = (
  source: DecisionSource,
  command: UndoCommand
) => Promise<AppliedDecisionChange>;
/** Serialized source editor; canonical reads never lend another writer's revision to Undo. */
export interface DecisionEditor {
  setPerformer: (perform: DecisionPerformer) => void;
  getState: () => DecisionEditorState;
  subscribe: (listener: () => void) => () => void;
  commit: (command: DecisionCommand, label: string) => Promise<boolean>;
  undo: () => Promise<boolean>;
  retry: (failure: DecisionFailure) => Promise<boolean>;
  receive: (source: DecisionSource) => void;
  reload: (source: DecisionSource) => void;
  setDirty: (key: string, dirty: boolean) => void;
}
