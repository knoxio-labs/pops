/**
 * Types for the Ego conversation engine (PRD-087 US-01).
 *
 * Covers: AppContext, Message, ChatResult, Conversation,
 * ConversationStore interface, and engine configuration.
 */

/** Which pops app the user is currently viewing. */
export interface AppContext {
  app: string;
  route?: string;
  entityId?: string;
  entityType?: string;
}

/** A single message in a conversation. */
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: string[];
  toolCalls?: unknown[];
  tokensIn?: number;
  tokensOut?: number;
  createdAt: string;
}

/** Result returned from ConversationEngine.chat(). */
export interface ChatResult {
  response: {
    content: string;
    citations: string[];
    tokensIn: number;
    tokensOut: number;
  };
  retrievedEngrams: Array<{
    engramId: string;
    relevanceScore: number;
  }>;
}

/** A conversation record. */
export interface Conversation {
  id: string;
  title: string | null;
  activeScopes: string[];
  appContext: AppContext | null;
  model: string;
  createdAt: string;
  updatedAt: string;
}

/** Parameters for ConversationEngine.chat(). */
export interface ChatParams {
  conversationId: string;
  message: string;
  history: Message[];
  activeScopes: string[];
  appContext?: AppContext;
}

/**
 * Abstraction over conversation persistence.
 *
 * The engine depends on this interface so persistence can be
 * implemented in-memory (stub) or via SQLite (US-05) without
 * changing the engine code.
 */
export interface ConversationStore {
  /** Get a conversation by ID, or null if it doesn't exist. */
  getConversation(id: string): Promise<Conversation | null>;

  /** Create a new conversation. Returns the created record. */
  createConversation(params: {
    id: string;
    title: string | null;
    activeScopes: string[];
    appContext: AppContext | null;
    model: string;
  }): Promise<Conversation>;

  /** Load message history for a conversation, ordered by createdAt ascending. */
  getMessages(conversationId: string): Promise<Message[]>;

  /** Append a message to a conversation. */
  addMessage(conversationId: string, message: Message): Promise<void>;

  /** Update the conversation's updatedAt timestamp. */
  touchConversation(conversationId: string): Promise<void>;

  /** Record engrams that were retrieved during a turn. */
  addContextEngrams(
    conversationId: string,
    engrams: Array<{ engramId: string; relevanceScore: number }>
  ): Promise<void>;
}

/** Configuration for the conversation engine. */
export interface EngineConfig {
  /** LLM model identifier. */
  model: string;
  /** Max history messages to include in context (default 20). */
  maxHistoryMessages: number;
  /** Max engrams to retrieve per query (default 5). */
  maxRetrievalResults: number;
  /** Token budget for context assembly (default 4096). */
  tokenBudget: number;
  /** Relevance threshold for retrieval results (default 0.3). */
  relevanceThreshold: number;
}
