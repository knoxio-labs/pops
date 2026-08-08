/**
 * Reading the transaction line an Everyday Rewards footer prints.
 *
 * `POS 066 TRANS 3184 20:39 24/07/2026` — local time, no zone, day-first.
 * Resolving that wall clock to an instant is `../local-time.ts`, which the
 * drop-zone also uses; what is specific here is the shape of the line and
 * the POS/transaction pair it carries, which is what identifies the
 * purchase.
 */
import { instantFromLocalParts } from '../local-time.js';

/** `POS 066 TRANS 3184 20:39 24/07/2026` */
const TRANSACTION_DETAILS_RE =
  /POS\s+(\S+)\s+TRANS\s+(\S+)\s+(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/iu;

export interface TransactionStamp {
  readonly pos: string;
  readonly transaction: string;
  /** ISO-8601 instant, offset resolved for the store's zone. */
  readonly occurredAt: string;
  /** `DDMMYYYY`, as the receipt prints it — part of the natural key. */
  readonly localDate: string;
}

/**
 * Read the footer's transaction line.
 *
 * Returns null rather than a partial reading: `occurredAt` is what the
 * reconciliation window is measured against and the POS/TRANS pair is what
 * identifies the purchase, so a receipt missing either cannot be ingested
 * usefully anyway.
 */
export function readTransactionDetails(raw: string | null | undefined): TransactionStamp | null {
  const match = TRANSACTION_DETAILS_RE.exec(raw ?? '');
  if (match === null) return null;
  const [, pos = '', transaction = '', hour = '', minute = '', day = '', month = '', year = ''] =
    match;

  const occurredAt = instantFromLocalParts({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  });
  if (occurredAt === null) return null;

  return {
    pos,
    transaction,
    occurredAt,
    localDate: `${day.padStart(2, '0')}${month.padStart(2, '0')}${year}`,
  };
}
