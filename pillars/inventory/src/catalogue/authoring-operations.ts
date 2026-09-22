import { and, eq } from 'drizzle-orm';

import { fieldEnumOptions, itemTypeFields, itemTypes } from '../db/schema.js';
import { applyPutField } from './authoring-put-field.js';
import { applyPutOption } from './authoring-put-option.js';
import { applyPutType } from './authoring-put-type.js';
import { applyReorder } from './authoring-reorder.js';
import { failIssues, issue } from './authoring-shared.js';

import type { CommandDb } from '../domain/commands/index.js';
import type { DraftOperation } from './authoring-types.js';

function applyArchive(
  db: CommandDb,
  revision: number,
  operation: Extract<
    DraftOperation,
    { kind: 'archive_type' | 'archive_field' | 'archive_enum_option' }
  >
): void {
  const archivedAt = new Date().toISOString();
  const table = archiveTable(operation.kind);
  const result = db
    .update(table)
    .set({ archivedAt })
    .where(and(eq(table.revision, revision), eq(table.id, operation.id)))
    .run();
  if (result.changes === 0) {
    const label = archiveLabel(operation.kind);
    failIssues([
      issue(operation.id, 'id', 'definition_unknown', `${label} identity is not in the draft`),
    ]);
  }
}

function archiveTable(
  kind: Extract<
    DraftOperation,
    { kind: 'archive_type' | 'archive_field' | 'archive_enum_option' }
  >['kind']
): typeof itemTypes | typeof itemTypeFields | typeof fieldEnumOptions {
  if (kind === 'archive_type') return itemTypes;
  if (kind === 'archive_field') return itemTypeFields;
  return fieldEnumOptions;
}

function archiveLabel(
  kind: Extract<
    DraftOperation,
    { kind: 'archive_type' | 'archive_field' | 'archive_enum_option' }
  >['kind']
): string {
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
