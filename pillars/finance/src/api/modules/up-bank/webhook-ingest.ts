/**
 * What a signed Up webhook event does once it is trusted (POPS-2920).
 *
 * Up's event carries only the transaction's id, so the row is fetched back
 * through the same client the batch sync uses, mapped by the same mapper, and
 * deduped on the same checksum — a row the webhook wrote and the same row a
 * later sync fetches are one row, whichever came first. A created row lands
 * through the unattended commit path as a batch of one; a settled event for
 * a row already held settles it in place; a delivery for a row the ledger
 * already has in that state is a duplicate and writes nothing.
 *
 * Which token to fetch with is not in the event either. Every account fed by
 * Up names the secret its token lives under; an Up token is per customer, so
 * the distinct names are tried in turn and a 404 means "not this customer's",
 * not "gone". The transaction's own account id then picks the POPS account,
 * or reports the Up account nobody has mapped so the operator can.
 *
 * `TRANSACTION_DELETED` writes nothing on purpose: a deletion is reconciled
 * by the next batch sync, which sees the row missing from the range, rather
 * than by trusting a single event to remove ledger history.
 *
 * Deliveries for one transaction are serialised. Up sends CREATED and
 * SETTLED back to back for an instantly settled purchase, and redelivers on
 * a slow ack; the router acks and hands each event off without waiting, so
 * two of them can be in flight together. The checksum check and the write
 * are separated by the contacts and matcher calls, and nothing in the table
 * makes a checksum unique, so two concurrent ingests of one transaction
 * would each see no row and each write one. Chaining them per transaction id
 * makes the second one run after the first has committed, where it finds the
 * row and settles or skips it. The commit key is the transaction's own id,
 * so even a second process importing the same transaction hits the
 * `import_commits` primary key and gets the first commit's result back
 * instead of a second row.
 */
import {
  accountImportConfigService,
  accountsService,
  importsService,
  type FinanceDb,
} from '../../../db/index.js';
import { requireNamedSecret } from '../../secrets.js';
import { toParsedTransaction, type MappedUpTransaction } from './map-transaction.js';
import {
  createUpBankClient,
  UpBankApiError,
  type UpBankClient,
  type UpTransaction,
} from './up-api.js';
import { importMappedRows, settleMappedRows } from './write-rows.js';

import type { ContactsClient } from '../../contacts/client.js';

export interface UpWebhookEvent {
  eventType: string | undefined;
  transactionId: string | undefined;
}

export type UpWebhookOutcome =
  | { kind: 'imported'; accountId: string; batchId: string | null; failed: number }
  | { kind: 'settled'; accountId: string; transactionId: string }
  | { kind: 'duplicate'; accountId: string }
  | { kind: 'unmapped'; upAccountId: string; transactionId: string }
  | { kind: 'deleted'; transactionId: string }
  | { kind: 'ignored'; reason: string };

export type UpWebhookIngest = (event: UpWebhookEvent) => Promise<UpWebhookOutcome>;

export interface UpWebhookIngestDeps {
  /** A client for the token under `secretRef`; tests inject one, production reads the secret. */
  clientFor?: (secretRef: string) => UpBankClient;
}

const INGESTED_EVENTS = new Set(['TRANSACTION_CREATED', 'TRANSACTION_SETTLED']);

/** One commit per Up transaction, whatever delivers it. */
export function webhookCommitKey(upTransactionId: string): string {
  return `up-webhook:${upTransactionId}`;
}

function defaultClientFor(secretRef: string): UpBankClient {
  return createUpBankClient({ token: requireNamedSecret(secretRef) });
}

async function fetchAcrossTokens(
  secretRefs: readonly string[],
  transactionId: string,
  clientFor: (secretRef: string) => UpBankClient
): Promise<UpTransaction | null> {
  for (const secretRef of secretRefs) {
    try {
      return await clientFor(secretRef).getTransaction(transactionId);
    } catch (err) {
      if (err instanceof UpBankApiError && err.status === 404) continue;
      throw err;
    }
  }
  return null;
}

async function writeRow(
  db: FinanceDb,
  contacts: ContactsClient,
  target: { accountId: string; commitKey: string },
  mapped: MappedUpTransaction
): Promise<UpWebhookOutcome> {
  const { accountId } = target;
  const existing = importsService
    .findTransactionsByChecksums(db, [mapped.parsed.checksum])
    .get(mapped.parsed.checksum);
  if (existing === undefined) {
    const imported = await importMappedRows(db, contacts, target, [mapped]);
    return { kind: 'imported', accountId, batchId: imported.batchId, failed: imported.failed };
  }
  if (existing.pending && !mapped.parsed.pending) {
    settleMappedRows(db, [{ transactionId: existing.id, mapped }]);
    return { kind: 'settled', accountId, transactionId: existing.id };
  }
  return { kind: 'duplicate', accountId };
}

function serialisedBy(): <T>(key: string, run: () => Promise<T>) => Promise<T> {
  const inFlight = new Map<string, Promise<void>>();
  return (key, run) => {
    const previous = inFlight.get(key) ?? Promise.resolve();
    const next = previous.then(run);
    const settled = next.then(
      () => undefined,
      () => undefined
    );
    inFlight.set(key, settled);
    void settled.then(() => {
      if (inFlight.get(key) === settled) inFlight.delete(key);
    });
    return next;
  };
}

interface IngestContext {
  db: FinanceDb;
  contacts: ContactsClient;
  clientFor: (secretRef: string) => UpBankClient;
}

/** Build the ingest for one pillar process; each event resolves to what it did. */
export function makeUpWebhookIngest(
  db: FinanceDb,
  contacts: ContactsClient,
  deps: UpWebhookIngestDeps = {}
): UpWebhookIngest {
  const ctx: IngestContext = { db, contacts, clientFor: deps.clientFor ?? defaultClientFor };
  const serialised = serialisedBy();
  return (event) => {
    if (event.transactionId === undefined) {
      return Promise.resolve({ kind: 'ignored', reason: 'no transaction id' });
    }
    const transactionId = event.transactionId;
    return serialised(transactionId, () => ingestTransaction(ctx, event.eventType, transactionId));
  };
}

async function ingestTransaction(
  { db, contacts, clientFor }: IngestContext,
  eventType: string | undefined,
  transactionId: string
): Promise<UpWebhookOutcome> {
  if (eventType === 'TRANSACTION_DELETED') return { kind: 'deleted', transactionId };
  if (eventType === undefined || !INGESTED_EVENTS.has(eventType)) {
    return { kind: 'ignored', reason: `event ${eventType ?? 'unknown'} is not ingested` };
  }

  const configs = accountImportConfigService.listImportConfigsByProvider(db, 'up');
  const secretRefs = [...new Set(configs.flatMap((c) => (c.secretRef ? [c.secretRef] : [])))];
  if (secretRefs.length === 0) {
    return { kind: 'ignored', reason: 'no account fed by Up names a secret' };
  }

  const txn = await fetchAcrossTokens(secretRefs, transactionId, clientFor);
  if (txn === null) {
    return { kind: 'ignored', reason: `transaction ${transactionId} not found under any token` };
  }

  const upAccountId = txn.relationships.account.data.id;
  const config = configs.find((c) => c.externalAccountRef === upAccountId);
  if (config === undefined) return { kind: 'unmapped', upAccountId, transactionId: txn.id };

  const account = accountsService.getAccount(db, config.accountId);
  const mapped = toParsedTransaction(txn, { accountId: account.id, accountLabel: account.name });
  return writeRow(
    db,
    contacts,
    { accountId: account.id, commitKey: webhookCommitKey(txn.id) },
    mapped
  );
}
