import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_ITERATIONS,
  UsageError,
  buildSummary,
  defaultOutDirBase,
  extractFailures,
  formatDuration,
  formatLoadAverage,
  huntId,
  parseArgs,
  readJsonReport,
  runHunt,
  slugifyFilter,
  spawnCapture,
} from '../flake-hunt.mjs';

import type { IterationResult, TestFailure } from '../flake-hunt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const scriptPath = join(repoRoot, 'scripts', 'flake-hunt.mjs');

/**
 * A real vitest 4.1 `--reporter=json` report for one failing and one passing
 * assertion in the same file, captured from an induced failure while
 * building this tool — see the harness's own header for why the shape isn't
 * guessed at.
 */
const REAL_SHAPED_FAILING_REPORT = {
  success: false,
  numFailedTests: 1,
  testResults: [
    {
      name: '/repo/pillars/purchases/src/api/__tests__/backfill.test.ts',
      status: 'failed',
      assertionResults: [
        {
          ancestorTitles: ['the parser output is acceptable to the real API'],
          fullName: 'the parser output is acceptable to the real API > creates every parsed order',
          title: 'creates every parsed order',
          status: 'failed',
          failureMessages: ['AssertionError: expected 500 to be 201 // Object.is equality'],
        },
        {
          ancestorTitles: ['the parser output is acceptable to the real API'],
          fullName: 'the parser output is acceptable to the real API > skips a duplicate order',
          title: 'skips a duplicate order',
          status: 'passed',
          failureMessages: [],
        },
      ],
    },
  ],
};

describe('parseArgs', () => {
  it('requires --filter', () => {
    expect(() => parseArgs(['--iterations', '5'])).toThrow(UsageError);
  });

  it('defaults iterations, script and keepGoing', () => {
    const opts = parseArgs(['--filter', '@pops/purchases']);
    expect(opts).toMatchObject({
      filter: '@pops/purchases',
      iterations: DEFAULT_ITERATIONS,
      coverage: false,
      keepGoing: false,
      script: 'test',
      outDir: undefined,
      extraArgs: [],
    });
  });

  it('rejects a non-numeric --iterations', () => {
    expect(() => parseArgs(['--filter', '@pops/x', '--iterations', 'lots'])).toThrow(UsageError);
  });

  it('rejects a zero or negative --iterations', () => {
    expect(() => parseArgs(['--filter', '@pops/x', '--iterations', '0'])).toThrow(UsageError);
  });

  it('--coverage selects the test:coverage script', () => {
    expect(parseArgs(['--filter', '@pops/x', '--coverage']).script).toBe('test:coverage');
  });

  it('--script overrides the coverage-derived default', () => {
    const opts = parseArgs(['--filter', '@pops/x', '--coverage', '--script', 'test:watch']);
    expect(opts.script).toBe('test:watch');
  });

  it('--keep-going and --out-dir are read', () => {
    const opts = parseArgs(['--filter', '@pops/x', '--keep-going', '--out-dir', '/tmp/wherever']);
    expect(opts.keepGoing).toBe(true);
    expect(opts.outDir).toBe('/tmp/wherever');
  });

  it('forwards everything after a literal -- to vitest, unparsed', () => {
    const opts = parseArgs([
      '--filter',
      '@pops/x',
      '--iterations',
      '3',
      '--',
      '--pool=forks',
      '-t',
      'foo',
    ]);
    expect(opts.iterations).toBe(3);
    expect(opts.extraArgs).toEqual(['--pool=forks', '-t', 'foo']);
  });

  it("a flag that only exists after -- is not read as this tool's own flag", () => {
    // --iterations here belongs to the forwarded vitest args, not to us, so
    // the default must still apply.
    const opts = parseArgs(['--filter', '@pops/x', '--', '--iterations', '99']);
    expect(opts.iterations).toBe(DEFAULT_ITERATIONS);
  });
});

describe('slugifyFilter', () => {
  it('strips the scope and lowercases', () => {
    expect(slugifyFilter('@pops/purchases')).toBe('pops-purchases');
  });

  it('collapses non-alphanumeric runs and trims leading/trailing dashes', () => {
    expect(slugifyFilter('@pops/purchases...')).toBe('pops-purchases');
  });
});

describe('defaultOutDirBase / huntId', () => {
  it('nests under tmp/flake-hunt/<slug>, which .gitignore already covers', () => {
    expect(defaultOutDirBase('/repo', '@pops/purchases')).toBe(
      '/repo/tmp/flake-hunt/pops-purchases'
    );
  });

  it('huntId is filesystem-safe (no colons) and sortable', () => {
    const id = huntId(new Date('2026-08-12T01:02:03.456Z'));
    expect(id).not.toContain(':');
    expect(id).toBe('2026-08-12T01-02-03-456Z');
  });
});

