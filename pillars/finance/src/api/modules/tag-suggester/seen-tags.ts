import { tagVocabularyService } from '../../../db/index.js';

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
