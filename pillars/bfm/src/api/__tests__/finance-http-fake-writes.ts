/**
 * The write and history half of the finance stand-in.
 *
 * Reproduces what finance decides for a guest on each: an account with no
 * grant answers `404`, a `view` grant answers `403` to a write, and a guest
 * who sets an operator-only field answers `400`. `pillars/finance`'s own
 * guest-write suite is what holds finance to the same.
 */
import { financeRow, type FinanceFakeRow } from './finance-fake.js';
import { answerAttachments, answerExtract } from './finance-http-fake-attachments.js';
import {
  canSee,
  fail,
  FAKE_TIMESTAMP,
  invalid,
  isRecord,
  mayEdit,
  notFound,
  send,
  type FakeHistoryEvent,
  type WriteCaller,
  type WriteContext,
  type WriteRequest,
  type WriteState,
} from './finance-http-fake-shared.js';

/** `[operationId, path, query, method]` for each operation the write halves serve. */
export const WRITE_OPERATIONS: readonly [string, string, readonly string[], string][] = [
  ['transactions.create', '/transactions', [], 'post'],
  ['transactions.update', '/transactions/{id}', [], 'patch'],
  ['transactionHistory.forTransaction', '/transactions/{id}/history', [], 'get'],
  ['transactionHistory.forAccount', '/accounts/{id}/history', ['limit', 'offset'], 'get'],
  ['transactionAttachments.extractReceipt', '/transactions/receipt-extract', [], 'post'],
  ['transactionAttachments.attach', '/transactions/{id}/attachments', [], 'post'],
  ['transactionAttachments.list', '/transactions/{id}/attachments', [], 'get'],
  ['transactionAttachments.read', '/transactions/{id}/attachments/{attachmentId}', [], 'get'],
  [
    'transactionAttachments.thumbnail',
    '/transactions/{id}/attachments/{attachmentId}/thumbnail',
    [],
    'get',
  ],
];

const OPERATOR_ONLY_FIELDS = ['relatedTransactionId', 'entityId', 'entityName', 'tags'] as const;
const KNOWN_TYPES = new Set(['purchase', 'refund', 'transfer', 'income']);
const TEXT_FIELDS = ['description', 'accountId', 'date', 'type'] as const;
const NULLABLE_FIELDS = ['notes', 'entityId', 'entityName', 'location', 'country'] as const;

/** Answers the refusal and returns false for a body finance would not take. */
function isValidWrite({ caller, res }: WriteContext, body: Record<string, unknown>): boolean {
  const set = OPERATOR_ONLY_FIELDS.filter((field) => body[field] !== undefined);
  if (caller.roles !== null && set.length > 0) {
    invalid(res, { fields: set });
    return false;
  }
  if (typeof body['type'] === 'string' && !KNOWN_TYPES.has(body['type'])) {
    invalid(res, { field: 'type' });
    return false;
  }
  return true;
}

/** The fields of a write body finance stores, each kept only when it is the type finance takes. */
function fieldsFrom(body: Record<string, unknown>): Partial<FinanceFakeRow> {
  const fields: Partial<FinanceFakeRow> = {};
  for (const key of TEXT_FIELDS) {
    const value = body[key];
    if (typeof value === 'string') fields[key] = value;
  }
  for (const key of NULLABLE_FIELDS) {
    const value = body[key];
    if (typeof value === 'string' || value === null) fields[key] = value;
  }
  if (typeof body['amount'] === 'number') fields.amount = body['amount'];
  const tags: unknown = body['tags'];
  if (Array.isArray(tags)) fields.tags = tags.filter((tag) => typeof tag === 'string');
  return fields;
}

function snapshot(row: FinanceFakeRow): Record<string, unknown> {
  return {
    accountId: row.accountId,
    date: row.date,
    amount: row.amount,
    description: row.description,
    type: row.type,
    notes: row.notes,
    entityId: row.entityId,
    entityName: row.entityName,
    tags: row.tags,
  };
}

function record({ state, caller }: WriteContext, change: Partial<FakeHistoryEvent>): void {
  state.events.unshift({
    id: `evt-${String(state.events.length + 1)}`,
    transactionId: '',
    accountId: '',
    action: 'update',
    actorKind: caller.roles === null ? 'service' : 'guest',
    actorEmail: caller.email,
    at: FAKE_TIMESTAMP,
    before: null,
    after: null,
    changed: [],
    ...change,
  });
}

