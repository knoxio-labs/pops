import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { fieldEnumOptions, itemTypeFields } from '../db/schema.js';
import { definitionText } from './authoring-put-shared.js';
import { existingOrNew, failIssues, issue, persistedOptionRow } from './authoring-shared.js';

import type { CommandDb } from '../domain/commands/index.js';
import type { DraftOperation } from './authoring-types.js';

interface OptionDefaults {
  readonly sortOrder: number;
  readonly archivedAt: string | null;
}

function optionDefaults(current: typeof fieldEnumOptions.$inferSelect | undefined): OptionDefaults {
  return { sortOrder: current?.sortOrder ?? 0, archivedAt: current?.archivedAt ?? null };
}

interface OptionWriteContext {
  readonly db: CommandDb;
  readonly revision: number;
  readonly current: typeof fieldEnumOptions.$inferSelect | undefined;
  readonly operation: Extract<DraftOperation, { kind: 'put_enum_option' }>;
  readonly id: string;
  readonly key: string;
  readonly label: string;
}

function writeOption(context: OptionWriteContext): void {
  const { db, revision, current, operation, id, key, label } = context;
  const row = persistedOptionRow(revision, {
    ...optionDefaults(current),
    ...operation,
    id,
    key,
    label,
  });
  db.insert(fieldEnumOptions)
    .values(row)
    .onConflictDoUpdate({
      target: [fieldEnumOptions.revision, fieldEnumOptions.id],
      set: {
        key: row.key,
        fieldId: row.fieldId,
        label: row.label,
        sortOrder: row.sortOrder,
        archivedAt: row.archivedAt,
      },
    })
    .run();
}

function currentOption(
  db: CommandDb,
  revision: number,
  id: string | undefined
): typeof fieldEnumOptions.$inferSelect | undefined {
  return existingOrNew(id, (optionId) =>
    db
      .select()
      .from(fieldEnumOptions)
      .where(and(eq(fieldEnumOptions.revision, revision), eq(fieldEnumOptions.id, optionId)))
      .get()
  );
}

function requireEnumField(
  db: CommandDb,
  revision: number,
  fieldId: string
): typeof itemTypeFields.$inferSelect {
  const field = db
    .select()
    .from(itemTypeFields)
    .where(and(eq(itemTypeFields.revision, revision), eq(itemTypeFields.id, fieldId)))
    .get();
  if (field === undefined)
    failIssues([
      issue(fieldId, 'fieldId', 'field_unknown', 'Enum option parent field is not in the draft'),
    ]);
  if (field.kind !== 'enum')
    failIssues([
      issue(fieldId, 'fieldId', 'enum_field_required', 'Enum options require an enum field'),
    ]);
  return field;
}

function assertOptionIdentity(
  current: typeof fieldEnumOptions.$inferSelect | undefined,
  operation: Extract<DraftOperation, { kind: 'put_enum_option' }>,
  id: string
): void {
  if (current && operation.fieldId !== current.fieldId)
    failIssues([
      issue(id, 'fieldId', 'immutable_identity', 'An enum option cannot move to another field'),
    ]);
  if (
    current &&
    operation.key !== undefined &&
    operation.key.toLocaleLowerCase() !== current.key.toLocaleLowerCase()
  ) {
    failIssues([
      issue(id, 'key', 'immutable_identity', 'Published enum option keys cannot be changed'),
    ]);
  }
}

/** Applies an enum-option create or mutable update to a draft snapshot. */
export function applyPutOption(
  db: CommandDb,
  revision: number,
  operation: Extract<DraftOperation, { kind: 'put_enum_option' }>
): void {
  const current = currentOption(db, revision, operation.id);
  if (operation.id !== undefined && current === undefined)
    failIssues([
      issue(operation.id, 'id', 'definition_unknown', 'Enum option identity is not in the draft'),
    ]);
  requireEnumField(db, revision, operation.fieldId);
  const id = current?.id ?? operation.id ?? randomUUID();
  assertOptionIdentity(current, operation, id);
  writeOption({
    db,
    revision,
    current,
    operation,
    id,
    key: definitionText({
      id,
      proposed: operation.key,
      current: current?.key,
      path: 'key',
      label: 'Enum option key',
    }),
    label: definitionText({
      id,
      proposed: operation.label,
      current: current?.label,
      path: 'label',
      label: 'Enum option label',
    }),
  });
}
