/**
 * The entity shape `EntitySelect` renders. Lives apart from the component so
 * the row components can name it without importing their own parent.
 */
export interface EntityOption {
  id: string;
  name: string;
  /** Optional tag shown as a badge (e.g. entity type) */
  type?: string;
  /**
   * Other names this entity is known by. Searchable but not rendered: someone
   * who types a merchant's alias is looking for that merchant, and offering to
   * create it instead mints a duplicate.
   */
  aliases?: readonly string[];
  /** When true, renders the name in italic and shows a "Pending" badge */
  pending?: boolean;
}
