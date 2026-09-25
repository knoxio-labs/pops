/**
 * Contract-fidelity guards for the MCP catalogue and item schemas.
 *
 * MCP cannot import `@pops/inventory` at runtime without pulling the backend's
 * native SQLite dependency graph into the gateway image. The committed OpenAPI
 * document is generated from inventory's zod contract and checked for drift in
 * CI, so these assertions bind the hand-authored MCP JSON schemas to producer
 * enforcement without creating that runtime dependency.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { cataloguePreviewComputedField } from './inventory-catalogue-computed-preview.js';
import { catalogueDraftOperationInputSchema } from './inventory-catalogue-preview.js';
import {
  catalogueOperationSchema,
  EXPRESSION_BINARY_OPS,
  EXPRESSION_UNARY_OPS,
  expressionSchemaDefs,
} from './inventory-catalogue-schema.js';
import { catalogueTools } from './inventory-catalogue.js';
import { validationFieldValueSchema } from './inventory-item-input.js';

const here = dirname(fileURLToPath(import.meta.url));
const INVENTORY_OPENAPI_PATH = join(here, '../../../inventory/openapi/inventory.openapi.json');

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`expected ${label} to be an object`);
  }
  return value;
}

function property(value: unknown, key: string): unknown {
  return object(value, `parent of ${key}`)[key];
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`expected ${label} to be an array`);
  return value;
}

function strings(value: unknown, label: string): readonly string[] {
  const values = array(value, label);
  if (!values.every((entry): entry is string => typeof entry === 'string')) {
    throw new Error(`expected ${label} to contain only strings`);
  }
  return values;
}

function requestSchema(spec: unknown, path: string, method: string): unknown {
  const operation = property(property(property(spec, 'paths'), path), method);
  const content = property(property(operation, 'requestBody'), 'content');
  return property(property(content, 'application/json'), 'schema');
}

function discriminants(schema: unknown): readonly string[] {
  return array(property(schema, 'oneOf'), 'oneOf').flatMap((variant) => {
    const kind = property(property(variant, 'properties'), 'kind');
    const constant = property(kind, 'const');
    if (typeof constant === 'string') return [constant];
    return strings(property(kind, 'enum'), 'kind enum');
  });
}

/** Resolves a `{ $ref: '#/components/schemas/Name' }` against the OpenAPI document root. */
function resolveRef(spec: unknown, schema: unknown): unknown {
  const ref = property(schema, '$ref');
  if (typeof ref !== 'string') return schema;
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref: ${ref}`);
  return ref
    .slice(2)
    .split('/')
    .reduce<unknown>((node, segment) => property(node, segment), spec);
}

/** The producer's published `ExpressionV1` schema, following `allOf`/`$ref` wrapping to the real node. */
function expressionSchema(spec: unknown): Record<string, unknown> {
  const patchSchema = requestSchema(spec, '/type-catalogue/drafts/{revision}', 'patch');
  const operations = property(property(property(patchSchema, 'properties'), 'operations'), 'items');
  const putField = array(property(operations, 'oneOf'), 'operation oneOf').find((variant) =>
    discriminants({ oneOf: [variant] }).includes('put_field')
  );
  if (putField === undefined) throw new Error('put_field operation is missing');
  const wrapped = property(property(putField, 'properties'), 'expression');
  const wrappedAllOf = array(property(wrapped, 'allOf'), 'expression allOf');
  const first = wrappedAllOf[0];
  if (first === undefined) throw new Error('expression allOf is empty');
  return object(resolveRef(spec, first), 'ExpressionV1');
}

const spec: unknown = JSON.parse(readFileSync(INVENTORY_OPENAPI_PATH, 'utf8'));

describe('inventory MCP schema fidelity', () => {
  it('matches every producer catalogue operation discriminant and primitive kind', () => {
    const patchSchema = requestSchema(spec, '/type-catalogue/drafts/{revision}', 'patch');
    const producerOperation = property(
      property(property(patchSchema, 'properties'), 'operations'),
      'items'
    );
    const producerKinds = discriminants(producerOperation);
    const mcpKinds = discriminants(catalogueOperationSchema);
    expect(mcpKinds.toSorted()).toEqual(producerKinds.toSorted());

    const producerPutField = array(property(producerOperation, 'oneOf'), 'operation oneOf').find(
      (variant) => discriminants({ oneOf: [variant] }).includes('put_field')
    );
    const mcpPutField = catalogueOperationSchema.oneOf.find((variant) =>
      discriminants({ oneOf: [variant] }).includes('put_field')
    );
    if (producerPutField === undefined || mcpPutField === undefined) {
      throw new Error('put_field operation is missing');
    }
    const producerPrimitiveKinds = strings(
      property(property(property(producerPutField, 'properties'), 'fieldKind'), 'enum'),
      'producer primitive kinds'
    );
    const mcpPrimitiveKinds = strings(
      property(property(property(mcpPutField, 'properties'), 'fieldKind'), 'enum'),
      'MCP primitive kinds'
    );
    expect(mcpPrimitiveKinds).toEqual(producerPrimitiveKinds);

    const producerVersions = property(
      property(property(producerPutField, 'properties'), 'expressionVersion'),
      'enum'
    );
    const mcpVersions = property(
      property(property(mcpPutField, 'properties'), 'expressionVersion'),
      'enum'
    );
    expect(producerVersions).toEqual([1, 2, null]);
    expect(mcpVersions).toEqual(producerVersions);
  });

  it('offers the same archive operations as the producer, replacement included', () => {
    const patchSchema = requestSchema(spec, '/type-catalogue/drafts/{revision}', 'patch');
    const producerVariants = array(
      property(
        property(property(property(patchSchema, 'properties'), 'operations'), 'items'),
        'oneOf'
      ),
      'operation oneOf'
    );
    const shape = (variants: readonly unknown[], kind: string) => {
      const variant = variants.find((entry) => discriminants({ oneOf: [entry] }).includes(kind));
      if (variant === undefined) throw new Error(`${kind} operation is missing`);
      return {
        properties: Object.keys(object(property(variant, 'properties'), kind)).toSorted(),
        required: strings(property(variant, 'required'), `${kind} required`).toSorted(),
      };
    };

    for (const kind of ['archive_type', 'archive_field', 'archive_enum_option']) {
      expect(shape(catalogueOperationSchema.oneOf, kind), kind).toEqual(
        shape(producerVariants, kind)
      );
    }
    expect(shape(catalogueOperationSchema.oneOf, 'archive_field').properties).toContain(
      'replacedBy'
    );
  });

  it('matches the producer item-validation value vocabulary and required fields', () => {
    const schema = requestSchema(spec, '/type-catalogue/items/validate', 'post');
    const producerFieldValue = property(
      property(property(schema, 'properties'), 'fieldValues'),
      'items'
    );
    expect(strings(property(producerFieldValue, 'required'), 'producer required fields')).toEqual(
      validationFieldValueSchema.required
    );
    expect(
      strings(
        property(property(property(producerFieldValue, 'properties'), 'source'), 'enum'),
        'producer sources'
      )
    ).toEqual(validationFieldValueSchema.properties.source.enum);
    expect(
      property(property(property(producerFieldValue, 'properties'), 'fieldId'), 'format')
    ).toBe(validationFieldValueSchema.properties.fieldId.format);
    expect(property(property(producerFieldValue, 'properties'), 'values')).toMatchObject({
      type: validationFieldValueSchema.properties.values.type,
      minItems: validationFieldValueSchema.properties.values.minItems,
    });
  });

  it('matches the producer expression grammar op sets and reference-hop bound', () => {
    const producerVariants = array(property(expressionSchema(spec), 'anyOf'), 'ExpressionV1 anyOf');

    function opValues(variant: unknown): readonly string[] | undefined {
      const opSchema = property(property(variant, 'properties'), 'op');
      const enumValues = property(opSchema, 'enum');
      if (Array.isArray(enumValues)) return strings(enumValues, 'op enum');
      const constant = property(opSchema, 'const');
      return typeof constant === 'string' ? [constant] : undefined;
    }

    function findByOp(variants: readonly unknown[], op: string): unknown {
      const found = variants.find((variant) => opValues(variant)?.includes(op));
      if (found === undefined) throw new Error(`no expression variant accepts op '${op}'`);
      return found;
    }

    const producerUnaryOps = opValues(findByOp(producerVariants, 'negate'));
    const producerBinaryOps = opValues(findByOp(producerVariants, 'add'));
    if (producerUnaryOps === undefined || producerBinaryOps === undefined) {
      throw new Error('producer op enum missing on a matched variant');
    }
    const producerReadPath = property(
      property(findByOp(producerVariants, 'read'), 'properties'),
      'path'
    );

    expect([...EXPRESSION_UNARY_OPS].toSorted()).toEqual(producerUnaryOps.toSorted());
    expect([...EXPRESSION_BINARY_OPS].toSorted()).toEqual(producerBinaryOps.toSorted());

    const mcpVariants = expressionSchemaDefs.expressionV1.oneOf;
    const mcpUnaryOps = opValues(findByOp(mcpVariants, 'negate'));
    const mcpBinaryOps = opValues(findByOp(mcpVariants, 'add'));
    if (mcpUnaryOps === undefined || mcpBinaryOps === undefined) {
      throw new Error('MCP op enum missing on a matched variant');
    }
    const mcpReadPath = property(property(findByOp(mcpVariants, 'read'), 'properties'), 'path');

    expect(mcpUnaryOps.toSorted()).toEqual(producerUnaryOps.toSorted());
    expect(mcpBinaryOps.toSorted()).toEqual(producerBinaryOps.toSorted());
    expect(mcpReadPath).toMatchObject({ maxItems: property(producerReadPath, 'maxItems') });

    const everyOp = (variants: readonly unknown[]) =>
      variants.flatMap((variant) => opValues(variant) ?? []).toSorted();
    expect(everyOp(mcpVariants)).toEqual(everyOp(producerVariants));
    const producerValues = property(
      property(findByOp(producerVariants, 'coalesce'), 'properties'),
      'values'
    );
    const mcpValues = property(property(findByOp(mcpVariants, 'coalesce'), 'properties'), 'values');
    expect(mcpValues).toMatchObject({ minItems: property(producerValues, 'minItems') });
  });

  it('matches the producer length and count limits for put_type, put_field and put_enum_option', () => {
    const patchSchema = requestSchema(spec, '/type-catalogue/drafts/{revision}', 'patch');
    const producerVariants = array(
      property(
        property(property(property(patchSchema, 'properties'), 'operations'), 'items'),
        'oneOf'
      ),
      'operation oneOf'
    );
    const variant = (variants: readonly unknown[], kind: string) => {
      const found = variants.find((entry) => discriminants({ oneOf: [entry] }).includes(kind));
      if (found === undefined) throw new Error(`${kind} operation is missing`);
      return object(property(found, 'properties'), kind);
    };
    const limits = (schema: unknown) => {
      const record = object(schema, 'field schema');
      return {
        minLength: record['minLength'],
        maxLength: record['maxLength'],
        maxItems: record['maxItems'],
      };
    };

    const producerPutType = variant(producerVariants, 'put_type');
    const mcpPutType = variant(catalogueOperationSchema.oneOf, 'put_type');
    for (const key of ['key', 'label', 'description', 'capabilities', 'legacyLabels']) {
      expect(limits(mcpPutType[key]), key).toEqual(limits(producerPutType[key]));
    }
    expect(limits(property(producerPutType['capabilities'], 'items'))).toEqual(
      limits(property(mcpPutType['capabilities'], 'items'))
    );
    expect(limits(property(producerPutType['legacyLabels'], 'items'))).toEqual(
      limits(property(mcpPutType['legacyLabels'], 'items'))
    );

    const producerPutField = variant(producerVariants, 'put_field');
    const mcpPutField = variant(catalogueOperationSchema.oneOf, 'put_field');
    for (const key of ['key', 'label', 'help', 'fixedUnit', 'referenceKinds', 'referenceTypeIds']) {
      expect(limits(mcpPutField[key]), key).toEqual(limits(producerPutField[key]));
    }

    const producerPutEnumOption = variant(producerVariants, 'put_enum_option');
    const mcpPutEnumOption = variant(catalogueOperationSchema.oneOf, 'put_enum_option');
    for (const key of ['key', 'label']) {
      expect(limits(mcpPutEnumOption[key]), key).toEqual(limits(producerPutEnumOption[key]));
    }

    const producerReorder = variant(producerVariants, 'reorder');
    const mcpReorder = variant(catalogueOperationSchema.oneOf, 'reorder');
    expect({
      minItems: property(mcpReorder['ids'], 'minItems'),
      maxItems: property(mcpReorder['ids'], 'maxItems'),
    }).toEqual({
      minItems: property(producerReorder['ids'], 'minItems'),
      maxItems: property(producerReorder['ids'], 'maxItems'),
    });

    const producerOperations = property(property(patchSchema, 'properties'), 'operations');
    const mcpOperations = property(
      property(catalogueDraftOperationInputSchema, 'properties'),
      'operations'
    );
    expect({
      minItems: property(mcpOperations, 'minItems'),
      maxItems: property(mcpOperations, 'maxItems'),
    }).toEqual({
      minItems: property(producerOperations, 'minItems'),
      maxItems: property(producerOperations, 'maxItems'),
    });
  });

  it('matches the producer length limits on publishDraft note and migrationName', () => {
    const schema = requestSchema(spec, '/type-catalogue/drafts/{revision}/publish', 'post');
    const producerNote = object(property(property(schema, 'properties'), 'note'), 'note');
    const producerMigrationName = object(
      property(property(schema, 'properties'), 'migrationName'),
      'migrationName'
    );
    const cataloguePublishDraft = catalogueTools.find(
      (tool) => tool.name === 'inventory.catalogue.publishDraft'
    );
    if (cataloguePublishDraft === undefined) throw new Error('publishDraft tool is missing');
    const mcpProps = object(
      property(cataloguePublishDraft.inputSchema, 'properties'),
      'MCP publishDraft properties'
    );
    const mcpNote = object(mcpProps['note'], 'MCP note');
    const mcpMigrationName = object(mcpProps['migrationName'], 'MCP migrationName');

    expect(mcpNote['maxLength']).toEqual(producerNote['maxLength']);
    expect(mcpMigrationName['minLength']).toEqual(producerMigrationName['minLength']);
    expect(mcpMigrationName['maxLength']).toEqual(producerMigrationName['maxLength']);
  });

  it('maps every producer computed-preview request key onto an MCP input', () => {
    const schema = requestSchema(
      spec,
      '/type-catalogue/drafts/{revision}/computed-preview',
      'post'
    );
    const producerKeys = Object.keys(object(property(schema, 'properties'), 'preview properties'));
    const producerFieldKeys = array(
      property(property(property(schema, 'properties'), 'field'), 'anyOf'),
      'field anyOf'
    ).flatMap((variant) => Object.keys(object(property(variant, 'properties'), 'field variant')));
    const mcpKeys = Object.keys(
      object(property(cataloguePreviewComputedField.inputSchema, 'properties'), 'MCP properties')
    );
    const mcpFieldKeys = { id: 'fieldId', key: 'fieldKey' } as const;

    for (const key of producerKeys.filter((candidate) => candidate !== 'field'))
      expect(mcpKeys, `MCP input lacks ${key}`).toContain(key);
    expect(producerFieldKeys.toSorted()).toEqual(Object.keys(mcpFieldKeys).toSorted());
    for (const key of Object.values(mcpFieldKeys)) expect(mcpKeys).toContain(key);
  });
});
