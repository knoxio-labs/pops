/**
 * In-memory ConversationStore implementation (PRD-087 US-01).
 *
 * This is a stub that will be replaced by the SQLite persistence layer
 * when US-05 lands. It provides a working ConversationStore interface
 * so the engine can be developed and tested independently of persistence.
 */

import type { AppContext, Conversation, ConversationStore, Message } from './types.js';

interface StoredConversation {
  conversation: Conversation;
  messages: Message[];
  contextEngrams: Array<{ engramId: string; relevanceScore: number }>;
}

export class InMemoryConversationStore implements ConversationStore {
  private readonly store = new Map<string, StoredConversation>();

  async getConversation(id: string): Promise<Conversation | null> {
    return this.store.get(id)?.conversation ?? null;
  }

  async createConversation(params: {
    id: string;
    title: string | null;
    activeScopes: string[];
    appContext: AppContext | null;
    model: string;
  }): Promise<Conversation> {
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: params.id,
      title: params.title,
      activeScopes: params.activeScopes,
      appContext: params.appContext,
      model: params.model,
      createdAt: now,
      updatedAt: now,
    };

    this.store.set(params.id, {
      conversation,
      messages: [],
      contextEngrams: [],
    });

    return conversation;
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    const entry = this.store.get(conversationId);
    if (!entry) return [];
    return entry.messages.toSorted(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  async addMessage(conversationId: string, message: Message): Promise<void> {
    const entry = this.store.get(conversationId);
    if (!entry) return;
    entry.messages.push(message);
  }

  async touchConversation(conversationId: string): Promise<void> {
    const entry = this.store.get(conversationId);
    if (!entry) return;
    entry.conversation.updatedAt = new Date().toISOString();
  }

  async addContextEngrams(
    conversationId: string,
    engrams: Array<{ engramId: string; relevanceScore: number }>
  ): Promise<void> {
    const entry = this.store.get(conversationId);
    if (!entry) return;

    for (const engram of engrams) {
      const existing = entry.contextEngrams.find((e) => e.engramId === engram.engramId);
      if (!existing) {
        entry.contextEngrams.push(engram);
      }
    }
  }

  /** Test helper: clear all stored data. */
  clear(): void {
    this.store.clear();
  }
}
