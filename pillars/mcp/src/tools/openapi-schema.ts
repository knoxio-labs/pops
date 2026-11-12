import { openApiArray as array, openApiObject as object } from './openapi-values.js';

const schemaKeys = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  'enum',
  'const',
  'nullable',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'description',
  'title',
  'example',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
  'discriminator',
]);
const stringFormats = new Set([
  'date',
  'date-time',
  'time',
  'uuid',
  'uri',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
]);
const numericFormats: Readonly<Record<string, { type: string; bounds: Record<string, number> }>> = {
  int64: { type: 'integer', bounds: { minimum: -(2 ** 63), exclusiveMaximum: 2 ** 63 } },
  int32: { type: 'integer', bounds: { minimum: -(2 ** 31), exclusiveMaximum: 2 ** 31 } },
  double: { type: 'number', bounds: { minimum: -Number.MAX_VALUE, maximum: Number.MAX_VALUE } },
};

function resolveReference(document: unknown, reference: string, seen: readonly string[]): unknown {
  if (!reference.startsWith('#/')) throw new Error(`External OpenAPI reference: ${reference}`);
  if (seen.includes(reference)) throw new Error(`Recursive OpenAPI reference: ${reference}`);
  return reference
    .slice(2)
    .split('/')
    .reduce<unknown>((value, part) => {
      const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
      const next = object(value, reference)[key];
      if (next === undefined) throw new Error(`Missing OpenAPI reference: ${reference}`);
      return next;
    }, document);
}

function projectEntry(
  document: unknown,
  key: string,
  item: unknown,
  seen: readonly string[]
): unknown {
  if (!schemaKeys.has(key)) throw new Error(`Unsupported OpenAPI schema keyword: ${key}`);
  if (key === 'properties') {
    return Object.fromEntries(
      Object.entries(object(item, 'properties')).map(([name, child]) => [
        name,
        projectOpenApiSchema(document, child, seen),
      ])
    );
  }
  if (key === 'oneOf' || key === 'anyOf' || key === 'allOf') {
    return array(item, key).map((child) => projectOpenApiSchema(document, child, seen));
  }
  if (
    key === 'items' ||
    key === 'not' ||
    (key === 'additionalProperties' && typeof item !== 'boolean')
  ) {
    return projectOpenApiSchema(document, item, seen);
  }
  return item;
}

function lowerExclusiveBounds(result: Record<string, unknown>): void {
  for (const [exclusive, inclusive] of [
    ['exclusiveMinimum', 'minimum'],
    ['exclusiveMaximum', 'maximum'],
  ]) {
    if (exclusive === undefined || inclusive === undefined)
      throw new Error('Missing numeric bound names');
    const value = result[exclusive];
    if (typeof value !== 'boolean') continue;
    delete result[exclusive];
    if (!value) continue;
    const bound = result[inclusive];
    if (typeof bound !== 'number') throw new Error(`Missing OpenAPI bound for ${exclusive}`);
    result[exclusive] = bound;
  }
}

function lowerFormat(result: Record<string, unknown>): void {
  const format = result['format'];
  if (format === undefined) return;
  if (typeof format !== 'string') throw new Error('OpenAPI format must be a string');
  const numeric = numericFormats[format];
  if (numeric === undefined) {
    if (!stringFormats.has(format)) throw new Error(`Unsupported OpenAPI schema format: ${format}`);
    return;
  }
  if (result['type'] !== numeric.type) throw new Error(`Invalid OpenAPI numeric format: ${format}`);
  delete result['format'];
  result['allOf'] = [...array(result['allOf'] ?? [], 'numeric allOf'), numeric.bounds];
}

function lowerNullableComposition(result: Record<string, unknown>): Record<string, unknown> {
  if (result['nullable'] !== true || result['type'] !== undefined) return result;
  if (
    result['oneOf'] === undefined &&
    result['anyOf'] === undefined &&
    result['allOf'] === undefined
  ) {
    throw new Error('Nullable OpenAPI schema requires a type or composition');
  }
  delete result['nullable'];
  return { anyOf: [result, { type: 'null' }] };
}

/**
 * Resolve local OpenAPI schemas and lower OAS3 bounds, numeric formats and nullable unions.
 * Unhandled constraints fail admission rather than being dropped by the JSON Schema validator.
 */
export function projectOpenApiSchema(
  document: unknown,
  value: unknown,
  seen: readonly string[] = []
): Record<string, unknown> {
  const original = object(value, 'OpenAPI schema');
  const reference = original['$ref'];
  if (reference !== undefined) {
    if (typeof reference !== 'string') throw new Error('OpenAPI $ref must be a string');
    if (Object.keys(original).length !== 1)
      throw new Error(`OpenAPI 3.0 reference has siblings: ${reference}`);
    return projectOpenApiSchema(document, resolveReference(document, reference, seen), [
      ...seen,
      reference,
    ]);
  }
  const result = Object.fromEntries(
    Object.entries(original).map(([key, item]) => [key, projectEntry(document, key, item, seen)])
  );
  lowerExclusiveBounds(result);
  lowerFormat(result);
  return lowerNullableComposition(result);
}
