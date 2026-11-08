/** Fictional source document metadata; availability controls whether a new link can be created. */
export interface DocumentRecord {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  availability: 'available' | 'unavailable';
}

/** An explicitly chosen trip object that may reference reusable source documents. */
export interface DocumentTarget {
  id: string;
  label: string;
  kind: 'trip' | 'visit' | 'journey' | 'stay' | 'event';
}

/** A removable association; neither endpoint is owned by this link. */
export interface DocumentLink {
  id: string;
  documentId: string;
  targetId: string;
}

/** Local link editing and pending file selections; files do not represent uploaded source documents. */
export interface DocumentLinkingState {
  documents: DocumentRecord[];
  targets: DocumentTarget[];
  links: DocumentLink[];
  targetId: string;
  selectedIds: string[];
  files: File[];
  query: string;
}

/** Searches document titles and filenames without filtering out unavailable source records. */
export function filteredDocuments(state: DocumentLinkingState): DocumentRecord[] {
  const query = state.query.trim().toLocaleLowerCase();
  return state.documents.filter((document) =>
    `${document.title}\n${document.fileName}`.toLocaleLowerCase().includes(query)
  );
}

/** Toggles a known available document once; unavailable or unknown records leave selections unchanged. */
export function toggleDocumentSelection(
  state: DocumentLinkingState,
  id: string
): DocumentLinkingState {
  if (
    !state.documents.some((document) => document.id === id && document.availability === 'available')
  )
    return state;
  return {
    ...state,
    selectedIds: state.selectedIds.includes(id)
      ? state.selectedIds.filter((selectedId) => selectedId !== id)
      : [...state.selectedIds, id],
  };
}

/** Returns selected available sources not already linked to the chosen target, once per source identity. */
export function pendingDocuments(state: DocumentLinkingState): DocumentRecord[] {
  const selectedIds = new Set(state.selectedIds);
  const linkedIds = new Set(
    state.links.filter((link) => link.targetId === state.targetId).map((link) => link.documentId)
  );
  return state.documents.filter(
    (document) =>
      document.availability === 'available' &&
      selectedIds.has(document.id) &&
      !linkedIds.has(document.id)
  );
}

/** Links explicit available selections to a known target, retaining original documents and all local files. */
export function attachSelected(
  state: DocumentLinkingState,
  newLinkId: (documentId: string) => string
): DocumentLinkingState {
  if (!state.targets.some((target) => target.id === state.targetId)) return state;
  const links = pendingDocuments(state).map((document) => ({
    id: newLinkId(document.id),
    documentId: document.id,
    targetId: state.targetId,
  }));
  return { ...state, links: [...state.links, ...links], selectedIds: [] };
}

/** Removes one association by identity while preserving the source document and its other associations. */
export function unlinkDocument(state: DocumentLinkingState, linkId: string): DocumentLinkingState {
  return { ...state, links: state.links.filter((link) => link.id !== linkId) };
}

/** Changes only to a known target; selected sources and pending local files remain selected. */
export function setDocumentTarget(state: DocumentLinkingState, id: string): DocumentLinkingState {
  return state.targets.some((target) => target.id === id) ? { ...state, targetId: id } : state;
}

/** Retains actual browser File objects as pending local selections without creating document records or links. */
export function addDocumentFiles(state: DocumentLinkingState, files: File[]): DocumentLinkingState {
  return { ...state, files: [...state.files, ...files] };
}

/** Removes exactly the indexed file occurrence; invalid indices leave the selection unchanged. */
export function removeDocumentFile(
  state: DocumentLinkingState,
  index: number
): DocumentLinkingState {
  if (!Number.isInteger(index) || index < 0 || index >= state.files.length) return state;
  return { ...state, files: [...state.files.slice(0, index), ...state.files.slice(index + 1)] };
}
