import type {
  ProviderAccountStatus,
  ProviderOperation,
  ProviderRunStatus,
  ImportBatch,
  CommitReceipt,
} from '../../contacts-api/types.gen';

/** Fictional provider operation identifier. */
export const providerOperation: ProviderOperation = {
  accountId: '00000000-0000-4000-8000-000000000010',
  runId: '00000000-0000-4000-8000-000000000011',
};
/** Fictional completed provider scan. */
export const providerStatus: ProviderRunStatus = {
  ...providerOperation,
  runId: '00000000-0000-4000-8000-000000000011',
  status: 'completed',
  totalCollections: 1,
  completedCollections: 1,
  batchIds: [],
};
/** Fictional connected provider account metadata. */
export const providerAccounts: ProviderAccountStatus[] = [
  {
    accountId: providerOperation.accountId,
    provider: 'google',
    connected: true,
    reauthorizationRequired: false,
    includeOtherContacts: false,
    latestRunId: providerStatus.runId,
    previewRunId: providerStatus.runId,
  },
];
/** Fictional empty durable import preview. */
export const importBatch: ImportBatch = {
  id: '00000000-0000-4000-8000-000000000012',
  accountId: providerOperation.accountId,
  collectionKey: 'contacts',
  revision: 1,
  rows: [],
  createdAt: '2026-10-24T00:00:00Z',
};
/** Fictional persisted import receipt. */
export const importReceipt: CommitReceipt = { batchId: importBatch.id, revision: 2, rows: [] };
