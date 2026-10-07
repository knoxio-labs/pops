/**
 * bfm's finance leg for creating and editing a transaction.
 *
 * The phone sends an amount in minor units and finance takes a decimal in the
 * account's currency, so a write reads the account before it writes. That
 * read goes out as the same caller as the write: an account the caller holds
 * no grant on is finance's `404` here, before anything is written. Whether the
 * caller may write to an account it can see is decided by the write itself.
 */
import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { fetchAccountRow, resolveAccount, type ResolvedAccount } from './accounts-client.js';
import { FinanceTransactionGetResponseSchema, toMobileTransactionDetail } from './wire.js';
import { FinanceTransactionWriteResponseSchema, fromMinorUnits } from './write-wire.js';

import type {
  MobileCreateTransactionBody,
  MobileUpdateTransactionBody,
} from '../../contract/mobile-finance-write-schemas.js';
import type { MobileTransactionDetail } from '../../contract/rest-schemas.js';

type FinanceTransactionFields = Omit<MobileUpdateTransactionBody, 'amountMinorUnits'> & {
  amount?: number;
};

/** The subset of finance's router the mobile transaction writes call. */
export type FinanceTransactionWritesRouter = {
  transactions: {
    get: (input: { id: string }) => Promise<unknown>;
    create: (input: FinanceTransactionFields) => Promise<unknown>;
    update: (input: { id: string } & FinanceTransactionFields) => Promise<unknown>;
  };
};

/** Declared per file: see `accounts-client.ts` for why it is not shared. */
export const FINANCE_PILLAR_ID = 'finance';

interface KnownAccount extends ResolvedAccount {
  readonly id: string;
}

async function requireAccount(
  gateway: PillarGateway,
  accountId: string
): Promise<GatewayOutcome<KnownAccount>> {
  const account = await fetchAccountRow(gateway, accountId);
  if (!isGatewayOk(account)) return account;
  return {
    kind: 'ok',
    value: { id: accountId, name: account.value.name, currency: account.value.currency },
  };
}

/** The account the transaction sits on now, as finance serves it to this caller. */
async function currentAccountId(
  gateway: PillarGateway,
  id: string
): Promise<GatewayOutcome<string>> {
  const outcome = await gateway.call<FinanceTransactionWritesRouter, unknown>(
    FINANCE_PILLAR_ID,
    (handle) => handle.transactions.get({ id })
  );
  const current = parseOrMismatch(
    FINANCE_PILLAR_ID,
    outcome,
    FinanceTransactionGetResponseSchema,
    'transactions.get'
  );
  if (!isGatewayOk(current)) return current;
  return { kind: 'ok', value: current.value.data.accountId };
}

/**
 * Finance's answer to a write as the mobile detail record. `known` is the
 * account already read for the amount, reused when the transaction sits on it.
 */
async function toWrittenTransaction(
  gateway: PillarGateway,
  outcome: GatewayOutcome<unknown>,
  operation: string,
  known: KnownAccount | null
): Promise<GatewayOutcome<MobileTransactionDetail>> {
  const written = parseOrMismatch(
    FINANCE_PILLAR_ID,
    outcome,
    FinanceTransactionWriteResponseSchema,
    operation
  );
  if (!isGatewayOk(written)) return written;

  const row = written.value.data;
  const account =
    known !== null && known.id === row.accountId
      ? known
      : await resolveAccount(gateway, row.accountId);
  const transaction = toMobileTransactionDetail(row, account.name, account.currency);
  if (transaction === null) {
    return {
      kind: 'contract-mismatch',
      pillar: FINANCE_PILLAR_ID,
      status: 502,
      detail: `${operation} returned an amount that cannot be represented in its account currency`,
    };
  }
  return { kind: 'ok', value: transaction };
}

/** Create a transaction on the account the body names. */
export async function createTransaction(
  gateway: PillarGateway,
  body: MobileCreateTransactionBody
): Promise<GatewayOutcome<MobileTransactionDetail>> {
  const account = await requireAccount(gateway, body.accountId);
  if (!isGatewayOk(account)) return account;

  const { amountMinorUnits, ...fields } = body;
  const amount = fromMinorUnits(amountMinorUnits, account.value.currency);
  const outcome = await gateway.call<FinanceTransactionWritesRouter, unknown>(
    FINANCE_PILLAR_ID,
    (handle) => handle.transactions.create({ ...fields, amount })
  );
  return toWrittenTransaction(gateway, outcome, 'transactions.create', account.value);
}

/**
 * The account whose currency a new amount is in: the one the body moves the
 * transaction to, or the one it sits on now. `null` when no amount is sent.
 */
async function accountForAmount(
  gateway: PillarGateway,
  id: string,
  body: MobileUpdateTransactionBody
): Promise<GatewayOutcome<KnownAccount | null>> {
  if (body.amountMinorUnits === undefined) return { kind: 'ok', value: null };
  if (body.accountId !== undefined) return requireAccount(gateway, body.accountId);
  const accountId = await currentAccountId(gateway, id);
  if (!isGatewayOk(accountId)) return accountId;
  return requireAccount(gateway, accountId.value);
}

/** Change the fields the body names on one transaction. */
export async function updateTransaction(
  gateway: PillarGateway,
  id: string,
  body: MobileUpdateTransactionBody
): Promise<GatewayOutcome<MobileTransactionDetail>> {
  const account = await accountForAmount(gateway, id, body);
  if (!isGatewayOk(account)) return account;

  const { amountMinorUnits, ...fields } = body;
  const amount =
    amountMinorUnits === undefined || account.value === null
      ? {}
      : { amount: fromMinorUnits(amountMinorUnits, account.value.currency) };
  const outcome = await gateway.call<FinanceTransactionWritesRouter, unknown>(
    FINANCE_PILLAR_ID,
    (handle) => handle.transactions.update({ id, ...fields, ...amount })
  );
  return toWrittenTransaction(gateway, outcome, 'transactions.update', account.value);
}
