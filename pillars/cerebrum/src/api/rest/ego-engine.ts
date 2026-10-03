/**
 * Shared builder for Ego's contract and SSE entry points.
 *
 * Keep the engine's retrieval, engram, and optional toolbox dependencies in
 * one place so both chat routes use the same tool loop configuration.
 */
import { ConversationEngine } from '../modules/ego/engine.js';
import { EngramService } from '../modules/engrams/service.js';

import type { EgoHandlerDeps } from './ego-handlers.js';

/** Build the conversation engine from the dependencies shared by both routes. */
export function buildEgoEngine(deps: EgoHandlerDeps): ConversationEngine {
  return new ConversationEngine({
    llm: deps.llm,
    search: {
      db: deps.db,
      raw: deps.raw,
      vecAvailable: deps.vecAvailable,
      peers: deps.peers,
      embeddingClient: deps.embeddingClient,
    },
    engramService: new EngramService({
      root: deps.engramRoot,
      db: deps.db,
      templates: deps.templates,
    }),
    toolbox: deps.tools?.toolbox,
    gateway: deps.tools?.gateway,
  });
}
