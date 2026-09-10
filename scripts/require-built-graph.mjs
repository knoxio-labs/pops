#!/usr/bin/env node
/**
 * Refuse a unit's own `typecheck` before it can lie about a cold graph.
 *
 * A unit that imports an `@pops/*` package whose `exports[...].types` resolves
 * into that package's `dist/` can only type-check after the compiled graph has
 * been emitted. `mise run typecheck` provides that — it runs
 * `tsc -b tsconfig.build.json` and only then fans out to each unit's own
 * script. Run on its own, on a fresh clone or worktree, that script reports
 * `TS2307: Cannot find module '@pops/<x>'`, which reads as a broken package
 * rather than as a missing prerequisite.
 *
 * It has cost a whole agent run: POPS-3072 was filed against the build graph
 * and project references after 93 `TS2307`s out of
 * `pnpm --filter @pops/app-finance typecheck`. The graph was fine. Moving
 * that pillar's own emitted output aside reproduced it exactly; restoring it
 * fixed it.
 *
 * So the answer is a legible refusal rather than a build: this prints what is
 * missing and what to run, in one line, before `tsc` gets a chance to blame
 * the unit's own files. `check-cold-graph-typecheck.mjs` is the other half —
 * it fails CI when a unit that needs this call does not make it.
 *
 * Usage, from the unit's own directory (this is what its `typecheck` script
 * runs):
 *
 *   node ../../scripts/require-built-graph.mjs && tsc --noEmit
 */

import { resolve } from 'node:path';

import {
  coldGraphSpecifiers,
  missingTypeEntries,
  readUnits,
  workspaceRootFor,
} from './ci/cold-graph-deps.mjs';

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/require-built-graph.mjs [<unit dir>]\n' +
        'Exits 1 when an @pops/* package this unit imports has not been built yet, naming it.'
    );
    process.exit(2);
  }

  const unitDir = resolve(args[0] ?? process.cwd());
  const units = readUnits(workspaceRootFor(unitDir));
  const names = missingTypeEntries(coldGraphSpecifiers(unitDir, units), units);
  if (names.length === 0) process.exit(0);

  console.error(
    `${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} not been built. This unit ` +
      'imports compiled output, so `tsc` here would report every one of those imports as a ' +
      'missing module and blame this unit for it.\n' +
      `Run \`pnpm --filter ${names.join(' --filter ')} build\` first, or \`mise run typecheck\`, ` +
      'which builds the whole graph before checking any unit and never hits this. See POPS-3072.'
  );
  process.exit(1);
}

if (import.meta.main) {
  main();
}
