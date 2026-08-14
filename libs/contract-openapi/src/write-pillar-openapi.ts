import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { generateOpenApi } from '@ts-rest/open-api';

import { hoistRecursiveDefinitions } from './hoist-definitions.js';
import { isRecord, sortJson } from './json.js';
import { zodSchemaTransformer } from './zod-schema-transformer.js';

import type { AppRouter } from '@ts-rest/core';

/** What a pillar has to say about itself for its snapshot to be reproducible. */
export interface PillarOpenApiProjection {
  /** The pillar's ts-rest contract — the canonical declaration being projected. */
  contract: AppRouter;
  /** Absolute path to the pillar package root (the directory holding its package.json). */
  packageDir: string;
  /** Pillar id: names the output file, prefixes the log line, and must match the package name. */
  pillarId: string;
  /** Prose that lands verbatim in the document's `info.description`. */
  description: string;
  /**
   * Whether to hoist zod's nested `definitions` / `$defs` into
   * `components.schemas`. Only a contract with a recursive schema needs it, but
   * turning it on also materialises an empty `components.schemas` when there is
   * nothing to hoist — which is wire-visible. Each pillar therefore states its
   * own answer rather than inheriting a default, and flipping one is a
   * deliberate change to that pillar's published document.
   */
  hoistRecursiveDefinitions: boolean;
}

interface PillarPackageManifest {
  name: string | undefined;
  version: string | undefined;
}

function readPackageManifest(packageDir: string): PillarPackageManifest {
  const manifestPath = resolve(packageDir, 'package.json');
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error(`[contract-openapi] ${manifestPath} is not a JSON object`);
  }
  const { name, version } = parsed;
  return {
    name: typeof name === 'string' ? name : undefined,
    version: typeof version === 'string' ? version : undefined,
  };
}

/**
 * Project a pillar's ts-rest contract to an OpenAPI 3.0 document, with the keys
 * recursively sorted so the drift check is byte-stable.
 */
export function buildPillarOpenApiDocument(projection: PillarOpenApiProjection): unknown {
  const manifest = readPackageManifest(projection.packageDir);
  const expectedName = `@pops/${projection.pillarId}`;
  if (manifest.name !== expectedName) {
    throw new Error(
      `[contract-openapi] pillarId "${projection.pillarId}" expects package name ` +
        `"${expectedName}", but ${projection.packageDir}/package.json declares ` +
        `"${manifest.name ?? '<missing>'}"`
    );
  }

  const document = generateOpenApi(
    projection.contract,
    {
      info: {
        title: expectedName,
        description: projection.description,
        version: manifest.version ?? '0.0.0',
      },
    },
    { schemaTransformer: zodSchemaTransformer, setOperationId: 'concatenated-path' }
  );

  if (projection.hoistRecursiveDefinitions) hoistRecursiveDefinitions(document);

  return sortJson(document);
}

/**
 * Build the pillar's OpenAPI document and write it to
 * `<packageDir>/openapi/<pillarId>.openapi.json`, formatted by oxfmt so the
 * committed snapshot matches what `pnpm format:check` expects.
 */
export function writePillarOpenApi(projection: PillarOpenApiProjection): void {
  const serialized = `${JSON.stringify(buildPillarOpenApiDocument(projection), null, 2)}\n`;

  const outFile = resolve(projection.packageDir, 'openapi', `${projection.pillarId}.openapi.json`);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, serialized, 'utf8');

  execFileSync('pnpm', ['exec', 'oxfmt', '--write', outFile], {
    cwd: projection.packageDir,
    stdio: 'inherit',
  });

  process.stdout.write(`[${projection.pillarId}] wrote OpenAPI projection to ${outFile}\n`);
}
