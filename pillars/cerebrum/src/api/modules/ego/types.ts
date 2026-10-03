/**
 * Ego conversation engine domain types.
 *
 * The conversation/message/context row shapes live in the pillar db
 * (conversationsService, src/db/services/conversations.ts); these are the
 * engine-level shapes (chat params, results, streaming events, scope
 * negotiation) the engine traffics in.
 */
import type { EgoMessagePart } from '../../../contract/rest-ego-parts.js';
import type { Message } from './persistence.js';
import type { AutoExecutedGroup, ProposedBatch } from './tool-loop.js';

export type { Message };

/** Which pops app the user is currently viewing. */
export interface AppContext {
  app: string;
  route?: string;
  entityId?: string;
  entityType?: string;
  entityTitle?: string;
  uri?: string;
}

/** Scope negotiation outcome included in ChatResult. */
export interface ScopeNegotiation {
  scopes: string[];
  changed: boolean;
  reason: string | null;
  secretNotice: string | null;
}

/** Result returned from ConversationEngine.chat(). */
export interface ChatResult {
  response: {
    content: string;
    citations: string[];
    tokensIn: number;
    tokensOut: number;
    parts: EgoMessagePart[];
    batch: ProposedBatch | null;
    autoExecuted: AutoExecutedGroup[];
  };
  retrievedEngrams: Array<{ engramId: string; relevanceScore: number }>;
  /** Scope negotiation outcome, present when negotiation was run. */
  scopeNegotiation?: ScopeNegotiation;
}

/** A partial text token yielded during streaming. */
export interface ChatStreamToken {
  type: 'token';
  text: string;
}

/** A tool lifecycle event forwarded from the tool loop. */
export interface ChatStreamTool {
  type: 'tool';
  name: string;
  status: 'started' | 'finished' | 'failed';
}

/** A model-visible part yielded by a tool. */
export interface ChatStreamPart {
  type: 'part';
  part: EgoMessagePart;
}

/** A navigation request yielded by a tool. */
export interface ChatStreamNavigate {
  type: 'navigate';
  uri: string;
}

/** Final metadata yielded when the stream completes. */
export interface ChatStreamDone {
  type: 'done';
  content: string;
  citations: string[];
  tokensIn: number;
  tokensOut: number;
  parts: EgoMessagePart[];
  batch: ProposedBatch | null;
  autoExecuted: AutoExecutedGroup[];
}

/** Union of events yielded by the engine's streaming generator. */
export type ChatStreamEvent =
  | ChatStreamToken
  | ChatStreamTool
  | ChatStreamPart
  | ChatStreamNavigate
  | ChatStreamDone;

/** Preparation result from ConversationEngine.prepareStream(). */
export interface ChatStreamPreparation {
  stream: AsyncGenerator<ChatStreamEvent>;
  retrievedEngrams: Array<{ engramId: string; relevanceScore: number }>;
  scopeNegotiation: ScopeNegotiation;
}

/** Channels through which Ego conversations can originate. */
export type EgoChannel = 'shell' | 'moltbot' | 'mcp' | 'cli';

/** Parameters for ConversationEngine.chat(). */
export interface ChatParams {
  conversationId: string;
  message: string;
  history: Message[];
  activeScopes: string[];
  appContext?: AppContext;
  /** Channel the conversation originates from (for scope defaults). */
  channel?: EgoChannel;
  /** All known scopes in the system (for scope negotiation matching). */
  knownScopes?: string[];
  /** Gateway dotted tool names allowed to execute writes in this conversation. */
  allowedTools?: readonly string[];
}

/** Configuration for the conversation engine. */
export interface EngineConfig {
  maxHistoryMessages: number;
  maxRetrievalResults: number;
  tokenBudget: number;
  /** Minimum cosine similarity a retrieved engram must reach to enter the context. */
  minCosine: number;
}