describe('formatLoadAverage / formatDuration', () => {
  it('formats the three load-average figures to two decimal places', () => {
    expect(formatLoadAverage([1, 2.5, 10.333])).toBe('1m=1.00 5m=2.50 15m=10.33');
  });

  it('formats duration in seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s');
  });
});

describe('readJsonReport', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'flake-hunt-read-json-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns undefined for a missing file rather than throwing', () => {
    expect(readJsonReport(join(dir, 'missing.json'))).toBeUndefined();
  });

  it('returns undefined for unparseable JSON rather than throwing', () => {
    const path = join(dir, 'bad.json');
    writeFileSync(path, '{not json', 'utf8');
    expect(readJsonReport(path)).toBeUndefined();
  });

  it('parses a real report', () => {
    const path = join(dir, 'good.json');
    writeFileSync(path, JSON.stringify(REAL_SHAPED_FAILING_REPORT), 'utf8');
    expect(readJsonReport(path)).toEqual(REAL_SHAPED_FAILING_REPORT);
  });
});

describe('extractFailures', () => {
  it('extracts a real-shaped failing report, skipping the passing assertion', () => {
    const failures = extractFailures(REAL_SHAPED_FAILING_REPORT);
    expect(failures).toEqual<TestFailure[]>([
      {
        file: '/repo/pillars/purchases/src/api/__tests__/backfill.test.ts',
        name: 'the parser output is acceptable to the real API > creates every parsed order',
        message: 'AssertionError: expected 500 to be 201 // Object.is equality',
      },
    ]);
  });

  it('returns nothing for a fully green report', () => {
    const green = {
      testResults: [
        { name: 'a.test.ts', assertionResults: [{ status: 'passed', fullName: 'a > b' }] },
      ],
    };
    expect(extractFailures(green)).toEqual([]);
  });

  it('degrades to no failures rather than throwing on a malformed shape', () => {
    expect(extractFailures(undefined)).toEqual([]);
    expect(extractFailures(null)).toEqual([]);
    expect(extractFailures({})).toEqual([]);
    expect(extractFailures({ testResults: 'nope' })).toEqual([]);
    expect(extractFailures({ testResults: [{ name: 'a', assertionResults: 'nope' }] })).toEqual([]);
  });

  it('falls back to title when fullName is absent, and to a placeholder file name', () => {
    const report = {
      testResults: [
        { assertionResults: [{ status: 'failed', title: 'bare title', failureMessages: [] }] },
      ],
    };
    expect(extractFailures(report)).toEqual([
      { file: '(unknown file)', name: 'bare title', message: '' },
    ]);
  });
});

describe('buildSummary', () => {
  const base = {
    filter: '@pops/purchases',
    script: 'test',
    iteration: 7,
    iterations: 25,
    exitCode: 1,
    startedAt: '2026-08-12T01:00:00.000Z',
    endedAt: '2026-08-12T01:00:31.800Z',
    loadBefore: [3.42, 2.11, 1.8] as const,
    loadAfter: [4.1, 2.3, 1.85] as const,
  };

  it('names the failing test(s), the iteration, and both load averages', () => {
    const summary = buildSummary({
      ...base,
      failures: extractFailures(REAL_SHAPED_FAILING_REPORT),
      hadJsonReport: true,
    });
    expect(summary).toContain('iteration:   7 of 25');
    expect(summary).toContain('creates every parsed order');
    expect(summary).toContain('AssertionError: expected 500 to be 201');
    expect(summary).toContain('load avg — start: 1m=3.42 5m=2.11 15m=1.80');
    expect(summary).toContain('load avg — end:   1m=4.10 5m=2.30 15m=1.85');
    expect(summary).toContain('31.8s');
  });

  it('says plainly when no JSON report was produced', () => {
    const summary = buildSummary({ ...base, failures: [], hadJsonReport: false });
    expect(summary).toContain('No JSON reporter output was found');
  });

  it('says plainly when the exit was non-zero but nothing failed at the assertion level', () => {
    const summary = buildSummary({ ...base, failures: [], hadJsonReport: true });
    expect(summary).toContain('no failed assertion was found');
  });
});

