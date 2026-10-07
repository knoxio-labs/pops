import { fail as sendError, send as sendJson } from './finance-http-fake-shared.js';
import {
  answerAccountHistory,
  answerTransactionWrite,
  WRITE_OPERATIONS,
} from './finance-http-fake-writes.js';

/**
 * What the finance stand-in answers, once it knows who is asking.
 *
 * Reproduces the three things finance does for a caller named as a guest:
 * serve only the accounts granted to that email, answer 404 for anything else,
 * and refuse a route no guest may reach. `pillars/finance`'s own
 * delegated-subject suite is what holds finance to the same behaviour.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FinanceFakeAccountRow, FinanceFakeRow } from './finance-fake.js';
import type {
  GuestRole,
  WriteCaller,
  WriteContext,
  WriteRequest,
  WriteState,
} from './finance-http-fake-shared.js';

export { send as sendJson, type GuestRole } from './finance-http-fake-shared.js';

export const SUBJECT_HEADER = 'x-pops-subject-email';
const DELEGATION_SCOPE = 'finance.delegatedSubject';

/** Everything a test can change about the stand-in while it runs. */
export interface FinanceHttpState extends WriteState {
  readonly accounts: readonly FinanceFakeAccountRow[];
  readonly grants: Map<string, Map<string, GuestRole>>;
  keyScopes: readonly string[];
  outage: boolean;
}

/** Who finance would answer as: the service itself, or the guest it was told about. */
type Caller =
  | { kind: 'service' }
  | { kind: 'guest'; roles: ReadonlyMap<string, GuestRole>; email: string };

function writeCaller(caller: Caller): WriteCaller {
  return caller.kind === 'service'
    ? { roles: null, email: null }
    : { roles: caller.roles, email: caller.email };
}

type VisibleAccount = FinanceFakeAccountRow & { viewerRole: string };

const OPERATIONS: readonly [
  operationId: string,
  path: string,
  query: readonly string[],
  method: string,
][] = [
  ['accounts.list', '/accounts', ['search', 'kind', 'archived', 'limit', 'offset'], 'get'],
  ['accounts.get', '/accounts/{id}', [], 'get'],
  ['checkpoints.history', '/accounts/{id}/balance-history', ['months'], 'get'],
  ['transactions.list', '/transactions', ['accountId', 'limit', 'beforeDate', 'beforeId'], 'get'],
  ['transactions.get', '/transactions/{id}', [], 'get'],
  ['summary.get', '/summary', ['window', 'topLimit'], 'get'],
  ...WRITE_OPERATIONS,
];

/** The narrowest document that lets the SDK resolve the operations bfm calls. */
export function financeOpenApiDocument(): unknown {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [operationId, path, query, method] of OPERATIONS) {
    const parameters = [
      ...[...path.matchAll(/\{(\w+)\}/gu)].map(([, name]) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      })),
      ...query.map((name) => ({ name, in: 'query', required: false, schema: { type: 'string' } })),
    ];
    const requestBody =
      method === 'get'
        ? {}
        : { requestBody: { content: { 'application/json': { schema: { type: 'object' } } } } };
    paths[path] = {
      ...paths[path],
      [method]: {
        operationId,
        parameters,
        ...requestBody,
        responses: { '200': { description: 'ok' } },
      },
    };
  }
  return { openapi: '3.0.3', info: { title: 'finance', version: '0.1.0' }, paths };
}

/**
 * Finance's delegation gate (`@pops/pillar-express`): a subject from a key
 * that may not delegate is refused rather than ignored, and so is anything
 * that is not exactly one address. Answers the refusal itself and returns
 * `null`.
 */
function resolveCaller(
  state: FinanceHttpState,
  req: IncomingMessage,
  res: ServerResponse
): Caller | null {
  const subject = req.headers[SUBJECT_HEADER];
  if (subject === undefined) return { kind: 'service' };
  if (!state.keyScopes.includes(DELEGATION_SCOPE)) {
    sendError(res, 403, 'finance.auth.forbidden', { requiredScope: DELEGATION_SCOPE });
    return null;
  }
  if (typeof subject !== 'string' || subject.includes(',') || !subject.includes('@')) {
    sendError(res, 400, 'finance.auth.subject_invalid', { header: SUBJECT_HEADER });
    return null;
  }
  const email = subject.trim().toLowerCase();
  return { kind: 'guest', roles: state.grants.get(email) ?? new Map(), email };
}

