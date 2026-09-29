/** Read-only projection from canonical persisted values to protocol 1. */
import { and, eq } from 'drizzle-orm';

import { itemFieldValues, items } from '../db/schema.js';
import { resolveProtocol1TypeById } from './catalogue.js';
import {
  projectLegacyRow,
  projectRange,
  type Protocol1Projection,
  type Protocol1ProjectionIssue,
} from './protocol-1-projection.js';

import type { CommandDb } from '../db/command-db.js';
import type { Protocol1Fields } from './protocol-1-types.js';

export type { Protocol1Projection, Protocol1ProjectionIssue } from './protocol-1-projection.js';

function loadLegacyFields(
  db: CommandDb,
  itemId: string,
  cardinality: 'reject' | 'omit',
  issues: Protocol1ProjectionIssue[] | undefined = undefined
): Protocol1Fields {
  const item = db.select({ typeId: items.typeId }).from(items).where(eq(items.id, itemId)).get();
  if (!item?.typeId) return {};
  const type = resolveProtocol1TypeById(db, item.typeId);
  if (!type) return {};
  const rows = db
    .select()
    .from(itemFieldValues)
    .where(and(eq(itemFieldValues.itemId, itemId), eq(itemFieldValues.source, 'stored')))
    .all();
  const fields: Protocol1Fields = {};
  const definitions = new Map(type.fields.map((field) => [field.id, field]));
  const multipleValueFieldIds = new Set(
    rows.filter((row) => row.ordinal !== 0).map((row) => row.fieldId)
  );
  const options = { definitions, multipleValueFieldIds, cardinality, issues };
  for (const row of rows) projectLegacyRow(fields, row, options);
  projectRange(fields, type);
  return fields;
}

/** Loads stored values and strictly projects them onto legacy protocol-1 fields. */
export function loadProtocol1Fields(db: CommandDb, itemId: string): Protocol1Fields {
  return loadLegacyFields(db, itemId, 'reject');
}

/**
 * Builds the requested protocol's legacy projection. Protocol 2 omits a
 * complete field when its canonical values cannot fit protocol 1's shape;
 * protocol 1 remains strict.
 */
export function loadLegacyFieldsForProtocol(
  db: CommandDb,
  itemId: string,
  protocol: number
): Protocol1Fields {
  return loadLegacyFields(db, itemId, protocol >= 2 ? 'omit' : 'reject');
}

/**
 * Builds the compatibility projection without allowing one incompatible
 * stored value to abort a page. Canonical stable-ID values remain readable;
 * callers surface the returned issues beside the item.
 */
export function loadLegacyFieldsWithIssues(
  db: CommandDb,
  itemId: string,
  protocol: number
): Protocol1Projection {
  const issues: Protocol1ProjectionIssue[] = [];
  return {
    fields: loadLegacyFields(db, itemId, protocol >= 1 ? 'omit' : 'reject', issues),
    issues,
  };
}
