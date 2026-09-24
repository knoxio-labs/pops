import {
  ACCOUNTS,
  BALANCE_HISTORY,
  EVERYDAY_ACCOUNT_ID,
  REWARDS_CARD_ID,
  REWARDS_CHECKPOINTS,
} from '../../fixtures/accounts';
import { IMPORT_BATCHES, IMPORT_CONFIG } from '../../fixtures/imports';
import { created, done, noContent, notFound, ok, page } from '../respond';

import type { MockHandler, MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  AccountImportsGetConfigResponses,
  AccountImportsListBatchesResponses,
  AccountsGetResponses,
  CheckpointsBalanceResponses,
  CheckpointsHistoryResponses,
  CheckpointsListResponses,
  LoanListOffsetLinksResponses,
  LoanListRateHistoryResponses,
} from '../../../finance-api/types.gen';

/**
 * `/accounts/**`. The id is honoured on the reads a page opens with, so an
 * unknown account reaches the page's own not-found answer and each account
 * shows its own checkpoints — the rewards card's disagreeing one included.
 */

const [everyday] = ACCOUNTS;

const byId: MockHandler = ({ params }) => {
  const account = ACCOUNTS.find((a) => a.id === params['id']);
  if (account === undefined) return notFound('account');
  const body: AccountsGetResponses[200] = { data: account };
  return { body };
};

const checkpointsFor: MockHandler = ({ params }) => {
  const data = params['id'] === REWARDS_CARD_ID ? REWARDS_CHECKPOINTS : [];
  const body: CheckpointsListResponses[200] = { data };
  return { body };
};

const balanceFor: MockHandler = ({ params }) => {
  const account = ACCOUNTS.find((a) => a.id === params['id']);
  if (account === undefined) return notFound('account');
  const body: CheckpointsBalanceResponses[200] = { data: account.balance };
  return { body };
};

const importBatchesFor: MockHandler = ({ params }) => {
  const body: AccountImportsListBatchesResponses[200] = {
    data: params['id'] === EVERYDAY_ACCOUNT_ID ? IMPORT_BATCHES : [],
    nextBefore: null,
  };
  return { body };
};

const importConfigFor: MockHandler = ({ params }) =>
  params['id'] === EVERYDAY_ACCOUNT_ID
    ? { body: { data: IMPORT_CONFIG } satisfies AccountImportsGetConfigResponses[200] }
    : notFound('import config');

const syncJob = {
  id: 'sync-job-1',
  accountId: EVERYDAY_ACCOUNT_ID,
  status: 'completed',
  startedAt: '2026-09-05T08:00:00.000Z',
  finishedAt: '2026-09-05T08:00:04.000Z',
  error: null,
};

export const accountHandlers: MockHandlers = {
  'GET /accounts': (request) => ({ body: page(ACCOUNTS, request) }),
  'POST /accounts': created({ data: everyday, message: 'created' }),
  'POST /accounts/reorder': ok({ data: ACCOUNTS, message: 'reordered' }),
  'GET /accounts/{id}': byId,
  'PATCH /accounts/{id}': ok({ data: everyday, message: 'updated' }),
  'DELETE /accounts/{id}': ok({ data: everyday, message: 'deleted' }),
  'POST /accounts/{id}/merge': ok({ data: everyday, message: 'merged' }),
  'POST /accounts/{id}/merge/preview': ok({ data: { transactionCount: 0, checkpointCount: 0 } }),

  'GET /accounts/{id}/balance': balanceFor,
  'GET /accounts/{id}/balance-history': ok<CheckpointsHistoryResponses[200]>({
    data: BALANCE_HISTORY,
  }),
  'GET /accounts/{id}/checkpoints': checkpointsFor,
  'POST /accounts/{id}/checkpoints': created({ data: REWARDS_CHECKPOINTS[0], message: 'created' }),
  'DELETE /accounts/{id}/checkpoints/{checkpointId}': noContent,

  'GET /accounts/{id}/gift-card-details': () => notFound('gift card'),
  'PUT /accounts/{id}/gift-card-details': done,
  'POST /accounts/{id}/gift-card-details/reveal': ok({
    data: { number: '0000 0000 0000 0000', pin: '0000' },
    message: 'revealed',
  }),

  'GET /accounts/{id}/import-config': importConfigFor,
  'PUT /accounts/{id}/import-config': ok({ data: IMPORT_CONFIG, message: 'saved' }),
  'GET /accounts/{id}/imports': importBatchesFor,
  'POST /accounts/{id}/sync': () => ({ status: 202, body: { data: syncJob } }),
  'GET /accounts/{id}/sync/{jobId}': ok({ data: syncJob }),

  'GET /accounts/{id}/loan-terms': () => notFound('loan terms'),
  'PUT /accounts/{id}/loan-terms': done,
  'GET /accounts/{id}/loan-offset-links': ok<LoanListOffsetLinksResponses[200]>({ data: [] }),
  'POST /accounts/{id}/loan-offset-links': created({ data: null, message: 'linked' }),
  'POST /accounts/{id}/loan-offset-links/{linkId}/unlink': done,
  'GET /accounts/{id}/loan-rate-history': ok<LoanListRateHistoryResponses[200]>({ data: [] }),
  'POST /accounts/{id}/loan-rate-history': created({ data: null, message: 'recorded' }),
};