describe('runHunt', () => {
  let outDir: string;
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'flake-hunt-runhunt-'));
    outDir = join(scratch, 'out');
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  function writeGreen(staging: string): IterationResult {
    writeFileSync(join(staging, 'stdout.log'), 'all good\n', 'utf8');
    const now = new Date().toISOString();
    return {
      exitCode: 0,
      jsonPath: join(staging, 'report.json'),
      stdoutPath: join(staging, 'stdout.log'),
      stderrPath: join(staging, 'stderr.log'),
      startedAt: now,
      endedAt: now,
      loadBefore: [0.1, 0.1, 0.1],
      loadAfter: [0.1, 0.1, 0.1],
    };
  }

  function writeRed(staging: string): IterationResult {
    writeFileSync(join(staging, 'report.json'), JSON.stringify(REAL_SHAPED_FAILING_REPORT), 'utf8');
    writeFileSync(join(staging, 'stdout.log'), 'FAIL backfill.test.ts\n', 'utf8');
    writeFileSync(join(staging, 'stderr.log'), '', 'utf8');
    const now = new Date().toISOString();
    return {
      exitCode: 1,
      jsonPath: join(staging, 'report.json'),
      stdoutPath: join(staging, 'stdout.log'),
      stderrPath: join(staging, 'stderr.log'),
      startedAt: now,
      endedAt: now,
      loadBefore: [1, 1, 1],
      loadAfter: [2, 2, 2],
    };
  }

  it('deletes every green run and leaves no trace under outDir', async () => {
    let calls = 0;
    const result = await runHunt({
      filter: '@pops/x',
      script: 'test',
      iterations: 4,
      keepGoing: false,
      outDir,
      runIteration: async (_iteration, staging) => {
        calls += 1;
        return writeGreen(staging);
      },
    });

    expect(result).toMatchObject({ caught: false, ranIterations: 4, redRuns: [] });
    expect(calls).toBe(4);
    // Nothing was ever retained, so outDir itself was never created.
    expect(existsSync(outDir)).toBe(false);
  });

  it('stops at the first red run by default and retains its full output', async () => {
    let calls = 0;
    const result = await runHunt({
      filter: '@pops/purchases',
      script: 'test',
      iterations: 10,
      keepGoing: false,
      outDir,
      runIteration: async (iteration, staging) => {
        calls += 1;
        return iteration === 3 ? writeRed(staging) : writeGreen(staging);
      },
    });

    expect(calls).toBe(3); // never reaches iteration 4
    expect(result.caught).toBe(true);
    expect(result.redRuns).toHaveLength(1);
    const [red] = result.redRuns;
    expect(red?.iteration).toBe(3);
    expect(red?.failures[0]?.name).toContain('creates every parsed order');

    const dir = red!.dir;
    expect(existsSync(join(dir, 'report.json'))).toBe(true);
    expect(existsSync(join(dir, 'stdout.log'))).toBe(true);
    expect(existsSync(join(dir, 'stderr.log'))).toBe(true);
    expect(existsSync(join(dir, 'summary.txt'))).toBe(true);
    expect(readFileSync(join(dir, 'stdout.log'), 'utf8')).toContain('FAIL backfill.test.ts');
    expect(JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'))).toEqual(
      REAL_SHAPED_FAILING_REPORT
    );
  });

  it('--keep-going spends the whole budget and retains every red run it hits', async () => {
    const redAt = new Set([2, 4]);
    let calls = 0;
    const result = await runHunt({
      filter: '@pops/x',
      script: 'test',
      iterations: 5,
      keepGoing: true,
      outDir,
      runIteration: async (iteration, staging) => {
        calls += 1;
        return redAt.has(iteration) ? writeRed(staging) : writeGreen(staging);
      },
    });

    expect(calls).toBe(5);
    expect(result.ranIterations).toBe(5);
    expect(result.redRuns.map((r) => r.iteration)).toEqual([2, 4]);
    expect(result.redRuns.every((r) => existsSync(join(r.dir, 'summary.txt')))).toBe(true);
  });

  it('a runIteration that throws is captured as a red run instead of crashing the hunt', async () => {
    const result = await runHunt({
      filter: '@pops/x',
      script: 'test',
      iterations: 3,
      keepGoing: false,
      outDir,
      runIteration: async () => {
        throw new Error('pnpm ENOENT');
      },
    });

    expect(result.caught).toBe(true);
    expect(result.redRuns).toHaveLength(1);
    const [red] = result.redRuns;
    expect(readFileSync(join(red!.dir, 'stderr.log'), 'utf8')).toContain('pnpm ENOENT');
  });

  it('retains a stdout.log for a throw that happened before anything wrote one', async () => {
    const result = await runHunt({
      filter: '@pops/x',
      script: 'test',
      iterations: 1,
      keepGoing: false,
      outDir,
      runIteration: async () => {
        throw new Error('spawn failed before the child produced a byte');
      },
    });

    const [red] = result.redRuns;
    // Half a retained run is the failure mode this whole tool exists to
    // prevent: a red run missing stdout entirely reads as a tool bug rather
    // than as evidence.
    expect(existsSync(join(red!.dir, 'stdout.log'))).toBe(true);
    expect(existsSync(join(red!.dir, 'stderr.log'))).toBe(true);
  });

  it('keeps what the child already wrote when the iteration then throws', async () => {
    const result = await runHunt({
      filter: '@pops/x',
      script: 'test',
      iterations: 1,
      keepGoing: false,
      outDir,
      runIteration: async (_iteration, staging) => {
        writeFileSync(join(staging, 'stdout.log'), 'RUN backfill.test.ts\n', 'utf8');
        writeFileSync(join(staging, 'stderr.log'), 'heap limit approaching\n', 'utf8');
        throw new Error('killed mid-run');
      },
    });

    const [red] = result.redRuns;
    expect(readFileSync(join(red!.dir, 'stdout.log'), 'utf8')).toContain('RUN backfill.test.ts');
    const stderr = readFileSync(join(red!.dir, 'stderr.log'), 'utf8');
    // The throw is appended, not written over the output that explains it.
    expect(stderr).toContain('heap limit approaching');
    expect(stderr).toContain('killed mid-run');
  });
});

