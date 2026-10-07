import { ok } from '../respond';

import type { MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  TransactionHistoryForAccountResponses,
  TransactionHistoryForTransactionResponses,
} from '../../../finance-api/types.gen';

/** The audit log. No fixture transaction was written through an audited route, so both are empty. */
export const historyHandlers: MockHandlers = {
  'GET /transactions/{id}/history': ok<TransactionHistoryForTransactionResponses[200]>({
    data: [],
  }),
  'GET /accounts/{id}/history': ok<TransactionHistoryForAccountResponses[200]>({
    data: [],
    pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
  }),
};
