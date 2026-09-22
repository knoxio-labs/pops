/** The focused editor section currently shown in the catalogue workspace. */
export type EditorMode = 'type' | 'field' | 'new-type' | 'new-field';

/** A definition awaiting archive confirmation. */
export type ArchiveTarget = { kind: 'type' | 'field'; id: string; label: string };
