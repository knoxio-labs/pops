/**
 * `generateRules`: a batch of transactions → proposed tagging rules. Ported
 * from the monolith `core/corrections/lib/rule-generator.ts`, routed through
 * the injectable Claude completer (`ai-runtime.ts`).
 *
 * Split out of `ai-analyze.ts` (which keeps `analyzeCorrection`) to stay under
 * the per-file line cap — the two share `AcceptedCorrectionExample`'s few-shot
 * formatting but are otherwise independent prompts.
 */
import { accountsService, type FinanceDb, tagVocabularyService } from '../../../db/index.js';
import { extractJsonFromReply } from '../ai-json.js';
import {
  closedFacetFields,
  closedFacetOptions,
  type TagDescriptions,
} from '../vocabulary-prompt.js';
import {
  formatFewShotExamples,
  loadRecentAcceptedCorrections,
  MATCH_TYPES,
  type AcceptedCorrectionExample,
} from './ai-analyze.js';
import { getClaudeCompleter } from './ai-runtime.js';
import { type ProposedRule } from './ai-types.js';

export interface GenerateRulesTransaction {
  description: string;
  entityName: string | null;
  amount: number;
  accountId: string;
  currentTags: string[];
}

/**
 * The account name to show the AI for one transaction. Falls back to a
 * placeholder rather than throwing — this is a display nicety for an AI
 * prompt, not a write that must fail loudly on a stale id.
 */
function resolveAccountNameForPrompt(db: FinanceDb, txn: GenerateRulesTransaction): string {
  try {
    return accountsService.getAccount(db, txn.accountId).name;
  } catch {
    return 'unknown account';
  }
}

/** A `GenerateRulesTransaction` with its `accountId` resolved to a display name for the prompt. */
export type PromptTransaction = Omit<GenerateRulesTransaction, 'accountId'> & {
  account: string;
};

/**
 * Render the proposal prompt.
 *
 * `availableTags` is the closed vocabulary from `tag_vocabulary`, presented per
 * facet with its cardinality — the same rendering the categorizer uses, reused
 * rather than restated so the two cannot describe the same vocabulary
 * differently (POPS-3287). It used to be a flat comma-separated list of every
 * distinct tag on a stored transaction, which told the model neither what the
 * axes were nor that a rule may assert only one occasion.
 *
 * The reply keeps its flat `tags` array. A rule is not a classification of one
 * transaction — it names a pattern and what to assert when it matches — so the
 * per-facet reply shape the categorizer uses does not fit here. What the model
 * needs from the facets is the constraint, and that is in the field listing.
 */
export function buildGeneratePrompt(
  txns: PromptTransaction[],
  availableTags: string[],
  examples: AcceptedCorrectionExample[] = [],
  tagDescriptions?: TagDescriptions
): string {
  const lines = txns
    .map((t, i) => {
      const entity = t.entityName ?? 'unknown';
      const tags = t.currentTags.length > 0 ? t.currentTags.join(', ') : 'none';
      return `${i + 1}. "${t.description}" | entity: ${entity} | amount: ${t.amount} | account: ${t.account} | current tags: ${tags}`;
    })
    .join('\n');
  const facets = closedFacetFields(closedFacetOptions(availableTags, tagDescriptions));
  return `You are a transaction categorization assistant. Propose reusable tagging rules for these transactions.

Tag axes and their available values:
${facets}

Transactions:
${lines}${formatFewShotExamples(examples)}

Return a JSON array; each rule: {"descriptionPattern":"...","matchType":"exact|contains|regex","tags":["facet:value"],"reasoning":"..."}.

tag rules:
- Every tag must be one of the \`facet:value\` combinations listed above, written exactly as listed. A value that is not listed is not available — do NOT invent one, coin a near-synonym, or move a value to a different facet.
- Where a value is followed by a description, that description is its definition. Propose against it, not against what the word suggests on its own.
- A rule asserting "exactly one of" may carry at most one value from that axis; a rule that would need two is two rules or neither.
- Assert only what the pattern itself guarantees. A rule fires on every future transaction matching it with nobody in the loop, so a tag that is merely usually true is a tag that will be wrong on a row nobody looks at. Fewer tags is a better rule.
Return ONLY the JSON array, no markdown.`;
}

