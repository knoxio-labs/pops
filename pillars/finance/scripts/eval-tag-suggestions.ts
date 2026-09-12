import { resolveFinanceSqlitePath } from '../src/api/finance-sqlite-path.js';
import {
  callBatchApi,
  parseBatchEntries,
} from '../src/api/modules/imports/ai-categorizer-batch-api.js';
import {
  createCategorizerClient,
  getApiKey,
  getBatchMaxTokens,
  getCategorizerBatchSize,
  getModel,
  getTagsOnlyMaxTokens,
} from '../src/api/modules/imports/ai-categorizer-config.js';
import {
  callTagsOnlyApi,
  parseTagsOnlyEntries,
} from '../src/api/modules/imports/ai-tags-only-api.js';
import { loadKnownTags, loadTagDescriptions } from '../src/api/modules/imports/tag-management.js';
/**
 * Score the categorizer's tag suggestions against what was actually committed
 * (POPS-3677).
 *
 * Two modes, both read-only against the finance database:
 *
 *   # Re-classify the held-out set with the CURRENT prompt and score it. Costs
 *   # money: it calls the model, with the key from ANTHROPIC_API_KEY.
 *   pnpm --filter @pops/finance exec tsx scripts/eval-tag-suggestions.ts
 *   ... scripts/eval-tag-suggestions.ts --shape categorize --limit 100
 *
 *   # Score what live imports recorded for one prompt revision. Free.
 *   ... scripts/eval-tag-suggestions.ts --outcomes tags-v2.0
 *
 * The held-out set is every spend transaction {@link isHeldOut} selects that
 * carries at least one classified tag. The tag requirement is deliberate: a
 * spend row with no classified tag at all has not been reviewed, and scoring a
 * suggestion against "not decided yet" would count every correct answer as a
 * false positive. Prints aggregates only, never a description.
 *
 * Not a CI gate — it spends money and its answer moves with the ledger. Record
 * its output in the ticket of the prompt change being measured.
 */
import { isSpendType } from '../src/contract/corrections-constants.js';
import { aiTagSuggestionOutcomesService, openFinanceDb, type FinanceDb } from '../src/db/index.js';
import {
  CLASSIFIED_TAG_FACETS,
  isClassifiedTagFacet,
  parseStoredTags,
  parseTagFacet,
} from '../src/db/tag-facets.js';
import {
  formatScoreTable,
  isHeldOut,
  scoreTagSuggestions,
  type EvalCase,
} from './tag-suggestion-eval.js';

import type Anthropic from '@anthropic-ai/sdk';

const LOG = '[eval-tag-suggestions]';
const DEFAULT_LIMIT = 200;
const FACETS = CLASSIFIED_TAG_FACETS.map((entry) => entry.facet);

type Shape = 'tags-only' | 'categorize';

interface HeldOutRow {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  type: string;
  tags: string;
  entityName: string | null;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`--limit must be a positive integer, got ${raw}`);
  return parsed;
}

function parseShape(raw: string | undefined): Shape {
  if (raw === undefined || raw === 'tags-only') return 'tags-only';
  if (raw === 'categorize') return 'categorize';
  throw new Error(`--shape must be tags-only or categorize, got ${raw}`);
}

function hasClassifiedTag(tagsJson: string): boolean {
  return parseStoredTags(tagsJson).some((tag) => isClassifiedTagFacet(parseTagFacet(tag).facet));
}

/** Transaction ids are unique, so two rows never compare equal. */
function byId(a: HeldOutRow, b: HeldOutRow): number {
  return a.id < b.id ? -1 : 1;
}

/** The held-out, reviewed spend rows, in a stable order independent of insertion. */
export function selectHeldOutRows(
  rows: readonly HeldOutRow[],
  shape: Shape,
  limit: number
): HeldOutRow[] {
  return rows
    .filter((row) => isHeldOut(row.id))
    .filter((row) => isSpendType(row.type))
    .filter((row) => hasClassifiedTag(row.tags))
    .filter((row) => shape === 'categorize' || (row.entityName !== null && row.entityName !== ''))
    .toSorted(byId)
    .slice(0, limit);
}

