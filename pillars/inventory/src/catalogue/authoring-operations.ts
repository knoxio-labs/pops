import { and, eq } from 'drizzle-orm';

import { fieldEnumOptions, itemTypeFields, itemTypes } from '../db/schema.js';
import { applyPutField } from './authoring-put-field.js';
import { applyPutOption } from './authoring-put-option.js';
import { applyPutType } from './authoring-put-type.js';
import { applyReorder } from './authoring-reorder.js';
import { failIssues, issue } from './authoring-shared.js';

import type { CommandDb } from '../domain/commands/index.js';
import type { DraftOperation } from './authoring-types.js';

type ArchiveOperation = Extract<
  DraftOperation,
  { kind: 'archive_type' | 'archive_field' | 'archive_enum_option' }
>;

function applyArchive(db: CommandDb, revision: number, operation: ArchiveOperation): void {
  const table = archiveTable(operation.kind);
  const label = archiveLabel(operation.kind);
  const where = and(eq(table.revision, revision), eq(table.id, operation.id));
  const current = db.select({ archivedAt: table.archivedAt }).from(table).where(where).get();
  if (current === undefined) {
    failIssues([
      issue(operation.id, 'id', 'definition_unknown', `${label} identity is not in the draft`),
    ]);
  }
  if (operation.kind === 'archive_enum_option' || operation.replacedBy === undefined) {
    db.update(table).set({ archivedAt: new Date().toISOString() }).where(where).run();
    return;
  }
  recordReplacement(db, revision, { ...operation, replacedBy: operation.replacedBy }, current);
}

function recordReplacement(
  db: CommandDb,
  revision: number,
  operation: { kind: 'archive_type' | 'archive_field'; id: string; replacedBy: string },
  current: { readonly archivedAt: string | null }
): void {
  if (operation.replacedBy === operation.id) {
    failIssues([
      issue(operation.id, 'replacedBy', 'replacement_self', 'A definition cannot replace itself'),
    ]);
  }
  const table = operation.kind === 'archive_type' ? itemTypes : itemTypeFields;
  db.update(table)
    .set({
      archivedAt: current.archivedAt ?? new Date().toISOString(),
      replacedBy: operation.replacedBy,
    })
    .where(and(eq(table.revision, revision), eq(table.id, operation.id)))
    .run();
}

function archiveTable(
  kind: ArchiveOperation['kind']
): typeof itemTypes | typeof itemTypeFields | typeof fieldEnumOptions {
  if (kind === 'archive_type') return itemTypes;
  if (kind === 'archive_field') return itemTypeFields;
  return fieldEnumOptions;
}

function archiveLabel(kind: ArchiveOperation['kind']): string {
  if (kind === 'archive_type') return 'Type';
  if (kind === 'archive_field') return 'Field';
  return 'Enum option';
}

/** Applies one closed catalogue edit operation inside the caller transaction. */
export function applyOperation(db: CommandDb, revision: number, operation: DraftOperation): void {
  switch (operation.kind) {
    case 'put_type':
      applyPutType(db, revision, operation);
      return;
    case 'put_field':
      applyPutField(db, revision, operation);
      return;
    case 'put_enum_option':
      applyPutOption(db, revision, operation);
      return;
    case 'archive_type':
    case 'archive_field':
    case 'archive_enum_option':
      applyArchive(db, revision, operation);
      return;
    case 'reorder':
      applyReorder(db, revision, operation);
      return;
  }
}
