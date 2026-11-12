import { captureDraftCommand, copyCaptureDraft, emptyCaptureDraft } from './draft';
import { CaptureEditorStore } from './editor-store';
import { executeCaptureIntent } from './execute';
import { captureRevisionConflict } from './failure';
import { captureUndoScope } from './result';

import type { CaptureEditor } from './editor-types';
import type {
  CaptureAttachment,
  CaptureCommand,
  CaptureDraft,
  CapturePerformer,
  CaptureSelection,
  CaptureSource,
} from './types';

class SourceCaptureEditor implements CaptureEditor {
  private store: CaptureEditorStore;
  constructor(options: {
    source: CaptureSource;
    tripId: number;
    perform: CapturePerformer;
    newId?: () => string;
  }) {
    this.store = new CaptureEditorStore(
      options.source,
      options.tripId,
      options.perform,
      options.newId ?? (() => crypto.randomUUID())
    );
  }
  getState: CaptureEditor['getState'] = () => this.store.state;
  getPendingRequest: CaptureEditor['getPendingRequest'] = () =>
    this.store.pending === null ? null : structuredClone(this.store.pending.request);
  subscribe: CaptureEditor['subscribe'] = (listener) => this.store.subscribe(listener);
  receive: CaptureEditor['receive'] = (source, generation) =>
    this.store.receive(source, generation);
  beginConflictReload: CaptureEditor['beginConflictReload'] = () =>
    this.store.recovery.beginConflictReload();
  completeConflictReload: CaptureEditor['completeConflictReload'] = (token, source) =>
    this.store.recovery.completeConflictReload(token, source);
  canDiscardRejectedEdit: CaptureEditor['canDiscardRejectedEdit'] = (kind, id) =>
    this.store.recovery.canDiscardRejectedEdit(kind, id);
  discardRejectedEdit: CaptureEditor['discardRejectedEdit'] = (kind, id) =>
    this.store.recovery.discardRejectedEdit(kind, id);
  setPerformer(perform: CapturePerformer): void {
    this.store.perform = perform;
  }
  editDraft(fields: Partial<Omit<CaptureDraft, 'selections'>>): boolean {
    if (this.store.state.composerLocked) return false;
    this.store.publish({
      draft: copyCaptureDraft({ ...this.store.state.draft, ...fields }),
      draftRevision: this.store.state.draftRevision + 1,
      ...(this.store.failureIntent === null ? { failure: null } : {}),
    });
    return true;
  }
  clearDraft(): boolean {
    return this.replaceSelections({
      ...emptyCaptureDraft(),
      explore: this.store.state.draft.explore,
    });
  }
  addSelection(selection: Omit<CaptureSelection, 'id'>): string | undefined {
    if (this.store.state.composerLocked) return undefined;
    const retained = this.store.selections.add({ ...selection, id: this.store.newId() });
    this.replaceSelections({
      ...this.store.state.draft,
      selections: [...this.store.state.draft.selections, retained],
    });
    return retained.id;
  }
  removeSelection(id: string): boolean {
    return this.replaceSelections({
      ...this.store.state.draft,
      selections: this.store.state.draft.selections.filter((selection) => selection.id !== id),
    });
  }
  acceptAttachment(id: string, reference: CaptureAttachment): void {
    this.store.selections.accept(id, reference);
    this.store.publish({ draft: this.store.selections.refresh(this.store.state.draft) });
  }
  capture(): Promise<boolean> {
    if (this.store.state.busy || this.store.pending !== null) return Promise.resolve(false);
    try {
      const draft = this.store.selections.restore(this.store.state.draft);
      const command = captureDraftCommand(draft);
      return executeCaptureIntent(this.store, {
        request: { operationId: this.store.newId(), command },
        label: 'Capture',
        draft,
        draftRevision: this.store.state.draftRevision,
        inverse: null,
      });
    } catch (error) {
      this.store.publish({ failure: { label: 'Capture', error, canRetry: false } });
      return Promise.resolve(false);
    }
  }
  commit(command: CaptureCommand, label: string): Promise<boolean> {
    if (this.store.pending !== null || this.store.recovery.blocksConflictedEdit(command))
      return Promise.resolve(false);
    return executeCaptureIntent(this.store, {
      request: { operationId: this.store.newId(), command: structuredClone(command) },
      label,
      draft: null,
      draftRevision: null,
      inverse: null,
    });
  }
  undo(): Promise<boolean> {
    if (this.store.pending !== null) return Promise.resolve(false);
    const inverse = this.store.history.at(-1);
    if (inverse === undefined) return Promise.resolve(false);
    return executeCaptureIntent(this.store, {
      request: {
        operationId: this.store.newId(),
        command: { kind: 'undo', targetOperationId: inverse.operation.operationId },
        scope: captureUndoScope(inverse.operation.command),
      },
      label: 'Undo',
      draft: null,
      draftRevision: null,
      inverse,
    });
  }
  retry(): Promise<boolean> {
    const intent = this.store.failureIntent;
    return intent === null || captureRevisionConflict(this.store.state.failure?.error, intent)
      ? Promise.resolve(false)
      : executeCaptureIntent(this.store, intent);
  }
  private replaceSelections(draft: CaptureDraft): boolean {
    if (this.store.state.composerLocked) return false;
    this.store.publish({
      draft,
      draftRevision: this.store.state.draftRevision + 1,
      ...(this.store.failureIntent === null ? { failure: null } : {}),
    });
    return true;
  }
}

/** Create a shared session editor with durable owner receipts and exact in-session File restoration. */
export function createCaptureEditor(options: {
  source: CaptureSource;
  tripId: number;
  perform: CapturePerformer;
  newId?: () => string;
}): CaptureEditor {
  return new SourceCaptureEditor(options);
}
