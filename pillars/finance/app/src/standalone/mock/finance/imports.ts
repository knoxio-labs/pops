import { IMPORT_BATCHES, IMPORT_DRAFTS, IMPORT_PROGRESS } from '../../fixtures/imports';
import { created, noContent, notFound, ok } from '../respond';

import type { MockHandler, MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  ImportDraftsListResponses,
  ImportsCommitImportResponses,
  ImportsGetImportProgressResponses,
} from '../../../finance-api/types.gen';

/**
 * The import wizard's operations. The pending draft is listed, and reading
 * the progress of its session answers the fixture result with its one
 * skipped (duplicate) row; opening the draft itself answers an empty payload,
 * which the wizard treats as "start from the upload step".
 */

const [draft] = IMPORT_DRAFTS;

const draftById: MockHandler = ({ params }) => {
  const found = IMPORT_DRAFTS.find((d) => d.id === params['id']);
  return found === undefined ? notFound('draft') : { body: { data: { ...found, payload: {} } } };
};

const reevaluated = { affectedCount: 0, result: IMPORT_PROGRESS.result };

const COMMITTED: ImportsCommitImportResponses[200] = {
  data: {
    batches: IMPORT_BATCHES.map(
      ({ accountId, checkpointId, dateFrom, dateTo, id, rowCount, sourceKind }) => ({
        accountId,
        checkpointId,
        dateFrom,
        dateTo,
        id,
        rowCount,
        sourceKind,
      })
    ),
    entitiesCreated: 0,
    failedDetails: [],
    retroactiveReclassifications: 0,
    rulesApplied: { add: 0, disable: 0, edit: 0, remove: 0 },
    tagRulesApplied: 0,
    transactionsFailed: 0,
    transactionsImported: IMPORT_BATCHES.reduce((sum, batch) => sum + batch.rowCount, 0),
  },
  message: 'committed',
};

export const importHandlers: MockHandlers = {
  'GET /import-drafts': ok<ImportDraftsListResponses[200]>({ data: IMPORT_DRAFTS }),
  'POST /import-drafts': created({ data: draft }),
  'GET /import-drafts/{id}': draftById,
  'PUT /import-drafts/{id}': ok({ data: draft }),
  'DELETE /import-drafts/{id}': noContent,
  'POST /import-drafts/{id}/claim': ok({ data: draft }),
  'POST /import-drafts/{id}/heartbeat': ok({ data: draft }),
  'POST /import-drafts/{id}/release': noContent,

  'POST /imports/process': ok({ sessionId: IMPORT_PROGRESS.sessionId }),
  'GET /imports/progress': ok<ImportsGetImportProgressResponses[200]>(IMPORT_PROGRESS),
  'POST /imports/commit': ok(COMMITTED),
  'POST /imports/entities': ok({ entityId: 'ent-new-merchant', entityName: 'New merchant' }),
  'POST /imports/reevaluate-pending': ok(reevaluated),
  'POST /imports/reevaluate-pending-rows': ok(reevaluated),
  'POST /imports/apply-changeset-reevaluate': ok(reevaluated),
};
