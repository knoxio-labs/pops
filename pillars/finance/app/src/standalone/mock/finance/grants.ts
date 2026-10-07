import { EVERYDAY_ACCOUNT_ID } from '../../fixtures/accounts';
import { noContent, ok } from '../respond';

import type { MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  AccountGrantsListResponses,
  AccountGrantsPutResponses,
} from '../../../finance-api/types.gen';

/** `/accounts/{id}/grants`. No fixture account is shared, so every listing is empty. */
export const grantHandlers: MockHandlers = {
  'GET /accounts/{id}/grants': ok<AccountGrantsListResponses[200]>({ data: [] }),
  'PUT /accounts/{id}/grants': ok<AccountGrantsPutResponses[200]>({
    data: {
      id: 'grant-everyday-guest',
      accountId: EVERYDAY_ACCOUNT_ID,
      email: 'guest@example.test',
      role: 'view',
      createdAt: '2026-10-01T00:00:00.000Z',
      createdBy: null,
    },
    message: 'granted',
  }),
  'DELETE /accounts/{id}/grants/{grantId}': noContent,
};
