/**
 * Sharing an account with someone else: the grant service, the transaction
 * audit log, and the value sets both tables constrain their columns to. The tables themselves
 * come through `./core.ts` with the rest of the schema.
 *
 * One of the groups re-exported by `../index.ts` — see that file's header for
 * why the barrel is split rather than flat.
 */
export { ACCOUNT_GRANT_ROLES, type AccountGrantRole } from '../schema/account-grants.js';

export * as accountGrantsService from '../services/account-grants.js';

export type { AccountGrantRow, UpsertGrantInput } from '../services/account-grants.js';

export {
  TRANSACTION_EVENT_ACTIONS,
  TRANSACTION_EVENT_ACTOR_KINDS,
  type TransactionEventAction,
  type TransactionEventActorKind,
} from '../schema/transaction-events.js';

export * as transactionEventsService from '../services/transaction-events.js';

export type {
  AccountEventsPage,
  TransactionActor,
  TransactionEventInput,
  TransactionEventRow,
} from '../services/transaction-events.js';
