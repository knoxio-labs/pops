/** Source attribution for a tag — from AI, correction rule, or entity defaults. */
export type TagSource = 'ai' | 'rule' | 'entity';

export interface TagMetaEntry {
  source: TagSource;
  /** For rule-sourced tags: the description_pattern from the matched correction. */
  pattern?: string;
}

export interface TagEditorProps {
  /** Current tags on the transaction. */
  currentTags: string[];
  /** Called with the final tag list when the user saves. May be async. */
  onSave: (tags: string[]) => void | Promise<void>;
  /** Optional async callback for AI-powered tag suggestions. */
  onSuggest?: () => Promise<string[]>;
  /** Available tags for autocomplete. */
  availableTags?: string[];
  /** Whether to disable editing (shows tags read-only). */
  disabled?: boolean;
  /** Optional source attribution metadata keyed by tag name. */
  tagMeta?: Map<string, TagMetaEntry>;
}

/** How many autocomplete suggestions the panel offers at once. */
export const SUGGESTION_LIMIT = 8;
