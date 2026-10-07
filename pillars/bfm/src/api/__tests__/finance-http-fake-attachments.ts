/**
 * The attachment half of the finance stand-in: reading a receipt into a
 * suggestion, attaching files, and serving them back.
 *
 * `pillars/finance`'s own attachment suite is what holds finance to the same
 * answers.
 */
import {
  canSee,
  fail,
  FAKE_TIMESTAMP,
  invalid,
  isRecord,
  mayEdit,
  notFound,
  send,
  type FakeAttachment,
  type WriteContext,
  type WriteRequest,
} from './finance-http-fake-shared.js';

import type { FinanceFakeRow } from './finance-fake.js';

const SHA = 'a'.repeat(64);
const RECEIPT_URI = `pops://purchases/receipt/${SHA}`;

/** `POST /transactions/receipt-extract`: answers whatever the test seeded. */
export function answerExtract(context: WriteContext, body: unknown): void {
  if (!isRecord(body) || typeof body['accountId'] !== 'string') return invalid(context.res);
  if (!mayEdit(context, body['accountId'])) return;
  send(context.res, 200, { data: context.state.extractAnswer });
}

function attach(context: WriteContext, row: FinanceFakeRow, body: unknown): void {
  const { state, caller, res } = context;
  if (!mayEdit(context, row.accountId)) return;
  if (!isRecord(body)) return invalid(res);
  const parts: unknown[] = Array.isArray(body['parts']) ? body['parts'] : [];
  const uris: unknown[] = Array.isArray(body['receiptUris']) ? body['receiptUris'] : [];
  const added = [...parts, ...uris].map((file, index): FakeAttachment => ({
    id: `att-${String(state.attachments.length + index + 1)}`,
    transactionId: row.id,
    documentUri: typeof file === 'string' ? file : RECEIPT_URI,
    mediaType: isRecord(file) ? String(file['mediaType']) : 'image/jpeg',
    position: state.attachments.length + index,
    createdAt: FAKE_TIMESTAMP,
    createdBy: caller.email,
  }));
  state.attachments.push(...added);
  send(res, 201, { data: added, message: 'Files attached' });
}

function attachmentBytes(
  { state, res }: WriteContext,
  row: FinanceFakeRow,
  [attachmentId, tail]: readonly (string | undefined)[]
): void {
  const attachment = state.attachments.find(
    (candidate) => candidate.id === attachmentId && candidate.transactionId === row.id
  );
  if (attachment === undefined) return notFound(res);
  if (tail === 'thumbnail' && !attachment.mediaType.startsWith('image/')) {
    return fail(res, 415, 'finance.resource.unsupported_media_type');
  }
  send(res, 200, {
    data: { sha256: SHA, mediaType: attachment.mediaType, byteLength: 3, dataBase64: 'AAEC' },
  });
}

/** Every `/transactions/:id/attachments` route. */
export function answerAttachments(context: WriteContext, request: WriteRequest): void {
  const { state, caller, res } = context;
  const row = state.transactions.find((candidate) => candidate.id === request.segments[1]);
  if (row === undefined || !canSee(caller, row.accountId)) return notFound(res);
  const rest = request.segments.slice(3);
  if (request.method === 'POST') return attach(context, row, request.body);
  if (rest.length > 0) return attachmentBytes(context, row, rest);
  send(res, 200, {
    data: state.attachments.filter((attachment) => attachment.transactionId === row.id),
  });
}
