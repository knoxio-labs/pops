import {
  ACCOUNTS,
  BALANCE_HISTORY,
  EVERYDAY_ACCOUNT_ID,
  REWARDS_CARD_ID,
  REWARDS_CHECKPOINTS,
} from '../../fixtures/accounts';
import { IMPORT_BATCHES, IMPORT_CONFIG } from '../../fixtures/imports';
import { created, noContent, notFound, ok, page } from '../respond';

import type { MockHandler, MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  AccountImportsGetConfigResponses,
  AccountImportsListBatchesResponses,
  AccountImportsGetSyncJobResponses,
  AccountsGetResponses,
  AccountsPreviewMergeResponses,
  CheckpointsBalanceResponses,
  CheckpointsHistoryResponses,
  CheckpointsListResponses,
  GiftCardDetailsWriteResponses,
  LoanLinkOffsetAccountResponses,
  LoanListOffsetLinksResponses,
  LoanListRateHistoryResponses,
  LoanRecordRateResponses,
  LoanUnlinkOffsetAccountResponses,
  LoanWriteTermsResponses,
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

const WRITTEN_AT = '2026-09-05T08:00:00.000Z';

const syncJob: AccountImportsGetSyncJobResponses[200]['data'] = {
  id: 'sync-job-1',
  accountId: EVERYDAY_ACCOUNT_ID,
  status: 'completed',
  trigger: 'manual',
  from: '2026-08-06',
  to: '2026-09-05',
  startedAt: WRITTEN_AT,
  finishedAt: '2026-09-05T08:00:04.000Z',
  error: null,
  result: {
    alreadyHeld: 0,
    alreadyInLedger: 0,
    alreadyStaged: 0,
    draftId: null,
    fetched: 0,
    settled: 0,
    staged: 0,
    warnings: [],
  },
};

const mergePreview: MockHandler = ({ params }) => {
  const source = ACCOUNTS.find((a) => a.id === params['id']);
  const target = ACCOUNTS.find((a) => a.id !== params['id']);
  if (source === undefined || target === undefined) return notFound('account');
  const body: AccountsPreviewMergeResponses[200] = {
    data: {
      source,
      target,
      transactionCount: 0,
      checkpointCount: 0,
      hasGiftCardDetailsConflict: false,
      resultingBalanceCents: source.balance.balanceCents + target.balance.balanceCents,
    },
  };
  return { body };
};

const giftCardWritten: MockHandler = ({ params }) => {
  const body: GiftCardDetailsWriteResponses[200] = {
    data: {
      accountId: params['id'] ?? '',
      expiresOn: null,
      issuerEntityId: null,
      lastFour: '0000',
    },
    message: 'saved',
  };
  return { body };
};

const loanTermsWritten: MockHandler = ({ params }) => {
  const body: LoanWriteTermsResponses[200] = {
    data: {
      accountId: params['id'] ?? '',
      annualRatePct: 6.1,
      createdAt: WRITTEN_AT,
      monthlyRepayment: 2_400,
      originalPrincipal: 400_000,
      source: 'manual',
      startedOn: '2024-01-01',
      termMonths: 360,
      termsEffectiveFrom: '2024-01-01',
      updatedAt: WRITTEN_AT,
    },
    message: 'saved',
  };
  return { body };
};

const offsetLink = (params: Readonly<Record<string, string>>) => ({
  createdAt: WRITTEN_AT,
  id: params['linkId'] ?? 'offset-link-1',
  linkedFrom: '2026-09-05',
  loanAccountId: params['id'] ?? '',
  offsetAccountId: EVERYDAY_ACCOUNT_ID,
});

const offsetLinked: MockHandler = ({ params }) => {
  const body: LoanLinkOffsetAccountResponses[201] = {
    data: { ...offsetLink(params), unlinkedAt: null },
    message: 'linked',
  };
  return { status: 201, body };
};

const offsetUnlinked: MockHandler = ({ params }) => {
  const body: LoanUnlinkOffsetAccountResponses[200] = {
    data: { ...offsetLink(params), unlinkedAt: WRITTEN_AT },
    message: 'unlinked',
  };
  return { body };
};

const rateRecorded: MockHandler = ({ params }) => {
  const body: LoanRecordRateResponses[201] = {
    data: {
      annualRatePct: 6.1,
      createdAt: WRITTEN_AT,
      effectiveFrom: '2026-09-01',
      id: 'rate-1',
      loanAccountId: params['id'] ?? '',
      source: 'manual',
    },
    message: 'recorded',
  };
  return { status: 201, body };
};

export const accountHandlers: MockHandlers = {
  'GET /accounts': (request) => ({ body: page(ACCOUNTS, request) }),
  'POST /accounts': created({ data: everyday, message: 'created' }),
  'POST /accounts/reorder': ok({ data: ACCOUNTS, message: 'reordered' }),
  'GET /accounts/{id}': byId,
  'PATCH /accounts/{id}': ok({ data: everyday, message: 'updated' }),
  'DELETE /accounts/{id}': ok({ data: everyday, message: 'deleted' }),
  'POST /accounts/{id}/merge': ok({ data: everyday, message: 'merged' }),
  'POST /accounts/{id}/merge/preview': mergePreview,

  'GET /accounts/{id}/balance': balanceFor,
  'GET /accounts/{id}/balance-history': ok<CheckpointsHistoryResponses[200]>({
    data: BALANCE_HISTORY,
  }),
  'GET /accounts/{id}/checkpoints': checkpointsFor,
  'POST /accounts/{id}/checkpoints': created({ data: REWARDS_CHECKPOINTS[0], message: 'created' }),
  'DELETE /accounts/{id}/checkpoints/{checkpointId}': noContent,

  'GET /accounts/{id}/gift-card-details': () => notFound('gift card'),
  'PUT /accounts/{id}/gift-card-details': giftCardWritten,
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
  'PUT /accounts/{id}/loan-terms': loanTermsWritten,
  'GET /accounts/{id}/loan-offset-links': ok<LoanListOffsetLinksResponses[200]>({ data: [] }),
  'POST /accounts/{id}/loan-offset-links': offsetLinked,
  'POST /accounts/{id}/loan-offset-links/{linkId}/unlink': offsetUnlinked,
  'GET /accounts/{id}/loan-rate-history': ok<LoanListRateHistoryResponses[200]>({ data: [] }),
  'POST /accounts/{id}/loan-rate-history': rateRecorded,
};
