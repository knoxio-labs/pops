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

import { catalogueOperationSchema } from './inventory-catalogue-schema.js';
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
});
