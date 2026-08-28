/**
 * Pre-flight validation for a commit payload.
 *
 * Ported from the monolith `lib/commit-validation.ts`. Rejects duplicate temp
 * ids, duplicate entity names, and dangling temp-id references (a ChangeSet op
 * or transaction pointing at a temp id with no matching pending entity).
 *
 * `ValidationError` maps to a 400 through the shared `HttpError` path.
 */
import { ValidationError } from '../../shared/errors.js';

import type { CommitPayload } from './types.js';

const TEMP_ENTITY_PREFIX = 'temp:entity:';

/**
 * Reserved namespace for any commit-time placeholder id. Real contact ids are
 * v4 UUIDs, so nothing legitimate written to `entity_id` ever starts with
 * `temp:`. The only well-formed placeholder is a `temp:entity:{uuid}` pending
 * reference; any other bare `temp:`-prefixed id (a stale scheme, a partially
 * resolved id) is a bug and must be rejected before it reaches the database.
 *
 * `pending:contact:{uuid}` (see `entity-precreate-outbox.ts`) is a DIFFERENT
 * namespace and deliberately NOT covered by this guard: it's the one
 * placeholder that IS meant to be persisted while contacts is unreachable,
 * tracked by an outbox row until the background reconciler resolves it.
 */
const TEMP_ID_PREFIX = 'temp:';

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
      `Entity id '${originalEntityId}' has no resolved contact; refusing to commit a placeholder`
    );
  }
  if (resolvedEntityId.startsWith(TEMP_ID_PREFIX)) {
    throw new ValidationError(
      `Refusing to persist unresolved placeholder entity id '${resolvedEntityId}'`
    );
  }
}

function assertNoDuplicateNames(payload: CommitPayload): void {
  const names = new Set<string>();
  for (const entity of payload.entities) {
    const lower = entity.name.toLowerCase();
    if (names.has(lower)) throw new ValidationError(`Duplicate entity name: '${entity.name}'`);
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
    if (!tempIds.has(ref)) throw new ValidationError(`Unknown temp ID referenced: '${ref}'`);
  }
}
