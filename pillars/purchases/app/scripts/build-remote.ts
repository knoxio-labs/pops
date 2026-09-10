/**
 * Builds the remote bundle and refuses to leave a violating one on disk.
 *
 * `vite build` on its own is happy to inline React the moment the `external`
 * predicate stops matching — a renamed dependency, a copied config, a
 * `resolve.alias` added for something else. Nothing about the output would
 * look wrong; the pillar would simply throw `Invalid hook call` the first time
 * the shell mounted it, in the browser, for whoever navigated there first.
 *
 * So the shared-runtime rule is asserted here, over the build's own record of
 * which modules went into which chunk, and a violation deletes nothing but
 * exits non-zero before anything can serve the bundle.
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { build } from 'vite';

import {
  createPackageNameResolver,
  findBundledSharedRuntime,
  findProcessGlobalUsage,
} from '@pops/pillar-sdk/remote-build';

import type { RollupOutput, RollupWatcher } from 'rollup';

// Vite derives `isProduction` from `NODE_ENV` when it is set, and `mode`
// alone does not override it. Invoked from vitest (`NODE_ENV=test`) the build
// therefore emitted `react/jsx-dev-runtime` imports and development-only
// warnings into a shippable artifact — its contents depended on who ran it.
// Set before the config is loaded, which is what `mode` below cannot do.
process.env.NODE_ENV = 'production';

const APP_ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(APP_ROOT, 'dist/remote');

/**
 * `vite build` is typed as returning any of its three shapes. This build is a
 * single non-watch config, so it is always one `RollupOutput` — narrowed here
 * rather than asserted, so a config change that made it something else fails
 * loudly at the narrowing instead of silently skipping the check below.
 */
function singleOutput(result: RollupOutput | RollupOutput[] | RollupWatcher): RollupOutput {
  if (Array.isArray(result)) {
    if (result.length === 1 && result[0] !== undefined) return result[0];
    throw new Error(`expected one build output, got ${result.length}`);
  }
  if ('output' in result) return result;
  throw new Error('expected a build result, got a watcher');
}

/** Every resolved module id that went into any emitted chunk. */
function moduleIdsOf(output: RollupOutput): string[] {
  return output.output.flatMap((chunk) =>
    chunk.type === 'chunk' ? Object.keys(chunk.modules) : []
  );
}

/** The emitted JS chunks, as `findProcessGlobalUsage` wants them. */
function chunksOf(output: RollupOutput): { fileName: string; code: string }[] {
  return output.output
    .filter((chunk) => chunk.type === 'chunk')
    .map((chunk) => ({ fileName: chunk.fileName, code: chunk.code }));
}

async function main(): Promise<void> {
  const result = await build({
    configFile: path.join(APP_ROOT, 'vite.remote.config.ts'),
    root: APP_ROOT,
    logLevel: 'warn',
    mode: 'production',
  });

  const output = singleOutput(result);
  const offenders = findBundledSharedRuntime(moduleIdsOf(output), createPackageNameResolver());
  if (offenders.length > 0) {
    // The bundle is removed rather than left behind: a violating build that
    // stays on disk is one a later step can still pick up and serve, and the
    // failure would then surface a deploy away from its cause.
    await rm(OUT_DIR, { recursive: true, force: true });
    console.error(
      `FAIL — the remote bundle contains ${offenders.length} shared-runtime package(s) that ` +
        `must be imported from the shell, not bundled:`
    );
    for (const name of offenders) console.error(`  XX  ${name}`);
    console.error(
      '  Each one is a second instance at runtime (two React dispatchers, a second\n' +
        '  query cache, a second i18n instance). Check the `external` predicate in\n' +
        '  vite.remote.config.ts against SHARED_RUNTIME_SPECIFIERS in\n' +
        '  @pops/pillar-sdk/remote-build. Output removed.'
    );
    process.exitCode = 1;
    return;
  }

  // A browser loads this as a plain ES module, with no `process` around it, so
  // a chunk that still reads the global throws at module scope the first time
  // the shell mounts the pillar — reaching the reader as the loader's
  // "interface could not be loaded" placeholder, with nothing naming the
  // cause. Asserted over the emitted code rather than trusted to the `define`,
  // which only rewrites the exact `process.env.NODE_ENV` member expression.
  const processUsers = findProcessGlobalUsage(chunksOf(output));
  if (processUsers.length > 0) {
    await rm(OUT_DIR, { recursive: true, force: true });
    console.error(
      `FAIL — ${processUsers.length} emitted chunk(s) reference the \`process\` global, which ` +
        `does not exist in a browser:`
    );
    for (const fileName of processUsers) console.error(`  XX  ${fileName}`);
    console.error(
      '  A CJS dependency carried its own `process.env` branch into the bundle.\n' +
        '  REMOTE_BUILD_DEFINE in vite.remote.config.ts covers `process.env.NODE_ENV`;\n' +
        '  anything else needs its own `define` entry or a dependency that does not\n' +
        '  read `process` at module scope. Output removed.'
    );
    process.exitCode = 1;
    return;
  }

  console.log('OK — no shared-runtime package inside the bundle, no bare `process` read.');
}

await main();
