import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { affectedUnits, changedFiles } from './affected.mjs';
import { discoverLocalTasks, discoverUnits, prepareTasks } from './discovery.mjs';
import { validationFingerprint } from './fingerprint.mjs';
import { privateInputs } from './private-inputs.mjs';
import { repositoryFingerprint } from './repository-inputs.mjs';
import { runTasks } from './run-all.mjs';
import {
  coversValidation,
  invalidateReceipt,
  readReceipt,
  writeReceipt,
} from './validation-cache.mjs';
import { withValidationLock } from './validation-lock.mjs';

/**
 * Validate the selected workspace closure; only unchanged successful typechecks
 * can be reused. Tests and lint retain their own real exit statuses.
 * @param {{cwd:string, all?:boolean, base?:string, typecheckOnly?:boolean, planOnly?:boolean, force?:boolean, concurrency?:number}} options
 * @returns {Promise<number>}
 */
export async function validate({
  cwd,
  all = false,
  base = 'origin/main',
  typecheckOnly = false,
  planOnly = false,
  force = false,
  concurrency = 4,
}) {
  const receiptFile = join(cwd, 'tmp/local-dev/validation/success.json');
  const initialSources = planOnly ? undefined : repositoryFingerprint(cwd);
  const discovered = await discoverUnits({ cwd });
  const units = discovered
    .map((unit) => ({ ...unit, unitPath: relative(cwd, unit.unitPath) }))
    .filter((unit) => !unit.unitPath.startsWith('clients/'));
  const checkable = new Set(
    units
      .filter((unit) => unit.taskNames.includes('typecheck') || unit.taskNames.includes('test'))
      .map((unit) => unit.unitPath)
  );
  const scope = affectedUnits(units, all ? null : changedFiles(cwd, base));
  scope.unitPaths = scope.unitPaths.filter((unit) => checkable.has(unit));
  console.log(
    `local-check: ${scope.unitPaths.length}/${checkable.size} units; ${all ? 'Full workspace requested.' : scope.reason}`
  );
  for (const unit of scope.unitPaths) console.log(`  ${unit}`);
  if (planOnly) return 0;
  if (!typecheckOnly) {
    for (const args of [['lint'], ['exec', '--', 'pnpm', 'format:check']]) {
      const status = run('mise', args);
      if (status !== 0) return status;
    }
    const docsStatus = run('node', ['scripts/ci/check-docs-model.mjs']);
    if (docsStatus !== 0) return docsStatus;
  }
  if (scope.unitPaths.length === 0 && !scope.scripts) return sourcesUnchanged() ? 0 : 1;
  const checks = await discoverLocalTasks({
    cwd,
    units: discovered,
    taskNames: ['typecheck'],
    unitPaths: scope.unitPaths,
  });
  if (!sourcesUnchanged()) return 1;
  const paths = units.map((unit) => unit.unitPath);
  const privateFiles = privateInputs(cwd, paths);
  if (privateFiles.length > 0)
    console.log(
      `local-check: receipt reuse disabled by private configuration: ${privateFiles.join(', ')}`
    );
  let before = validationFingerprint(cwd, paths);
  if (
    !force &&
    !process.env.CI &&
    privateFiles.length === 0 &&
    coversValidation(readReceipt(receiptFile), before, scope.unitPaths, scope.scripts)
  ) {
    if (validationFingerprint(cwd, paths) !== before || !sourcesUnchanged()) {
      invalidateReceipt(receiptFile);
      console.error('local-check: inputs changed while verifying the cached result.');
      return 1;
    }
    console.log('local-check: reusing successful typechecks for identical inputs.');
  } else {
    invalidateReceipt(receiptFile);
    const buildStatus = run('mise', ['build']);
    if (buildStatus !== 0) return buildStatus;
    const prerequisites = await prepareTasks({ cwd, descriptors: checks, units: discovered });
    if (prerequisites.length > 0) {
      const preparation = await runTasks(prerequisites, { concurrency: 1 });
      if (preparation.status !== 0) return preparation.status;
    }
    if (!sourcesUnchanged()) return 1;
    before = validationFingerprint(cwd, paths);
    if (scope.scripts) {
      const status = run('mise', ['run', 'typecheck:scripts']);
      if (status !== 0) return status;
    }
    const result =
      scope.unitPaths.length === 0
        ? { status: 0, count: 0, failures: [] }
        : await runTasks(checks, { concurrency });
    if (result.status !== 0) {
      console.error(`local-check: typecheck failed in ${result.failures.join(', ')}`);
      return result.status;
    }
    const after = validationFingerprint(cwd, paths);
    if (before !== after || !sourcesUnchanged()) {
      invalidateReceipt(receiptFile);
      console.error('local-check: inputs changed during validation; run the check again.');
      return 1;
    }
    if (
      privateFiles.length === 0 &&
      !writeReceipt(receiptFile, {
        before,
        after,
        status: result.status,
        units: scope.unitPaths,
        scripts: scope.scripts,
      })
    ) {
      console.error('local-check: inputs changed during validation; run the check again.');
      return 1;
    }
    console.log(`local-check: typecheck passed for all ${result.count} selected units.`);
  }
  if (!typecheckOnly) {
    if (scope.scripts) {
      const status = run('mise', ['run', 'test:scripts']);
      if (status !== 0) return status;
    }
    const tests = await discoverLocalTasks({
      cwd,
      units: discovered,
      taskNames: ['test'],
      unitPaths: scope.unitPaths,
    });
    if (tests.length > 0) {
      const result = await runTasks(tests, { concurrency });
      if (result.status !== 0)
        console.error(`local-check: tests failed in ${result.failures.join(', ')}`);
      return sourcesUnchanged() ? result.status : 1;
    }
  }
  return sourcesUnchanged() ? 0 : 1;

  function sourcesUnchanged() {
    if (repositoryFingerprint(cwd) === initialSources) return true;
    invalidateReceipt(receiptFile);
    console.error(
      'local-check: source inputs changed during planning or validation; run the check again.'
    );
    return false;
  }

  /** @param {string} command @param {string[]} args */
  function run(command, args) {
    const child = spawnSync(command, args, { cwd, stdio: 'inherit' });
    if (child.error) {
      invalidateReceipt(receiptFile);
      throw child.error;
    }
    if (child.status !== 0) invalidateReceipt(receiptFile);
    return child.status ?? 1;
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      all: { type: 'boolean' },
      base: { type: 'string' },
      'typecheck-only': { type: 'boolean' },
      plan: { type: 'boolean' },
      force: { type: 'boolean' },
      jobs: { type: 'string' },
    },
  });
  const concurrency = Number(values.jobs ?? process.env.RUN_ALL_CONCURRENCY ?? 4);
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new Error('--jobs must be a positive integer');
  const action = () =>
    validate({
      cwd: process.cwd(),
      all: values.all,
      base: values.base,
      typecheckOnly: values['typecheck-only'],
      planOnly: values.plan,
      force: values.force,
      concurrency,
    });
  process.exitCode = values.plan
    ? await action()
    : await withValidationLock(join(process.cwd(), 'tmp/local-dev/validation/lock'), action);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    invalidateReceipt(join(process.cwd(), 'tmp/local-dev/validation/success.json'));
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
