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

export const SUBJECT_HEADER = 'x-pops-subject-email';
const DELEGATION_SCOPE = 'finance.delegatedSubject';

export type GuestRole = 'view' | 'edit';

/** Everything a test can change about the stand-in while it runs. */
export interface FinanceHttpState {
  readonly accounts: readonly FinanceFakeAccountRow[];
  readonly transactions: readonly FinanceFakeRow[];
  readonly grants: Map<string, Map<string, GuestRole>>;
  keyScopes: readonly string[];
  outage: boolean;
}

/** Who finance would answer as: the service itself, or the guest it was told about. */
type Caller = { kind: 'service' } | { kind: 'guest'; roles: ReadonlyMap<string, GuestRole> };

type VisibleAccount = FinanceFakeAccountRow & { viewerRole: string };

const OPERATIONS: readonly [operationId: string, path: string, query: readonly string[]][] = [
  ['accounts.list', '/accounts', ['search', 'kind', 'archived', 'limit', 'offset']],
  ['accounts.get', '/accounts/{id}', []],
  ['checkpoints.history', '/accounts/{id}/balance-history', ['months']],
  ['transactions.list', '/transactions', ['accountId', 'limit', 'beforeDate', 'beforeId']],
  ['transactions.get', '/transactions/{id}', []],
  ['summary.get', '/summary', ['window', 'topLimit']],
];

/** The narrowest document that lets the SDK resolve the operations bfm calls. */
export function financeOpenApiDocument(): unknown {
  const paths: Record<string, unknown> = {};
  for (const [operationId, path, query] of OPERATIONS) {
    const parameters = [
      ...(path.includes('{id}')
        ? [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]
        : []),
      ...query.map((name) => ({ name, in: 'query', required: false, schema: { type: 'string' } })),
    ];
    paths[path] = { get: { operationId, parameters, responses: { '200': { description: 'ok' } } } };
  }
  return { openapi: '3.0.3', info: { title: 'finance', version: '0.1.0' }, paths };
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

export function sendError(
  res: ServerResponse,
  status: number,
  code: string,
  details?: unknown
): void {
  sendJson(res, status, {
    code,
    message: `finance fake answered ${String(status)}`,
    requestId: 'req-finance-fake',
    retryable: status >= 500,
    ...(details === undefined ? {} : { details }),
  });
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
  return { kind: 'guest', roles: state.grants.get(subject.trim().toLowerCase()) ?? new Map() };
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

/** Answer one finance data route as finance would for this caller. */
export function answerFinanceRoute(
  state: FinanceHttpState,
  req: IncomingMessage,
  url: URL,
  res: ServerResponse
): void {
  if (state.outage) return sendError(res, 503, 'finance.unavailable');
  const caller = resolveCaller(state, req, res);
  if (caller === null) return;

  const [collection, ...rest] = url.pathname.split('/').filter((segment) => segment !== '');
  const accounts = visibleAccounts(state, caller);
  if (collection === 'accounts') return answerAccounts(accounts, rest, url, res);
  if (collection === 'transactions') {
    return answerTransactions(visibleTransactions(state, accounts), rest[0], url, res);
  }
  if (collection !== 'summary') return sendError(res, 404, 'finance.resource.not_found');
  // Not a guest route in finance, so the gate refuses before any handler.
  if (caller.kind === 'guest') {
    return sendError(res, 403, 'finance.auth.forbidden', { principal: 'guest' });
  }
  sendJson(res, 200, { data: null });
}
