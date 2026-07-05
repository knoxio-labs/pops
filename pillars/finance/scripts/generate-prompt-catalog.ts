/**
 * Regenerates `prompt-catalog.json` — a live snapshot of every AI prompt
 * template, produced by calling the real `build*Prompt` functions (see
 * `src/api/modules/prompt-catalog.ts`). Mirrors `generate-openapi.ts`'s
 * "pure projection + drift check in CI" pattern.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPromptCatalog } from '../src/api/modules/prompt-catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function main(): void {
  const catalog = buildPromptCatalog();
  const serialized = `${JSON.stringify(catalog, null, 2)}\n`;

  const outFile = resolve(HERE, '..', 'prompt-catalog.json');
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, serialized, 'utf8');

  process.stdout.write(`[finance] wrote prompt catalog to ${outFile}\n`);
}

main();
