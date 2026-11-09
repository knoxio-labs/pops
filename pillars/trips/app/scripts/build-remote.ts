import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { build } from 'vite';

import {
  createPackageNameResolver,
  findBundledSharedRuntime,
  findProcessGlobalUsage,
} from '@pops/pillar-sdk/remote-build';

import type { RollupOutput, RollupWatcher } from 'rollup';

process.env.NODE_ENV = 'production';
const root = resolve(import.meta.dirname, '..');
function singleOutput(result: RollupOutput | RollupOutput[] | RollupWatcher): RollupOutput {
  if (Array.isArray(result)) {
    if (result.length === 1 && result[0]) return result[0];
    throw new Error('Expected one remote build output');
  }
  if ('output' in result) return result;
  throw new Error('Expected a completed remote build');
}
const output = singleOutput(
  await build({ configFile: join(root, 'vite.remote.config.ts'), root, mode: 'production' })
);
const chunks = output.output.filter((chunk) => chunk.type === 'chunk');
const shared = findBundledSharedRuntime(
  chunks.flatMap((chunk) => Object.keys(chunk.modules)),
  createPackageNameResolver()
);
const globals = findProcessGlobalUsage(chunks.map(({ fileName, code }) => ({ fileName, code })));
if (shared.length || globals.length) {
  await rm(join(root, 'dist/remote'), { recursive: true, force: true });
  throw new Error(
    `Invalid remote output: shared runtimes ${shared.join(', ')}; process globals ${globals.join(', ')}`
  );
}
