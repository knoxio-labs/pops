import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { itemTypes } from '../db/schema.js';
import { definitionText } from './authoring-put-shared.js';
import {
  assertReplacedStaysArchived,
  existingOrNew,
  failIssues,
  issue,
  persistedTypeRow,
} from './authoring-shared.js';

import type { CommandDb } from '../domain/commands/index.js';
import type { DraftOperation } from './authoring-types.js';

interface TypeDefaults {
  readonly description: string | null;
  readonly sortOrder: number;
  readonly capabilities: readonly string[];
  readonly legacyLabels: readonly string[];
  readonly presentation: Record<string, unknown>;
  readonly archivedAt: string | null;
  readonly parentTypeId: string | null;
}

function typeDefaults(current: typeof itemTypes.$inferSelect | undefined): TypeDefaults {
  if (current === undefined) {
    return {
      description: null,
      sortOrder: 0,
      capabilities: [],
      legacyLabels: [],
      presentation: {},
      archivedAt: null,
      parentTypeId: null,
    };
  }
  return {
    description: current.description,
    sortOrder: current.sortOrder,
    capabilities: JSON.parse(current.capabilitiesJson) as string[],
    legacyLabels: JSON.parse(current.legacyLabelsJson) as string[],
    presentation: JSON.parse(current.presentationJson) as Record<string, unknown>,
    archivedAt: current.archivedAt,
    parentTypeId: current.parentTypeId,
  };
}

function resolvedParentTypeId(
  current: typeof itemTypes.$inferSelect | undefined,
  operation: Extract<DraftOperation, { kind: 'put_type' }>
): string | null {
  return operation.parentTypeId === undefined
    ? (current?.parentTypeId ?? null)
    : operation.parentTypeId;
}

interface TypeWriteContext {
  readonly db: CommandDb;
  readonly revision: number;
  readonly current: typeof itemTypes.$inferSelect | undefined;
  readonly operation: Extract<DraftOperation, { kind: 'put_type' }>;
  readonly id: string;
  readonly key: string;
  readonly label: string;
}

function writeType(context: TypeWriteContext): void {
  const { db, revision, current, operation, id, key, label } = context;
  const defaults = typeDefaults(current);
  const row = persistedTypeRow(revision, {
    ...defaults,
    ...operation,
    id,
    key,
    label,
    parentTypeId: resolvedParentTypeId(current, operation),
  });
  assertReplacedStaysArchived(id, current, row.archivedAt);
  db.insert(itemTypes)
    .values(row)
    .onConflictDoUpdate({
      target: [itemTypes.revision, itemTypes.id],
      set: {
        key: row.key,
        label: row.label,
        description: row.description,
        sortOrder: row.sortOrder,
        capabilitiesJson: row.capabilitiesJson,
        legacyLabelsJson: row.legacyLabelsJson,
        presentationJson: row.presentationJson,
        archivedAt: row.archivedAt,
        parentTypeId: row.parentTypeId,
      },
    })
    .run();
}

/** Applies a type create or mutable update to a draft snapshot. */
export function applyPutType(
  db: CommandDb,
  revision: number,
  operation: Extract<DraftOperation, { kind: 'put_type' }>
): void {
  const current = existingOrNew(operation.id, (id) =>
    db
      .select()
      .from(itemTypes)
      .where(and(eq(itemTypes.revision, revision), eq(itemTypes.id, id)))
      .get()
  );
  if (operation.id !== undefined && current === undefined) {
    failIssues([
      issue(operation.id, 'id', 'definition_unknown', 'Type identity is not in the draft'),
    ]);
  }
  const id = current?.id ?? operation.id ?? randomUUID();
  if (
    current &&
    operation.key !== undefined &&
    operation.key.toLocaleLowerCase() !== current.key.toLocaleLowerCase()
  ) {
    failIssues([issue(id, 'key', 'immutable_identity', 'Published type keys cannot be changed')]);
  }
  if (resolvedParentTypeId(current, operation) === id) {
    failIssues([issue(id, 'parentTypeId', 'type_parent_cycle', 'A type cannot be its own parent')]);
  }
  writeType({
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
      label: 'Type key',
    }),
    label: definitionText({
      id,
      proposed: operation.label,
      current: current?.label,
      path: 'label',
      label: 'Type label',
    }),
  });
}
