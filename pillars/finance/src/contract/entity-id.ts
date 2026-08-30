/**
 * The placeholder namespace an `entity_id` can hold instead of a real contact
 * id, shared by the API and the app.
 *
 * It lives in the contract rather than beside the outbox service that mints it
 * (`db/services/entity-precreate-outbox.ts`) because the browser needs the same
 * answer: a row whose entity is a placeholder has an id that resolves to no
 * contact, and a picker that can't tell that from "no entity assigned" shows an
 * empty control on a row the user already believes is matched (POPS-2692).
 */

/**
 * Reserved namespace for a pending contact placeholder written to `entity_id`
 * columns while contacts is unreachable. Distinct from the request-scoped
 * `temp:entity:{uuid}` commit placeholder (see `commit-validation.ts`) — this
 * one IS meant to be persisted, and is only ever replaced by the reconciler.
 */
export const PENDING_CONTACT_ID_PREFIX = 'pending:contact:';

/** True if `entityId` is an outbox placeholder rather than a real contact id. */
export function isPendingContactId(entityId: string): boolean {
  return entityId.startsWith(PENDING_CONTACT_ID_PREFIX);
}