function create(context: WriteContext, body: unknown): void {
  const { state, res } = context;
  if (!isRecord(body) || typeof body['accountId'] !== 'string') return invalid(res);
  if (!mayEdit(context, body['accountId']) || !isValidWrite(context, body)) return;
  const row: FinanceFakeRow = {
    ...financeRow({ id: `txn-new-${String(state.transactions.length + 1)}` }),
    tags: [],
    entityId: null,
    entityName: null,
    country: null,
    lastEditedTime: FAKE_TIMESTAMP,
    ...fieldsFrom(body),
  };
  state.transactions.push(row);
  record(context, {
    transactionId: row.id,
    accountId: row.accountId,
    action: 'create',
    after: snapshot(row),
  });
  send(res, 201, { data: row, message: 'Transaction created' });
}

function update(context: WriteContext, request: WriteRequest): void {
  const { state, caller, res } = context;
  const index = state.transactions.findIndex((row) => row.id === request.segments[1]);
  const current = state.transactions[index];
  if (current === undefined || !canSee(caller, current.accountId)) return notFound(res);
  if (!isRecord(request.body)) return invalid(res);
  if (!mayEdit(context, current.accountId)) return;
  const target = request.body['accountId'];
  if (typeof target === 'string' && !mayEdit(context, target)) return;
  if (!isValidWrite(context, request.body)) return;
  const next: FinanceFakeRow = { ...current, ...fieldsFrom(request.body) };
  state.transactions[index] = next;
  record(context, {
    transactionId: next.id,
    accountId: next.accountId,
    before: snapshot(current),
    after: snapshot(next),
    changed: Object.keys(request.body),
  });
  send(res, 200, { data: next, message: 'Transaction updated' });
}

/** Events lying wholly on accounts the caller can see, as finance filters them. */
function visibleEvents(state: WriteState, caller: WriteCaller): FakeHistoryEvent[] {
  return state.events.filter((event) =>
    [event.before, event.after].every(
      (fields) => fields === null || canSee(caller, String(fields['accountId']))
    )
  );
}

function transactionHistory({ state, caller, res }: WriteContext, id: string): void {
  const row = state.transactions.find((candidate) => candidate.id === id);
  if (row === undefined || !canSee(caller, row.accountId)) return notFound(res);
  send(res, 200, {
    data: visibleEvents(state, caller).filter((event) => event.transactionId === id),
  });
}

/** `GET /accounts/:id/history`, paged by `limit` and `offset` as finance pages it. */
export function answerAccountHistory(
  { state, caller, res }: WriteContext,
  request: WriteRequest
): void {
  const accountId = request.segments[1] ?? '';
  if (!canSee(caller, accountId)) return notFound(res);
  const limit = Number(request.url.searchParams.get('limit') ?? '50');
  const offset = Number(request.url.searchParams.get('offset') ?? '0');
  const events = visibleEvents(state, caller).filter((event) => event.accountId === accountId);
  send(res, 200, {
    data: events.slice(offset, offset + limit),
    pagination: {
      total: events.length,
      limit,
      offset,
      hasMore: offset + limit < events.length,
    },
  });
}

function answerPost(context: WriteContext, request: WriteRequest): void {
  const [, id, tail] = request.segments;
  if (id === undefined) return create(context, request.body);
  if (id === 'receipt-extract') return answerExtract(context, request.body);
  if (tail === 'attachments') return answerAttachments(context, request);
  notFound(context.res);
}

/**
 * Answer a `/transactions` write, history or attachment call. Returns false
 * for a request this half does not serve, which the read half then answers.
 */
export function answerTransactionWrite(context: WriteContext, request: WriteRequest): boolean {
  const [, id, tail] = request.segments;
  if (request.method === 'GET' && tail === undefined) return false;
  const { forced } = context.state;
  if (forced !== null) fail(context.res, forced.status, forced.code);
  else if (request.method === 'POST') answerPost(context, request);
  else if (request.method === 'PATCH') update(context, request);
  else if (tail === 'history') transactionHistory(context, id ?? '');
  else if (tail === 'attachments') answerAttachments(context, request);
  else notFound(context.res);
  return true;
}
