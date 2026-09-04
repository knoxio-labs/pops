/**
 * POPS-2771's `person` account / `entityId` invariant, split out of
 * `accounts.ts` to keep that file under the repo's 200-line cap.
 *
 * `kind === 'person'` requires an `entityId` (a receivable/payable ledger
 * with no contact behind it has nothing to key the balance to), and every
 * other kind must NOT carry one (`entityId` exists only to name a `person`
 * account's contact). `allowPendingEntity` is the one exception — a `person`
 * account may transiently hold `entityId = null` while
 * `entity_precreate_outbox` resolves it (see
 * `accountsService.createAccount`'s `CreateAccountOptions`).
 */
import {
  AccountNameConflictError,
  NonPersonAccountHasEntityError,
  PersonAccountEntityConflictError,
  PersonAccountRequiresEntityError,
} from '../errors.js';
import { isAccountEntityCurrencyConflict, isAccountNameConflict } from './account-conflict.js';

import type { AccountKind } from '../../contract/account-kind.js';

/** Throws the matching domain error for a write's SQLite constraint
 * violation, or rethrows `err` unchanged if none of the two match. */
export function translateWriteConflict(
  err: unknown,
  ctx: { name: string; currency: string; entityId: string | null }
): never {
  if (isAccountNameConflict(err)) throw new AccountNameConflictError(ctx.name);
  if (ctx.entityId !== null && isAccountEntityCurrencyConflict(err)) {
    throw new PersonAccountEntityConflictError(ctx.entityId, ctx.currency);
  }
  throw err;
}

/** Throws `PersonAccountRequiresEntityError` or `NonPersonAccountHasEntityError`
 * for a `(kind, entityId)` pair that violates the invariant described above. */
export function validatePersonEntityInvariant(
  kind: AccountKind,
  entityId: string | null,
  allowPendingEntity: boolean
): void {
  if (kind === 'person') {
    if (entityId === null && !allowPendingEntity) throw new PersonAccountRequiresEntityError();
    return;
  }
  if (entityId !== null) throw new NonPersonAccountHasEntityError(kind);
}

/**
 * Re-run {@link validatePersonEntityInvariant} for an `updateAccount` patch,
 * but only when the patch actually changes `kind` or `entityId` — re-sending
 * an account's current (possibly already-pending) state unchanged must never
 * throw, or a `person` account left pending by `createAccount`'s
 * `allowPendingEntity` escape hatch could never be patched on an unrelated
 * field before the outbox resolves it.
 */
export function validatePersonEntityInvariantOnUpdate(
  current: { kind: AccountKind; entityId: string | null },
  input: { kind?: AccountKind; entityId?: string | null },
  effectiveKind: AccountKind,
  effectiveEntityId: string | null
): void {
  const kindChanged = input.kind !== undefined && input.kind !== current.kind;
  const entityIdChanged = input.entityId !== undefined && effectiveEntityId !== current.entityId;
  if (kindChanged || entityIdChanged) {
    validatePersonEntityInvariant(effectiveKind, effectiveEntityId, false);
  }
}
