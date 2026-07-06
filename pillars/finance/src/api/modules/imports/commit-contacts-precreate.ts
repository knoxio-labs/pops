/**
 * Import commit: contacts pre-create phase, split out of `commit.ts` to stay
 * under the 200-line cap.
 *
 * Pending contacts are pre-created against the contacts pillar BEFORE the
 * SQLite transaction opens (network can't live inside a better-sqlite3 sync
 * transaction). Each pre-create carries `{ name, type }` and is idempotent —
 * a 409 dup-name fetches the existing contact id so a retry after a
 * rolled-back finance tx reuses the contact. The resolved tempId→id map is
 * threaded into the synchronous transaction. Because this happens before the
 * finance transaction opens, a rollback of the finance side does not undo
 * any contacts already created there.
 *
 * When a pre-create fails with a TRANSIENT error (`ContactsUnavailableError`
 * — contacts unreachable or mid-recovery), the commit no longer aborts (issue
 * #3683): a `pending:contact:{uuid}` placeholder takes the entity's place in
 * the tempId map and a row is queued in `entity_precreate_outbox` — inside
 * the same finance transaction — so the outage is invisible to the importer.
 * `reconcile-contacts-outbox.ts` drains the outbox once contacts recovers,
 * rewriting the placeholder to the real contact id everywhere it landed. A
 * PERMANENT error (`ContactsPermanentError` — bad request, unauthorized,
 * contract mismatch) is NOT eligible for the outbox: retrying the same input
 * would fail identically forever, so it propagates and aborts the commit
 * exactly like any other unexpected error.
 */
import { entityPrecreateOutboxService, type FinanceDb } from '../../../db/index.js';
import { ContactsUnavailableError, type ContactsClient } from '../../contacts/client.js';

import type { CommitPayload } from './types.js';

/** A pending entity that couldn't be pre-created because contacts was down —
 * queued into `entity_precreate_outbox` for the background reconciler. */
export interface OutboxCandidate {
  placeholderId: string;
  name: CommitPayload['entities'][number]['name'];
  type: CommitPayload['entities'][number]['type'];
}

/**
 * Pre-create every pending contact against the contacts pillar BEFORE the
 * finance transaction opens, returning the tempId→contact-id map. Each create
 * carries `{ name, type }` and is create-or-fetch-by-name, so a retry after a
 * rolled-back finance tx reuses the existing contact. `entitiesCreated` counts
 * ONLY real inserts — a reused (already-existing) contact must not inflate the
 * commit result's "Entities Created" card.
 *
 * A `ContactsUnavailableError` (TRANSIENT) no longer propagates: the tempId
 * maps to a fresh `pending:contact:{uuid}` placeholder instead, and the
 * entity is collected into `outboxCandidates` for the caller to queue once
 * the finance transaction opens. Any OTHER error — including
 * `ContactsPermanentError` (PERMANENT: bad request / unauthorized / contract
 * mismatch) and any genuine bug — still throws; only the documented
 * transient case degrades.
 */
export async function preCreatePendingContacts(
  contacts: ContactsClient,
  payload: CommitPayload
): Promise<{
  tempIdMap: Map<string, string>;
  entitiesCreated: number;
  outboxCandidates: OutboxCandidate[];
}> {
  const tempIdMap = new Map<string, string>();
  const outboxCandidates: OutboxCandidate[] = [];
  let entitiesCreated = 0;
  for (const pending of payload.entities) {
    try {
      const { id, created } = await contacts.createOrFetchByName(pending.name, pending.type);
      tempIdMap.set(pending.tempId, id);
      if (created) entitiesCreated++;
    } catch (error) {
      if (!(error instanceof ContactsUnavailableError)) throw error;
      const placeholderId = entityPrecreateOutboxService.buildPendingContactId();
      tempIdMap.set(pending.tempId, placeholderId);
      outboxCandidates.push({ placeholderId, name: pending.name, type: pending.type });
    }
  }
  return { tempIdMap, entitiesCreated, outboxCandidates };
}

/** Queue every outbox candidate inside the finance transaction, so a rollback
 * of the rest of the commit rolls the outbox row back too. */
export function enqueueOutboxCandidatesPhase(tx: FinanceDb, candidates: OutboxCandidate[]): void {
  for (const candidate of candidates) {
    entityPrecreateOutboxService.enqueue(tx, {
      id: candidate.placeholderId,
      name: candidate.name,
      type: candidate.type,
    });
  }
}