describe('spawnCapture', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'flake-hunt-spawn-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('captures stdout, stderr and the exit code of a real process', async () => {
    const stdoutPath = join(dir, 'out.log');
    const stderrPath = join(dir, 'err.log');
    const code = await spawnCapture(
      process.execPath,
      [
        '-e',
        "process.stdout.write('hi out'); process.stderr.write('hi err'); process.exitCode = 7;",
      ],
      { cwd: dir, stdoutPath, stderrPath }
    );
    expect(code).toBe(7);
    expect(readFileSync(stdoutPath, 'utf8')).toBe('hi out');
    expect(readFileSync(stderrPath, 'utf8')).toBe('hi err');
  });

  it('rejects rather than hanging when the command does not exist', async () => {
    await expect(
      spawnCapture('pops-flake-hunt-nonexistent-command-xyz', [], {
        cwd: dir,
        stdoutPath: join(dir, 'out.log'),
        stderrPath: join(dir, 'err.log'),
      })
    ).rejects.toThrow();
  });

  /**
   * The two signals a retained red run has to tell apart: an OOM kill and an
   * ordinary termination. A bare 128 for both would make the retained
   * evidence unable to answer the first question anyone asks of it.
   */
  it.each([
    ['SIGKILL', 128 + constants.signals.SIGKILL],
    ['SIGTERM', 128 + constants.signals.SIGTERM],
  ])('reports a %s as 128 + the signal number', async (signal, expected) => {
    const code = await spawnCapture(
      process.execPath,
      ['-e', `process.kill(process.pid, '${signal}');`],
      { cwd: dir, stdoutPath: join(dir, 'out.log'), stderrPath: join(dir, 'err.log') }
    );

    expect(code).toBe(expected);
  });

  it('distinguishes the two, rather than collapsing both to 128', async () => {
    const run = (signal: string) =>
      spawnCapture(process.execPath, ['-e', `process.kill(process.pid, '${signal}');`], {
        cwd: dir,
        stdoutPath: join(dir, `${signal}.out.log`),
        stderrPath: join(dir, `${signal}.err.log`),
      });

    expect(await run('SIGKILL')).not.toBe(await run('SIGTERM'));
  });
});

describe('the CLI itself', () => {
  it('--self-test exits 0', () => {
    const stdout = execFileSync('node', [scriptPath, '--self-test'], { encoding: 'utf8' });
    expect(stdout).toContain('self-test OK');
  });

  it('--help exits 2 and prints usage', () => {
    expect(() => execFileSync('node', [scriptPath, '--help'], { stdio: 'pipe' })).toThrow();
    try {
      execFileSync('node', [scriptPath, '--help'], { stdio: 'pipe', encoding: 'utf8' });
      expect.unreachable();
    } catch (error) {
      const e = error as { status: number; stdout: string };
      expect(e.status).toBe(2);
      expect(e.stdout).toContain('Usage:');
    }
  });

  it('a missing --filter is a usage error, exit 2', () => {
    try {
      execFileSync('node', [scriptPath], { stdio: 'pipe', encoding: 'utf8' });
      expect.unreachable();
    } catch (error) {
      const e = error as { status: number; stderr: string };
      expect(e.status).toBe(2);
      expect(e.stderr).toContain('--filter');
    }
  });
});
