import type {
  CaptureDraft,
  CaptureSource,
  CaptureOperation,
  CaptureRequest,
  CaptureResult,
  CaptureCommand,
  CapturePerformer,
  CaptureAttachment,
  CaptureSelection,
} from './types';

/** Confirmed owner operation and exact submitted draft retained for guarded in-session Undo. */
export interface CaptureHistory {
  operation: CaptureOperation;
  receipt: CaptureResult['receipt'];
  draft: CaptureDraft | null;
}
/** Retained immutable request; an ambiguous retry never allocates another operation UUID. */
export interface CaptureIntent {
  request: CaptureRequest;
  label: string;
  draft: CaptureDraft | null;
  draftRevision: number | null;
  inverse: CaptureHistory | null;
}
/** Safe error display metadata; the raw request and File handles are never diagnostic output. */
export interface CaptureFailure {
  error: unknown;
  label: string;
  canRetry: boolean;
  reloadSource?: boolean;
}
/** Observable shared state for Capture, Inbox and Explore, with session-only composer material. */
export interface CaptureEditorState {
  source: CaptureSource;
  draft: CaptureDraft;
  draftRevision: number;
  generation: number;
  busy: boolean;
  composerLocked: boolean;
  undoCount: number;
  failure: CaptureFailure | null;
  confirmation: { request: CaptureRequest; result: CaptureResult } | null;
}
/** One explicit conflict reload, bound to the rejected operation and mutation generation. */
export interface CaptureConflictReload {
  readonly operationId: string;
  readonly generation: number;
  readonly readId: number;
  readonly sourceVersion: number;
}
/** Serialized source operations with original draft recovery and exact request replay. */
export interface CaptureEditor {
  getState: () => CaptureEditorState;
  /** Copy the request currently reserved for execution or exact replay; callers cannot mutate its retained payload. */
  getPendingRequest: () => CaptureRequest | null;
  subscribe: (listener: () => void) => () => void;
  receive: (source: CaptureSource, readGeneration: number) => void;
  /** Begin a fresh read only for a definitely rejected row revision conflict. */
  beginConflictReload: () => CaptureConflictReload | null;
  /** Admit a successful owner-fenced fresh read without rebasing or discarding retained fields. */
  completeConflictReload: (token: CaptureConflictReload, source: CaptureSource) => boolean;
  /** Whether this row can be explicitly discarded without losing an unknown request or unreconciled conflict. */
  canDiscardRejectedEdit: (kind: 'capture' | 'idea', id: number) => boolean;
  /** Clear only a matching definite failure after its fresh read; unknown row writes remain retained. */
  discardRejectedEdit: (kind: 'capture' | 'idea', id: number) => boolean;
  setPerformer: (perform: CapturePerformer) => void;
  editDraft: (fields: Partial<Omit<CaptureDraft, 'selections'>>) => boolean;
  clearDraft: () => boolean;
  addSelection: (selection: Omit<CaptureSelection, 'id'>) => string | undefined;
  removeSelection: (id: string) => boolean;
  acceptAttachment: (id: string, reference: CaptureAttachment) => void;
  capture: () => Promise<boolean>;
  commit: (command: CaptureCommand, label: string) => Promise<boolean>;
  undo: () => Promise<boolean>;
  retry: () => Promise<boolean>;
}
