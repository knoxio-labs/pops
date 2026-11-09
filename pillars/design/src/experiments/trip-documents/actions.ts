import {
  addDocumentFiles,
  attachSelected,
  pendingDocuments,
  removeDocumentFile,
  setDocumentTarget,
  toggleDocumentSelection,
  unlinkDocument,
  type DocumentLinkingState,
} from '../trip-document-linking/model';

import type { TripDocumentsState } from './types';

function withLinking(state: TripDocumentsState, linking: DocumentLinkingState): TripDocumentsState {
  return linking === state.linking ? state : { ...state, linking };
}

/** Selects a known target through the approved linker, preserving source selections and pending actual files. */
export function setTripDocumentTarget(state: TripDocumentsState, id: string): TripDocumentsState {
  return withLinking(state, setDocumentTarget(state.linking, id));
}

/** Toggles only known available originals; source availability is independent of recorded offline facts. */
export function toggleTripDocumentSelection(
  state: TripDocumentsState,
  id: string
): TripDocumentsState {
  return withLinking(state, toggleDocumentSelection(state.linking, id));
}

/** Links explicit selections atomically with distinct association IDs, retaining originals, offline facts and pending files. */
export function attachTripDocumentSelection(
  state: TripDocumentsState,
  newLinkId: (documentId: string) => string
): { state: TripDocumentsState; error: string | null } {
  if (!state.linking.targets.some((target) => target.id === state.linking.targetId))
    return { state, error: 'Choose an available target.' };
  const pending = pendingDocuments(state.linking);
  if (!pending.length)
    return { state, error: 'Choose available documents not already linked to this target.' };
  const ids = pending.map((document) => ({ documentId: document.id, id: newLinkId(document.id) }));
  if (
    ids.some(
      (entry) => !entry.id.trim() || state.linking.links.some((link) => link.id === entry.id)
    ) ||
    new Set(ids.map((entry) => entry.id)).size !== ids.length
  )
    return { state, error: 'Choose distinct link identifiers.' };
  const linking = attachSelected(state.linking, (documentId) => {
    const source = ids.find((entry) => entry.documentId === documentId);
    if (!source) throw new Error('Selected document changed during local linking');
    return source.id;
  });
  return { state: withLinking(state, linking), error: null };
}

/** Removes one association including broken endpoints, preserving the original and its remaining cross-links. */
export function unlinkTripDocument(state: TripDocumentsState, id: string): TripDocumentsState {
  return state.linking.links.some((link) => link.id === id)
    ? withLinking(state, unlinkDocument(state.linking, id))
    : state;
}

/** Retains actual browser File objects as pending selections, without creating metadata, links or offline availability. */
export function addTripDocumentFiles(state: TripDocumentsState, files: File[]): TripDocumentsState {
  return withLinking(state, addDocumentFiles(state.linking, files));
}

/** Removes exactly one pending file occurrence through the approved linker, leaving originals untouched. */
export function removeTripDocumentFile(
  state: TripDocumentsState,
  index: number
): TripDocumentsState {
  return withLinking(state, removeDocumentFile(state.linking, index));
}
