/**
 * Entry point for the `db:clear:<id>` and `db:clear` mise tasks. All behaviour
 * lives in `db-clear.ts` so it can be exercised without spawning a process.
 */
import { fileURLToPath } from 'node:url';

import { parseDbClearArgv, runDbClear } from './db-clear.js';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

try {
  const invocation = parseDbClearArgv(process.argv.slice(2), repoRoot);
  for (const pillarId of invocation.pillarIds) {
    runDbClear({
      pillarId,
      repoRoot,
      ...(invocation.dbPath === undefined ? {} : { dbPath: invocation.dbPath }),
    });
  }
} catch (error) {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