function visibleAccounts(state: FinanceHttpState, caller: Caller): VisibleAccount[] {
  return state.accounts.flatMap((account) => {
    if (caller.kind === 'service') return [{ ...account, viewerRole: 'owner' }];
    const role = caller.roles.get(account.id);
    return role === undefined ? [] : [{ ...account, viewerRole: role }];
  });
}

function byNewestFirst(left: FinanceFakeRow, right: FinanceFakeRow): number {
  if (left.date !== right.date) return left.date < right.date ? 1 : -1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

function listAccounts(accounts: readonly VisibleAccount[], url: URL, res: ServerResponse): void {
  const limit = Number(url.searchParams.get('limit') ?? '50');
  const offset = Number(url.searchParams.get('offset') ?? '0');
  sendJson(res, 200, {
    data: accounts.slice(offset, offset + limit),
    pagination: {
      total: accounts.length,
      limit,
      offset,
      hasMore: offset + limit < accounts.length,
    },
  });
}

function visibleTransactions(
  state: FinanceHttpState,
  accounts: readonly VisibleAccount[]
): FinanceFakeRow[] {
  const visible = new Set(accounts.map((account) => account.id));
  return state.transactions.filter((row) => visible.has(row.accountId)).toSorted(byNewestFirst);
}

function listTransactions(rows: readonly FinanceFakeRow[], url: URL, res: ServerResponse): void {
  const accountId = url.searchParams.get('accountId');
  const limit = Number(url.searchParams.get('limit') ?? '50');
  const matched = rows.filter((row) => accountId === null || row.accountId === accountId);
  sendJson(res, 200, {
    data: matched.slice(0, limit),
    pagination: { total: matched.length, limit, offset: 0, hasMore: matched.length > limit },
  });
}

function answerAccounts(
  accounts: readonly VisibleAccount[],
  [id, tail]: readonly (string | undefined)[],
  url: URL,
  res: ServerResponse
): void {
  if (id === undefined) return listAccounts(accounts, url, res);
  const account = accounts.find((row) => row.id === id);
  if (account === undefined) return sendError(res, 404, 'finance.resource.not_found');
  sendJson(res, 200, { data: tail === 'balance-history' ? [] : account });
}

function answerTransactions(
  rows: readonly FinanceFakeRow[],
  id: string | undefined,
  url: URL,
  res: ServerResponse
): void {
  if (id === undefined) return listTransactions(rows, url, res);
  const transaction = rows.find((row) => row.id === id);
  if (transaction === undefined) return sendError(res, 404, 'finance.resource.not_found');
  sendJson(res, 200, { data: transaction });
}

/** One call as the stand-in received it. `body` is absent on a `GET`. */
export interface FinanceHttpRequest {
  req: IncomingMessage;
  url: URL;
  body?: unknown;
}

/** Answer one finance data route as finance would for this caller. */
export function answerFinanceRoute(
  state: FinanceHttpState,
  { req, url, body }: FinanceHttpRequest,
  res: ServerResponse
): void {
  if (state.outage) return sendError(res, 503, 'finance.unavailable');
  const caller = resolveCaller(state, req, res);
  if (caller === null) return;

  const segments = url.pathname.split('/').filter((segment) => segment !== '');
  const [collection, ...rest] = segments;
  const request: WriteRequest = { method: req.method ?? 'GET', segments, url, body };
  const context: WriteContext = { state, caller: writeCaller(caller), res };
  const accounts = visibleAccounts(state, caller);
  if (collection === 'accounts' && rest[1] === 'history') {
    return answerAccountHistory(context, request);
  }
  if (collection === 'accounts') return answerAccounts(accounts, rest, url, res);
  if (collection === 'transactions') {
    if (answerTransactionWrite(context, request)) return;
    return answerTransactions(visibleTransactions(state, accounts), rest[0], url, res);
  }
  if (collection !== 'summary') return sendError(res, 404, 'finance.resource.not_found');
  // Not a guest route in finance, so the gate refuses before any handler.
  if (caller.kind === 'guest') {
    return sendError(res, 403, 'finance.auth.forbidden', { principal: 'guest' });
  }
  sendJson(res, 200, { data: null });
}
