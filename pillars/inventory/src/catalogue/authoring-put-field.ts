import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { fieldEnumOptions, itemTypeFields, itemTypes } from '../db/schema.js';
import { fieldValues, type FieldValues } from './authoring-put-field-shape.js';
import { choose } from './authoring-put-shared.js';
import {
  assertReplacedStaysArchived,
  existingOrNew,
  failIssues,
  issue,
  persistedFieldRow,
} from './authoring-shared.js';
import { checkFieldDefaultValues } from './field-default-values.js';

import type { CommandDb } from '../domain/commands/index.js';
import type { DraftOperation } from './authoring-types.js';
import type { PrimitiveWireValue } from './value-types.js';

interface FieldWriteContext {
  readonly db: CommandDb;
  readonly revision: number;
  readonly current: typeof itemTypeFields.$inferSelect | undefined;
  readonly operation: Extract<DraftOperation, { kind: 'put_field' }>;
  readonly id: string;
  readonly values: FieldValues;
}

function writeField(context: FieldWriteContext): void {
  const { db, revision, current, operation, id, values } = context;
  const row = persistedFieldRow(revision, {
    id,
    typeId: operation.typeId,
    ...values,
    help: choose(operation.help, current?.help ?? null),
    sortOrder: choose(operation.sortOrder, current?.sortOrder ?? 0),
  });
  assertReplacedStaysArchived(id, current, row.archivedAt);
  db.insert(itemTypeFields)
    .values(row)
    .onConflictDoUpdate({
      target: [itemTypeFields.revision, itemTypeFields.id],
      set: {
        typeId: row.typeId,
        key: row.key,
        label: row.label,
        help: row.help,
        sortOrder: row.sortOrder,
        kind: row.kind,
        cardinality: row.cardinality,
        required: row.required,
        storage: row.storage,
        fixedUnit: row.fixedUnit,
        referenceKindsJson: row.referenceKindsJson,
        referenceTypeIdsJson: row.referenceTypeIdsJson,
        expressionVersion: row.expressionVersion,
        expressionJson: row.expressionJson,
        allowOverride: row.allowOverride,
        defaultValuesJson: row.defaultValuesJson,
        presentationJson: row.presentationJson,
        archivedAt: row.archivedAt,
      },
    })
    .run();
}

function checkedDefaultValues(
  db: CommandDb,
  revision: number,
  id: string,
  context: { readonly values: FieldValues; readonly supplied: boolean }
): readonly PrimitiveWireValue[] {
  const { values, supplied } = context;
  if (!supplied) return values.defaultValues;
  const options = db
    .select({ id: fieldEnumOptions.id, archivedAt: fieldEnumOptions.archivedAt })
    .from(fieldEnumOptions)
    .where(and(eq(fieldEnumOptions.revision, revision), eq(fieldEnumOptions.fieldId, id)))
    .all();
  const checked = checkFieldDefaultValues(
    {
      ...values,
      id,
      enumOptionIds: new Set(options.map((option) => option.id)),
      archivedEnumOptionIds: new Set(
        options.filter((option) => option.archivedAt !== null).map((option) => option.id)
      ),
      referenceKinds: new Set(values.referenceKinds),
      referenceTypeIds: new Set(values.referenceTypeIds),
    },
    values.defaultValues
  );
  if (!checked.ok) failIssues([checked.issue]);
  return checked.values;
}

/** Applies a field create or mutable update to a draft snapshot. */
export function applyPutField(
  db: CommandDb,
  revision: number,
  operation: Extract<DraftOperation, { kind: 'put_field' }>
): void {
  const current = existingOrNew(operation.id, (id) =>
    db
      .select()
      .from(itemTypeFields)
      .where(and(eq(itemTypeFields.revision, revision), eq(itemTypeFields.id, id)))
      .get()
  );
  if (operation.id !== undefined && current === undefined)
    failIssues([
      issue(operation.id, 'id', 'definition_unknown', 'Field identity is not in the draft'),
    ]);
  const id = current?.id ?? operation.id ?? randomUUID();
  const type = db
    .select()
    .from(itemTypes)
    .where(and(eq(itemTypes.revision, revision), eq(itemTypes.id, operation.typeId)))
    .get();
  if (type === undefined)
    failIssues([
      issue(operation.typeId, 'typeId', 'type_unknown', 'Field parent type is not in the draft'),
    ]);
  if (current && operation.typeId !== current.typeId)
    failIssues([issue(id, 'typeId', 'immutable_identity', 'A field cannot move to another type')]);
  if (
    current &&
    operation.key !== undefined &&
    operation.key.toLocaleLowerCase() !== current.key.toLocaleLowerCase()
  )
    failIssues([issue(id, 'key', 'immutable_identity', 'Published field keys cannot be changed')]);
  const values = fieldValues(id, current, operation);
  const defaultValues = checkedDefaultValues(db, revision, id, {
    values,
    supplied: operation.defaultValues !== undefined,
  });
  writeField({ db, revision, current, operation, id, values: { ...values, defaultValues } });
}
