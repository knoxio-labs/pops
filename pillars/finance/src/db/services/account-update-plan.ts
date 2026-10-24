import { validatePersonEntityInvariantOnUpdate } from './account-entity-invariant.js';
import { assertCanonicalPersonAccountAvailable } from './canonical-person-account.js';
import { preservedEntityId, type EntityIdentities } from './entity-identity.js';

import type { accounts } from '../schema.js';
import type { UpdateAccountInput } from './account-inputs.js';
import type { FinanceDb } from './internal.js';

function buildAccountUpdates(input: UpdateAccountInput): Partial<typeof accounts.$inferInsert> {
  const updates: Partial<typeof accounts.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.kind !== undefined) updates.kind = input.kind;
  if (input.currency !== undefined) updates.currency = input.currency;
  if (input.displayOrder !== undefined) updates.displayOrder = input.displayOrder;
  if (input.entityId !== undefined) updates.entityId = input.entityId ?? null;
  if (input.archivedAt !== undefined) updates.archivedAt = input.archivedAt ?? null;
  return updates;
}

/** Validated updates plus the historical entity id used for write-conflict diagnostics. */
export interface PreparedAccountUpdate {
  updates: Partial<typeof accounts.$inferInsert>;
  effectiveEntityId: string | null;
}

/** Plan a validated account patch against canonical identity while keeping its historical reference. */
export function prepareAccountUpdate(
  db: FinanceDb,
  current: typeof accounts.$inferSelect,
  input: UpdateAccountInput,
  identities?: EntityIdentities
): PreparedAccountUpdate {
  const effectiveKind = input.kind ?? current.kind;
  const effectiveEntityId =
    input.entityId !== undefined
      ? (preservedEntityId(current.entityId, input.entityId, identities) ?? null)
      : current.entityId;
  validatePersonEntityInvariantOnUpdate(current, input, effectiveKind, effectiveEntityId);

  const scopeChanged =
    effectiveKind !== current.kind ||
    effectiveEntityId !== current.entityId ||
    (input.currency !== undefined && input.currency !== current.currency);
  if (scopeChanged) {
    assertCanonicalPersonAccountAvailable(
      db,
      {
        kind: effectiveKind,
        entityId: effectiveEntityId,
        currency: input.currency ?? current.currency,
      },
      identities,
      current.id
    );
  }
  const updates = buildAccountUpdates({
    ...input,
    entityId: input.entityId === undefined ? undefined : effectiveEntityId,
  });
  return { updates, effectiveEntityId };
}
