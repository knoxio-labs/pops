/**
 * What the model suggested for a transaction beside what it was committed as
 * (POPS-3677).
 *
 * The categorizer's calls are logged to `@pops/ai-telemetry` with a
 * `promptVersion`, and that log records cost and latency only. This table is
 * the other half of the join: for every committed row that carried an AI
 * suggestion, the version that produced it, the tags offered and the tags kept.
 * Accept rate per prompt revision is a query over it.
 *
 * Written inside the commit transaction, so a rolled-back commit leaves no
 * outcome behind and a transaction's deletion cascades to its outcome.
 */
import { asc, eq } from 'drizzle-orm';

import { aiTagSuggestionOutcomes } from '../schema.js';
import { parseStoredTags } from '../tag-facets.js';

import type { FinanceDb } from './internal.js';

/** One outcome as recorded. */
export interface RecordAiTagSuggestionOutcomeInput {
  transactionId: string;
  promptVersion: string;
  suggestedTags: readonly string[];
  committedTags: readonly string[];
}

/** An outcome read back, tags parsed. */
export interface AiTagSuggestionOutcome {
  transactionId: string;
  promptVersion: string;
  suggestedTags: string[];
  committedTags: string[];
  createdAt: string;
}

/** Record one row's outcome. */
export function recordAiTagSuggestionOutcome(
  db: FinanceDb,
  input: RecordAiTagSuggestionOutcomeInput
): void {
  db.insert(aiTagSuggestionOutcomes)
    .values({
      transactionId: input.transactionId,
      promptVersion: input.promptVersion,
      suggestedTags: JSON.stringify(input.suggestedTags),
      committedTags: JSON.stringify(input.committedTags),
    })
    .run();
}

/** Every outcome recorded for `promptVersion`, oldest first. */
export function listAiTagSuggestionOutcomes(
  db: FinanceDb,
  promptVersion: string
): AiTagSuggestionOutcome[] {
  return db
    .select()
    .from(aiTagSuggestionOutcomes)
    .where(eq(aiTagSuggestionOutcomes.promptVersion, promptVersion))
    .orderBy(asc(aiTagSuggestionOutcomes.createdAt), asc(aiTagSuggestionOutcomes.id))
    .all()
    .map((row) => ({
      transactionId: row.transactionId,
      promptVersion: row.promptVersion,
      suggestedTags: parseStoredTags(row.suggestedTags),
      committedTags: parseStoredTags(row.committedTags),
      createdAt: row.createdAt,
    }));
}
