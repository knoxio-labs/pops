import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKSPACE_ROOT_MARKER = 'pnpm-workspace.yaml';

/**
 * The absolute path to `pillars/<pillarId>`, resolved from a calling test
 * file's own `import.meta.url` rather than `process.cwd()` — the latter
 * depends on how the test runner was invoked (per-package vs. a
 * repo-rooted run), the former does not. Walks up from the caller's
 * directory to the workspace root (marked by `pnpm-workspace.yaml`) rather
 * than hardcoding a `../..` depth, so it keeps working if a test moves.
 *
 * @param callerImportMetaUrl The calling test file's `import.meta.url`.
 * @param pillarId Directory name under `pillars/`, e.g. `'lists'`.
 */
export function resolvePillarDir(callerImportMetaUrl: string, pillarId: string): string {
  const repoRoot = findWorkspaceRoot(dirname(fileURLToPath(callerImportMetaUrl)));
  return join(repoRoot, 'pillars', pillarId);
}

function findWorkspaceRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, WORKSPACE_ROOT_MARKER))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `could not find ${WORKSPACE_ROOT_MARKER} above ${startDir} — is this test still inside the workspace?`
      );
    }
    dir = parent;
  }
}
