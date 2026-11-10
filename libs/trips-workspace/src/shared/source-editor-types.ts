import type { Dispatch, SetStateAction } from 'react';

/** Failed explicit source action, retained for correction or exact retry. */
export interface FailedSourceChange<Patch> {
  patch: Patch;
  undo: boolean;
  error: unknown;
}

/** Editable source state, retaining drafts while fresh canonical reads arrive. */
export interface SourceState<Source, Patch> {
  saved: Source;
  /** Observed source-field facts, retained separately from confirmed write metadata and user edits. */
  canonical: Patch;
  setCanonical: Dispatch<SetStateAction<Patch>>;
  setSaved: Dispatch<SetStateAction<Source>>;
  draft: Source;
  setDraft: Dispatch<SetStateAction<Source>>;
  history: Source[];
  setHistory: Dispatch<SetStateAction<Source[]>>;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  failure: FailedSourceChange<Patch> | undefined;
  setFailure: Dispatch<SetStateAction<FailedSourceChange<Patch> | undefined>>;
  dirty: boolean;
  conflict: boolean;
  conflicts: (keyof Patch)[];
  setConflicts: Dispatch<SetStateAction<(keyof Patch)[]>>;
  acknowledgeRead: Dispatch<SetStateAction<Source>>;
}

/** Source projection and persistence supplied by the owning domain. */
export interface SourceEditorOptions<Source, Patch> {
  source: (value: Source) => Patch;
  /** The owning producer may reject an older versioned aggregate without discarding its confirmed successor. */
  acceptRead?: (incoming: Source, confirmed: Source) => boolean;
  /** Persist against the captured confirmed source, including inverse and retry operations. */
  save: (patch: Patch, saved: Source) => Promise<Source>;
  onSaved: (value: Source) => void;
}

/** One committed view's permission to dispatch writes or deliver canonical reads. */
export interface SourceEditorView {
  assertCurrent: () => void;
  isCurrent: () => boolean;
}

/** Serialized source editor with retained failures and successful undo snapshots. */
export interface SourceEditor<Source, Patch> {
  draft: Source;
  dirty: boolean;
  saved: Source;
  edit: (patch: Patch) => void;
  commit: (patch: Patch, undo?: boolean) => Promise<void>;
  busy: boolean;
  failure: FailedSourceChange<Patch> | undefined;
  /** An observed canonical update overlapped a pending field; writes require an explicit reset. */
  conflict: boolean;
  /** Discard only conflicted draft fields against canonical values, retaining unrelated edits and retry baselines. */
  reset: () => void;
  canUndo: boolean;
  undo: () => Promise<void> | undefined;
  retry: () => Promise<void> | undefined;
}
