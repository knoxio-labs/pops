/**
 * Wire schemas for `ego.*` — conversations CRUD, chat, context.
 *
 * Lives in its own file (not the shared `rest-schemas.ts`) so that file stays
 * under the oxlint `max-lines: 200` cap; no other domain consumes these. The
 * conversation/message rows carry JSON-decoded `activeScopes` / `appContext` /
 * `citations` / `toolCalls`, projected here as open `z.unknown()` bags where the
 * shape is caller-defined.
 */
import { z } from 'zod';

import { egoActionStatusSchema, egoMessagePartsSchema, egoUriSchema } from './rest-ego-parts.js';

export const egoAppContextSchema = z.object({
  app: z.string(),
  route: z.string().optional(),
  entityId: z.string().optional(),
  entityType: z.string().optional(),
  entityTitle: z.string().optional(),
  uri: egoUriSchema.optional(),
});
export type EgoAppContextWire = z.infer<typeof egoAppContextSchema>;

export const egoChannelSchema = z.enum(['shell', 'moltbot', 'mcp', 'cli']);
export type EgoChannelWire = z.infer<typeof egoChannelSchema>;

export const conversationWire = z.object({
  id: z.string(),
  title: z.string().nullable(),
  activeScopes: z.array(z.string()),
  appContext: z.unknown().nullable(),
  model: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConversationWire = z.infer<typeof conversationWire>;

export const conversationMessageWire = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.string(),
  content: z.string(),
  citations: z.unknown().nullable(),
  toolCalls: z.unknown().nullable(),
  parts: egoMessagePartsSchema.nullable(),
  tokensIn: z.number().nullable(),
  tokensOut: z.number().nullable(),
  createdAt: z.string(),
});
export type ConversationMessageWire = z.infer<typeof conversationMessageWire>;

export const egoActionWire = z.object({
  id: z.string(),
  batchId: z.string(),
  conversationId: z.string(),
  messageId: z.string(),
  tool: z.string(),
  summary: z.string(),
  status: egoActionStatusSchema,
  result: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type EgoActionWire = z.infer<typeof egoActionWire>;

export const egoBatchWire = z.object({
  id: z.string(),
  conversationId: z.string(),
  messageId: z.string(),
  status: z.enum(['pending', 'decided', 'continued', 'auto']),
  actions: z.array(egoActionWire),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});
export type EgoBatchWire = z.infer<typeof egoBatchWire>;

export const egoDecisionBodySchema = z.object({
  approve: z.array(z.string().min(1)),
  reject: z.array(z.string().min(1)),
  alwaysAllow: z.array(z.string().min(1)),
});
export type EgoDecisionBodyWire = z.infer<typeof egoDecisionBodySchema>;

export const egoDecisionResultSchema = z.object({
  batch: egoBatchWire,
  updatedMessage: conversationMessageWire.nullable(),
});
export type EgoDecisionResultWire = z.infer<typeof egoDecisionResultSchema>;

export const scopeNegotiationWire = z.object({
  scopes: z.array(z.string()),
  changed: z.boolean(),
  reason: z.string().nullable(),
  secretNotice: z.string().nullable(),
});
export type ScopeNegotiationWire = z.infer<typeof scopeNegotiationWire>;

export const retrievedEngramWire = z.object({
  engramId: z.string(),
  relevanceScore: z.number(),
});
export type RetrievedEngramWire = z.infer<typeof retrievedEngramWire>;

export const conversationContextEngramWire = z.object({
  engramId: z.string(),
  relevanceScore: z.number().nullable(),
  loadedAt: z.string(),
});
export type ConversationContextEngramWire = z.infer<typeof conversationContextEngramWire>;

export const egoChatBodySchema = z.object({
  conversationId: z.string().min(1).optional(),
  message: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional(),
  appContext: egoAppContextSchema.optional(),
  channel: egoChannelSchema.optional(),
  knownScopes: z.array(z.string().min(1)).optional(),
});
export type EgoChatBodyWire = z.infer<typeof egoChatBodySchema>;

export const egoChatResponseSchema = z.object({
  conversationId: z.string(),
  response: conversationMessageWire,
  retrievedEngrams: z.array(retrievedEngramWire),
  scopeNegotiation: scopeNegotiationWire.nullable(),
});
export type EgoChatResponseWire = z.infer<typeof egoChatResponseSchema>;

export const createConversationBodySchema = z.object({
  title: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).optional(),
  appContext: z.unknown().optional(),
  model: z.string().min(1),
});
export type CreateConversationBodyWire = z.infer<typeof createConversationBodySchema>;

export const listConversationsBodySchema = z.object({
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional(),
  search: z.string().optional(),
});
export type ListConversationsBodyWire = z.infer<typeof listConversationsBodySchema>;

export const setScopesBodySchema = z.object({
  scopes: z.array(z.string()),
});
export type SetScopesBodyWire = z.infer<typeof setScopesBodySchema>;

export const getActiveContextResponseSchema = z.object({
  scopes: z.array(z.string()),
  appContext: z.unknown().nullable(),
  engrams: z.array(conversationContextEngramWire),
});
export type GetActiveContextResponseWire = z.infer<typeof getActiveContextResponseSchema>;
