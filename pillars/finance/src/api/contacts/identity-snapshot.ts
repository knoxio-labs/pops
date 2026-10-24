import { accounts } from '../../db/schema.js';
import {
  EntityIdentityConflictError,
  entityIdentity,
  EntityIdentitySnapshotError,
  referencedEntityIds,
  type EntityIdentities,
} from '../../db/services/entity-identity.js';
import { listDistinctEntityRefs } from '../../db/services/entity-orphans.js';
import { ConflictError, DependencyUnavailableError } from '../shared/errors.js';

import type { FinanceDb } from '../../db/services/internal.js';
import type { ContactsClient } from './types.js';

function storedEntityIds(db: FinanceDb): string[] {
  const ids = listDistinctEntityRefs(db).map((ref) => ref.entityId);
  for (const account of db.select({ entityId: accounts.entityId }).from(accounts).all()) {
    if (account.entityId !== null) ids.push(account.entityId);
  }
  return [...new Set(ids)];
}

/** Fetch canonical identities before an HTTP operation and pass the snapshot explicitly to its body. */
export async function runEntityHttp<T>(
  db: FinanceDb,
  contacts: ContactsClient,
  input: unknown,
  operation: (identities: EntityIdentities) => T | Promise<T>
): Promise<T> {
  const identities = await loadEntityIdentities(db, contacts, referencedEntityIds(input));
  try {
    return await operation(identities);
  } catch (error) {
    if (error instanceof EntityIdentityConflictError) throw new ConflictError(error.message);
    if (error instanceof EntityIdentitySnapshotError) {
      throw new DependencyUnavailableError(
        'The contact identity snapshot changed; retry the operation'
      );
    }
    throw error;
  }
}

/** Read one complete canonical snapshot before synchronous comparison or mutation; never perform network work in a transaction. */
export async function loadEntityIdentities(
  db: FinanceDb,
  contacts: ContactsClient,
  extraIds: readonly string[] = []
): Promise<EntityIdentities> {
  const ids = [...new Set([...storedEntityIds(db), ...extraIds])].filter(
    (id) => !id.startsWith('temp:') && !id.startsWith('pending:contact:')
  );
  const identities = await contacts.resolveEntityIds(ids);
  try {
    for (const id of [...storedEntityIds(db), ...extraIds]) entityIdentity(id, identities);
  } catch (error) {
    if (error instanceof EntityIdentitySnapshotError) {
      throw new DependencyUnavailableError(
        'The contact identity snapshot changed; retry the operation'
      );
    }
    throw error;
  }
  return identities;
}
