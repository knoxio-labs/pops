/**
 * bfm's finance leg for the audit log: who created or changed a transaction,
 * and what it said either side.
 */
import { z } from 'zod';

import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { resolveAccountCurrencies } from './accounts-client.js';
import {
  FinanceAccountHistoryResponseSchema,
  FinanceTransactionHistoryResponseSchema,
  historyAccountIds,
  toMobileHistoryEvents,
  type FinanceHistoryEvent,
} from './write-wire.js';

import type {
  MobileAccountHistoryPage,
  MobileTransactionHistory,
  MobileTransactionHistoryEvent,
} from '../../contract/mobile-finance-write-schemas.js';

/** The subset of finance's router the mobile history screens call. */
export type FinanceHistoryRouter = {
  transactionHistory: {
    forTransaction: (input: { id: string }) => Promise<unknown>;
    forAccount: (input: { id: string; limit: number; offset: number }) => Promise<unknown>;
  };
};

/** Declared per file: see `accounts-client.ts` for why it is not shared. */
export const FINANCE_PILLAR_ID = 'finance';

const HistoryCursorSchema = z.object({ o: z.int().nonnegative() });

/** Where an account-history page starts. Opaque to the app. */
export type HistoryCursor = z.infer<typeof HistoryCursorSchema>;

function encodeHistoryCursor(cursor: HistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Read a cursor a previous page issued, or `null` for anything else. */
export function decodeHistoryCursor(encoded: string): HistoryCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const result = HistoryCursorSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

async function toMobileEvents(
  gateway: PillarGateway,
  events: readonly FinanceHistoryEvent[],
  operation: string
): Promise<GatewayOutcome<MobileTransactionHistoryEvent[]>> {
  const currencies = await resolveAccountCurrencies(gateway, historyAccountIds(events));
  const mapped = toMobileHistoryEvents(events, currencies);
  if (mapped === null) {
    return {
      kind: 'contract-mismatch',
      pillar: FINANCE_PILLAR_ID,
      status: 502,
      detail: `${operation} returned an amount that cannot be represented in its account currency`,
    };
  }
  return { kind: 'ok', value: mapped };
}

/** Every recorded change to one transaction, newest first. */
export async function getTransactionHistory(
  gateway: PillarGateway,
  id: string
): Promise<GatewayOutcome<MobileTransactionHistory>> {
  const outcome = await gateway.call<FinanceHistoryRouter, unknown>(FINANCE_PILLAR_ID, (handle) =>
    handle.transactionHistory.forTransaction({ id })
  );
  const history = parseOrMismatch(
    FINANCE_PILLAR_ID,
    outcome,
    FinanceTransactionHistoryResponseSchema,
    'transactionHistory.forTransaction'
  );
  if (!isGatewayOk(history)) return history;

  const events = await toMobileEvents(
    gateway,
    history.value.data,
    'transactionHistory.forTransaction'
  );
  if (!isGatewayOk(events)) return events;
  return { kind: 'ok', value: { data: events.value } };
}

export interface AccountHistoryRequest {
  readonly accountId: string;
  /** Events to return. The caller has already clamped this to the contract's cap. */
  readonly limit: number;
  /** Where the previous page stopped, or `null` for the first page. */
  readonly cursor: HistoryCursor | null;
}

/** One page of the changes made to an account's transactions, newest first. */
export async function getAccountHistory(
  gateway: PillarGateway,
  request: AccountHistoryRequest
): Promise<GatewayOutcome<MobileAccountHistoryPage>> {
  const offset = request.cursor?.o ?? 0;
  const outcome = await gateway.call<FinanceHistoryRouter, unknown>(FINANCE_PILLAR_ID, (handle) =>
    handle.transactionHistory.forAccount({ id: request.accountId, limit: request.limit, offset })
  );
  const page = parseOrMismatch(
    FINANCE_PILLAR_ID,
    outcome,
    FinanceAccountHistoryResponseSchema,
    'transactionHistory.forAccount'
  );
  if (!isGatewayOk(page)) return page;

  const events = await toMobileEvents(gateway, page.value.data, 'transactionHistory.forAccount');
  if (!isGatewayOk(events)) return events;
  return {
    kind: 'ok',
    value: {
      data: events.value,
      nextCursor: page.value.pagination.hasMore
        ? encodeHistoryCursor({ o: offset + page.value.data.length })
        : null,
    },
  };
}
