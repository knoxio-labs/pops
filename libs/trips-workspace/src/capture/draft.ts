import { ApiError } from '@pops/pillar-sdk/client';

import type { CaptureDraft, CaptureCommand, CaptureSelection } from './types';

/** Start with no inferred kind, location, URL or organisation target. */
export function emptyCaptureDraft(): CaptureDraft {
  return {
    originalText: '',
    originalUrl: '',
    classification: null,
    placeId: null,
    visitId: null,
    selections: [],
    target: undefined,
    explore: false,
  };
}
/** Any entered source or optional selection prevents capture Undo from overwriting the composer. */
export function captureDraftHasMaterial(draft: CaptureDraft): boolean {
  return (
    draft.originalText.length > 0 ||
    draft.originalUrl.length > 0 ||
    draft.selections.length > 0 ||
    draft.classification !== null ||
    draft.placeId !== null ||
    draft.visitId !== null ||
    draft.target !== undefined
  );
}
/** Clone session fields while retaining the exact original File handles. */
export function copyCaptureDraft(draft: CaptureDraft): CaptureDraft {
  return {
    ...draft,
    target: draft.target === undefined ? undefined : structuredClone(draft.target),
    selections: draft.selections.map(copyCaptureSelection),
  };
}
/** Snapshot accepted owner references independently of a File's session identity. */
export function copyCaptureSelection(selection: CaptureSelection): CaptureSelection {
  return { ...selection, references: selection.references.map((reference) => ({ ...reference })) };
}
/** Freeze source capture intent only after every explicitly selected file has an accepted owner identity. */
export function captureDraftCommand(
  draft: CaptureDraft
): Extract<CaptureCommand, { kind: 'capture.create' }> {
  if (draft.selections.some((selection) => selection.references.length === 0))
    throw new ApiError({
      code: 'trips.capture.attachments_pending',
      kind: 'client',
      message:
        'Finish or remove each selected upload before capturing. Your files remain selected.',
      retryable: false,
    });
  if (!draft.originalText.trim() && !draft.originalUrl.trim() && draft.selections.length === 0)
    throw new ApiError({
      code: 'trips.capture.source_required',
      kind: 'client',
      message: 'Enter some source text, a URL or choose an original file.',
      retryable: false,
    });
  return {
    kind: 'capture.create',
    input: {
      originalText: draft.originalText,
      originalUrl: draft.originalUrl || null,
      classification: draft.classification,
      placeId: draft.placeId,
      visitId: draft.visitId,
      attachments: draft.selections.flatMap((selection) => [...selection.references]),
    },
    ...(draft.target === undefined ? {} : { target: structuredClone(draft.target) }),
    explore: draft.explore,
  };
}
