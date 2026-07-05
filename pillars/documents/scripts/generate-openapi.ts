/**
 * OpenAPI generator for `@pops/documents` — projects the ts-rest contract in
 * `src/contract/rest.ts` to a static `openapi/documents.openapi.json` file.
 *
 * The contract is the canonical declaration of the documents wire surface;
 * this script is a pure projection of it. `@pops/pillar-sdk`'s
 * `getRouteMap` fetches this document live from the pillar's `GET /openapi`
 * route to build its `operationId`-addressed route map, so a sibling
 * pillar's `pillar('documents')` proxy call resolves against it.
 *
 * Output is deterministic (recursively sorted keys + oxfmt pass) so the
 * `pnpm generate:openapi && git diff --exit-code` drift check is stable.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateOpenApi } from '@ts-rest/open-api';
import { z } from 'zod';

import { documentsContract } from '../src/contract/rest.js';

type OpenApiSchema = Record<string, unknown>;

/**
 * Custom schema transformer for zod 4 — the bundled `ZOD_3_SCHEMA_TRANSFORMER`
 * uses `@anatine/zod-openapi` which only knows about zod 3 (`z.ZodTypeAny`).
 * zod 4 ships its own `z.toJSONSchema` that emits a draft-2020-12 schema; we
 * strip the JSON-Schema draft marker so the output is OpenAPI 3.0-safe.
 */
function isZodType(value: unknown): value is z.ZodType {
  return value !== null && typeof value === 'object' && '_zod' in value && 'parse' in value;
}

function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  const raw = z.toJSONSchema(schema, { target: 'openapi-3.0' }) as Record<string, unknown>;
  const { $schema: _ignored, ...rest } = raw;
  return rest;
}

function documentsSchemaTransformer({ schema }: { schema: unknown }): OpenApiSchema | null {
  if (isZodType(schema)) return zodToOpenApiSchema(schema);
  return null;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON_PATH = resolve(HERE, '..', 'package.json');
const PACKAGE_JSON: { version?: string } = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
const CONTRACT_VERSION = PACKAGE_JSON.version ?? '0.0.0';

function sortJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const entries = value as Record<string, unknown>;
    const sortedKeys = Object.keys(entries).toSorted();
    const sorted: Record<string, unknown> = {};
    for (const key of sortedKeys) sorted[key] = sortJson(entries[key]);
    return sorted as T;
  }
  return value;
}

function main(): void {
  const document = generateOpenApi(
    documentsContract,
    {
      info: {
        title: '@pops/documents',
        description:
          "OpenAPI projection of the documents pillar's REST contract. " +
          'Authored as a ts-rest contract (src/contract/rest.ts); ' +
          'consumed by the pillar SDK to build its operationId route map.',
        version: CONTRACT_VERSION,
      },
    },
    {
      schemaTransformer: documentsSchemaTransformer,
      setOperationId: 'concatenated-path',
    }
  );
  const sorted = sortJson(document);
  const serialized = `${JSON.stringify(sorted, null, 2)}\n`;

  const outFile = resolve(HERE, '..', 'openapi', 'documents.openapi.json');
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, serialized, 'utf8');

  execFileSync('pnpm', ['exec', 'oxfmt', '--write', outFile], {
    cwd: resolve(HERE, '..'),
    stdio: 'inherit',
  });

  process.stdout.write(`[documents] wrote OpenAPI projection to ${outFile}\n`);
}

main();
