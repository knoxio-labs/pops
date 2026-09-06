/**
 * Drift check for `src/contract/manifest.generated.ts`, the output of
 * `./generate-manifest.ts`.
 *
 * Re-renders the manifest in-memory, normalises via oxfmt (mirroring
 * what `generate:manifest` does after writing), byte-compares against
 * the committed file, and exits non-zero on mismatch with a regenerate
 * instruction. Wired into the pillar's `build` script so a stale
 * committed manifest fails CI.
 */
import { readFileSync } from 'node:fs';

import {
  MANIFEST_OUTPUT_PATH,
  readContractVersion,
  renderFormattedManifest,
} from './render-manifest.js';

const version = readContractVersion();
const expected = renderFormattedManifest(version);

let actual: string;
try {
  actual = readFileSync(MANIFEST_OUTPUT_PATH, 'utf8');
} catch {
  console.error(
    `[lists-contract] ${MANIFEST_OUTPUT_PATH} is missing. Run \`pnpm -F @pops/lists-contract generate:manifest\` and commit the result.`
  );
  process.exit(1);
}

if (actual !== expected) {
  console.error(
    `[lists-contract] ${MANIFEST_OUTPUT_PATH} is out of date. Run \`pnpm -F @pops/lists-contract generate:manifest\` and commit the result.`
  );
  process.exit(1);
}

process.stdout.write(`[lists-contract] manifest.generated.ts is up to date (version=${version})\n`);
