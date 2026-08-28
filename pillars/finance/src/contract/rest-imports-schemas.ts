/**
 * Zod schemas + inferred types for the `imports.*` sub-router.
 *
 * Split from `rest-imports.ts` so the route map there stays under the per-file
 * line cap. These are the single source of truth for the import wire shapes;
 * the CSV/PDF transformers are out of scope (the wire receives already-parsed
 * transactions via {@link ParsedTransactionSchema}).
 */
import { z } from 'zod';

import { ENTITY_TYPES, TRANSACTION_MATCH_TYPES } from '../db/index.js';
import { MIN_MATCH_CONFIDENCE } from './corrections-constants.js';
import { TransactionTypeSchema } from './rest-corrections-schemas.js';
import { ChangeSetSchema } from './rest-corrections.js';
import { TagRuleChangeSetSchema } from './rest-tag-rules.js';

/** Transaction as parsed upstream (client-side or a transformer), with audit + dedup fields. */
export const ParsedTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  description: z.string().min(1),
  amount: z.number(),
  account: z.string().min(1),
  location: z.string().optional(),
  /** ISO-3166-1 alpha-2, set by parsers that can tell a charge was foreign. */
  country: z.string().optional(),
  /** Amount charged abroad, in `foreignCurrency`'s own ISO-4217 minor units. */
  foreignAmountMinor: z.number().int().optional(),
  /** ISO-4217 alpha-3 of the charge abroad, uppercase. */
  foreignCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'Currency must be an ISO-4217 alpha-3 code')
    .optional(),
  /** The issuer's foreign-transaction fee in AUD cents — a fee, not a converted total. */
  fxFeeCents: z.number().int().optional(),
  rawRow: z.string(),
  checksum: z.string(),
});

export const EntityMatchSchema = z.object({
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  matchType: z.enum(TRANSACTION_MATCH_TYPES),
  confidence: z.number().min(0).max(1).optional(),
});

export { TransactionTypeSchema };

export const SuggestedTagSchema = z.object({
  tag: z.string(),
  source: z.enum(['ai', 'rule', 'entity']),
  pattern: z.string().optional(),
  isNew: z.boolean().optional(),
});

export const RuleProvenanceSchema = z.object({
  source: z.literal('correction'),
  ruleId: z.string().min(1),
  pattern: z.string().min(1),
  matchType: z.enum(['exact', 'contains', 'regex']),
  confidence: z.number().min(0).max(1),
});

export const MatchedRuleSchema = z.object({
  ruleId: z.string().min(1),
  pattern: z.string().min(1),
  matchType: z.enum(['exact', 'contains', 'regex']),
  confidence: z.number().min(0).max(1),
  priority: z.number(),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
});

export const ProcessedTransactionSchema = ParsedTransactionSchema.extend({
  entity: EntityMatchSchema,
  status: z.enum(['matched', 'uncertain', 'failed', 'skipped']),
  skipReason: z.string().optional(),
  error: z.string().optional(),
  transactionType: TransactionTypeSchema.optional(),
  suggestedTags: z.array(SuggestedTagSchema).optional(),
  ruleProvenance: RuleProvenanceSchema.optional(),
  matchedRules: z.array(MatchedRuleSchema).optional(),
});

export const ConfirmedTransactionSchema = ParsedTransactionSchema.extend({
  transactionType: TransactionTypeSchema.optional(),
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  tags: z.array(z.string()).optional(),
  suggestedTags: z.array(SuggestedTagSchema).optional(),
  /** How the entity assignment was produced (CF057/#3658), persisted verbatim at commit. */
  matchType: EntityMatchSchema.shape.matchType.optional(),
  /** Winning correction rule id, only set when `matchType` is `learned`. */
  matchRuleId: z.string().min(1).optional(),
  /** Match confidence (0-1), only set for `ai`/`learned` matches. */
  matchConfidence: z.number().min(0).max(1).optional(),
});

export const ImportWarningSchema = z.object({
  type: z.enum(['AI_CATEGORIZATION_UNAVAILABLE', 'AI_API_ERROR']),
  message: z.string(),
  affectedCount: z.number().optional(),
  details: z.string().optional(),
});

export const AiUsageStatsSchema = z.object({
  apiCalls: z.number(),
  cacheHits: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCostUsd: z.number(),
  avgCostPerCall: z.number(),
});

export const ProcessImportOutputSchema = z.object({
  matched: z.array(ProcessedTransactionSchema),
  uncertain: z.array(ProcessedTransactionSchema),
  failed: z.array(ProcessedTransactionSchema),
  skipped: z.array(ProcessedTransactionSchema),
  warnings: z.array(ImportWarningSchema).optional(),
  aiUsage: AiUsageStatsSchema.optional(),
});

export const ProcessImportInputSchema = z.object({
  transactions: z.array(ParsedTransactionSchema),
  account: z.string().min(1),
});

export const CreateEntityInputSchema = z.object({ name: z.string().min(1).max(200) });
export const CreateEntityOutputSchema = z.object({
  entityId: z.string(),
  entityName: z.string(),
});

