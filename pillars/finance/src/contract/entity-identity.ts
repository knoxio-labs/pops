/** Per-operation canonical identities; null denotes a confirmed missing contact. */
export type EntityIdentities = ReadonlyMap<string, string | null>;

/** Existing assertions collide after canonical identity resolution and require an explicit choice. */
export class EntityIdentityConflictError extends Error {
  override readonly name = 'EntityIdentityConflictError';
}

/** A stored id was introduced after the operation's complete identity snapshot was fetched. */
export class EntityIdentitySnapshotError extends Error {
  override readonly name = 'EntityIdentitySnapshotError';
}

/** Resolve an id for comparison while keeping missing contacts isolated and finance placeholders local. */
export function entityIdentity(id: string, identities?: EntityIdentities): string;
export function entityIdentity(id: string | null, identities?: EntityIdentities): string | null;
export function entityIdentity(id: string | null, identities?: EntityIdentities): string | null {
  if (
    id === null ||
    identities === undefined ||
    id.startsWith('temp:') ||
    id.startsWith('pending:contact:')
  )
    return id;
  if (identities.has(id)) return identities.get(id) ?? id;
  if ([...identities.values()].includes(id)) return id;
  throw new EntityIdentitySnapshotError(
    'The contact identity snapshot does not cover every referenced id'
  );
}

/** Historical ids equivalent to a filter, including its canonical id; missing ids match only themselves. */
export function equivalentEntityIds(id: string, identities?: EntityIdentities): string[] {
  const canonical = entityIdentity(id, identities);
  if (identities === undefined) return [id];
  return [
    ...new Set(
      [id, ...identities.keys(), canonical].filter(
        (candidate): candidate is string =>
          candidate !== null && entityIdentity(candidate, identities) === canonical
      )
    ),
  ];
}

/** Keep the historical id when an edit names its canonical equivalent; explicit distinct changes still apply. */
export function preservedEntityId(
  stored: string | null,
  proposed: string | null | undefined,
  identities?: EntityIdentities
): string | null | undefined {
  if (proposed === undefined) return undefined;
  return entityIdentity(stored, identities) === entityIdentity(proposed, identities)
    ? stored
    : proposed;
}

/** Collect explicit entityId fields from a typed request's JSON-shaped value, excluding local placeholders. */
export function referencedEntityIds(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return [];
  const ids: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (
      (key === 'entityId' || key === 'issuerEntityId') &&
      typeof child === 'string' &&
      !child.startsWith('temp:') &&
      !child.startsWith('pending:contact:')
    )
      ids.push(child);
    else if (typeof child === 'object') ids.push(...referencedEntityIds(child));
  }
  return ids;
}
