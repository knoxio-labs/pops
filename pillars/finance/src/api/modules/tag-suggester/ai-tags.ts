/**
 * The AI pass of tag suggestion: attributing model-supplied tags as
 * `source: 'ai'` suggestions. Split from `index.ts`, which runs the passes in
 * priority order, because the tag-only pass (POPS-2596) calls it on its own.
 */
import { tagVocabularyService, type FinanceDb } from '../../../db/index.js';
import { remember } from './seen-tags.js';

import type { AiSuggestionProvenance, SuggestedTag } from './types.js';

export interface AddAiTagsArgs {
  aiTags: string[] | undefined;
  aiCategory: string | null | undefined;
  aiProvenance: AiSuggestionProvenance | undefined;
  knownTags: string[] | undefined;
  db: FinanceDb;
  seen: Set<string>;
  result: SuggestedTag[];
}

/**
 * Attribute model-supplied tags as `source: 'ai'` suggestions, flagging any
 * value outside the active vocabulary as `isNew` so the accept/reject gate can
 * tell a vocabulary value from a coined one.
 *
 * Exported because the tag-only pass (POPS-2596) attributes its tags without a
 * full `suggestTags` walk: those rows resolved deterministically and already
 * ran the correction/rule passes, and re-running them would bump `timesApplied`
 * a second time for rules whose tags the row does not even carry. It takes the
 * vocabulary set rather than reading it so that pass can load it once per run
 * instead of once per row.
 */
export function buildAiSuggestedTags(
  aiTags: readonly string[],
  knownTagSet: tagVocabularyService.KnownTagSet,
  provenance?: AiSuggestionProvenance
): SuggestedTag[] {
  const seen = new Set<string>();
  const result: SuggestedTag[] = [];
  for (const tag of aiTags) {
    if (!remember(seen, tag)) continue;
    const isNew = !knownTagSet.has(tag) || undefined;
    result.push({
      tag,
      source: 'ai',
      ...(isNew ? { isNew: true } : {}),
      ...provenanceFields(provenance),
    });
  }
  return result;
}

/**
 * The provenance an AI suggestion carries. `preAccept` is decided here, once,
 * so no consumer re-derives it from a threshold it would have to be sent: a
 * suggestion is pre-accepted only when the model reported a confidence and that
 * confidence meets the threshold. A suggestion with no reported confidence is
 * not pre-accepted — the model declining to say how sure it is is not a reason
 * to tick the tag for the person (POPS-3671).
 */
function provenanceFields(
  provenance: AiSuggestionProvenance | undefined
): Pick<SuggestedTag, 'promptVersion' | 'confidence' | 'preAccept'> {
  if (provenance === undefined) return {};
  const { promptVersion, confidence, preAcceptThreshold } = provenance;
  return {
    ...(promptVersion === undefined ? {} : { promptVersion }),
    ...(confidence === undefined ? {} : { confidence }),
    preAccept: confidence !== undefined && confidence >= preAcceptThreshold,
  };
}

/**
 * The AI pass, and the only pass that answers `isNew`.
 *
 * The vocabulary read happens after the early return, not before it: this pass
 * contributes nothing to a row the model did not classify, and reading the
 * table to then discard it made every deterministic row — and both sides of
 * every `previewTagRuleChangeSet` diff — pay for a set nothing consumed.
 *
 * It is read here rather than threaded from the caller because the answer must
 * come from the whole active vocabulary, and the once-per-batch list the caller
 * carries (`knownTags`) is the *closed* vocabulary the prompt was built from —
 * testing membership against that reported every open value the user had
 * already created as new (POPS-2602). What remains is one indexed read per
 * AI-classified row, on a path already waiting on a model call.
 */
export function addAiTags(args: AddAiTagsArgs): void {
  const { aiTags, aiCategory, aiProvenance, knownTags, db, seen, result } = args;
  let tags: string[];
  if (aiTags && aiTags.length > 0) {
    tags = aiTags;
  } else if (aiCategory && knownTags) {
    const matched = knownTags.find((t) => t.toLowerCase() === aiCategory.toLowerCase());
    tags = matched ? [matched] : [];
  } else {
    return;
  }
  if (tags.length === 0) return;

  for (const suggestion of buildAiSuggestedTags(
    tags,
    tagVocabularyService.loadKnownTagSet(db),
    aiProvenance
  )) {
    if (!remember(seen, suggestion.tag)) continue;
    result.push(suggestion);
  }
}
