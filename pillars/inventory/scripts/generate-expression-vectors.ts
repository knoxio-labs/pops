/**
 * Regenerate `contracts/expression-vectors-v1.json` from
 * {@link buildExpressionVectors}. Run with `pnpm generate:expression-vectors`
 * (or `mise run fixture:expression-vectors`, which also re-vendors the iOS
 * copy); the drift test fails on any difference.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildExpressionVectors } from '../src/api/sync/computed-vectors/build.js';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(packageDir, 'contracts', 'expression-vectors-v1.json');

function main(): void {
  const vectors = buildExpressionVectors();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify({ version: 1, vectors }, null, 2)}\n`);
  execFileSync('pnpm', ['exec', 'oxfmt', '--write', outPath], {
    cwd: packageDir,
    stdio: 'inherit',
  });
  console.warn(`[generate-expression-vectors] wrote ${vectors.length} vectors to ${outPath}`);
}

main();
