import {
  importsReadyApply,
  importsReviewDecide,
  importsReviewProposals,
} from '../contacts-api/sdk.gen';
import { contactRequest } from '../request';
import { mapReview } from './mapReview';

import type { FieldSelection } from '../contacts-api/types.gen';
import type { ReviewGateway, ReviewRequest } from './contracts';

function selections(request: ReviewRequest): FieldSelection[] {
  const selected: FieldSelection[] = [];
  const choices = request.choices;
  if (choices.nameEntityId)
    selected.push({ kind: 'entity', field: 'name', entityId: choices.nameEntityId });
  if (choices.nameSourceRecordId)
    selected.push({
      kind: 'sourceRecord',
      field: 'name',
      sourceRecordId: choices.nameSourceRecordId,
    });
  if (choices.profileEntityId)
    selected.push({ kind: 'entity', field: 'personProfile', entityId: choices.profileEntityId });
  if (choices.profileSourceRecordId)
    selected.push({
      kind: 'sourceRecord',
      field: 'personProfile',
      sourceRecordId: choices.profileSourceRecordId,
    });
  return selected;
}

/** Contacts-owned generated-client binding; one save is exactly one atomic review transaction. */
export const reviewGateway: ReviewGateway = {
  load: async (batchId, page) =>
    mapReview(
      await contactRequest(() =>
        importsReviewProposals({
          path: { id: batchId },
          query: { ...page, limit: 50, candidateLimit: 50 },
        })
      )
    ),
  applyReady: async ({ batchId, ...body }) => {
    const receipt = await contactRequest(() => importsReadyApply({ path: { id: batchId }, body }));
    return { appliedRows: receipt.rows.length };
  },
  save: async (request) => {
    await contactRequest(() =>
      importsReviewDecide({
        path: { id: request.batchId },
        body: {
          batchRevision: request.batchRevision,
          directoryRevision: request.directoryRevision,
          proposalRevision: request.proposalRevision,
          rowId: request.rowId,
          idempotencyKey: request.idempotencyKey,
          mergeEntityIds: request.mergeEntityIds,
          differentEntityIds: request.differentEntityIds,
          laterEntityIds: request.laterEntityIds,
          selections: selections(request),
          incomingFields: request.choices.incomingFields,
          preferredPointIds: request.choices.preferredPointIds,
        },
      })
    );
  },
};
