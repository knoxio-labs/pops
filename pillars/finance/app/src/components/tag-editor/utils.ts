import type { SuggestedTag } from '@pops/finance';

import type { TagFacetOption } from '../../lib/tags';

/** Source attribution for a tag — from AI, correction rule, or entity defaults. */
export type TagSource = 'ai' | 'rule' | 'entity';

export interface TagMetaEntry {
  source: TagSource;
  /** For rule-sourced tags: the description_pattern from the matched correction. */
  pattern?: string;
  /** True for an AI tag not yet in the known vocabulary. */
  isNew?: boolean;
  /** For AI tags: the model's confidence in them, in `[0, 1]` (POPS-3671). */
  confidence?: number;
  /** For AI tags: `false` when the suggestion was not pre-accepted (POPS-3671). */
  preAccept?: boolean;
}

export interface TagEditorProps {
  /** Current tags on the transaction. */
  currentTags: string[];
  /** Called with the final tag list when the user saves. May be async. */
  onSave: (tags: string[]) => void | Promise<void>;
  /**
   * Optional async callback returning tag-suggester candidates for this
   * transaction, each attributed to its source (`rule`/`ai`/`entity`) so the
   * panel can badge them. Picking one only ever stores its `tag` string.
   */
  onSuggest?: () => Promise<SuggestedTag[]>;
  /** Available tags for autocomplete. */
  availableTags?: string[];
  /**
   * The taxonomy, which decides what a typed value may be created as. Without
   * it the panel still adds existing tags but offers no way to mint one — a
   * facet is not something to guess at on the user's behalf.
   */
  facets?: TagFacetOption[];
  /** Whether to disable editing (shows tags read-only). */
  disabled?: boolean;
  /** Optional source attribution metadata keyed by tag name. */
  tagMeta?: Map<string, TagMetaEntry>;
}

/** How many autocomplete suggestions the panel offers at once. */
export const SUGGESTION_LIMIT = 8;

/** Build a tagMeta Map from a SuggestedTag array, for the badge rendering both TagEditor and Tag Review share. */
export function buildTagMetaMap(suggestedTags: SuggestedTag[]): Map<string, TagMetaEntry> {
  const map = new Map<string, TagMetaEntry>();
  for (const s of suggestedTags)
    map.set(s.tag, {
      source: s.source,
      pattern: s.pattern,
      isNew: s.isNew,
      confidence: s.confidence,
      preAccept: s.preAccept,
    });
  return map;
}
