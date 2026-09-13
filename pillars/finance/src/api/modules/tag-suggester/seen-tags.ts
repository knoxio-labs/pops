import { tagVocabularyService } from '../../../db/index.js';
import { exceedsFacetCardinality } from '../../../db/tag-facets.js';

import type { SuggestedTag } from './types.js';

/**
 * Record a tag as emitted, returning false when an equal tag is already in the
 * result. Comparison is case-insensitive and shared with the vocabulary, so an
 * AI `Bar` and an entity-default `bar` collapse to one suggestion instead of
 * landing on the row twice under two spellings.
 */
export function remember(seen: Set<string>, tag: string): boolean {
  const key = tagVocabularyService.normalizeTagForComparison(tag);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

/**
 * Append `suggestion` unless it repeats an emitted tag or would be a second
 * value on a single-valued facet an earlier suggestion already filled.
 *
 * Every pass pushes through here, so passes run in priority order and the
 * first source to fill a single-valued facet keeps it (POPS-3668, POPS-3734).
 * Two venues in the list reach the import commit as two venues on one row,
 * which the commit refuses.
 */
export function pushSuggestion(
  seen: Set<string>,
  result: SuggestedTag[],
  suggestion: SuggestedTag
): void {
  const suggested = result.map((existing) => existing.tag);
  if (exceedsFacetCardinality(suggested, suggestion.tag)) return;
  if (!remember(seen, suggestion.tag)) return;
  result.push(suggestion);
}
