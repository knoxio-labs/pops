/**
 * Files attached to a transaction (POPS-5870, epic POPS-5827).
 *
 * Finance holds the link only: `document_uri` names a file in the purchases
 * receipt store. Pinning that file there so the retention sweep keeps it, and
 * releasing the pin, are the caller's job, on either side of these writes. An
 * insert happens after the pin is taken and a release after the row is gone,
 * so a row never names a file the sweep is free to delete.
 *
 * One transaction holds a file at most once. Attaching one it already holds
 * keeps the existing row and records nothing.
 *
 * Each row added or removed appends an `attach` or `detach` event whose
 * `before` and `after` are both the transaction as it stood, since the entry
 * itself did not change.
 */
import { and, asc, eq, max, sql } from 'drizzle-orm';

import { transactionAttachments } from '../schema.js';
import { recordTransactionEvent, type TransactionActor } from './transaction-events.js';
import { getTransaction } from './transactions.js';

import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape for `transaction_attachments`. */
export type TransactionAttachmentRow = typeof transactionAttachments.$inferSelect;

/** One file to link: the URI the receipt store issued and what the file is. */
export interface AttachmentFile {
  documentUri: string;
  mediaType: string;
}

/** A transaction's attachments in the order they were added. */
export function listAttachments(db: FinanceDb, transactionId: string): TransactionAttachmentRow[] {
  return db
    .select()
    .from(transactionAttachments)
    .where(eq(transactionAttachments.transactionId, transactionId))
    .orderBy(asc(transactionAttachments.position), asc(sql`rowid`))
    .all();
}

/**
 * One attachment of one transaction, or `undefined`. An id that belongs to a
 * different transaction is not found.
 */
export function findAttachment(
  db: FinanceDb,
  transactionId: string,
  attachmentId: string
): TransactionAttachmentRow | undefined {
  return db
    .select()
    .from(transactionAttachments)
    .where(
      and(
        eq(transactionAttachments.id, attachmentId),
        eq(transactionAttachments.transactionId, transactionId)
      )
    )
    .get();
}

/**
 * Link files to a transaction, after the ones it already holds and in the
 * order given.
 *
 * @returns the row for every file named, in the order given, whether this
 *   call inserted it or it was already attached. A file named twice is
 *   returned once.
 * @throws TransactionNotFoundError when the transaction has no row.
 */
export function addAttachments(
  db: FinanceDb,
  transactionId: string,
  files: readonly AttachmentFile[],
  actor: TransactionActor
): TransactionAttachmentRow[] {
  return db.transaction((tx) => {
    const transaction = getTransaction(tx, transactionId);
    const held = new Map(
      listAttachments(tx, transactionId).map((row) => [row.documentUri, row] as const)
    );
    const last = tx
      .select({ position: max(transactionAttachments.position) })
      .from(transactionAttachments)
      .where(eq(transactionAttachments.transactionId, transactionId))
      .get();
    let position = last?.position ?? -1;

    const linked = new Map<string, TransactionAttachmentRow>();
    for (const file of files) {
      if (linked.has(file.documentUri)) continue;
      const existing = held.get(file.documentUri);
      if (existing !== undefined) {
        linked.set(file.documentUri, existing);
        continue;
      }
      position += 1;
      const row = tx
        .insert(transactionAttachments)
        .values({
          transactionId,
          documentUri: file.documentUri,
          mediaType: file.mediaType,
          position,
          createdBy: actor.email,
        })
        .returning()
        .get();
      recordTransactionEvent(tx, {
        action: 'attach',
        actor,
        before: transaction,
        after: transaction,
      });
      linked.set(file.documentUri, row);
    }
    return [...linked.values()];
  });
}

/**
 * Unlink one file from a transaction.
 *
 * @returns the removed row, or `undefined` when the transaction holds no
 *   attachment with that id.
 * @throws TransactionNotFoundError when the transaction has no row.
 */
export function removeAttachment(
  db: FinanceDb,
  transactionId: string,
  attachmentId: string,
  actor: TransactionActor
): TransactionAttachmentRow | undefined {
  return db.transaction((tx) => {
    const transaction = getTransaction(tx, transactionId);
    const row = findAttachment(tx, transactionId, attachmentId);
    if (row === undefined) return undefined;
    tx.delete(transactionAttachments).where(eq(transactionAttachments.id, row.id)).run();
    recordTransactionEvent(tx, {
      action: 'detach',
      actor,
      before: transaction,
      after: transaction,
    });
    return row;
  });
}
