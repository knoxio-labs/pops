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
/** Serialized source operations with original draft recovery and exact request replay. */
export interface CaptureEditor {
  getState: () => CaptureEditorState;
  /** Copy the request currently reserved for execution or exact replay; callers cannot mutate its retained payload. */
  getPendingRequest: () => CaptureRequest | null;
  subscribe: (listener: () => void) => () => void;
  receive: (source: CaptureSource, readGeneration: number) => void;
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
