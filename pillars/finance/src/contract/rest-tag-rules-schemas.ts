/**
 * Zod schemas for the `tagRules.*` REST contract — split out of
 * `rest-tag-rules.ts` so the contract router stays under the line cap.
 */
import { z } from 'zod';

import { LimitQuery, OffsetQuery } from './rest-schemas.js';

export const MatchTypeSchema = z.enum(['exact', 'contains', 'regex']);

export const TagRuleDataSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: MatchTypeSchema.default('exact'),
  entityId: z.string().nullable().optional(),
  tags: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
});

export const TagRuleUpdateSchema = z.object({
  entityId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
});

export const TagRuleChangeSetOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), data: TagRuleDataSchema }),
  z.object({ op: z.literal('edit'), id: z.string().min(1), data: TagRuleUpdateSchema }),
  z.object({ op: z.literal('disable'), id: z.string().min(1) }),
  z.object({ op: z.literal('remove'), id: z.string().min(1) }),
]);

export const TagRuleChangeSetSchema = z.object({
  source: z.string().optional(),
  reason: z.string().optional(),
  ops: z.array(TagRuleChangeSetOpSchema).min(1),
});

export type TagRuleChangeSetOp = z.infer<typeof TagRuleChangeSetOpSchema>;
export type TagRuleChangeSet = z.infer<typeof TagRuleChangeSetSchema>;

export const TagRuleSignalSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: MatchTypeSchema,
  entityId: z.string().nullable().optional(),
  tags: z.array(z.string()).min(1),
});

export const PreviewInputTransactionSchema = z.object({
  transactionId: z.string().min(1),
  description: z.string().min(1),
  entityId: z.string().nullable().optional(),
  userTags: z.array(z.string()).optional(),
});

const TagSuggestionSchema = z.object({
  tag: z.string(),
  source: z.enum(['tag_rule', 'rule', 'ai', 'entity']),
  pattern: z.string().optional(),
  isNew: z.boolean().optional(),
});

const TagRuleSuggestionOutcomeSchema = z.object({ suggestedTags: z.array(TagSuggestionSchema) });

const TagRuleImpactItemSchema = z.object({
  transactionId: z.string(),
  description: z.string(),
  before: TagRuleSuggestionOutcomeSchema,
  after: TagRuleSuggestionOutcomeSchema,
});

/** One transaction's before/after tag-suggestion outcome in a tag-rule preview. */
export type TagRuleImpactItem = z.infer<typeof TagRuleImpactItemSchema>;

const TagRuleImpactCountsSchema = z.object({
  affected: z.number(),
  suggestionChanges: z.number(),
  newTagProposals: z.number(),
});

export const TagRulePreviewSchema = z.object({
  counts: TagRuleImpactCountsSchema,
  affected: z.array(TagRuleImpactItemSchema),
});

export const TagRuleChangeSetProposalSchema = z.object({
  changeSet: TagRuleChangeSetSchema,
  rationale: z.string(),
  preview: TagRulePreviewSchema,
});

/** Persisted rule row, with `tags` parsed to a `string[]` (column is JSON). */
export const TagRuleSchema = z.object({
  id: z.string(),
  descriptionPattern: z.string(),
  matchType: MatchTypeSchema,
  entityId: z.string().nullable(),
  tags: z.array(z.string()),
  isActive: z.boolean(),
  confidence: z.number(),
  priority: z.number(),
  timesApplied: z.number(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

export const MaxPreviewItems = z.coerce.number().int().positive().max(500).default(200);

export const TagRuleListQuery = z.object({
  matchType: MatchTypeSchema.optional(),
  // Query params arrive as strings; the handler coerces "true" → boolean. A
  // transform here would break OpenAPI JSON-Schema generation.
  isActive: z.enum(['true', 'false']).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  limit: LimitQuery,
  offset: OffsetQuery,
});

export const TagRuleMutation = z.object({ data: TagRuleSchema, message: z.string() });

/** Body for the tag-rule match preview: an arbitrary (possibly unsaved) pattern plus a page window. */
export const TagRuleMatchPreviewBody = z.object({
  pattern: z.string().min(1),
  matchType: MatchTypeSchema,
  limit: z.number().int().positive().max(500).optional(),
  offset: z.number().int().nonnegative().optional(),
});

/** A DB transaction the candidate pattern matches, projected for the usage-history panel. */
const TagRuleMatchPreviewTransactionSchema = z.object({
  id: z.string(),
  checksum: z.string().nullable(),
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
});

export const TagRuleMatchPreviewResultSchema = z.object({
  matches: z.array(TagRuleMatchPreviewTransactionSchema),
  totalCount: z.number(),
});
