/** REST handler for recording decisions on pending Ego action batches. */
import { initServer } from '@ts-rest/express';

import { EgoActionStore } from '../modules/ego/actions-store.js';
import { decideBatch } from '../modules/ego/batch-decision.js';
import { ConversationPersistence } from '../modules/ego/persistence.js';
import { cerebrumErrors, ConflictError, NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { EgoActionWire, EgoBatchWire } from '../../contract/rest-ego-schemas.js';
import type { cerebrumEgoContract } from '../../contract/rest-ego.js';
import type { EgoActionBatchRow, EgoActionRow } from '../../db/index.js';
import type { EgoHandlerDeps } from './ego-engine.js';

const server: ReturnType<typeof initServer> = initServer();

/** Build the handler that records a user's decision without executing writes. */
export function makeEgoActionHandlers(
  deps: EgoHandlerDeps
): Pick<ReturnType<typeof server.router<typeof cerebrumEgoContract>>, 'decideActionBatch'> {
  const store = new EgoActionStore({ db: deps.db });
  const persistence = new ConversationPersistence({ db: deps.db });

  return {
    decideActionBatch: async ({ params, body }) =>
      runHttp(async () => {
        if (deps.tools === undefined && body.approve.length > 0) {
          cerebrumErrors.gateway_unavailable();
        }

        const outcome = await decideBatch({ store, persistence }, params.batchId, body);
        if (typeof outcome === 'string') {
          if (outcome === 'not-found') throw new NotFoundError('ActionBatch', params.batchId);
          if (outcome === 'not-pending') {
            throw new ConflictError(`Action batch '${params.batchId}' is not pending.`);
          }
          return cerebrumErrors.invalid_decision();
        }

        return {
          status: 200 as const,
          body: {
            batch: toEgoBatchWire(outcome.batch, outcome.actions),
            updatedMessage: outcome.updatedMessage,
          },
        };
      }),
  };
}

function toEgoBatchWire(batch: EgoActionBatchRow, actions: EgoActionRow[]): EgoBatchWire {
  return {
    id: batch.id,
    conversationId: batch.conversationId,
    messageId: batch.messageId,
    status: batch.status,
    actions: actions.map(toEgoActionWire),
    createdAt: batch.createdAt,
    decidedAt: batch.decidedAt,
  };
}

function toEgoActionWire(action: EgoActionRow): EgoActionWire {
  return {
    id: action.id,
    batchId: action.batchId,
    conversationId: action.conversationId,
    messageId: action.messageId,
    tool: action.tool,
    summary: action.summary,
    status: action.status,
    result: action.result,
    createdAt: action.createdAt,
    resolvedAt: action.resolvedAt,
  };
}
