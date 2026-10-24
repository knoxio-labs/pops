import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

import { type EntityIdentities } from '../../contract/entity-identity.js';

export {
  EntityIdentityConflictError,
  EntityIdentitySnapshotError,
  entityIdentity,
  equivalentEntityIds,
  preservedEntityId,
  referencedEntityIds,
  type EntityIdentities,
} from '../../contract/entity-identity.js';

/** Project an entity column for comparison/grouping without changing historical stored values. */
export function entityIdentitySql(
  column: SQLWrapper,
  identities?: EntityIdentities
): SQL<string | null> {
  if (identities === undefined) return sql`${column}`;
  const mapping = JSON.stringify(Object.fromEntries(identities));
  return sql`COALESCE(json_extract(${mapping}, '$.' || json_quote(${column})), ${column})`;
}
