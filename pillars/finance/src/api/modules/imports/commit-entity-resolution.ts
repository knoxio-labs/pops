import { assertPersistableEntityId, COMMIT_TEMP_ENTITY_PREFIX } from './commit-validation.js';

/** Resolves temporary entity IDs and rejects unresolved IDs before insertion. */
export function resolveCommitEntityId(
  entityId: string | undefined,
  tempIdMap: Map<string, string>
): string | undefined {
  if (entityId == null) return undefined;
  const resolved = entityId.startsWith(COMMIT_TEMP_ENTITY_PREFIX)
    ? tempIdMap.get(entityId)
    : entityId;
  assertPersistableEntityId(entityId, resolved);
  return resolved;
}
