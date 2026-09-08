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

import { createPackageNameResolver, findBundledSharedRuntime } from '@pops/pillar-sdk/remote-build';

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

async function main(): Promise<void> {
  const result = await build({
    configFile: path.join(APP_ROOT, 'vite.remote.config.ts'),
    root: APP_ROOT,
    logLevel: 'warn',
    mode: 'production',
  });

  const offenders = findBundledSharedRuntime(
    moduleIdsOf(singleOutput(result)),
    createPackageNameResolver()
  );
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

  console.log('OK — remote bundle built with no shared-runtime package inside it.');
}

await main();
