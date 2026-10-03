/**
 * Shared builder for Ego's contract and SSE entry points.
 *
 * Keep the engine's retrieval, engram, and optional toolbox dependencies in
 * one place so both chat routes use the same tool loop configuration.
 */
import { ConversationEngine } from '../modules/ego/engine.js';
import { EngramService } from '../modules/engrams/service.js';

import type BetterSqlite3 from 'better-sqlite3';

import type { CerebrumDb } from '../../db/index.js';
import type { EgoLlm } from '../modules/ego/llm.js';
import type { EgoTools } from '../modules/ego/toolbox.js';
import type { EmbeddingClient } from '../modules/retrieval/embedding-client.js';
import type { PeerClients } from '../modules/retrieval/peer-clients.js';
import type { TemplateRegistry } from '../modules/templates/registry.js';

/** Dependencies shared by Ego's contract and streaming route handlers. */
export interface EgoHandlerDeps {
  db: CerebrumDb;
  raw: BetterSqlite3.Database;
  vecAvailable: boolean;
  engramRoot: string;
  templates: TemplateRegistry;
  llm: EgoLlm;
  tools?: EgoTools;
  peers: PeerClients;
  embeddingClient?: EmbeddingClient;
}

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
