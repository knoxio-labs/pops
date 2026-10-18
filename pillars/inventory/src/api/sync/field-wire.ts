import { inArray } from 'drizzle-orm';

import { projectLegacyFieldsWithIssues } from '../../catalogue/protocol-1-read.js';
import { readIdBatches } from '../../catalogue/read-id-batches.js';
import { items } from '../../db/index.js';

import type {
  Protocol1Fields,
  Protocol1Projection,
  ReadItemFieldValue,
} from '../../catalogue/index.js';
import type { ItemValueReader } from '../../catalogue/item-value-reader.js';
import type { CommandDb } from '../../domain/commands/index.js';
import type { ItemExtras, SyncItemProjectionIssue } from './wire-types.js';

type FieldExtras = Pick<ItemExtras, 'fields' | 'fieldValues' | 'typeKeys' | 'projectionIssues'>;

function projectionIssue(code: string, message: string): SyncItemProjectionIssue {
  return { fieldId: null, fieldKey: null, code, message };
}

function syncProjectionIssues(
  issues: readonly SyncItemProjectionIssue[],
  fieldValues: readonly ReadItemFieldValue[],
  protocol: number
): readonly SyncItemProjectionIssue[] {
  if (protocol < 2) return issues;
  const canonicalFieldIds = new Set(fieldValues.map((field) => field.fieldId));
  return issues.filter(
    (issue) =>
      (issue.code !== 'field_definition_missing' &&
        issue.code !== 'field_cardinality_unsupported') ||
      issue.fieldId === null ||
      !canonicalFieldIds.has(issue.fieldId)
  );
}

/** Loads legacy fields, canonical values and type keys through one request-scoped reader. */
export function loadFieldExtras(
  db: CommandDb,
  ids: readonly string[],
  protocol: number,
  valueReader: ItemValueReader
): FieldExtras {
  const fields = new Map<string, Protocol1Fields>();
  const fieldValues = new Map<string, readonly ReadItemFieldValue[]>();
  const typeKeys = new Map<string, string | null>();
  const projectionIssues = new Map<string, SyncItemProjectionIssue[]>();
  const itemTypes = readIdBatches(ids).flatMap((batch) =>
    db
      .select({ id: items.id, typeId: items.typeId })
      .from(items)
      .where(inArray(items.id, batch))
      .all()
  );

  for (const item of itemTypes) {
    const issues: SyncItemProjectionIssue[] = [];
    const projection = loadLegacyProjection(valueReader, item, protocol, issues);
    fields.set(item.id, projection.fields);
    fieldValues.set(
      item.id,
      loadCanonicalProjection(
        valueReader,
        item.id,
        { legacyIssues: projection.issues, protocol },
        issues
      )
    );
    typeKeys.set(item.id, loadTypeKey(valueReader, item, issues));
    if (issues.length > 0) projectionIssues.set(item.id, issues);
  }
  return { fields, fieldValues, typeKeys, projectionIssues };
}

function loadLegacyProjection(
  valueReader: ItemValueReader,
  item: { readonly id: string; readonly typeId: string | null },
  protocol: number,
  issues: SyncItemProjectionIssue[]
): Protocol1Projection {
  try {
    return projectLegacyFieldsWithIssues(
      valueReader.protocol1Type(item.typeId),
      valueReader.rows(item.id),
      protocol
    );
  } catch (error) {
    console.error('[inventory-sync] legacy projection failed', { itemId: item.id, error });
    issues.push(
      projectionIssue(
        'legacy_projection_failed',
        'A compatibility value could not be prepared for sync. No value was changed.'
      )
    );
    return { fields: {}, issues: [] };
  }
}

function loadCanonicalProjection(
  valueReader: ItemValueReader,
  itemId: string,
  compatibility: {
    readonly legacyIssues: readonly SyncItemProjectionIssue[];
    readonly protocol: number;
  },
  issues: SyncItemProjectionIssue[]
): readonly ReadItemFieldValue[] {
  try {
    const values = valueReader.read(itemId, true);
    issues.push(
      ...syncProjectionIssues(compatibility.legacyIssues, values, compatibility.protocol)
    );
    return values;
  } catch (error) {
    console.error('[inventory-sync] canonical projection failed', { itemId, error });
    issues.push(
      ...compatibility.legacyIssues,
      projectionIssue(
        'sync_value_projection_failed',
        'A stored field value could not be prepared for sync. No value was changed.'
      )
    );
    return [];
  }
}

function loadTypeKey(
  valueReader: ItemValueReader,
  item: { readonly id: string; readonly typeId: string | null },
  issues: SyncItemProjectionIssue[]
): string | null {
  try {
    return valueReader.protocol1Type(item.typeId)?.key ?? null;
  } catch (error) {
    console.error('[inventory-sync] item type projection failed', { itemId: item.id, error });
    issues.push(
      projectionIssue(
        'type_projection_failed',
        'The item type could not be prepared for sync. No value was changed.'
      )
    );
    return null;
  }
}