function parseProposals(text: string): ProposedRule[] {
  const jsonSlice = extractJsonFromReply(text);
  if (jsonSlice === null) return [];
  try {
    const parsed = JSON.parse(jsonSlice) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object' && !Array.isArray(item)
      )
      .map((item) => ({
        descriptionPattern:
          typeof item['descriptionPattern'] === 'string' ? item['descriptionPattern'] : '',
        matchType: (MATCH_TYPES.includes(String(item['matchType']) as (typeof MATCH_TYPES)[number])
          ? item['matchType']
          : 'contains') as ProposedRule['matchType'],
        tags: Array.isArray(item['tags'])
          ? item['tags'].filter((t): t is string => typeof t === 'string')
          : [],
        reasoning: typeof item['reasoning'] === 'string' ? item['reasoning'] : '',
      }))
      .filter((p) => p.descriptionPattern.length > 0);
  } catch {
    return [];
  }
}

/**
 * Drop every proposed tag the closed vocabulary does not hold, and with it any
 * rule left asserting nothing.
 *
 * The categorizer has validated its reply against the closed set since
 * POPS-2606; this path did not, and it is the one where a bad value is
 * *durable* — a proposal becomes a stored rule that fires on every future
 * import, above the AI, with nobody in the loop. A rule whose values were all
 * refused is dropped rather than kept empty, on migration 0071's reasoning: an
 * empty rule cannot help and can still match.
 */
export function rejectUnknownTags(
  proposals: readonly ProposedRule[],
  knownTags: readonly string[]
): ProposedRule[] {
  const known = tagVocabularyService.createKnownTagSet(knownTags);
  const kept: ProposedRule[] = [];
  for (const proposal of proposals) {
    const tags = proposal.tags.filter((tag) => known.has(tag));
    for (const tag of proposal.tags) {
      if (!known.has(tag)) {
        console.warn(
          `[AI] rejected proposed rule tag ${JSON.stringify(tag)}: not in the closed vocabulary`
        );
      }
    }
    if (tags.length === 0) {
      console.warn(
        `[AI] dropped proposed rule ${JSON.stringify(proposal.descriptionPattern)}: every tag was refused`
      );
      continue;
    }
    kept.push({ ...proposal, tags });
  }
  return kept;
}

/** Batch-propose reusable tagging rules from a set of transactions. */
export async function generateRules(
  db: FinanceDb,
  txns: GenerateRulesTransaction[]
): Promise<ProposedRule[]> {
  const resolvedTxns: PromptTransaction[] = txns.map((t) => ({
    description: t.description,
    entityName: t.entityName,
    amount: t.amount,
    currentTags: t.currentTags,
    account: resolveAccountNameForPrompt(db, t),
  }));
  const knownTags = tagVocabularyService.listClassifiedVocabulary(db);
  // An empty closed vocabulary makes the call pure cost: there is nothing to
  // propose from, so every value the model returned would be invented and then
  // refused below. Returning here rather than throwing keeps this path's
  // contract — "no proposals" is already how it answers an unavailable model —
  // while still refusing to prompt with a vocabulary that does not exist.
  if (knownTags.length === 0) return [];
  const text = await getClaudeCompleter()({
    prompt: buildGeneratePrompt(
      resolvedTxns,
      knownTags,
      loadRecentAcceptedCorrections(db),
      tagVocabularyService.listVocabularyDescriptions(db)
    ),
    maxTokens: 2000,
    operation: 'generate-rules',
  });
  if (!text) return [];
  return rejectUnknownTags(parseProposals(text), knownTags);
}
