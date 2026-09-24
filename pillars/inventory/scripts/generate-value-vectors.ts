/**
 * Regenerate `contracts/value-vectors-v1.json` from {@link buildValueVectors}.
 * Run with `pnpm generate:value-vectors` (or `mise run fixture:value-vectors`,
 * which also re-vendors the iOS and BFM copies); the drift check
 * (`scripts/ci/check-value-vectors-fixture.mjs`) fails on any difference.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildValueVectors } from '../src/api/sync/value-vectors/build.js';
import { openMigratedMemoryDb } from '../src/db/open-migrated-memory-db.js';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(packageDir, 'contracts', 'value-vectors-v1.json');

function main(): void {
  const { db } = openMigratedMemoryDb();
  const file = buildValueVectors(db);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(file, null, 2)}\n`);
  execFileSync('pnpm', ['exec', 'oxfmt', '--write', outPath], {
    cwd: packageDir,
    stdio: 'inherit',
  });
  console.warn(
    `[generate-value-vectors] wrote ${String(file.vectors.length)} positive and ${String(file.negativeVectors.length)} negative vectors to ${outPath}`
  );
}

main();
