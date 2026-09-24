import { EVERYDAY_ACCOUNT_ID, REWARDS_CARD_ID } from './accounts';
import { FUEL_ENTITY_ID, GROCER_ENTITY_ID } from './entities';

import type { TransactionsListResponses } from '../../finance-api/types.gen';

/**
 * The ledger the other pages read, fictional throughout.
 *
 * Each row stores the entity name it was written with (`entityName`), which
 * is what a transaction shows whether or not contacts can be reached. The
 * last row is the one the correction proposal in `./rules` retargets: its
 * description matches the rule, but it was saved against no entity.
 */

export type FixtureTransaction = TransactionsListResponses[200]['data'][number];

export const PROPOSAL_TRANSACTION_ID = 'txn-hbr-unmatched';

const EDITED = '2026-09-04T10:00:00.000Z';

function transaction(
  fields: Pick<FixtureTransaction, 'id' | 'accountId' | 'amount' | 'date' | 'description'> &
    Partial<FixtureTransaction>
): FixtureTransaction {
  return {
    type: 'purchase',
    entityId: null,
    entityName: null,
    tags: [],
    notes: null,
    location: null,
    country: 'AU',
    foreignAmountMinor: null,
    foreignCurrency: null,
    fxCaptureSource: null,
    fxFeeCents: null,
    relatedTransactionId: null,
    lastEditedTime: EDITED,
    ...fields,
  };
}

export const TRANSACTIONS: FixtureTransaction[] = [
  transaction({
    id: 'txn-hbr-0904',
    accountId: EVERYDAY_ACCOUNT_ID,
    amount: -84.35,
    date: '2026-09-04',
    description: 'HARBOUR GROCER WHARF ST',
    entityId: GROCER_ENTITY_ID,
    entityName: 'Harbour Grocer',
    tags: ['groceries'],
  }),
  transaction({
    id: 'txn-salary-0901',
    accountId: EVERYDAY_ACCOUNT_ID,
    amount: 4_120,
    date: '2026-09-01',
    description: 'PAYROLL LANTERN STUDIOS',
    type: 'income',
    tags: ['salary'],
  }),
  transaction({
    id: 'txn-fuel-0827',
    accountId: REWARDS_CARD_ID,
    amount: -71.9,
    date: '2026-08-27',
    description: 'NTHSIDE FUEL 0412',
    entityId: FUEL_ENTITY_ID,
    entityName: 'Northside Fuel',
    tags: ['transport'],
  }),
  transaction({
    id: 'txn-hbr-0822',
    accountId: EVERYDAY_ACCOUNT_ID,
    amount: -42.1,
    date: '2026-08-22',
    description: 'HARBOUR GROCER WHARF ST',
    entityId: GROCER_ENTITY_ID,
    entityName: 'Harbour Grocer',
    tags: ['groceries'],
  }),
  transaction({
    id: PROPOSAL_TRANSACTION_ID,
    accountId: REWARDS_CARD_ID,
    amount: -19.6,
    date: '2026-08-18',
    description: 'HBR GROCER PTY 118',
  }),
];

/** The rows that name one entity, newest first, as the entity page's card asks for them. */
export function transactionsForEntity(entityId: string | null): FixtureTransaction[] {
  return entityId === null ? TRANSACTIONS : TRANSACTIONS.filter((t) => t.entityId === entityId);
}
