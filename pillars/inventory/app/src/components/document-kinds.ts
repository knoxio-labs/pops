/** The kinds a linked or uploaded item document can be filed under. */
export const DOCUMENT_KINDS = ['receipt', 'warranty', 'manual', 'invoice', 'other'] as const;

/** One of {@link DOCUMENT_KINDS}. */
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Narrows a wire or form string to a {@link DocumentKind}. */
export function isDocumentKind(value: string): value is DocumentKind {
  return DOCUMENT_KINDS.some((kind) => kind === value);
}

/** Select options for the document kinds, labelled for display. */
export const DOCUMENT_KIND_OPTIONS = DOCUMENT_KINDS.map((kind) => ({
  value: kind,
  label: kind.charAt(0).toUpperCase() + kind.slice(1),
}));
