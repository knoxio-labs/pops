import { z } from 'zod';

type OpenApiSchema = Record<string, unknown>;

function isZodType(value: unknown): value is z.ZodType {
  return value !== null && typeof value === 'object' && '_zod' in value && 'parse' in value;
}

function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  const raw: OpenApiSchema = z.toJSONSchema(schema, { target: 'openapi-3.0' });
  const { $schema: _ignored, ...rest } = raw;
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
