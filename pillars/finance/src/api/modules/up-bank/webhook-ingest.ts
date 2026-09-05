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
 */
import { randomUUID } from 'node:crypto';

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
  accountId: string,
  mapped: MappedUpTransaction
): Promise<UpWebhookOutcome> {
  const existing = importsService
    .findTransactionsByChecksums(db, [mapped.parsed.checksum])
    .get(mapped.parsed.checksum);
  if (existing === undefined) {
    const imported = await importMappedRows(db, contacts, { accountId, commitKey: randomUUID() }, [
      mapped,
    ]);
    return { kind: 'imported', accountId, batchId: imported.batchId, failed: imported.failed };
  }
  if (existing.pending && !mapped.parsed.pending) {
    settleMappedRows(db, [{ transactionId: existing.id, mapped }]);
    return { kind: 'settled', accountId, transactionId: existing.id };
  }
  return { kind: 'duplicate', accountId };
}

/** Build the ingest for one pillar process; each event resolves to what it did. */
export function makeUpWebhookIngest(
  db: FinanceDb,
  contacts: ContactsClient,
  deps: UpWebhookIngestDeps = {}
): UpWebhookIngest {
  const clientFor = deps.clientFor ?? defaultClientFor;
  return async (event) => {
    if (event.transactionId === undefined) return { kind: 'ignored', reason: 'no transaction id' };
    if (event.eventType === 'TRANSACTION_DELETED') {
      return { kind: 'deleted', transactionId: event.transactionId };
    }
    if (event.eventType === undefined || !INGESTED_EVENTS.has(event.eventType)) {
      return { kind: 'ignored', reason: `event ${event.eventType ?? 'unknown'} is not ingested` };
    }

    const configs = accountImportConfigService.listImportConfigsByProvider(db, 'up');
    const secretRefs = [...new Set(configs.flatMap((c) => (c.secretRef ? [c.secretRef] : [])))];
    if (secretRefs.length === 0) {
      return { kind: 'ignored', reason: 'no account fed by Up names a secret' };
    }

    const txn = await fetchAcrossTokens(secretRefs, event.transactionId, clientFor);
    if (txn === null) {
      return {
        kind: 'ignored',
        reason: `transaction ${event.transactionId} not found under any token`,
      };
    }

    const upAccountId = txn.relationships.account.data.id;
    const config = configs.find((c) => c.externalAccountRef === upAccountId);
    if (config === undefined) return { kind: 'unmapped', upAccountId, transactionId: txn.id };

    const account = accountsService.getAccount(db, config.accountId);
    const mapped = toParsedTransaction(txn, { accountId: account.id, accountLabel: account.name });
    return writeRow(db, contacts, account.id, mapped);
  };
}
