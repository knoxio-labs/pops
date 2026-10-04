import { EgoActionStore } from '../modules/ego/actions-store.js';
import { settleConversation } from '../modules/ego/batch-settle.js';
import { ConversationPersistence } from '../modules/ego/persistence.js';

import type { SettleResult } from '../modules/ego/batch-settle.js';
import type { EgoHandlerDeps } from './ego-engine.js';

/** Settle any open action batches before a new message turn starts. */
export async function settleForMessage(
  deps: EgoHandlerDeps,
  conversationId: string
): Promise<SettleResult> {
  const persistence = new ConversationPersistence({ db: deps.db });
  const store = new EgoActionStore({ db: deps.db });
  return settleConversation({ store, persistence }, conversationId, { reason: 'new-message' });
}
