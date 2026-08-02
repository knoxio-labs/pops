/**
 * OpenAPI generator for `@pops/purchases` — projects the ts-rest contract
 * in `src/contract/rest.ts` to a static `openapi/purchases.openapi.json`.
 *
 * The contract is the canonical declaration of the purchases wire surface;
 * this script is a pure projection of it. Polyglot consumers consume the
 * JSON directly; TS consumers feed it through `openapi-typescript` (see
 * `generate-api-types.ts`) for `openapi-fetch`.
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

import { purchasesContract } from '../src/contract/rest.js';

type OpenApiSchema = Record<string, unknown>;

/**
 * Custom schema transformer for zod 4 — the bundled `ZOD_3_SCHEMA_TRANSFORMER`
 * uses `@anatine/zod-openapi` which only knows about zod 3. zod 4 ships its
 * own `z.toJSONSchema` that emits a draft-2020-12 schema; we strip the
 * JSON-Schema draft marker so the output is OpenAPI 3.0-safe.
 */
function isZodType(value: unknown): value is z.ZodType {
  return value !== null && typeof value === 'object' && '_zod' in value && 'parse' in value;
}

function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  const raw = z.toJSONSchema(schema, { target: 'openapi-3.0' }) as Record<string, unknown>;
  const { $schema: _ignored, ...rest } = raw;
  return rest;
}

function purchasesSchemaTransformer({ schema }: { schema: unknown }): OpenApiSchema | null {
  if (isZodType(schema)) return zodToOpenApiSchema(schema);
  return null;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON_PATH = resolve(HERE, '..', 'package.json');
const PACKAGE_JSON: { version?: string } = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
const CONTRACT_VERSION = PACKAGE_JSON.version ?? '0.0.0';

/**
 * Recursively sort object keys so the emitted document is byte-stable and
 * the `generate:openapi && git diff --exit-code` drift check can't flap on
 * key ordering.
 *
 * Takes and returns `unknown` rather than a generic: the generic form needs
 * an `as unknown as T` on the array branch to convince the compiler, and a
 * cast that broad defeats the point of having a type here at all.
 */
function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => sortJson(item));
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).toSorted()) {
      sorted[key] = sortJson(Reflect.get(value, key));
    }
    return sorted;
  }
  return value;
}

function main(): void {
  const document = generateOpenApi(
    purchasesContract,
    {
      info: {
        title: '@pops/purchases',
        description:
          "OpenAPI projection of the purchases pillar's REST contract. " +
          'Authored as a ts-rest contract (src/contract/rest.ts); ' +
          'consumed directly by polyglot clients and via ' +
          'openapi-typescript by TS consumers.',
        version: CONTRACT_VERSION,
      },
    },
    {
      schemaTransformer: purchasesSchemaTransformer,
      setOperationId: 'concatenated-path',
    }
  );
  const sorted = sortJson(document);
  const serialized = `${JSON.stringify(sorted, null, 2)}\n`;

  const outFile = resolve(HERE, '..', 'openapi', 'purchases.openapi.json');
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, serialized, 'utf8');

  execFileSync('pnpm', ['exec', 'oxfmt', '--write', outFile], {
    cwd: resolve(HERE, '..'),
    stdio: 'inherit',
  });

  process.stdout.write(`[purchases] wrote OpenAPI projection to ${outFile}\n`);
}

main();
