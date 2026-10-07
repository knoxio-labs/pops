import { created, done, financeNotFound, ok } from '../respond';

import type { MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  TransactionAttachmentsAttachResponses,
  TransactionAttachmentsListResponses,
} from '../../../finance-api/types.gen';

/** Files attached to a transaction. No fixture transaction holds one, so there is nothing to open. */
export const attachmentHandlers: MockHandlers = {
  'GET /transactions/{id}/attachments': ok<TransactionAttachmentsListResponses[200]>({
    data: [],
  }),
  'POST /transactions/{id}/attachments': created<TransactionAttachmentsAttachResponses[201]>({
    data: [],
    message: 'Files attached',
  }),
  'GET /transactions/{id}/attachments/{attachmentId}': () => financeNotFound('attachment'),
  'GET /transactions/{id}/attachments/{attachmentId}/thumbnail': () =>
    financeNotFound('attachment'),
  'DELETE /transactions/{id}/attachments/{attachmentId}': done,
};