function readRows(opened: ReturnType<typeof openFinanceDb>): HeldOutRow[] {
  return opened.raw
    .prepare(
      `SELECT id, description, amount_cents AS amountCents, date, type, tags, entity_name AS entityName
         FROM transactions`
    )
    .all() as HeldOutRow[];
}

function committedClassifiedTags(row: HeldOutRow): string[] {
  return parseStoredTags(row.tags).filter((tag) => isClassifiedTagFacet(parseTagFacet(tag).facet));
}

interface ClassifyEnv {
  db: FinanceDb;
  client: Anthropic;
  knownTags: string[];
  tagDescriptions: ReadonlyMap<string, string>;
}

function inputOf(row: HeldOutRow): { description: string; amount: number; date: string } {
  return { description: row.description, amount: row.amountCents / 100, date: row.date };
}

async function classifyChunk(
  env: ClassifyEnv,
  shape: Shape,
  rows: HeldOutRow[]
): Promise<string[][]> {
  const model = getModel(env.db);
  if (shape === 'tags-only') {
    const response = await callTagsOnlyApi({
      client: env.client,
      inputs: rows.map((row) => ({ entityName: row.entityName ?? '', input: inputOf(row) })),
      model,
      maxTokens: getTagsOnlyMaxTokens(rows.length),
      knownTags: env.knownTags,
      tagDescriptions: env.tagDescriptions,
    });
    return parseTagsOnlyEntries(response.text ?? '[]', rows.length, env.knownTags).map(
      (entry) => entry?.tags ?? []
    );
  }
  const response = await callBatchApi({
    client: env.client,
    inputs: rows.map(inputOf),
    model,
    maxTokens: getBatchMaxTokens(rows.length),
    knownTags: env.knownTags,
    tagDescriptions: env.tagDescriptions,
  });
  return parseBatchEntries(response.text ?? '[]', rows.length, env.knownTags).map(
    (entry) => entry?.tags ?? []
  );
}

async function evaluatePrompt(opened: ReturnType<typeof openFinanceDb>): Promise<void> {
  const apiKey = getApiKey();
  if (apiKey === '') {
    console.error(
      `${LOG} ANTHROPIC_API_KEY is not set; use --outcomes <promptVersion> to score recorded outcomes without a key.`
    );
    process.exitCode = 2;
    return;
  }
  const shape = parseShape(argValue('--shape'));
  const rows = selectHeldOutRows(readRows(opened), shape, parseLimit(argValue('--limit')));
  const env: ClassifyEnv = {
    db: opened.db,
    client: createCategorizerClient(apiKey),
    knownTags: loadKnownTags(opened.db),
    tagDescriptions: loadTagDescriptions(opened.db),
  };

  const cases: EvalCase[] = [];
  const size = getCategorizerBatchSize();
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const suggestions = await classifyChunk(env, shape, chunk);
    chunk.forEach((row, j) =>
      cases.push({ suggested: suggestions[j] ?? [], committed: committedClassifiedTags(row) })
    );
  }

  console.warn(`${LOG} shape=${shape} model=${getModel(opened.db)} cases=${cases.length}\n`);
  console.warn(formatScoreTable(scoreTagSuggestions(cases, FACETS)));
}

function evaluateOutcomes(opened: ReturnType<typeof openFinanceDb>, promptVersion: string): void {
  const cases = aiTagSuggestionOutcomesService
    .listAiTagSuggestionOutcomes(opened.db, promptVersion)
    .map((outcome) => ({ suggested: outcome.suggestedTags, committed: outcome.committedTags }));
  console.warn(`${LOG} recorded outcomes for ${promptVersion}: ${cases.length}\n`);
  if (cases.length === 0) return;
  console.warn(formatScoreTable(scoreTagSuggestions(cases, FACETS)));
}

async function main(): Promise<void> {
  const opened = openFinanceDb(resolveFinanceSqlitePath());
  try {
    const outcomes = argValue('--outcomes');
    if (outcomes === undefined) await evaluatePrompt(opened);
    else evaluateOutcomes(opened, outcomes);
  } finally {
    opened.raw.close();
  }
}

if (import.meta.main) await main();
