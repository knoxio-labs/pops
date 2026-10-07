/**
 * What the two write halves of the finance stand-in share: the store a write
 * changes, who is asking, and the refusals finance gives a guest.
 */
import type { ServerResponse } from 'node:http';

import type { FinanceFakeRow } from './finance-fake.js';

export type GuestRole = 'view' | 'edit';

export interface FakeHistoryEvent {
  id: string;
  transactionId: string;
  accountId: string;
  action: string;
  actorKind: string;
  actorEmail: string | null;
  at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed: string[];
}

export interface FakeAttachment {
  id: string;
  transactionId: string;
  documentUri: string;
  mediaType: string;
  position: number;
  createdAt: string;
  createdBy: string | null;
}

/** One body-carrying call bfm made, as finance received it. */
export interface FinanceHttpWrite {
  method: string;
  path: string;
  body: unknown;
}

export interface WriteState {
  transactions: FinanceFakeRow[];
  events: FakeHistoryEvent[];
  attachments: FakeAttachment[];
  /** What `receipt-extract` answers as its `data`. */
  extractAnswer: unknown;
  /** Answer the next write, history or attachment call with this instead. */
  forced: { status: number; code: string } | null;
}

/** Who is asking: the roles a guest holds and their address, or `null` for the service. */
export interface WriteCaller {
  roles: ReadonlyMap<string, GuestRole> | null;
  email: string | null;
}

export interface WriteRequest {
  method: string;
  segments: readonly string[];
  url: URL;
  body: unknown;
}

/** One call being answered: the store, the caller and where the answer goes. */
export interface WriteContext {
  state: WriteState;
  caller: WriteCaller;
  res: ServerResponse;
}

export const FAKE_TIMESTAMP = '2026-10-08T00:00:00.000Z';

export function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

export function fail(res: ServerResponse, status: number, code: string, details?: unknown): void {
  send(res, status, {
    code,
    message: `finance fake answered ${String(status)}`,
    requestId: 'req-finance-fake',
    retryable: status >= 500,
    ...(details === undefined ? {} : { details }),
  });
}

export const notFound = (res: ServerResponse): void => fail(res, 404, 'finance.resource.not_found');

export const invalid = (res: ServerResponse, details?: unknown): void =>
  fail(res, 400, 'finance.request.invalid', details);

export function canSee(caller: WriteCaller, accountId: string): boolean {
  return caller.roles === null || caller.roles.has(accountId);
}

/** Answers the refusal and returns false unless the caller may write to the account. */
export function mayEdit({ caller, res }: WriteContext, accountId: string): boolean {
  if (!canSee(caller, accountId)) {
    notFound(res);
    return false;
  }
  if (caller.roles !== null && caller.roles.get(accountId) !== 'edit') {
    fail(res, 403, 'finance.resource.forbidden');
    return false;
  }
  return true;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
