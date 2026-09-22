import { currentValue, type CommandDb, type FieldValues, type LoadedEntity } from './entities.js';
import { CommandRejected } from './errors.js';
import { eventsAfterRevision, eventsAfterSeq, lastTouching, sourceOf } from './events.js';

import type { ConflictBody, JsonValue } from './outcome.js';

function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).toSorted();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key] ?? null)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Whether two JSON values are equal, ignoring object key order. */
export function sameValue(a: JsonValue, b: JsonValue): boolean {
  return canonical(a) === canonical(b);
}

/** The fields of `changes` whose intended value differs from the entity's current one. */
export function diffAgainst(
  db: CommandDb,
  entity: LoadedEntity,
  changes: FieldValues
): FieldValues {
  const diff: FieldValues = {};
  const requestedType = changes['typeKey'];
  const typeChanged =
    entity.kind === 'item' &&
    requestedType !== undefined &&
    !sameValue(requestedType, currentValue(db, entity, 'typeKey'));
  for (const [field, value] of Object.entries(changes)) {
    if (field === 'fields' && typeChanged) {
      diff[field] = value;
      continue;
    }
    if (!sameValue(value, currentValue(db, entity, field))) diff[field] = value;
  }
  return diff;
}

/** The engine's verdict on a mutation made against `baseRevision`. */
export type RevisionVerdict =
  | { readonly kind: 'apply'; readonly converged: boolean }
  | { readonly kind: 'conflict'; readonly conflict: ConflictBody };

/**
 * Judge a mutation made against `baseRevision` of `entity`.
 *
 * At the current revision it applies. Behind it, the fields changed by later
 * events are collected: none shared with `changes` means the two changes are
 * disjoint and it applies; a shared field whose intended value already equals
 * the current one converged, so it applies with `converged: true`; a shared
 * field with a different value is a `field` conflict naming the latest event
 * that changed it. A base revision ahead of the row is a malformed mutation.
 */
export function checkRevision(
  db: CommandDb,
  entity: LoadedEntity,
  baseRevision: number,
  changes: FieldValues
): RevisionVerdict {
  const { revision, id } = entity.row;
  if (baseRevision > revision) {
    throw new CommandRejected('invalid', `base revision ${baseRevision} is ahead of ${revision}`);
  }
  if (baseRevision === revision) return { kind: 'apply', converged: false };

  const later = eventsAfterRevision(db, entity.kind, id, baseRevision);
  let converged = false;
  for (const [field, mine] of Object.entries(changes)) {
    const winner = lastTouching(later, field);
    if (!winner) continue;
    const theirs = currentValue(db, entity, field);
    if (sameValue(mine, theirs)) {
      converged = true;
      continue;
    }
    return {
      kind: 'conflict',
      conflict: {
        kind: 'field',
        field,
        mine,
        theirs,
        source: sourceOf(winner),
        at: winner.serverTime,
        currentRevision: revision,
      },
    };
  }
  return { kind: 'apply', converged };
}

/**
 * The first field of `fields` that an event after `seq` changed, as a
 * conflict where `mine` is the value `wanted` holds for it. Used by ops that
 * judge staleness against one event rather than a base revision.
 */
export function conflictSinceSeq(
  db: CommandDb,
  entity: LoadedEntity,
  seq: number,
  wanted: FieldValues
): ConflictBody | null {
  const later = eventsAfterSeq(db, entity.kind, entity.row.id, seq);
  for (const [field, mine] of Object.entries(wanted)) {
    const winner = lastTouching(later, field);
    if (!winner) continue;
    return {
      kind: 'field',
      field,
      mine,
      theirs: currentValue(db, entity, field),
      source: sourceOf(winner),
      at: winner.serverTime,
      currentRevision: entity.row.revision,
    };
  }
  return null;
}

/**
 * The conflict for a mutation addressed to a tombstoned entity, naming the
 * event that deleted it. A tombstone with no deleting event (one written
 * before the event log existed) is attributed to the server at `deleted_at`.
 */
export function deletedConflict(db: CommandDb, entity: LoadedEntity): ConflictBody {
  const history = eventsAfterRevision(db, entity.kind, entity.row.id, 0);
  const deletion = history.findLast((event) => event.kind === 'deleted');
  if (deletion) return { kind: 'deleted', source: sourceOf(deletion), at: deletion.serverTime };
  return {
    kind: 'deleted',
    source: { kind: 'web', label: 'Server' },
    at: entity.row.deletedAt ?? '',
  };
}
