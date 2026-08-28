/**
 * `tagRules.*` sub-router — the tag-suggestion rule surface: the standalone
 * Tag Rules browser CRUD (list/get/update/disable/delete/matchPreview) plus
 * the vocabulary + ChangeSet propose/preview/apply/reject surface. The
 * `transaction_tag_rules` + `tag_vocabulary` tables live in the finance db.
 * The propose/preview computations are deterministic (no AI) and operate on
 * caller-supplied transactions, so the domain has no cross-pillar coupling.
 *
 * propose/preview/matchPreview are `POST`: a GET cannot carry a body.
 * `vocabulary` (a static path) must be registered before `get` (`:id`) below
 * — the router matches by declaration order, and an unordered pair here
 * would make `get` shadow `vocabulary`.
 *
 * Schemas live in `rest-tag-rules-schemas.ts`; the ChangeSet schemas are
 * re-exported here because the in-pillar imports pipeline imports them from
 * this path.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, MessageSchema, PaginationMetaSchema } from './rest-schemas.js';
import {
  MaxPreviewItems,
  PreviewInputTransactionSchema,
  TagRuleApplyExistingBody,
  TagRuleApplyExistingResultSchema,
  TagRuleChangeSetProposalSchema,
  TagRuleChangeSetSchema,
  TagRuleListQuery,
  TagRuleMatchPreviewBody,
  TagRuleMatchPreviewResultSchema,
  TagRuleMutation,
  TagRulePreviewSchema,
  TagRuleSchema,
  TagRuleSignalSchema,
  TagRuleUpdateSchema,
} from './rest-tag-rules-schemas.js';

export {
  TagRuleChangeSetOpSchema,
  TagRuleChangeSetSchema,
  TagRuleUpdateSchema,
  type TagRuleChangeSet,
  type TagRuleChangeSetOp,
  type TagRuleImpactItem,
} from './rest-tag-rules-schemas.js';

const c = initContract();

export const financeTagRulesContract = c.router({
  list: {
    method: 'GET',
    path: '/tag-rules',
    query: TagRuleListQuery,
    responses: {
      200: z.object({ data: z.array(TagRuleSchema), pagination: PaginationMetaSchema }),
      ...ERR_RESPONSES,
    },
    summary: 'List tag rules with optional matchType/isActive/minConfidence filters and pagination',
  },
  vocabulary: {
    method: 'GET',
    path: '/tag-rules/vocabulary',
    responses: { 200: z.object({ tags: z.array(z.string()) }) },
    summary: 'List the user tag vocabulary',
  },
  matchPreview: {
    method: 'POST',
    path: '/tag-rules/match-preview',
    body: TagRuleMatchPreviewBody,
    responses: { 200: z.object({ data: TagRuleMatchPreviewResultSchema }), ...ERR_RESPONSES },
    summary:
      'List every DB transaction a candidate (pattern, matchType) tag rule matches, paged, with the full-DB match total',
  },
  get: {
    method: 'GET',
    path: '/tag-rules/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: TagRuleSchema }), ...ERR_RESPONSES },
    summary: 'Get a single tag rule by id',
  },
  update: {
    method: 'PATCH',
    path: '/tag-rules/:id',
    pathParams: z.object({ id: z.string() }),
    body: TagRuleUpdateSchema,
    responses: { 200: TagRuleMutation, ...ERR_RESPONSES },
    summary: 'Edit a tag rule (entityId / tags / confidence / priority / isActive)',
  },
  disable: {
    method: 'POST',
    path: '/tag-rules/:id/disable',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Disable a tag rule (soft-delete: isActive=false)',
  },
  delete: {
    method: 'DELETE',
    path: '/tag-rules/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete a tag rule',
  },
  applyExisting: {
    method: 'POST',
    path: '/tag-rules/:id/apply-existing',
    pathParams: z.object({ id: z.string() }),
    body: TagRuleApplyExistingBody,
    responses: { 200: z.object({ data: TagRuleApplyExistingResultSchema }), ...ERR_RESPONSES },
    summary:
      'Retroactively apply a tag rule to every existing matching transaction (#3660); dryRun previews without writing',
  },
  propose: {
    method: 'POST',
    path: '/tag-rules/propose',
    body: z.object({
      signal: TagRuleSignalSchema,
      transactions: z.array(PreviewInputTransactionSchema).default([]),
      maxPreviewItems: MaxPreviewItems,
    }),
    responses: { 200: TagRuleChangeSetProposalSchema, ...ERR_RESPONSES },
    summary:
      'Propose a tag-rule ChangeSet from a tag-edit signal (deterministic, with impact preview)',
  },
  preview: {
    method: 'POST',
    path: '/tag-rules/preview',
    body: z.object({
      changeSet: TagRuleChangeSetSchema,
      transactions: z.array(PreviewInputTransactionSchema),
      maxPreviewItems: MaxPreviewItems,
    }),
    responses: { 200: TagRulePreviewSchema, ...ERR_RESPONSES },
    summary: 'Preview the suggestion-impact of a tag-rule ChangeSet over the supplied transactions',
  },
  apply: {
    method: 'POST',
    path: '/tag-rules/apply',
    body: z.object({
      changeSet: TagRuleChangeSetSchema,
      acceptedNewTags: z.array(z.string()).default([]),
    }),
    responses: { 200: z.object({ rules: z.array(TagRuleSchema) }), ...ERR_RESPONSES },
    summary: 'Apply a tag-rule ChangeSet; upserts accepted new vocabulary tags',
  },
  reject: {
    method: 'POST',
    path: '/tag-rules/reject',
    body: z.object({
      changeSet: TagRuleChangeSetSchema,
      feedback: z.string().min(1),
    }),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Reject a ChangeSet, recording the feedback against the refused ChangeSet',
  },
});
