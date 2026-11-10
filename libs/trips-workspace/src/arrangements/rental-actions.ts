import type { SourceSessionView } from '../shared/retained-session-store';
import type { SourceEditor } from '../shared/source-editor-types';
import type { RentalEditSession, RentalFields } from './RentalSession';
import type { Rental, RentalPatch } from './types';

/** One mounted Rental view's guarded commands; the shared session owns their retained state. */
export interface RentalViewActions {
  setDraft: (draft: RentalFields) => void;
  run: (body: RentalPatch) => Promise<void>;
  retry: () => Promise<void>;
  undo: () => Promise<void>;
  discard: (source: Rental) => void;
}

interface ActionContext {
  source: Rental;
  session: RentalEditSession;
  view: SourceSessionView;
  editor: SourceEditor<Rental, RentalFields>;
  saved: (rental: Rental) => void;
}
/** Bind the canonical shared commands to one Rental view; late receipts never invoke a replaced view's callback. */
export function rentalActions({
  source,
  session,
  view,
  editor,
  saved,
}: ActionContext): RentalViewActions {
  async function complete(action: () => Promise<void> | undefined): Promise<void> {
    if (!view.isCurrent() || session.context.lock) return;
    const before = session.receipt();
    await action();
    const state = session.getState();
    const receipt = session.receipt();
    if (
      view.isCurrent() &&
      !state.busy &&
      !state.failure &&
      receipt !== undefined &&
      receipt !== before
    )
      saved({ ...receipt });
  }
  return {
    setDraft: (draft) => {
      if (view.isCurrent()) editor.edit({ ...draft });
    },
    run: (body: RentalPatch) =>
      complete(() => {
        if (editor.failure) return editor.retry();
        const { expectedRevision, ...patch } = body;
        if (expectedRevision !== editor.saved.revision || source.revision > editor.saved.revision)
          return;
        return editor.commit(patch);
      }),
    retry: () => complete(editor.retry),
    undo: () => complete(editor.undo),
    discard: (current) => {
      if (view.isCurrent()) session.discard(current);
    },
  };
}
