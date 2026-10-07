import { receiptSha256 } from '../../contract/rest-transaction-attachments-schemas.js';
/**
 * Handlers for the `transactionAttachments.*` sub-router (POPS-5870).
 *
 * Every call is authorised against the account the transaction sits on at
 * that moment, so moving a transaction moves who may reach its files.
 *
 * Attaching is ordered so a finance row never names a file the receipt
 * store's retention sweep may delete: store, pin for this transaction, then
 * insert. A failure part way leaves at worst a pin nothing uses. Detaching
 * runs the other way: the row goes first and the pin after it.
 */
import {
  type FinanceDb,
  type TransactionAttachmentRow,
  transactionAttachmentsService,
  TransactionNotFoundError,
  type TransactionRow,
  transactionsService,
} from '../../db/index.js';
import {
  type PurchasesReceiptsClient,
  PurchasesUnavailableError,
  ReceiptNotAPictureError,
  ReceiptNotFoundError,
  ReceiptRejectedError,
} from '../purchases/client.js';
import { releaseReceiptReferences, transactionOwnerUri } from '../purchases/references.js';
import {
  DependencyUnavailableError,
  NotFoundError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../shared/errors.js';
import { runHttp } from './error-mapping.js';
import {
  type AccountAccess,
  accountAccess,
  canSeeAccount,
  requireAccountRole,
} from './guest-access.js';
import { actorOf } from './transactions-write-handlers.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { financeTransactionAttachmentsContract } from '../../contract/rest-transaction-attachments.js';
import type { AccountGrantRole } from '../../db/index.js';

type Req = ServerInferRequest<typeof financeTransactionAttachmentsContract>;

/**
 * The transaction, once the caller is known to hold `minimum` on the account
 * it sits on now.
 *
 * @throws NotFoundError for a missing transaction, and for one on an account
 *   the caller holds no grant on, worded the same.
 * @throws ForbiddenError for a `view` grant where `edit` is needed.
 */
function authorisedTransaction(
  db: FinanceDb,
  access: AccountAccess,
  id: string,
  minimum: AccountGrantRole
): TransactionRow {
  let row: TransactionRow;
  try {
    row = transactionsService.getTransaction(db, id);
  } catch (err) {
    if (err instanceof TransactionNotFoundError) throw new NotFoundError('Transaction', id);
    throw err;
  }
  if (!canSeeAccount(access, row.accountId)) throw new NotFoundError('Transaction', id);
  requireAccountRole(access, row.accountId, minimum);
  return row;
}

function requireAttachment(
  db: FinanceDb,
  transactionId: string,
  attachmentId: string
): TransactionAttachmentRow {
  const row = transactionAttachmentsService.findAttachment(db, transactionId, attachmentId);
  if (row === undefined) throw new NotFoundError('Attachment', attachmentId);
  return row;
}

/** Map a receipt-store failure to its HTTP failure. */
function translatePurchasesError(err: unknown): never {
  if (err instanceof PurchasesUnavailableError) {
    throw new DependencyUnavailableError(
      'The receipt store is not available; nothing was changed',
      {
        dependency: 'purchases',
        reason: err.detail,
      }
    );
  }
  if (err instanceof ReceiptNotFoundError) {
    throw new NotFoundError('Receipt file', 'requested');
  }
  if (err instanceof ReceiptRejectedError) throw new ValidationError(err.message);
  if (err instanceof ReceiptNotAPictureError) throw new UnsupportedMediaTypeError(err.message);
  throw err;
}

function toAttachment(row: TransactionAttachmentRow) {
  return {
    id: row.id,
    transactionId: row.transactionId,
    documentUri: row.documentUri,
    mediaType: row.mediaType,
    position: row.position,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

interface StoredFile {
  documentUri: string;
  mediaType: string;
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function makeTransactionAttachmentsHandlers(
  db: FinanceDb,
  purchases: PurchasesReceiptsClient
) {
  /** The files to link, in order, once each is known to be in the store. */
  async function resolveFiles(body: Req['attach']['body']): Promise<StoredFile[]> {
    if ('parts' in body) {
      const uris = await purchases.store(body.parts);
      return body.parts.map((part, index) => ({
        documentUri: uris[index] ?? '',
        mediaType: part.mediaType,
      }));
    }
    const files: StoredFile[] = [];
    for (const documentUri of distinct(body.receiptUris)) {
      const stored = await purchases.read(receiptSha256(documentUri));
      files.push({ documentUri, mediaType: stored.mediaType });
    }
    return files;
  }

  return {
    attach: ({ params, body, res }: Req['attach'] & { res: Response }) =>
      runHttp(async () => {
        const access = accountAccess(res, db);
        authorisedTransaction(db, access, params.id, 'edit');
        try {
          const files = await resolveFiles(body);
          await purchases.addReferences(
            transactionOwnerUri(params.id),
            distinct(files.map((file) => file.documentUri))
          );
          // The transaction may have moved or gone while purchases answered.
          // Nothing awaits between this check and the insert.
          authorisedTransaction(db, accountAccess(res, db), params.id, 'edit');
          const rows = transactionAttachmentsService.addAttachments(
            db,
            params.id,
            files,
            actorOf(res)
          );
          return {
            status: 201 as const,
            body: { data: rows.map(toAttachment), message: 'Files attached' },
          };
        } catch (err) {
          translatePurchasesError(err);
        }
      }),

    list: ({ params, res }: Req['list'] & { res: Response }) =>
      runHttp(() => {
        authorisedTransaction(db, accountAccess(res, db), params.id, 'view');
        return {
          status: 200 as const,
          body: {
            data: transactionAttachmentsService.listAttachments(db, params.id).map(toAttachment),
          },
        };
      }),

    read: ({ params, res }: Req['read'] & { res: Response }) =>
      runHttp(async () => {
        authorisedTransaction(db, accountAccess(res, db), params.id, 'view');
        const attachment = requireAttachment(db, params.id, params.attachmentId);
        try {
          const data = await purchases.read(receiptSha256(attachment.documentUri));
          return { status: 200 as const, body: { data } };
        } catch (err) {
          translatePurchasesError(err);
        }
      }),

    thumbnail: ({ params, res }: Req['thumbnail'] & { res: Response }) =>
      runHttp(async () => {
        authorisedTransaction(db, accountAccess(res, db), params.id, 'view');
        const attachment = requireAttachment(db, params.id, params.attachmentId);
        try {
          const data = await purchases.thumbnail(receiptSha256(attachment.documentUri));
          return { status: 200 as const, body: { data } };
        } catch (err) {
          translatePurchasesError(err);
        }
      }),

    detach: ({ params, res }: Req['detach'] & { res: Response }) =>
      runHttp(async () => {
        authorisedTransaction(db, accountAccess(res, db), params.id, 'edit');
        const removed = transactionAttachmentsService.removeAttachment(
          db,
          params.id,
          params.attachmentId,
          actorOf(res)
        );
        if (removed === undefined) throw new NotFoundError('Attachment', params.attachmentId);
        await releaseReceiptReferences(purchases, params.id, [removed.documentUri]);
        return { status: 200 as const, body: { message: 'File removed' } };
      }),
  };
}
