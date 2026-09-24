import { BANK_ENTITY_ID } from './entities';

import type {
  AccountsListResponses,
  CheckpointsHistoryResponses,
  CheckpointsListResponses,
} from '../../finance-api/types.gen';

/**
 * Two accounts, one of which does not add up.
 *
 * The everyday account's ledger and its last checkpoint agree. The rewards
 * card's do not: the statement said -$1,245.50 and the transactions finance
 * holds only reach -$1,213.00, so the checkpoint carries a -$32.50 delta and
 * the balance is flagged `inconsistent`. That disagreement is what the
 * accounts list, the account page and the checkpoints page each exist to
 * surface, and a fixture where everything reconciled would show none of it.
 */

export const EVERYDAY_ACCOUNT_ID = 'acc-everyday';
export const REWARDS_CARD_ID = 'acc-rewards-card';
export const REWARDS_CHECKPOINT_ID = 'chk-rewards-aug';

type Account = AccountsListResponses[200]['data'][number];

const CREATED = '2026-01-12T08:00:00.000Z';
const UPDATED = '2026-09-02T08:00:00.000Z';

export const ACCOUNTS: Account[] = [
  {
    id: EVERYDAY_ACCOUNT_ID,
    name: 'Everyday',
    kind: 'checking',
    currency: 'AUD',
    displayOrder: 0,
    archivedAt: null,
    entityId: BANK_ENTITY_ID,
    resolvedEntityId: BANK_ENTITY_ID,
    entityDisplayName: 'Kestrel Bank',
    entityDisplayNameStale: false,
    entityAvatarAssetId: null,
    entityColour: '#4a5fb0',
    transactionCount: 3,
    balance: {
      anchor: { asOf: '2026-08-31', checkpointId: 'chk-everyday-aug', source: 'statement' },
      asOf: '2026-09-04',
      balanceCents: 318_420,
      basis: 'checkpoint',
      inconsistent: false,
    },
    importStatus: {
      cadenceDays: 30,
      lastBatchId: 'imp-everyday-aug',
      lastImportAt: '2026-09-01T07:30:00.000Z',
      lastSyncedAt: null,
      newestTransactionDate: '2026-09-04',
      source: { kind: 'csv-dialect', dialectId: 'kestrel-csv' },
      span: { from: '2026-08-01', to: '2026-08-31' },
    },
    createdAt: CREATED,
    updatedAt: UPDATED,
  },
  {
    id: REWARDS_CARD_ID,
    name: 'Rewards card',
    kind: 'credit-card',
    currency: 'AUD',
    displayOrder: 1,
    archivedAt: null,
    entityId: BANK_ENTITY_ID,
    resolvedEntityId: BANK_ENTITY_ID,
    entityDisplayName: 'Kestrel Bank',
    entityDisplayNameStale: false,
    entityAvatarAssetId: null,
    entityColour: '#4a5fb0',
    transactionCount: 2,
    balance: {
      anchor: { asOf: '2026-08-31', checkpointId: REWARDS_CHECKPOINT_ID, source: 'statement' },
      asOf: '2026-08-31',
      balanceCents: -124_550,
      basis: 'checkpoint',
      inconsistent: true,
    },
    importStatus: {
      cadenceDays: 30,
      lastBatchId: null,
      lastImportAt: null,
      lastSyncedAt: null,
      newestTransactionDate: '2026-08-27',
      source: null,
      span: null,
    },
    createdAt: CREATED,
    updatedAt: UPDATED,
  },
];

type Checkpoint = CheckpointsListResponses[200]['data'][number];

/** The rewards card's statement checkpoints; August's is the one that disagrees. */
export const REWARDS_CHECKPOINTS: Checkpoint[] = [
  {
    id: REWARDS_CHECKPOINT_ID,
    accountId: REWARDS_CARD_ID,
    asOf: '2026-08-31',
    balanceCents: -124_550,
    expectedBalanceCents: -121_300,
    deltaCents: -3_250,
    note: 'August statement',
    source: 'statement',
    sourceRef: 'statement-2026-08.pdf',
    createdAt: '2026-09-01T07:35:00.000Z',
  },
  {
    id: 'chk-rewards-jul',
    accountId: REWARDS_CARD_ID,
    asOf: '2026-07-31',
    balanceCents: -98_210,
    expectedBalanceCents: -98_210,
    deltaCents: 0,
    note: null,
    source: 'statement',
    sourceRef: 'statement-2026-07.pdf',
    createdAt: '2026-08-01T07:35:00.000Z',
  },
];

export const BALANCE_HISTORY: CheckpointsHistoryResponses[200]['data'] = [
  { month: '2026-06', balanceCents: 281_000 },
  { month: '2026-07', balanceCents: 297_640 },
  { month: '2026-08', balanceCents: 318_420 },
];
