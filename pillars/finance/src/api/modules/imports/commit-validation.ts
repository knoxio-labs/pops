/**
 * Pre-flight validation for a commit payload.
 *
 * Ported from the monolith `lib/commit-validation.ts`. Rejects duplicate temp
 * ids, duplicate entity names, and dangling temp-id references (a ChangeSet op
 * or transaction pointing at a temp id with no matching pending entity).
 *
 * `ValidationError` maps to a 400 through the shared `HttpError` path.
 */
import { PLACEHOLDER_ENTITY_ID_PREFIX as TEMP_ID_PREFIX } from '../../../db/services/tag-rule-write-guards.js';
import { ValidationError } from '../../shared/errors.js';

import type { CommitPayload } from './types.js';

const TEMP_ENTITY_PREFIX = 'temp:entity:';

export const COMMIT_TEMP_ENTITY_PREFIX = TEMP_ENTITY_PREFIX;

function collectTempIdsFromOps(
  ops: { op: string; data?: { entityId?: string | null } }[],
  out: Set<string>
): void {
  for (const op of ops) {
    if ((op.op === 'add' || op.op === 'edit') && op.data?.entityId?.startsWith(TEMP_ID_PREFIX)) {
      out.add(op.data.entityId);
    }
  }
}

/**
 * Guard the id about to be written to `transactions.entity_id` /
 * `*_corrections.entity_id` / `*_tag_rules.entity_id`. After temp-id resolution
 * the value MUST be a real contact id: a `null`/`undefined` result means a
 * referenced temp id had no mapping, and a lingering `temp:`-prefixed value
 * means resolution was skipped — either way persisting it plants a dead
 * placeholder (the CF016 failure). Throwing here rolls the commit back instead.
 */
export function assertPersistableEntityId(
  originalEntityId: string,
  resolvedEntityId: string | null | undefined
): asserts resolvedEntityId is string {
  if (resolvedEntityId == null) {
    throw new ValidationError(
      `Entity id '${originalEntityId}' has no resolved contact; refusing to commit a placeholder`,
      { entityId: originalEntityId }
    );
  }
  if (resolvedEntityId.startsWith(TEMP_ID_PREFIX)) {
    throw new ValidationError(
      `Refusing to persist unresolved placeholder entity id '${resolvedEntityId}'`,
      { entityId: resolvedEntityId }
    );
  }
}

function assertNoDuplicateNames(payload: CommitPayload): void {
  const names = new Set<string>();
  for (const entity of payload.entities) {
    const lower = entity.name.toLowerCase();
    if (names.has(lower)) {
      throw new ValidationError(`Duplicate entity name: '${entity.name}'`, { name: entity.name });
    }
    names.add(lower);
  }
}

export function validateCommitPayload(payload: CommitPayload): void {
  const tempIds = new Set(payload.entities.map((e) => e.tempId));
  if (tempIds.size !== payload.entities.length) {
    throw new ValidationError('Duplicate temp IDs in entities array');
  }
  assertNoDuplicateNames(payload);

  const referencedTempIds = new Set<string>();
  for (const cs of payload.changeSets) collectTempIdsFromOps(cs.ops, referencedTempIds);
  for (const entry of payload.tagRuleChangeSets) {
    collectTempIdsFromOps(entry.changeSet.ops, referencedTempIds);
  }
  for (const txn of payload.transactions) {
    if (txn.entityId?.startsWith(TEMP_ID_PREFIX)) referencedTempIds.add(txn.entityId);
  }

  for (const ref of referencedTempIds) {
    if (!tempIds.has(ref)) {
      throw new ValidationError(`Unknown temp ID referenced: '${ref}'`, { tempId: ref });
    }
  }
}
