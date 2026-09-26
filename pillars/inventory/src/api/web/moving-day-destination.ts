import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { loadPublishedCatalogue } from '../../catalogue/index.js';
import { itemFieldValues } from '../../db/index.js';

import type { PersistedItemTypeField } from '../../catalogue/index.js';
import type { WebMovingResponseSchema } from '../../contract/rest-web-moving.js';
import type { ItemRow } from '../../db/row-types.js';
import type { CommandDb } from '../../domain/commands/index.js';

type WebMovingResponse = z.infer<typeof WebMovingResponseSchema>;
type MovingDestination = WebMovingResponse['boxes'][number]['destination'];
type DestinationFields = {
  readonly options: WebMovingResponse['destinationOptions'];
  readonly byType: ReadonlyMap<string, PersistedItemTypeField>;
  readonly byId: ReadonlyMap<string, PersistedItemTypeField>;
};

const enumValueSchema = z.object({ optionId: z.string().min(1) });

function destinationFieldName(destinationField: string): string {
  return destinationField.trim().toLowerCase();
}

function readEnumOptionId(valueJson: string): string | null {
  try {
    const value = enumValueSchema.safeParse(JSON.parse(valueJson));
    return value.success ? value.data.optionId : null;
  } catch {
    return null;
  }
}

function readDestinationFields(
  catalogue: ReturnType<typeof loadPublishedCatalogue>,
  destinationField: string
): DestinationFields {
  const options: WebMovingResponse['destinationOptions'] = [];
  const optionKeys = new Set<string>();
  const byType = new Map<string, PersistedItemTypeField>();
  const byId = new Map<string, PersistedItemTypeField>();
  if (catalogue === null) return { options, byType, byId };

  const wantedKey = destinationFieldName(destinationField);
  for (const type of catalogue.types) {
    const field = type.fields.find(
      (candidate) => candidate.kind === 'enum' && candidate.key.trim().toLowerCase() === wantedKey
    );
    if (field === undefined) continue;
    byType.set(type.id, field);
    byId.set(field.id, field);
    for (const option of field.enumOptions) {
      if (optionKeys.has(option.key)) continue;
      optionKeys.add(option.key);
      options.push({ optionKey: option.key, label: option.label });
    }
  }
  return { options, byType, byId };
}

function readStoredValues(
  db: CommandDb,
  boxRows: readonly ItemRow[],
  fieldIds: ReadonlyMap<string, PersistedItemTypeField>
): ReadonlyMap<string, (typeof itemFieldValues.$inferSelect)[]> {
  if (boxRows.length === 0 || fieldIds.size === 0) return new Map();
  const valuesByItem = new Map<string, (typeof itemFieldValues.$inferSelect)[]>();
  const valueRows = db
    .select()
    .from(itemFieldValues)
    .where(
      and(
        inArray(
          itemFieldValues.itemId,
          boxRows.map((row) => row.id)
        ),
        eq(itemFieldValues.source, 'stored'),
        inArray(itemFieldValues.fieldId, [...fieldIds.keys()])
      )
    )
    .orderBy(asc(itemFieldValues.ordinal))
    .all();
  for (const row of valueRows) {
    const values = valuesByItem.get(row.itemId);
    if (values === undefined) valuesByItem.set(row.itemId, [row]);
    else values.push(row);
  }
  return valuesByItem;
}

function readBoxDestinations(
  boxRows: readonly ItemRow[],
  fields: DestinationFields,
  valuesByItem: ReadonlyMap<string, (typeof itemFieldValues.$inferSelect)[]>
): ReadonlyMap<string, MovingDestination> {
  const destinations = new Map<string, MovingDestination>();
  for (const box of boxRows) {
    const field = box.typeId === null ? undefined : fields.byType.get(box.typeId);
    const value =
      field === undefined
        ? undefined
        : valuesByItem.get(box.id)?.find((row) => row.fieldId === field.id && row.ordinal === 0);
    const optionId = value === undefined ? null : readEnumOptionId(value.valueJson);
    const option =
      optionId === null
        ? undefined
        : field?.enumOptions.find((candidate) => candidate.id === optionId);
    destinations.set(
      box.id,
      option === undefined ? null : { optionKey: option.key, label: option.label }
    );
  }
  return destinations;
}

/** Reads moving-day destination options and each box's stored destination value. */
export function readMovingDestinations(
  db: CommandDb,
  boxRows: readonly ItemRow[],
  destinationField: string
): {
  readonly options: WebMovingResponse['destinationOptions'];
  readonly destinations: ReadonlyMap<string, MovingDestination>;
} {
  const fields = readDestinationFields(loadPublishedCatalogue(db), destinationField);
  return {
    options: fields.options,
    destinations: readBoxDestinations(boxRows, fields, readStoredValues(db, boxRows, fields.byId)),
  };
}
