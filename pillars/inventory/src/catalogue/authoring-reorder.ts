import { and, eq } from 'drizzle-orm';

import { fieldEnumOptions, itemTypeFields, itemTypes } from '../db/schema.js';
import { failIssues, issue, sameStrings } from './authoring-shared.js';

import type { CommandDb } from '../domain/commands/index.js';
import type { DraftOperation } from './authoring-types.js';

function reorderTypes(
  db: CommandDb,
  revision: number,
  operation: Extract<DraftOperation, { kind: 'reorder' }>
): void {
  const rows = db
    .select({ id: itemTypes.id })
    .from(itemTypes)
    .where(eq(itemTypes.revision, revision))
    .all();
  if (
    !sameStrings(
      rows.map((row) => row.id),
      operation.ids
    )
  ) {
    failIssues([
      issue(
        operation.parentId ?? null,
        'ids',
        'reorder_incomplete',
        'Type reorder must name every type exactly once'
      ),
    ]);
  }
  for (const [sortOrder, id] of operation.ids.entries()) {
    db.update(itemTypes)
      .set({ sortOrder })
      .where(and(eq(itemTypes.revision, revision), eq(itemTypes.id, id)))
      .run();
  }
}

function reorderFields(
  db: CommandDb,
  revision: number,
  operation: Extract<DraftOperation, { kind: 'reorder' }>,
  parentId: string
): void {
  const rows = db
    .select({ id: itemTypeFields.id })
    .from(itemTypeFields)
    .where(and(eq(itemTypeFields.revision, revision), eq(itemTypeFields.typeId, parentId)))
    .all();
  if (
    !sameStrings(
      rows.map((row) => row.id),
      operation.ids
    )
  ) {
    failIssues([
      issue(
        parentId,
        'ids',
        'reorder_incomplete',
        'Field reorder must name every field exactly once'
      ),
    ]);
  }
  for (const [sortOrder, id] of operation.ids.entries()) {
    db.update(itemTypeFields)
      .set({ sortOrder })
      .where(and(eq(itemTypeFields.revision, revision), eq(itemTypeFields.id, id)))
      .run();
  }
}

function reorderOptions(
  db: CommandDb,
  revision: number,
  operation: Extract<DraftOperation, { kind: 'reorder' }>,
  parentId: string
): void {
  const rows = db
    .select({ id: fieldEnumOptions.id })
    .from(fieldEnumOptions)
    .where(and(eq(fieldEnumOptions.revision, revision), eq(fieldEnumOptions.fieldId, parentId)))
    .all();
  if (
    !sameStrings(
      rows.map((row) => row.id),
      operation.ids
    )
  ) {
    failIssues([
      issue(
        parentId,
        'ids',
        'reorder_incomplete',
        'Enum option reorder must name every option exactly once'
      ),
    ]);
  }
  for (const [sortOrder, id] of operation.ids.entries()) {
    db.update(fieldEnumOptions)
      .set({ sortOrder })
      .where(and(eq(fieldEnumOptions.revision, revision), eq(fieldEnumOptions.id, id)))
      .run();
  }
}

/** Applies one reorder operation inside the caller transaction. */
export function applyReorder(
  db: CommandDb,
  revision: number,
  operation: Extract<DraftOperation, { kind: 'reorder' }>
): void {
  if (operation.definition === 'type') {
    reorderTypes(db, revision, operation);
    return;
  }
  if (operation.parentId === undefined || operation.parentId === null) {
    failIssues([
      issue(
        null,
        'parentId',
        'parent_required',
        'Field and option reorders require a parent identity'
      ),
    ]);
  }
  if (operation.definition === 'field') {
    reorderFields(db, revision, operation, operation.parentId);
    return;
  }
  reorderOptions(db, revision, operation, operation.parentId);
}
