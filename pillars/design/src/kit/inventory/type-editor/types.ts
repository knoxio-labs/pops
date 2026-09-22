/** Named catalogue conditions represented by the type-editor playground screen. */
export type TypeEditorMode =
  | 'list'
  | 'create'
  | 'key-collision'
  | 'edit'
  | 'enum'
  | 'reference'
  | 'preview'
  | 'archive'
  | 'stale'
  | 'destructive'
  | 'migration'
  | 'computed'
  | 'dependency-error'
  | 'cycle';

/** Competing editor arrangements under review in the layout experiment. */
export type TypeEditorLayout = 'workspace' | 'focused';
