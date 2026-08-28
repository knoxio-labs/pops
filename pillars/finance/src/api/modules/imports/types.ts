/**
 * Internal TS shapes for the imports domain logic.
 *
 * The wire schemas + their inferred types live in the contract
 * (`contract/rest-imports-schemas.ts`); this file re-exports those inferred
 * types for the pipeline plus the internal-only coordination types that never
 * cross the wire (progress batch items, AI counters, the per-batch context).
 */
import type { EntityMaps } from '../../../db/index.js';
import type { CorrectionRow } from '../corrections/index.js';

export type {
  AiUsageStats,
  CommitPayload,
  CommitResult,
  ConfirmedTransaction,
  CreateEntityOutput,
  EntityMatch,
  FailedTransactionDetail,
  ImportWarning,
  MatchedRule,
  ParsedTransaction,
  ProcessedTransaction,
  ProcessImportOutput,
  RuleProvenance,
  SuggestedTag,
  TransactionType,
} from '../../../contract/rest-imports-schemas.js';

export interface ProgressBatchItem {
  description: string;
  status: 'processing' | 'success' | 'failed';
  error?: string;
}

export interface ErrorEntry {
  description: string;
  error: string;
}

export interface AiCounters {
  /** True once any AI call has failed in this batch (gates the no-match reason). */
  aiError: boolean;
  aiFailureCount: number;
  /** True when the categorizer was disabled while ≥1 row reached the AI stage (drives the disabled warning + reason). */
  aiDisabled: boolean;
  aiDisabledCount: number;
  aiApiCalls: number;
  aiCacheHits: number;
  /**
   * Tag values the model returned that were outside the closed set for their
   * facet and were dropped rather than stored (POPS-2606). A number that stops
   * being near-zero is evidence the closed vocabulary is missing something,
   * which is a human decision — the values themselves are logged where they
   * are rejected.
   */
  aiTagValuesRejected: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

export interface ProcessContext {
  entityLookup: EntityMaps['entityLookup'];
  aliases: EntityMaps['aliasMap'];
  knownTags: string[];
  importBatchId: string;
  /** `contactId → defaultTags` from the per-run contacts fetch (entity tag source). */
  entityDefaultTags: ReadonlyMap<string, string[]>;
  /**
   * The active correction rule set, fetched once per import run (CF040/#3664)
   * and threaded into every `applyLearnedCorrection` call instead of each
   * transaction re-querying + re-sorting the whole table.
   */
  correctionRules: CorrectionRow[];
}

export function createAiCounters(): AiCounters {
  return {
    aiError: false,
    aiFailureCount: 0,
    aiDisabled: false,
    aiDisabledCount: 0,
    aiApiCalls: 0,
    aiCacheHits: 0,
    aiTagValuesRejected: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
  };
}
