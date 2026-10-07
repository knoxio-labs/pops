/**
 * The `/mobile/finance` routes that create and edit a transaction, read its
 * history and reach its attached files.
 *
 * Each proxies the finance route of the same shape, and finance decides every
 * one of them: bfm holds no role and applies no rule about amounts. There is
 * no route here that deletes or restores a transaction or removes an attached
 * file. ADR-048 keeps destructive operations on the web surface.
 */
import { z } from 'zod';

import { requires } from './capabilities.js';
import {
  MobileAccountHistoryPageSchema,
  MobileAttachToTransactionBodySchema,
  MobileCreateTransactionBodySchema,
  MobileFinanceReceiptExtractBodySchema,
  MobileFinanceReceiptExtractSchema,
  MobileTransactionAttachmentsSchema,
  MobileTransactionHistorySchema,
  MobileUpdateTransactionBodySchema,
} from './mobile-finance-write-schemas.js';
import {
  MOBILE_FINANCE_WRITE_RESPONSES,
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
  MobilePageLimit,
} from './rest-mobile-responses.js';
import {
  MobilePayloadTooLargeErrorSchema,
  MobileReceiptBytesSchema,
  MobileTransactionDetailSchema,
  MobileUpstreamErrorSchema,
} from './rest-schemas.js';

const READ_RESPONSES = {
  ...MOBILE_REQUEST_RESPONSES,
  ...MOBILE_PERIMETER_RESPONSES,
  404: MobileUpstreamErrorSchema,
  ...MOBILE_UPSTREAM_RESPONSES,
} as const;

const TransactionParams = z.object({ id: z.string() });
const AttachmentParams = z.object({ id: z.string(), attachmentId: z.string() });

export const mobileFinanceWriteRoutes = {
  createTransaction: {
    method: 'POST',
    path: '/mobile/finance/transactions',
    body: MobileCreateTransactionBodySchema,
    responses: { 200: MobileTransactionDetailSchema, ...MOBILE_FINANCE_WRITE_RESPONSES },
    summary: 'Create a transaction on an account the caller may edit',
    metadata: requires('finance.transactions.write'),
  },
  extractTransactionReceipt: {
    method: 'POST',
    path: '/mobile/finance/transactions/receipt-extract',
    body: MobileFinanceReceiptExtractBodySchema,
    responses: {
      200: MobileFinanceReceiptExtractSchema,
      ...MOBILE_FINANCE_WRITE_RESPONSES,
      413: MobilePayloadTooLargeErrorSchema,
    },
    summary:
      'Store a receipt and suggest the date, description and amount of a new transaction. ' +
      'Writes no transaction',
    metadata: requires('finance.transactions.write'),
  },
  updateTransaction: {
    method: 'PATCH',
    path: '/mobile/finance/transactions/:id',
    pathParams: TransactionParams,
    body: MobileUpdateTransactionBodySchema,
    responses: { 200: MobileTransactionDetailSchema, ...MOBILE_FINANCE_WRITE_RESPONSES },
    summary: 'Change fields of a transaction the caller may edit',
    metadata: requires('finance.transactions.write'),
  },
  getTransactionHistory: {
    method: 'GET',
    path: '/mobile/finance/transactions/:id/history',
    pathParams: TransactionParams,
    responses: { 200: MobileTransactionHistorySchema, ...READ_RESPONSES },
    summary: 'Who created or changed a transaction and what it said either side, newest first',
    metadata: requires('finance.transactions.read'),
  },
  getAccountHistory: {
    method: 'GET',
    path: '/mobile/finance/accounts/:id/history',
    pathParams: TransactionParams,
    query: z.object({
      limit: MobilePageLimit,
      /** Opaque continuation token from a previous page's `nextCursor`. */
      cursor: z.string().optional(),
    }),
    responses: { 200: MobileAccountHistoryPageSchema, ...READ_RESPONSES },
    summary: 'One page of the changes made to an account’s transactions, newest first',
    metadata: requires('finance.transactions.read'),
  },
  attachToTransaction: {
    method: 'POST',
    path: '/mobile/finance/transactions/:id/attachments',
    pathParams: TransactionParams,
    body: MobileAttachToTransactionBodySchema,
    responses: {
      200: MobileTransactionAttachmentsSchema,
      ...MOBILE_FINANCE_WRITE_RESPONSES,
      413: MobilePayloadTooLargeErrorSchema,
    },
    summary:
      'Attach files to a transaction: new ones to store, or receipt URIs already stored. ' +
      'Answers every file named, in order',
    metadata: requires('finance.transactions.write'),
  },
  listTransactionAttachments: {
    method: 'GET',
    path: '/mobile/finance/transactions/:id/attachments',
    pathParams: TransactionParams,
    responses: { 200: MobileTransactionAttachmentsSchema, ...READ_RESPONSES },
    summary: 'The files attached to a transaction, in order',
    metadata: requires('finance.transactions.read'),
  },
  getTransactionAttachmentThumbnail: {
    method: 'GET',
    path: '/mobile/finance/transactions/:id/attachments/:attachmentId/thumbnail',
    pathParams: AttachmentParams,
    responses: {
      200: MobileReceiptBytesSchema,
      ...READ_RESPONSES,
      // The file is a PDF or a text body, or an image that will not decode.
      415: MobileUpstreamErrorSchema,
    },
    summary: 'One attached file at a size a list row can afford',
    metadata: requires('finance.transactions.read'),
  },
  getTransactionAttachment: {
    method: 'GET',
    path: '/mobile/finance/transactions/:id/attachments/:attachmentId',
    pathParams: AttachmentParams,
    responses: { 200: MobileReceiptBytesSchema, ...READ_RESPONSES },
    summary: 'One attached file, full size',
    metadata: requires('finance.transactions.read'),
  },
} as const;
