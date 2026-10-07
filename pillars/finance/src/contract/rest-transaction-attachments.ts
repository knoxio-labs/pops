/**
 * `transactions/:id/attachments` sub-router (POPS-5870, epic POPS-5827).
 *
 * Receipt photographs and PDFs attached to a transaction. The files live in
 * the purchases receipt store and finance keeps the link, so every route that
 * touches a file answers 503 while purchases cannot be reached, and nothing
 * is written.
 *
 * Every route is open to a guest. Reading needs `view` on the account the
 * transaction sits on now, attaching and detaching need `edit`. An attachment
 * id that belongs to a different transaction is a 404.
 *
 * Bytes travel base64 in JSON, as they do on the purchases routes these
 * proxy: one representation the OpenAPI document and every generated client
 * describe without a special case.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { guestRoute } from '@pops/pillar-sdk/server';

import { ErrorBodySchema, ERR_RESPONSES } from './rest-schemas.js';
import {
  MAX_RECEIPT_REFERENCES_PER_CALL,
  ReceiptPartSchema,
  ReceiptUriSchema,
  StoredReceiptBytesSchema,
} from './rest-transaction-attachments-schemas.js';

const c = initContract();

export const TransactionAttachmentSchema = z.object({
  id: z.string(),
  transactionId: z.string(),
  /** The `pops://purchases/receipt/<sha256>` URI of the stored file. */
  documentUri: z.string(),
  mediaType: z.string(),
  /** Order within the transaction, ascending. */
  position: z.number().int(),
  createdAt: z.string(),
  /** Email of whoever attached it. Null when that caller carried no identity. */
  createdBy: z.string().nullable(),
});

/**
 * New files to store and attach, or files the receipt store already holds.
 * Exactly one of the two.
 */
export const AttachToTransactionBody = z.union([
  z.strictObject({
    /** Files in the order they should appear. The request body limit bounds how many. */
    parts: z.array(ReceiptPartSchema).min(1),
  }),
  z.strictObject({
    receiptUris: z.array(ReceiptUriSchema).min(1).max(MAX_RECEIPT_REFERENCES_PER_CALL),
  }),
]);

const AttachmentParams = z.object({ id: z.string(), attachmentId: z.string() });

export const financeTransactionAttachmentsContract = c.router({
  attach: {
    method: 'POST',
    path: '/transactions/:id/attachments',
    metadata: guestRoute(),
    pathParams: z.object({ id: z.string() }),
    body: AttachToTransactionBody,
    responses: {
      201: z.object({ data: z.array(TransactionAttachmentSchema), message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary:
      'Attach files to a transaction: new files to store, or receipt URIs already stored. ' +
      'Answers every file named, in order; one the transaction already holds is not added twice',
  },
  list: {
    method: 'GET',
    path: '/transactions/:id/attachments',
    metadata: guestRoute(),
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: z.object({ data: z.array(TransactionAttachmentSchema) }),
      ...ERR_RESPONSES,
    },
    summary: 'The files attached to a transaction, in order',
  },
  read: {
    method: 'GET',
    path: '/transactions/:id/attachments/:attachmentId',
    metadata: guestRoute(),
    pathParams: AttachmentParams,
    responses: {
      200: z.object({ data: StoredReceiptBytesSchema }),
      ...ERR_RESPONSES,
    },
    summary: 'The bytes of one attached file',
  },
  thumbnail: {
    method: 'GET',
    path: '/transactions/:id/attachments/:attachmentId/thumbnail',
    metadata: guestRoute(),
    pathParams: AttachmentParams,
    responses: {
      200: z.object({ data: StoredReceiptBytesSchema }),
      ...ERR_RESPONSES,
      // The file is not a picture: a PDF, a text body, or an image that will
      // not decode. Settled, so the caller draws a placeholder.
      415: ErrorBodySchema,
    },
    summary:
      'One attached file at a size a list row can afford. 415 for a file that is not an image',
  },
  detach: {
    method: 'DELETE',
    path: '/transactions/:id/attachments/:attachmentId',
    metadata: guestRoute(),
    pathParams: AttachmentParams,
    responses: {
      200: z.object({ message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Remove one file from a transaction',
  },
});
