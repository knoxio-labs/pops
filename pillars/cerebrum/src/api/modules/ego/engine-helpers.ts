/**
 * Pure helpers for the ConversationEngine.
 *
 * Pillar delta: the monolith reads engine tuning from `getSettingValue('ego.*')`;
 * the pillar has no settings service, so the defaults are the hardcoded
 * constants below (overridable per-construction via `Partial<EngineConfig>`).
 */
import type { RetrievalFilters } from '../retrieval/types.js';
import type { EgoChatMessage, EgoStreamDone, EgoStreamEvent } from './llm.js';
import type { EngineConfig, Message } from './types.js';

const DEFAULT_MAX_HISTORY = 20;
const DEFAULT_MAX_RETRIEVAL = 5;
const DEFAULT_TOKEN_BUDGET = 4096;
const DEFAULT_MIN_COSINE = 0.3;

function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

export function buildRetrievalFilters(scopes: string[]): RetrievalFilters {
  const filters: RetrievalFilters = {};
  if (scopes.length > 0) {
    filters.scopes = scopes;
  }
  if (scopes.some(isSecretScope)) {
    filters.includeSecret = true;
  }
  return filters;
}

/**
 * Build the LLM message array: the most recent `maxHistoryMessages` user/
 * assistant turns, then the current message (with the retrieved-knowledge
 * context block appended when present).
 */
export function buildLlmMessages(
  history: Message[],
  currentMessage: string,
  contextBlock: string,
  maxHistoryMessages: number
): EgoChatMessage[] {
  const messages: EgoChatMessage[] = [];
  const recentHistory = history.slice(-maxHistoryMessages);

  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  const userContent = contextBlock
    ? `${currentMessage}\n\n---\nRetrieved knowledge:\n${contextBlock}`
    : currentMessage;
  messages.push({ role: 'user', content: userContent });
  return messages;
}

export function buildDefaultConfig(config?: Partial<EngineConfig>): EngineConfig {
  return {
    maxHistoryMessages: config?.maxHistoryMessages ?? DEFAULT_MAX_HISTORY,
    maxRetrievalResults: config?.maxRetrievalResults ?? DEFAULT_MAX_RETRIEVAL,
    tokenBudget: config?.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
    minCosine: config?.minCosine ?? DEFAULT_MIN_COSINE,
  };
}

/** Drains a model turn and returns its terminal `done` event; the streamed tokens are not needed. */
export async function drainToDone(events: AsyncIterable<EgoStreamEvent>): Promise<EgoStreamDone> {
  let done: EgoStreamDone | undefined;
  for await (const event of events) {
    if (event.type === 'done') done = event;
  }
  if (done === undefined) throw new Error('ego stream ended without a done event');
  return done;
}
