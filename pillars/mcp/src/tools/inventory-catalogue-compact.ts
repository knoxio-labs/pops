import { isDeepStrictEqual } from 'node:util';

type Definition = Record<string, unknown>;

type OwnedDefinition = {
  readonly value: Definition;
  readonly ownerId: string;
};

type CatalogueChange =
  | { readonly kind: 'type'; readonly id: string; readonly key: string }
  | {
      readonly kind: 'field';
      readonly id: string;
      readonly key: string;
      readonly typeId: string;
    }
  | {
      readonly kind: 'enum_option';
      readonly id: string;
      readonly key: string;
      readonly fieldId: string;
    };

const REVISION_FIELDS = [
  'revision',
  'baseRevision',
  'status',
  'draftVersion',
  'minimumProtocol',
] as const;

function isDefinition(value: unknown): value is Definition {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function definitions(value: unknown): Definition[] {
  return Array.isArray(value) ? value.filter(isDefinition) : [];
}

function stringField(value: Definition, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

function revisionSummary(value: unknown): Definition {
  if (!isDefinition(value) || !isDefinition(value['revision'])) return {};

  const source = value['revision'];
  const summary: Definition = {};
  for (const field of REVISION_FIELDS) {
    if (field in source) summary[field] = source[field];
  }
  return summary;
}

function compactWrite(value: unknown, changed: readonly CatalogueChange[]): Definition {
  return { revision: revisionSummary(value), changed };
}

function withoutFields(value: Definition, omittedFields: readonly string[]): Definition {
  const fields = { ...value };
  for (const field of omittedFields) delete fields[field];
  return fields;
}

function catalogueTypes(value: unknown): Definition[] {
  return isDefinition(value) ? definitions(value['types']) : [];
}

function catalogueFields(types: readonly Definition[]): OwnedDefinition[] {
  return types.flatMap((type) => {
    const typeId = stringField(type, 'id');
    if (typeId === undefined) return [];
    return definitions(type['fields']).map((field) => ({ value: field, ownerId: typeId }));
  });
}

function enumOptions(fields: readonly OwnedDefinition[]): OwnedDefinition[] {
  return fields.flatMap((field) => {
    const fieldId = stringField(field.value, 'id');
    if (fieldId === undefined) return [];
    return definitions(field.value['enumOptions']).map((option) => ({
      value: option,
      ownerId: fieldId,
    }));
  });
}

function changedDefinitions<T extends { readonly value: Definition; readonly ownerId: string }>(
  before: readonly T[],
  after: readonly T[],
  omittedFields: readonly string[]
): T[] {
  const previous = new Map<string, T>();
  for (const entry of before) {
    const id = stringField(entry.value, 'id');
    if (id !== undefined) previous.set(id, entry);
  }

  return after.filter((entry) => {
    const id = stringField(entry.value, 'id');
    if (id === undefined) return false;
    const old = previous.get(id);
    return (
      old === undefined ||
      old.ownerId !== entry.ownerId ||
      !isDeepStrictEqual(
        withoutFields(old.value, omittedFields),
        withoutFields(entry.value, omittedFields)
      )
    );
  });
}

function changeIdentity(
  entry: OwnedDefinition,
  kind: 'field' | 'enum_option'
): CatalogueChange | undefined {
  const id = stringField(entry.value, 'id');
  const key = stringField(entry.value, 'key');
  if (id === undefined || key === undefined) return undefined;

  if (kind === 'field') {
    return {
      kind,
      id,
      key,
      typeId: stringField(entry.value, 'typeId') ?? entry.ownerId,
    };
  }
  return {
    kind,
    id,
    key,
    fieldId: stringField(entry.value, 'fieldId') ?? entry.ownerId,
  };
}

function catalogueChanges(before: unknown, after: unknown): CatalogueChange[] {
  const beforeTypes = catalogueTypes(before);
  const afterTypes = catalogueTypes(after);
  const typeChanges = changedDefinitions(
    beforeTypes.map((value) => ({ value, ownerId: '' })),
    afterTypes.map((value) => ({ value, ownerId: '' })),
    ['fields', 'revision']
  ).flatMap((entry): CatalogueChange[] => {
    const id = stringField(entry.value, 'id');
    const key = stringField(entry.value, 'key');
    return id === undefined || key === undefined ? [] : [{ kind: 'type', id, key }];
  });

  const beforeFields = catalogueFields(beforeTypes);
  const afterFields = catalogueFields(afterTypes);
  const fieldChanges = changedDefinitions(beforeFields, afterFields, ['enumOptions']).flatMap(
    (entry): CatalogueChange[] => {
      const change = changeIdentity(entry, 'field');
      return change === undefined ? [] : [change];
    }
  );

  const beforeOptions = enumOptions(beforeFields);
  const afterOptions = enumOptions(afterFields);
  const optionChanges = changedDefinitions(beforeOptions, afterOptions, []).flatMap(
    (entry): CatalogueChange[] => {
      const change = changeIdentity(entry, 'enum_option');
      return change === undefined ? [] : [change];
    }
  );

  return [...typeChanges, ...fieldChanges, ...optionChanges];
}

/** Reduces a catalogue descriptor to revision metadata and an empty change list. */
export function compactCatalogueWriteResult(value: unknown): Definition {
  return compactWrite(value, []);
}

/** Reduces a patch response and lists only definitions changed since its prior draft. */
export function compactCataloguePatchResult(before: unknown, value: unknown): Definition {
  const draft = isDefinition(value) ? value['draft'] : undefined;
  const response: Definition = {
    revision: revisionSummary(draft),
    changed: catalogueChanges(before, draft),
  };
  if (isDefinition(value) && 'compatibility' in value) {
    response['compatibility'] = value['compatibility'];
  }
  return response;
}
