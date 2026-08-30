import { isPendingContactId } from '@pops/finance';

import type { ProcessedTransaction } from '@pops/finance';

/**
 * What the picker can honestly say about the entity a row already carries.
 *
 * - `unassigned` — no entity on the row. The placeholder is the honest label.
 * - `resolved` — the id is one of the loaded options; the picker shows it.
 * - `loading` — options haven't arrived yet, so nothing can be concluded.
 * - `never-created` — a `pending:contact:` placeholder. Contacts was
 *   unreachable when the row was committed and the pre-create outbox gave up,
 *   so this id resolves to nothing and never will (POPS-2689/POPS-2690).
 * - `missing` — a real-looking id absent from the loaded set, which since
 *   POPS-226 is the WHOLE contact set: the contact it names is genuinely gone
 *   (a reseed, a deletion).
 */
export type AssignedEntityState =
  | 'unassigned'
  | 'resolved'
  | 'loading'
  | 'never-created'
  | 'missing';

/** The states that leave the picker with an assignment it cannot show. */
export type UnresolvedEntityState = Extract<AssignedEntityState, 'never-created' | 'missing'>;

/** Whether the row carries an entity the picker cannot show — the case that needs saying out loud. */
export function isUnresolvedEntity(state: AssignedEntityState): state is UnresolvedEntityState {
  return state === 'never-created' || state === 'missing';
}

/**
 * Classify the entity assignment on `transaction` against the options the
 * picker was given.
 *
 * Exists because the picker renders its placeholder for anything it cannot
 * find, which makes "no entity" and "an entity that doesn't resolve" look
 * identical on a row the user has already been told is matched (POPS-2692).
 *
 * @param entities The loaded options, or `undefined` while they load. Absence
 *   from a *defined* list is conclusive — `useEntities` reads the whole
 *   contact set, not a capped page (POPS-226) — which is the only reason
 *   `missing` can be stated as fact rather than guessed at.
 */
export function classifyAssignedEntity(
  transaction: ProcessedTransaction,
  entities: ReadonlyArray<{ id: string }> | undefined
): AssignedEntityState {
  const entityId = transaction.entity.entityId;
  if (!entityId) return 'unassigned';
  if (isPendingContactId(entityId)) return 'never-created';
  if (entities === undefined) return 'loading';
  return entities.some((e) => e.id === entityId) ? 'resolved' : 'missing';
}
