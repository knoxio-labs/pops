/**
 * Ego conversation persistence schema.
 *
 * Stores conversation history, messages, and context associations
 * for the Ego AI assistant. Conversations reference engrams via the
 * conversationContext junction table.
 */
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    activeScopes: text('active_scopes').notNull(),
    appContext: text('app_context'),
    model: text('model').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_conversations_created_at').on(table.createdAt),
    index('idx_conversations_updated_at').on(table.updatedAt),
  ]
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    citations: text('citations'),
    toolCalls: text('tool_calls'),
    parts: text('parts'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_messages_conversation_created').on(table.conversationId, table.createdAt)]
);

export const conversationContext = sqliteTable(
  'conversation_context',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    engramId: text('engram_id').notNull(),
    relevanceScore: real('relevance_score'),
    loadedAt: text('loaded_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.engramId] }),
    index('idx_conversation_context_conversation').on(table.conversationId),
    index('idx_conversation_context_engram').on(table.engramId),
  ]
);

export const egoActionBatches = sqliteTable(
  'ego_action_batches',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    loopState: text('loop_state'),
    createdAt: text('created_at').notNull(),
    decidedAt: text('decided_at'),
  },
  (table) => [
    index('idx_ego_action_batches_conversation').on(table.conversationId),
    index('idx_ego_action_batches_message').on(table.messageId),
  ]
);

export const egoActions = sqliteTable(
  'ego_actions',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id')
      .notNull()
      .references(() => egoActionBatches.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    toolUseId: text('tool_use_id').notNull(),
    position: integer('position').notNull(),
    tool: text('tool').notNull(),
    args: text('args').notNull(),
    summary: text('summary').notNull(),
    status: text('status').notNull().default('pending'),
    result: text('result'),
    createdAt: text('created_at').notNull(),
    resolvedAt: text('resolved_at'),
  },
  (table) => [
    index('idx_ego_actions_conversation').on(table.conversationId),
    index('idx_ego_actions_message').on(table.messageId),
    index('idx_ego_actions_batch').on(table.batchId),
  ]
);
