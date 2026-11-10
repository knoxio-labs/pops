import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isMapping, parseYaml } from '../config-parse.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const workflowPath = join(repoRoot, '.github/workflows/quality.yml');
const oldSpaceMiB = 6144;
const scannerArguments = [
  'jscpd@^4',
  '--threshold',
  '5',
  '--min-lines',
  '8',
  '--min-tokens',
  '70',
  '--ignore',
  '**/*.test.{ts,tsx},**/*.spec.{ts,tsx},**/dist/**,**/node_modules/**,**/*.snap,**/*.d.ts,**/generated.ts,**/src/*-api/**,**/db/schema.ts,**/db/seeder.ts',
  '--reporters',
  'console',
  '.',
];

function mapping(value: unknown, label: string): Record<string, unknown> {
  if (!isMapping(value)) throw new Error(`Missing ${label} mapping`);
  return value;
}

function duplicationStep() {
  const document = mapping(parseYaml(readFileSync(workflowPath, 'utf8'), workflowPath), 'workflow');
  const jobs = mapping(document.jobs, 'jobs');
  const job = mapping(jobs.duplication, 'duplication');
  if (!Array.isArray(job.steps)) throw new Error('Missing duplication steps');
  const step = job.steps.find(
    (candidate: unknown) =>
      isMapping(candidate) &&
      typeof candidate.run === 'string' &&
      candidate.run.includes('npx jscpd')
  );
  const scan = mapping(step, 'duplication scan');
  if (typeof scan.run !== 'string') throw new Error('Missing duplication command');
  return { document, job, scan, command: scan.run };
}

const scannerFixture = `#!/usr/bin/env node
const { getHeapStatistics } = require('node:v8');
process.stdout.write(JSON.stringify({
  scannerArguments: process.argv.slice(2),
  scannerNodeOptions: process.env.NODE_OPTIONS,
  scannerHeapLimitBytes: getHeapStatistics().heap_size_limit,
}) + '\\n');
process.exit(Number(process.env.POPS_TEST_SCANNER_EXIT));
`;

// macOS supplies BSD time; adapt its measured RSS to the GNU interface used by the Linux job.
const darwinTimeFixture = `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const format = process.argv[2]?.replace(/^--format=/, '');
if (!format || process.argv[3] !== '--') throw new Error('Missing GNU time arguments');
const result = spawnSync('/usr/bin/time', ['-l', ...process.argv.slice(4)], {encoding: 'utf8'});
if (result.error) throw result.error;
if (result.status === null) throw new Error('Unexpected fixture signal');
const rss = result.stderr.match(/(\\d+)\\s+maximum resident set size/);
if (!rss) throw new Error('Missing measured BSD peak RSS');
process.stdout.write(result.stdout);
process.stderr.write(format.replaceAll('%M', String(Math.ceil(Number(rss[1]) / 1024))).replaceAll('%x', String(result.status)) + '\\n');
process.exit(result.status);
`;

function executeScan(exitCode: number) {
  const { scan, command } = duplicationStep();
  const env = isMapping(scan.env) ? scan.env : {};
  const scratch = join(repoRoot, 'tmp');
  mkdirSync(scratch, { recursive: true });
  const cwd = mkdtempSync(join(scratch, 'duplication-workflow-'));
  const bin = join(cwd, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'npx'), scannerFixture, { mode: 0o755 });
  const timePath = process.platform === 'darwin' ? join(bin, 'time') : '/usr/bin/time';
  if (process.platform === 'darwin') {
    writeFileSync(timePath, darwinTimeFixture, { mode: 0o755 });
  }
  try {
    return spawnSync('bash', ['-e', '-c', command.replace('/usr/bin/time', '"$POPS_TEST_TIME"')], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        NODE_OPTIONS: typeof env.NODE_OPTIONS === 'string' ? env.NODE_OPTIONS : '',
        POPS_TEST_TIME: timePath,
        POPS_TEST_SCANNER_EXIT: String(exitCode),
      },
      timeout: 10_000,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function outputRecord(output: string, key: string): Record<string, unknown> {
  for (const line of output.trim().split('\n')) {
    const parsed: unknown = JSON.parse(line);
    if (isMapping(parsed) && key in parsed) return parsed;
  }
  throw new Error(`Missing ${key} telemetry`);
}

function numeric(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Missing finite ${key}`);
  }
  return value;
}

describe('duplication workflow runtime budget', { timeout: 30_000 }, () => {
  it('applies the explicit budget only to the scanner step and keeps failure reporting enabled', () => {
    const { document, job, scan, command } = duplicationStep();

    const workflowEnv = document.env === undefined ? {} : mapping(document.env, 'workflow env');
    const jobEnv = job.env === undefined ? {} : mapping(job.env, 'duplication env');
    expect(workflowEnv.NODE_OPTIONS).toBeUndefined();
    expect(jobEnv.NODE_OPTIONS).toBeUndefined();
    expect(scan.env).toEqual({ NODE_OPTIONS: `--max-old-space-size=${oldSpaceMiB}` });
    expect(job['continue-on-error']).toBeUndefined();
    expect(scan['continue-on-error']).toBeUndefined();
    expect(command).toContain('/usr/bin/time --format=');
  });

  it.each([0, 42])('measures runtime capacity and preserves scanner exit %i', (exitCode) => {
    const result = executeScan(exitCode);

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(exitCode);
    const scanner = outputRecord(result.stdout, 'scannerArguments');
    expect(scanner.scannerArguments).toEqual(scannerArguments);
    expect(scanner.scannerNodeOptions).toBe(`--max-old-space-size=${oldSpaceMiB}`);
    expect(numeric(scanner, 'scannerHeapLimitBytes')).toBeGreaterThanOrEqual(
      oldSpaceMiB * 1024 * 1024
    );
    const telemetry = outputRecord(result.stdout, 'effectiveV8HeapLimitBytes');
    const ram = numeric(telemetry, 'runnerMemoryBytes');
    const constrained = numeric(telemetry, 'constrainedMemoryBytes');
    const heap = numeric(telemetry, 'effectiveV8HeapLimitBytes');
    expect(ram).toBeGreaterThan(0);
    expect(constrained).toBeGreaterThanOrEqual(0);
    expect(numeric(telemetry, 'effectiveMemoryBytes')).toBe(
      constrained > 0 ? Math.min(ram, constrained) : ram
    );
    expect(numeric(telemetry, 'availableMemoryBytes')).toBeGreaterThan(0);
    expect(heap).toBeGreaterThanOrEqual(oldSpaceMiB * 1024 * 1024);
    expect(heap).toBeLessThan((oldSpaceMiB + 256) * 1024 * 1024);
    expect(telemetry.nodeVersion).toBe(process.version);
    const peak = result.stderr.match(/duplication_peak_rss_kib=(\d+) duplication_exit_code=(\d+)/);
    expect(peak).not.toBeNull();
    expect(Number(peak?.[1])).toBeGreaterThan(0);
    expect(Number(peak?.[2])).toBe(exitCode);
  });
});
