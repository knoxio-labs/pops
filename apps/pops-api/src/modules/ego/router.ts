/**
 * tRPC router for ego (PRD-087 US-01).
 *
 * Procedures:
 *   chat — send a message in a conversation and receive a response
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { protectedProcedure, router } from '../../trpc.js';
import { ConversationEngine } from './engine.js';
import { InMemoryConversationStore } from './memory-store.js';

import type { AppContext, ConversationStore, Message } from './types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/**
 * Singleton store instance.
 * Will be replaced by a SQLite-backed store when US-05 lands.
 */
let storeInstance: ConversationStore | null = null;

function getStore(): ConversationStore {
  storeInstance ??= new InMemoryConversationStore();
  return storeInstance;
}

/** Allow tests to inject a custom store. */
export function setStore(store: ConversationStore): void {
  storeInstance = store;
}

function getEngine(): ConversationEngine {
  return new ConversationEngine();
}

/** Generate a conversation ID with timestamp and random hash. */
function generateConversationId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const hash = Math.random().toString(36).slice(2, 8);
  return `conv_${ts}_${hash}`;
}

/** Generate a message ID with timestamp and random hash. */
function generateMessageId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const hash = Math.random().toString(36).slice(2, 8);
  return `msg_${ts}_${hash}`;
}

/**
 * Auto-generate a conversation title from the first user message.
 * Takes first 80 characters, truncated at the nearest word boundary.
 */
function generateTitle(message: string): string {
  const cleaned = message.replace(/[#*_~`>[\]()]/g, '').trim();
  if (cleaned.length <= 80) return cleaned;

  const truncated = cleaned.slice(0, 80);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

const appContextSchema = z
  .object({
    app: z.string(),
    route: z.string().optional(),
    entityId: z.string().optional(),
    entityType: z.string().optional(),
  })
  .optional();

const chatInputSchema = z.object({
  conversationId: z.string().min(1).optional(),
  message: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional(),
  appContext: appContextSchema,
});

export const egoRouter = router({
  /**
   * Send a message in a conversation and receive a response.
   *
   * If conversationId is not provided or not found, a new conversation is created.
   * Persists both the user message and assistant response.
   */
  chat: protectedProcedure.input(chatInputSchema).mutation(async ({ input }) => {
    const store = getStore();
    const engine = getEngine();

    const scopes = input.scopes ?? [];
    const appContext: AppContext | undefined = input.appContext;

    // Load or create conversation.
    let conversationId = input.conversationId;
    let conversation = conversationId ? await store.getConversation(conversationId) : null;

    if (!conversation) {
      conversationId = conversationId ?? generateConversationId();
      conversation = await store.createConversation({
        id: conversationId,
        title: generateTitle(input.message),
        activeScopes: scopes,
        appContext: appContext ?? null,
        model: DEFAULT_MODEL,
      });
    }

    // Load message history.
    const history = await store.getMessages(conversation.id);

    // Run the conversation engine.
    let result;
    try {
      result = await engine.chat({
        conversationId: conversation.id,
        message: input.message,
        history,
        activeScopes: conversation.activeScopes,
        appContext: conversation.appContext ?? undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
    }

    // Persist user message.
    const userMessage: Message = {
      id: generateMessageId(),
      role: 'user',
      content: input.message,
      createdAt: new Date().toISOString(),
    };
    await store.addMessage(conversation.id, userMessage);

    // Persist assistant response.
    const assistantMessage: Message = {
      id: generateMessageId(),
      role: 'assistant',
      content: result.response.content,
      citations: result.response.citations,
      tokensIn: result.response.tokensIn,
      tokensOut: result.response.tokensOut,
      createdAt: new Date().toISOString(),
    };
    await store.addMessage(conversation.id, assistantMessage);

    // Update conversation timestamp.
    await store.touchConversation(conversation.id);

    // Record retrieved engrams in context.
    if (result.retrievedEngrams.length > 0) {
      await store.addContextEngrams(conversation.id, result.retrievedEngrams);
    }

    return {
      conversationId: conversation.id,
      response: assistantMessage,
      retrievedEngrams: result.retrievedEngrams,
    };
  }),
});
