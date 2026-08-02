/**
 * Drift check for `src/contract/manifest.generated.ts`.
 *
 * Re-renders the manifest in-memory, normalises via oxfmt (mirroring what
 * `generate:manifest` does after writing), byte-compares against the
 * committed file, and exits non-zero on mismatch with a regenerate
 * instruction. Wired into the pillar's `build` script so a stale committed
 * manifest fails CI.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MANIFEST_OUTPUT_PATH, readContractVersion, renderManifest } from './render-manifest.js';

/**
 * Normalise `content` the way `generate:manifest` does, via a scratch file
 * oxfmt can rewrite in place.
 *
 * The directory is removed in a `finally` so a formatting failure does not
 * leak it. This runs on every `build`, so on a long-lived CI runner the
 * leak accumulates rather than being cleaned up between jobs.
 */
function oxfmt(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-verify-'));
  try {
    const path = join(dir, 'manifest.generated.ts');
    writeFileSync(path, content);
    execFileSync('pnpm', ['exec', 'oxfmt', '--write', path], { stdio: 'ignore' });
    return readFileSync(path, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const version = readContractVersion();
const expected = oxfmt(renderManifest(version));

let actual: string;
try {
  actual = readFileSync(MANIFEST_OUTPUT_PATH, 'utf8');
} catch {
  console.error(
    `[purchases-contract] ${MANIFEST_OUTPUT_PATH} is missing. Run \`pnpm -F @pops/purchases generate:manifest\` and commit the result.`
  );
  process.exit(1);
}

if (actual !== expected) {
  console.error(
    `[purchases-contract] ${MANIFEST_OUTPUT_PATH} is out of date. Run \`pnpm -F @pops/purchases generate:manifest\` and commit the result.`
  );
  process.exit(1);
}

process.stdout.write(
  `[purchases-contract] manifest.generated.ts is up to date (version=${version})\n`
);
