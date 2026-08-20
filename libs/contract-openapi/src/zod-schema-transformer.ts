import { z } from 'zod';

import { isRecord } from './json.js';

type OpenApiSchema = Record<string, unknown>;

function isZodType(value: unknown): value is z.ZodType {
  return value !== null && typeof value === 'object' && '_zod' in value && 'parse' in value;
}

/**
 * `z.toJSONSchema(..., { target: 'openapi-3.0' })` renders a nullable enum
 * (`z.enum([...]).nullable()`) as `{ enum: [...], nullable: true }` — the
 * `enum` array itself never gains a `null` entry. OpenAPI 3.0's `nullable`
 * keyword is only a validation hint; per the JSON Schema semantics it draws
 * from, a value must still appear in `enum` to be accepted, so `null` needs
 * to be a member of the array, not just implied by the sibling flag.
 * `@hey-api/openapi-ts` reads `enum` literally when it builds a literal
 * union type: without `null` physically in the array it drops nullability
 * from the generated TS type, even though `nullable: true` is right there
 * (verified against `@hey-api/openapi-ts` 0.99.0). Widening every nullable
 * enum's `enum` array to carry `null` keeps the document strictly correct
 * and makes the generated client honor it.
 */
function widenNullableEnums(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) widenNullableEnums(item);
    return;
  }
  if (!isRecord(node)) return;
  if (node['nullable'] === true && Array.isArray(node['enum'])) {
    const values = node['enum'];
    if (!values.includes(null)) values.push(null);
  }
  for (const value of Object.values(node)) widenNullableEnums(value);
}

function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  const raw: OpenApiSchema = z.toJSONSchema(schema, { target: 'openapi-3.0' });
  const { $schema: _ignored, ...rest } = raw;
  widenNullableEnums(rest);
  return rest;
}

/**
 * Schema transformer for zod 4 — the bundled `ZOD_3_SCHEMA_TRANSFORMER` uses
 * `@anatine/zod-openapi`, which only knows zod 3 (`z.ZodTypeAny`) and emits
 * empty schemas under zod 4. zod 4 ships its own `z.toJSONSchema` that emits a
 * draft-2020-12 schema; we target `openapi-3.0` and strip the JSON-Schema draft
 * marker so the output holds the fleet-wide 3.0.x pin (see AGENTS.md "The
 * OpenAPI version pin").
 */
export function zodSchemaTransformer({ schema }: { schema: unknown }): OpenApiSchema | null {
  if (isZodType(schema)) return zodToOpenApiSchema(schema);
  return null;
}
