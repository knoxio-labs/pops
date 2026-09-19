/**
 * Regenerate `contracts/command-vectors-v1.json` from
 * {@link buildCommandVectors}. Run with `pnpm generate:command-vectors`; CI's
 * codegen-drift check (mirroring `check-vendored-contracts.mjs`'s pattern for
 * the refresh-message vector) runs this and fails the build on any diff. The
 * output is formatted with oxfmt (the same last step `@pops/contract-openapi`
 * uses for the OpenAPI snapshots), so the committed file matches what
 * `oxfmt --check` expects and the drift test can compare parsed JSON rather
 * than fighting the formatter's line wrapping.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCommandVectors } from '../src/domain/commands/command-vectors.js';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(packageDir, 'contracts', 'command-vectors-v1.json');

function main(): void {
  const vectors = buildCommandVectors();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify({ version: 1, vectors }, null, 2)}\n`);
  execFileSync('pnpm', ['exec', 'oxfmt', '--write', outPath], {
    cwd: packageDir,
    stdio: 'inherit',
  });
  console.warn(`[generate-command-vectors] wrote ${vectors.length} vectors to ${outPath}`);
}

main();
