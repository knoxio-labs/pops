import { copyCaptureDraft, copyCaptureSelection } from './draft';

import type { CaptureAttachment, CaptureDraft, CaptureSelection } from './types';

function sameAttachment(first: CaptureAttachment, second: CaptureAttachment): boolean {
  if (first.kind === 'task') return second.kind === 'task' && first.taskId === second.taskId;
  return (
    second.kind === 'document' &&
    first.documentId === second.documentId &&
    first.taskId === second.taskId
  );
}
/** Retain exact File handles and accepted owner provenance through composer clears, remounts and recapture. */
export class CaptureSelectionStore {
  private selections = new Map<string, CaptureSelection>();
  /** Register an independently selected original without copying its bytes. */
  add(selection: CaptureSelection): CaptureSelection {
    const retained = copyCaptureSelection(selection);
    this.selections.set(selection.id, retained);
    return retained;
  }
  /** Append an accepted owner reference without collapsing distinct selections. */
  accept(id: string, reference: CaptureAttachment): void {
    const selection = this.selections.get(id);
    if (!selection || selection.references.some((existing) => sameAttachment(existing, reference)))
      return;
    this.selections.set(id, {
      ...selection,
      references: [...selection.references, { ...reference }],
    });
  }
  /** Recover current accepted provenance alongside the submitted File handles. */
  restore(draft: CaptureDraft): CaptureDraft {
    const restored = copyCaptureDraft(draft);
    return {
      ...restored,
      selections: restored.selections.map((selection) =>
        copyCaptureSelection(this.selections.get(selection.id) ?? selection)
      ),
    };
  }
  /** Refresh owner metadata without changing user-authored draft fields. */
  refresh(draft: CaptureDraft): CaptureDraft {
    return {
      ...draft,
      selections: draft.selections.map(
        (selection) => this.selections.get(selection.id) ?? selection
      ),
    };
  }
}