export const ApplyChangeSetAndReevaluateInputSchema = z.object({
  sessionId: z.string().uuid(),
  changeSet: ChangeSetSchema,
  minConfidence: z.number().min(0).max(1).default(MIN_MATCH_CONFIDENCE),
});

export const ApplyChangeSetAndReevaluateOutputSchema = z.object({
  result: ProcessImportOutputSchema,
  affectedCount: z.number().int().nonnegative(),
});

export const PendingEntitySchema = z.object({
  tempId: z.string().regex(/^temp:entity:[0-9a-f-]{36}$/, 'Temp ID must match temp:entity:{uuid}'),
  name: z.string().min(1),
  type: z.enum(ENTITY_TYPES).default('company'),
});

/**
 * A tag-rule ChangeSet staged in the import wizard, carried to commit with the
 * new-vocabulary tags the user accepted alongside it.
 *
 * `acceptedNewTags` is the accept/decline outcome of the tag-rule dialog's
 * new-tags panel: when present, exactly those tags are upserted into
 * `tag_vocabulary`, so a tag the user unchecked never lands. When absent — the
 * batch rule-creation flow, which has no accept/decline UI — every tag the
 * ChangeSet carries is upserted (POPS-2597).
 */
export const CommitTagRuleChangeSetSchema = z.object({
  changeSet: TagRuleChangeSetSchema,
  acceptedNewTags: z.array(z.string()).optional(),
});

export const CommitPayloadSchema = z.object({
  entities: z.array(PendingEntitySchema).default([]),
  changeSets: z.array(ChangeSetSchema).default([]),
  tagRuleChangeSets: z.array(CommitTagRuleChangeSetSchema).default([]),
  transactions: z.array(ConfirmedTransactionSchema),
  /**
   * Client-generated idempotency key scoped to a single "Approve & Commit
   * All" click (#3640/#3642). Omitting it preserves the old at-most-once-
   * best-effort behaviour; supplying it makes a resubmit under the same key
   * a no-op replay of the first call's result instead of re-applying the
   * whole payload.
   */
  commitKey: z.string().uuid().optional(),
});

export const RulesAppliedSchema = z.object({
  add: z.number().int().nonnegative(),
  edit: z.number().int().nonnegative(),
  disable: z.number().int().nonnegative(),
  remove: z.number().int().nonnegative(),
});

export const FailedTransactionDetailSchema = z.object({
  checksum: z.string().nullable(),
  error: z.string(),
});

export const CommitResultSchema = z.object({
  entitiesCreated: z.number().int().nonnegative(),
  rulesApplied: RulesAppliedSchema,
  tagRulesApplied: z.number().int().nonnegative(),
  transactionsImported: z.number().int().nonnegative(),
  transactionsFailed: z.number().int().nonnegative(),
  failedDetails: z.array(FailedTransactionDetailSchema),
  retroactiveReclassifications: z.number().int().nonnegative(),
});

export const ReevaluateWithPendingRulesInputSchema = z.object({
  sessionId: z.string().uuid(),
  minConfidence: z.number().min(0).max(1).default(MIN_MATCH_CONFIDENCE),
  pendingChangeSets: z.array(z.object({ changeSet: ChangeSetSchema })),
});

export const SessionIdSchema = z.object({ sessionId: z.string() });

const ProgressBatchItemSchema = z.object({
  description: z.string(),
  status: z.enum(['processing', 'success', 'failed']),
  error: z.string().optional(),
});

export const ImportProgressSchema = z.object({
  sessionId: z.string(),
  status: z.enum(['processing', 'completed', 'failed']),
  currentStep: z.enum(['deduplicating', 'matching', 'categorizing']),
  totalTransactions: z.number(),
  processedCount: z.number(),
  currentBatch: z.array(ProgressBatchItemSchema),
  errors: z.array(z.object({ description: z.string(), error: z.string() })),
  startedAt: z.string(),
  result: ProcessImportOutputSchema.optional(),
});

export type ParsedTransaction = z.infer<typeof ParsedTransactionSchema>;
export type EntityMatch = z.infer<typeof EntityMatchSchema>;
export type TransactionType = z.infer<typeof TransactionTypeSchema>;
export type SuggestedTag = z.infer<typeof SuggestedTagSchema>;
export type RuleProvenance = z.infer<typeof RuleProvenanceSchema>;
export type MatchedRule = z.infer<typeof MatchedRuleSchema>;
export type ProcessedTransaction = z.infer<typeof ProcessedTransactionSchema>;
export type ConfirmedTransaction = z.infer<typeof ConfirmedTransactionSchema>;
export type ImportWarning = z.infer<typeof ImportWarningSchema>;
export type AiUsageStats = z.infer<typeof AiUsageStatsSchema>;
export type ProcessImportOutput = z.infer<typeof ProcessImportOutputSchema>;
export type CreateEntityOutput = z.infer<typeof CreateEntityOutputSchema>;
export type PendingEntity = z.infer<typeof PendingEntitySchema>;
export type CommitTagRuleChangeSet = z.infer<typeof CommitTagRuleChangeSetSchema>;
export type CommitPayload = z.infer<typeof CommitPayloadSchema>;
export type CommitResult = z.infer<typeof CommitResultSchema>;
export type FailedTransactionDetail = z.infer<typeof FailedTransactionDetailSchema>;
