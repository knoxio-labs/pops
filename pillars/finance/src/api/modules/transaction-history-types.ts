/**
 * Wire mapper for the transaction audit log (POPS-5865). The zod schemas live
 * in the REST contract (`src/contract/rest-transaction-history.ts`); this file
 * keeps the event row → response projection.
 *
 * A stored snapshot is the whole transaction row. The projection reads the
 * business fields out of it by name and drops the rest, so `rawRow`,
 * `checksum` and the match columns cannot reach a response by being added to
 * the row later.
 */
import { z } from 'zod';

import { TRANSACTION_TYPES } from '../../contract/corrections-constants.js';
import { TRANSACTION_HISTORY_FIELDS } from '../../contract/rest-transaction-history.js';
import { parseStoredTags } from '../../db/tag-facets.js';
import { centsToDollars } from '../../money.js';

import type {
  TransactionHistoryEventSchema,
  TransactionHistoryFieldsSchema,
} from '../../contract/rest-transaction-history.js';
import type { TransactionEventRow } from '../../db/index.js';

/** API response shape for one audit event. */
export type TransactionHistoryEvent = z.infer<typeof TransactionHistoryEventSchema>;

type HistoryFields = z.infer<typeof TransactionHistoryFieldsSchema>;

/** The columns of a stored snapshot the projection reads. Unknown keys are stripped. */
const SnapshotFieldsSchema = z.object({
  accountId: z.string(),
  date: z.string(),
  amountCents: z.number().int(),
  description: z.string(),
  type: z.enum(TRANSACTION_TYPES),
  notes: z.string().nullable(),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  tags: z.string(),
});

function toHistoryFields(snapshot: string | null): HistoryFields | null {
  if (snapshot === null) return null;
  const row = SnapshotFieldsSchema.parse(JSON.parse(snapshot));
  return {
    accountId: row.accountId,
    date: row.date,
    amount: centsToDollars(row.amountCents),
    description: row.description,
    type: row.type,
    notes: row.notes,
    entityId: row.entityId,
    entityName: row.entityName,
    tags: parseStoredTags(row.tags),
  };
}

function changedFields(
  before: HistoryFields | null,
  after: HistoryFields | null
): TransactionHistoryEvent['changed'] {
  if (before === null || after === null) return [];
  return TRANSACTION_HISTORY_FIELDS.filter(
    (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field])
  );
}

/** Map a stored audit event to the API response shape. */
export function toTransactionHistoryEvent(event: TransactionEventRow): TransactionHistoryEvent {
  const before = toHistoryFields(event.before);
  const after = toHistoryFields(event.after);
  return {
    id: event.id,
    transactionId: event.transactionId,
    accountId: event.accountId,
    action: event.action,
    actorKind: event.actorKind,
    actorEmail: event.actorEmail,
    at: event.at,
    before,
    after,
    changed: changedFields(before, after),
  };
}
