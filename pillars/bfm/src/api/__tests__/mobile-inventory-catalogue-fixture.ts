import { z } from 'zod';

const JsonObject = z.record(z.string(), z.unknown());

const Catalogue = JsonObject.and(
  z.object({
    revision: JsonObject.and(z.object({ revision: z.number() })),
    types: z.array(JsonObject.and(z.object({ fields: z.array(JsonObject) }))),
  })
);

function normalizeField(field: z.infer<typeof JsonObject>): z.infer<typeof JsonObject> {
  const { defaultValues, ...withoutDefaultValues } = field;
  if (!Array.isArray(defaultValues) || defaultValues.length > 0) {
    return defaultValues === undefined
      ? withoutDefaultValues
      : { ...withoutDefaultValues, defaultValues };
  }
  return withoutDefaultValues;
}

function normalizeType(type: z.infer<typeof JsonObject>): z.infer<typeof JsonObject> {
  const { parentTypeId, ...withoutParentTypeId } = type;
  const normalized = {
    ...withoutParentTypeId,
    fields: z.array(JsonObject).parse(type['fields']).map(normalizeField),
  };
  return parentTypeId == null ? normalized : { ...normalized, parentTypeId };
}

/** Converts a value-vector catalogue into the shape bfm serves to phones. */
export function normalizeCatalogueFixture(
  catalogue: Record<string, unknown>
): Record<string, unknown> {
  const parsed = Catalogue.parse(catalogue);
  const { draftVersion: _draftVersion, ...revision } = parsed.revision;
  return {
    ...parsed,
    revision,
    types: parsed.types.map(normalizeType),
  };
}
