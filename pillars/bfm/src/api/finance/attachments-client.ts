/**
 * bfm's finance leg for the files attached to a transaction, and for reading
 * a receipt into a suggested entry.
 *
 * The files live in the purchases receipt store, and finance is what reaches
 * it: bfm calls finance for every one of these and never purchases, so the
 * account check finance makes covers the bytes as well as the link.
 */
import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import {
  FinanceAttachmentBytesResponseSchema,
  FinanceAttachmentsResponseSchema,
  FinanceReceiptExtractResponseSchema,
  toMobileAttachments,
  toMobileReceiptExtract,
} from './write-wire.js';

import type {
  MobileAttachToTransactionBody,
  MobileFinanceReceiptExtract,
  MobileFinanceReceiptExtractBody,
  MobileTransactionAttachments,
} from '../../contract/mobile-finance-write-schemas.js';
import type { MobileReceiptBytes, MobileReceiptPart } from '../../contract/rest-schemas.js';

type AttachmentRef = { id: string; attachmentId: string };

/** The subset of finance's router the mobile attachment routes call. */
export type FinanceAttachmentsRouter = {
  transactionAttachments: {
    extractReceipt: (input: { accountId: string; parts: MobileReceiptPart[] }) => Promise<unknown>;
    attach: (
      input: { id: string } & ({ parts: MobileReceiptPart[] } | { receiptUris: string[] })
    ) => Promise<unknown>;
    list: (input: { id: string }) => Promise<unknown>;
    read: (input: AttachmentRef) => Promise<unknown>;
    thumbnail: (input: AttachmentRef) => Promise<unknown>;
  };
};

/** Declared per file: see `accounts-client.ts` for why it is not shared. */
export const FINANCE_PILLAR_ID = 'finance';

function toAttachments(
  outcome: GatewayOutcome<unknown>,
  operation: string
): GatewayOutcome<MobileTransactionAttachments> {
  const rows = parseOrMismatch(
    FINANCE_PILLAR_ID,
    outcome,
    FinanceAttachmentsResponseSchema,
    operation
  );
  if (!isGatewayOk(rows)) return rows;
  return { kind: 'ok', value: { data: toMobileAttachments(rows.value.data) } };
}

function toBytes(
  outcome: GatewayOutcome<unknown>,
  operation: string
): GatewayOutcome<MobileReceiptBytes> {
  const bytes = parseOrMismatch(
    FINANCE_PILLAR_ID,
    outcome,
    FinanceAttachmentBytesResponseSchema,
    operation
  );
  if (!isGatewayOk(bytes)) return bytes;
  return { kind: 'ok', value: bytes.value.data };
}

/** Store a receipt and read it into a suggestion for a new transaction. */
export async function extractTransactionReceipt(
  gateway: PillarGateway,
  body: MobileFinanceReceiptExtractBody
): Promise<GatewayOutcome<MobileFinanceReceiptExtract>> {
  const outcome = await gateway.call<FinanceAttachmentsRouter, unknown>(
    FINANCE_PILLAR_ID,
    (handle) =>
      handle.transactionAttachments.extractReceipt({
        accountId: body.accountId,
        parts: body.parts,
      })
  );
  const read = parseOrMismatch(
    FINANCE_PILLAR_ID,
    outcome,
    FinanceReceiptExtractResponseSchema,
    'transactionAttachments.extractReceipt'
  );
  if (!isGatewayOk(read)) return read;
  return { kind: 'ok', value: toMobileReceiptExtract(read.value.data) };
}

/**
 * Attach new files or already-stored ones to a transaction. The contract
 * admits exactly one of `parts` and `receiptUris`; a body with neither sends
 * finance an empty list, which it refuses.
 */
export async function attachToTransaction(
  gateway: PillarGateway,
  id: string,
  body: MobileAttachToTransactionBody
): Promise<GatewayOutcome<MobileTransactionAttachments>> {
  const files =
    body.parts === undefined ? { receiptUris: body.receiptUris ?? [] } : { parts: body.parts };
  const outcome = await gateway.call<FinanceAttachmentsRouter, unknown>(
    FINANCE_PILLAR_ID,
    (handle) => handle.transactionAttachments.attach({ id, ...files })
  );
  return toAttachments(outcome, 'transactionAttachments.attach');
}

/** The files attached to a transaction, in order. */
export async function listTransactionAttachments(
  gateway: PillarGateway,
  id: string
): Promise<GatewayOutcome<MobileTransactionAttachments>> {
  const outcome = await gateway.call<FinanceAttachmentsRouter, unknown>(
    FINANCE_PILLAR_ID,
    (handle) => handle.transactionAttachments.list({ id })
  );
  return toAttachments(outcome, 'transactionAttachments.list');
}

/** The bytes of one attached file, full size. */
export async function getTransactionAttachment(
  gateway: PillarGateway,
  ref: AttachmentRef
): Promise<GatewayOutcome<MobileReceiptBytes>> {
  const outcome = await gateway.call<FinanceAttachmentsRouter, unknown>(
    FINANCE_PILLAR_ID,
    (handle) => handle.transactionAttachments.read(ref)
  );
  return toBytes(outcome, 'transactionAttachments.read');
}

/** One attached file at list-row size. Finance answers 415 for a file that is not an image. */
export async function getTransactionAttachmentThumbnail(
  gateway: PillarGateway,
  ref: AttachmentRef
): Promise<GatewayOutcome<MobileReceiptBytes>> {
  const outcome = await gateway.call<FinanceAttachmentsRouter, unknown>(
    FINANCE_PILLAR_ID,
    (handle) => handle.transactionAttachments.thumbnail(ref)
  );
  return toBytes(outcome, 'transactionAttachments.thumbnail');
}
