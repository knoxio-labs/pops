/**
 * Create-time entity resolution for `person` accounts (POPS-2771).
 *
 * Mirrors `modules/imports/commit-contacts-precreate.ts`'s pre-create phase:
 * the contacts call happens BEFORE any db write, since better-sqlite3's sync
 * transactions can't hold a network call. Given a `person` account create
 * with a name and no `entityId`, this resolves-or-creates the contact via
 * `ContactsClient.createOrFetchByName`. A TRANSIENT failure
 * (`ContactsUnavailableError` — contacts unreachable or mid-recovery)
 * degrades to `allowPendingEntity: true` instead of aborting the create: the
 * caller inserts the account with `entityId = null` and
 * `accountsService.createAccount`'s `allowPendingEntity` option queues an
 * `entity_precreate_outbox` row in the same transaction, which
 * `reconcile-contacts-outbox.ts` drains once contacts recovers. A PERMANENT
 * failure (`ContactsPermanentError`, or any other error) is NOT degraded —
 * it propagates and aborts the create, exactly like the import commit path.
 *
 * Every other kind, and a `person` create that already supplied `entityId`
 * directly, passes through unresolved — `accountsService.createAccount`
 * still validates the final `(kind, entityId)` pair regardless of how it got
 * there.
 */
import { ContactsUnavailableError, type ContactsClient } from '../../contacts/client.js';

import type { CreateAccountInput } from '../../../db/index.js';

/** Outcome of resolving a create request's entity, feeding `createAccount`. */
export interface ResolvedAccountEntity {
  /** The `entityId` to insert — a real contact id, an explicit caller-supplied
   * one, `null` for a non-`person` kind, or `null` pending outbox resolution. */
  entityId: string | null;
  /** Pass straight through to `createAccount`'s `CreateAccountOptions`. */
  allowPendingEntity: boolean;
}

/**
 * Resolve the `entityId` a `person` account create should insert with.
 * No-ops (returns the input unresolved) for any other kind, and for a
 * `person` create that already named an `entityId` — there is nothing to
 * look up.
 */
export async function resolvePersonAccountEntity(
  contacts: ContactsClient,
  input: CreateAccountInput
): Promise<ResolvedAccountEntity> {
  if (input.kind !== 'person')
    return { entityId: input.entityId ?? null, allowPendingEntity: false };
  if (input.entityId != null) return { entityId: input.entityId, allowPendingEntity: false };

  try {
    const { id } = await contacts.createOrFetchByName(input.name, 'person');
    return { entityId: id, allowPendingEntity: false };
  } catch (err) {
    if (err instanceof ContactsUnavailableError)
      return { entityId: null, allowPendingEntity: true };
    throw err;
  }
}
