#!/usr/bin/env node
/**
 * Loop a unit's test suite until it goes red, and keep the evidence.
 *
 * Every intermittent failure seen across POPS-1349, POPS-1430 and POPS-1567
 * was observed once and then lost: the run's output was piped through `tail`,
 * scrolled away in a terminal, or simply never written down. Without the
 * failing test's name and its assertion diff there is nothing to correlate a
 * new sighting against, so a real intermittent bug and three unrelated ones
 * look identical. POPS-1349's own "suggested next step" names the fix — run
 * the suite in a loop with `--reporter=json --outputFile`, keep the output
 * only for the runs that fail — and this is that, built once so any unit can
 * use it rather than each investigation improvising its own.
 *
 * A green run's JSON report, stdout and stderr are written to a scratch
 * directory OUTSIDE the repo (`os.tmpdir()`) and deleted the moment the exit
 * code says pass — an unattended soak of hundreds of iterations must not fill
 * the disk. A red run's are moved into `--out-dir` and kept, alongside a
 * `summary.txt` naming the failing test(s), the loop iteration, the wall
 * clock, and the load average at the start and end of that one run — enough
 * for someone who was not watching to know whether it is worth chasing.
 *
 * "Load average" is `os.loadavg()`, not a spawned `uptime`: it is the exact
 * three numbers `uptime` prints, structured, with no locale-dependent text to
 * parse and no extra process per sample.
 *
 * This never retries a failure. Moving on to loop iteration N+1 after a red
 * N is a fresh, independent run — not a second attempt at the one that just
 * failed — and with `--keep-going` a single invocation can keep sitting the
 * remaining budget to see whether more than one sighting turns up. The
 * default is to stop the moment it catches one, since a first sighting is
 * usually the point of running this at all.
 *
 * Usage:
 *   node scripts/flake-hunt.mjs --filter <pnpm-filter> [options] [-- <extra vitest args>]
 *   node scripts/flake-hunt.mjs --self-test
 *   node scripts/flake-hunt.mjs --help
 *
 * Options:
 *   --filter <pkg>     Required. pnpm workspace filter, e.g. @pops/purchases.
 *   --iterations <n>   Loop budget. Default 25 — POPS-1349's own failure rate
 *                       ("roughly 1 in 25 runs") is as good a default budget
 *                       as any for a first attempt at a sighting.
 *   --coverage         Run the "test:coverage" script instead of "test" (v8
 *                       instrumentation on) — the lane these flakes bite
 *                       hardest, per POPS-1567.
 *   --keep-going       Do not stop at the first red run: spend the whole
 *                       --iterations budget regardless, retaining every red
 *                       run along the way. Default is to stop at the first.
 *   --script <name>    Override the pnpm script to run (default "test", or
 *                       "test:coverage" with --coverage).
 *   --out-dir <path>   Where retained red-run artifacts are written. Default
 *                       is `<repo root>/tmp/flake-hunt/<slug of --filter>/
 *                       <hunt timestamp>` — under `tmp/`, which the repo's
 *                       .gitignore already excludes at any depth, so nothing
 *                       here is a new gitignore rule to maintain and nothing
 *                       here makes `git status` notice.
 *   -- <args...>        Anything after a literal "--" is forwarded to vitest
 *                       verbatim, e.g. `-- --pool=forks`.
 *
 * Exit 0 = every iteration was green. Exit 1 = a red run was caught — see
 * stderr and the retained artifacts under --out-dir. Exit 2 = usage error.
 */

import { spawn } from 'node:child_process';
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readFlag } from './cli-flags.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

export const DEFAULT_ITERATIONS = 25;

/** Thrown by {@link parseArgs} for anything a human typed wrong. */
export class UsageError extends Error {}

/**
 * @typedef {{
 *   filter: string,
 *   iterations: number,
 *   coverage: boolean,
 *   keepGoing: boolean,
 *   script: string,
 *   outDir: string | undefined,
 *   extraArgs: string[],
 * }} FlakeHuntOptions
 */

/**
 * @param {string[]} argv `process.argv.slice(2)`.
 * @returns {FlakeHuntOptions}
 * @throws {UsageError}
 */
export function parseArgs(argv) {
  const dashIndex = argv.indexOf('--');
  const own = dashIndex === -1 ? argv : argv.slice(0, dashIndex);
  const extraArgs = dashIndex === -1 ? [] : argv.slice(dashIndex + 1);

  const filter = readFlag(own, '--filter');
  if (filter === undefined) {
    throw new UsageError(
      '--filter <pnpm-workspace-filter> is required, e.g. --filter @pops/purchases'
    );
  }

  let iterations = DEFAULT_ITERATIONS;
  if (own.includes('--iterations')) {
    const raw = readFlag(own, '--iterations');
    const parsed = raw === undefined ? Number.NaN : Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new UsageError(
        `--iterations must be a positive integer, got ${raw === undefined ? '(nothing)' : `"${raw}"`}`
      );
    }
    iterations = parsed;
  }

  const coverage = own.includes('--coverage');
  const keepGoing = own.includes('--keep-going');
  const script = readFlag(own, '--script') ?? (coverage ? 'test:coverage' : 'test');
  const outDir = readFlag(own, '--out-dir');

  return { filter, iterations, coverage, keepGoing, script, outDir, extraArgs };
}

/**
 * A filesystem-safe fragment identifying a pnpm filter, e.g. `@pops/purchases`
 * -> `pops-purchases`.
 *
 * @param {string} filter
 * @returns {string}
 */
export function slugifyFilter(filter) {
  return filter
    .replace(/^@/u, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

/**
 * @param {string} root Repo root.
 * @param {string} filter
 * @returns {string}
 */
export function defaultOutDirBase(root, filter) {
  return join(root, 'tmp', 'flake-hunt', slugifyFilter(filter));
}

/**
 * A directory name for a hunt, sortable and filesystem-safe.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function huntId(date = new Date()) {
  return date.toISOString().replace(/[:.]/gu, '-');
}

/**
 * @param {readonly [number, number, number]} loadavgTriple As returned by
 *   `os.loadavg()`: 1-, 5- and 15-minute averages, in that order.
 * @returns {string}
 */
export function formatLoadAverage(loadavgTriple) {
  const [one, five, fifteen] = loadavgTriple;
  const fmt = (/** @type {number} */ n) => (Number.isFinite(n) ? n.toFixed(2) : '?');
  return `1m=${fmt(one ?? Number.NaN)} 5m=${fmt(five ?? Number.NaN)} 15m=${fmt(fifteen ?? Number.NaN)}`;
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Read a vitest `--reporter=json` file, tolerating its absence — a process
 * that crashes before vitest finishes (a missing script, a config error)
 * never writes one, and that is itself diagnostic rather than a bug in this
 * tool.
 *
 * @param {string} path
 * @returns {unknown}
 */
export function readJsonReport(path) {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * @typedef {{ file: string, name: string, message: string }} TestFailure
 */

/**
 * `fullName` (ancestor describe blocks included) when vitest gave one,
 * falling back to the bare `title`, and only then to a placeholder.
 *
 * @param {unknown} fullName
 * @param {unknown} title
 * @returns {string}
 */
function pickTestName(fullName, title) {
  if (typeof fullName === 'string') return fullName;
  if (typeof title === 'string') return title;
  return '(unnamed test)';
}

/**
 * Every failed assertion in a vitest JSON report, flattened across files.
 *
 * Shape reference (vitest 4.1's `--reporter=json`, captured from a real run):
 * `{ testResults: [{ name: <file path>, assertionResults: [{ fullName,
 * title, status, failureMessages }] }] }`. Read defensively — a report from a
 * future vitest that renamed a field should degrade to "no failures parsed",
 * not throw and lose the run's stdout/stderr along with it.
 *
 * @param {unknown} report
 * @returns {TestFailure[]}
 */
export function extractFailures(report) {
  /** @type {TestFailure[]} */
  const failures = [];
  if (typeof report !== 'object' || report === null) return failures;
  const testResults = /** @type {{ testResults?: unknown }} */ (report).testResults;
  if (!Array.isArray(testResults)) return failures;

  for (const fileResult of testResults) {
    if (typeof fileResult !== 'object' || fileResult === null) continue;
    const { name, assertionResults } =
      /** @type {{ name?: unknown, assertionResults?: unknown }} */ (fileResult);
    const file = typeof name === 'string' ? name : '(unknown file)';
    if (!Array.isArray(assertionResults)) continue;

    for (const assertion of assertionResults) {
      if (typeof assertion !== 'object' || assertion === null) continue;
      const { status, fullName, title, failureMessages } =
        /** @type {{ status?: unknown, fullName?: unknown, title?: unknown, failureMessages?: unknown }} */ (
          assertion
        );
      if (status !== 'failed') continue;
      const name2 = pickTestName(fullName, title);
      const messages = Array.isArray(failureMessages)
        ? failureMessages.filter((m) => typeof m === 'string')
        : [];
      failures.push({ file, name: name2, message: messages.join('\n\n') });
    }
  }
  return failures;
}

/**
 * @typedef {object} RedRunContext
 * @property {string} filter
 * @property {string} script
 * @property {number} iteration
 * @property {number} iterations
 * @property {number} exitCode
 * @property {string} startedAt ISO timestamp.
 * @property {string} endedAt ISO timestamp.
 * @property {readonly [number, number, number]} loadBefore
 * @property {readonly [number, number, number]} loadAfter
 * @property {TestFailure[]} failures
 * @property {boolean} hadJsonReport
 */

/**
 * The human-readable evidence written to `summary.txt` beside a retained red
 * run — everything the ticket asks a sighting to carry, in one place so it
 * can be pasted straight into a tracker comment.
 *
 * @param {RedRunContext} ctx
 * @returns {string}
 */
export function buildSummary(ctx) {
  const wallClockMs = new Date(ctx.endedAt).getTime() - new Date(ctx.startedAt).getTime();
  const lines = [
    'FLAKE HUNT — RED RUN CAUGHT',
    `unit:        ${ctx.filter}`,
    `script:      ${ctx.script}`,
    `iteration:   ${ctx.iteration} of ${ctx.iterations}`,
    `wall clock:  ${ctx.startedAt} -> ${ctx.endedAt} (${formatDuration(wallClockMs)})`,
    `load avg — start: ${formatLoadAverage(ctx.loadBefore)}`,
    `load avg — end:   ${formatLoadAverage(ctx.loadAfter)}`,
    `exit code:   ${ctx.exitCode}`,
    '',
  ];

  if (!ctx.hadJsonReport) {
    lines.push(
      'No JSON reporter output was found — the process likely exited before',
      'vitest could write one (a missing script, a config error, a crash before',
      'any test ran). See stderr.log for the raw failure.',
      ''
    );
  } else if (ctx.failures.length === 0) {
    lines.push(
      'The run exited non-zero but no failed assertion was found in the JSON',
      'report (a suite-level crash, an unhandled rejection, a hook failure).',
      'See stdout.log / stderr.log.',
      ''
    );
  } else {
    lines.push(`FAILING TESTS (${ctx.failures.length}):`);
    for (const failure of ctx.failures) {
      lines.push(`  ${failure.file}`, `    ${failure.name}`);
      for (const messageLine of failure.message.split('\n')) lines.push(`      ${messageLine}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * @typedef {object} IterationResult
 * @property {number} exitCode
 * @property {string} jsonPath Where the JSON reporter was told to write.
 * @property {string} stdoutPath
 * @property {string} stderrPath
 * @property {string} startedAt ISO timestamp.
 * @property {string} endedAt ISO timestamp.
 * @property {readonly [number, number, number]} loadBefore
 * @property {readonly [number, number, number]} loadAfter
 */

/**
 * @typedef {object} RedRun
 * @property {number} iteration
 * @property {string} dir Where this run's artifacts were retained.
 * @property {TestFailure[]} failures
 */

/**
 * @typedef {object} HuntResult
 * @property {boolean} caught
 * @property {number} ranIterations
 * @property {RedRun[]} redRuns
 */

/**
 * @typedef {object} RunHuntOptions
 * @property {string} filter
 * @property {string} script
 * @property {number} iterations
 * @property {boolean} keepGoing
 * @property {string} outDir Root under which red runs are retained; created
 *   lazily, only once something needs to live there.
 * @property {(iteration: number, stagingDir: string) => Promise<IterationResult>} runIteration
 *   Runs one iteration, writing its JSON/stdout/stderr into `stagingDir`
 *   (which the caller already created), and resolves with where they went.
 *   Injected so the loop's retention logic is testable without spawning a
 *   real test suite.
 * @property {(line: string) => void} [log]
 */

/**
 * Loop `runIteration` up to `iterations` times, deleting every green run's
 * staging directory and moving every red run's into `outDir`.
 *
 * @param {RunHuntOptions} opts
 * @returns {Promise<HuntResult>}
 */
export async function runHunt(opts) {
  const { filter, script, iterations, keepGoing, outDir, runIteration, log = () => {} } = opts;
  const pad = String(iterations).length;
  /** @type {RedRun[]} */
  const redRuns = [];
  let ranIterations = 0;

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    ranIterations = iteration;
    const staging = mkdtempSync(join(tmpdir(), 'pops-flake-hunt-'));

    /** @type {IterationResult} */
    let result;
    try {
      result = await runIteration(iteration, staging);
    } catch (error) {
      // A thrown error (the spawn itself failing to start, say) is still a
      // red run — it must be captured and reported, not left to crash the
      // whole hunt and lose every iteration that ran before it.
      const now = new Date().toISOString();
      writeFileSync(
        join(staging, 'stderr.log'),
        error instanceof Error ? (error.stack ?? error.message) : String(error),
        'utf8'
      );
      result = {
        exitCode: 1,
        jsonPath: join(staging, 'report.json'),
        stdoutPath: join(staging, 'stdout.log'),
        stderrPath: join(staging, 'stderr.log'),
        startedAt: now,
        endedAt: now,
        loadBefore: loadavg(),
        loadAfter: loadavg(),
      };
    }

    if (result.exitCode === 0) {
      log(`  [${iteration}/${iterations}] green`);
      rmSync(staging, { recursive: true, force: true });
      continue;
    }

    const report = readJsonReport(result.jsonPath);
    const failures = extractFailures(report);
    const destDir = join(outDir, `run-${String(iteration).padStart(pad, '0')}`);
    mkdirSync(destDir, { recursive: true });
    cpSync(staging, destDir, { recursive: true });
    rmSync(staging, { recursive: true, force: true });

    const summary = buildSummary({
      filter,
      script,
      iteration,
      iterations,
      exitCode: result.exitCode,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      loadBefore: result.loadBefore,
      loadAfter: result.loadAfter,
      failures,
      hadJsonReport: report !== undefined,
    });
    writeFileSync(join(destDir, 'summary.txt'), summary, 'utf8');

    log(`  [${iteration}/${iterations}] RED — retained at ${destDir}`);
    log(summary);
    redRuns.push({ iteration, dir: destDir, failures });

    if (!keepGoing) break;
  }

  return { caught: redRuns.length > 0, ranIterations, redRuns };
}

/**
 * Spawn a command, streaming its stdout/stderr to files rather than
 * buffering them in memory — a soak of dozens of full-suite runs must not
 * hold each one's output in the process's own heap.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, stdoutPath: string, stderrPath: string }} opts
 * @returns {Promise<number>} The child's exit code (128 + signal number if it
 *   was killed by a signal, matching shell convention, since a caller reading
 *   only a number must not confuse "signalled" with "success").
 */
export function spawnCapture(command, args, opts) {
  const stdoutStream = createWriteStream(opts.stdoutPath);
  const stderrStream = createWriteStream(opts.stderrPath);
  // Every caller of this function is followed, sooner or later, by code that
  // may delete the directory these streams write into (a green run's staging
  // dir, or a test's own cleanup). Knowing when a stream is truly done means
  // listening for 'close' from the moment it is created — `.pipe()` ends the
  // destination automatically once the source (`child.stdout`) ends, which
  // routinely happens BEFORE the child's own 'close' event. A listener
  // attached inside the child's 'close' handler, as an earlier version of
  // this function did, can attach after the stream already closed: Node does
  // not replay a past event to a late listener, and the promise waiting on it
  // then never settles. Listening immediately means no event can be missed.
  const waitForClose = (/** @type {import('node:fs').WriteStream} */ stream) =>
    new Promise((res) => {
      stream.once('close', () => res(undefined));
      stream.once('error', () => res(undefined));
    });
  const stdoutClosed = waitForClose(stdoutStream);
  const stderrClosed = waitForClose(stderrStream);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(stdoutStream);
    child.stderr.pipe(stderrStream);
    child.on('error', (error) => {
      void Promise.all([stdoutClosed, stderrClosed]).then(() => reject(error));
    });
    child.on('close', (code, signal) => {
      void Promise.all([stdoutClosed, stderrClosed]).then(() =>
        resolvePromise(code ?? (signal !== null ? 128 : 1))
      );
    });
  });
}

/**
 * The real `runIteration`: one `pnpm --filter <filter> <script>` invocation
 * against the actual repo.
 *
 * @param {number} iteration
 * @param {string} stagingDir
 * @param {{ filter: string, script: string, extraArgs: string[] }} opts
 * @returns {Promise<IterationResult>}
 */
async function runRealIteration(iteration, stagingDir, opts) {
  const jsonPath = join(stagingDir, 'report.json');
  const stdoutPath = join(stagingDir, 'stdout.log');
  const stderrPath = join(stagingDir, 'stderr.log');

  const loadBefore = loadavg();
  const startedAt = new Date().toISOString();

  // No literal `--` before these: pnpm forwards trailing unrecognised args to
  // the script's own command line as-is. Inserting one (as `pnpm run <script>
  // -- <args>` suggests) instead lands a literal `--` in vitest's argv ahead
  // of the file filter, which vitest reads as "no positional filters" and
  // runs the whole suite regardless of what followed — confirmed against a
  // real invocation while building this tool, not a hypothetical.
  const args = [
    '--filter',
    opts.filter,
    opts.script,
    '--reporter=json',
    `--outputFile=${jsonPath}`,
    ...opts.extraArgs,
  ];

  const exitCode = await spawnCapture('pnpm', args, { cwd: repoRoot, stdoutPath, stderrPath });

  return {
    exitCode,
    jsonPath,
    stdoutPath,
    stderrPath,
    startedAt,
    endedAt: new Date().toISOString(),
    loadBefore,
    loadAfter: loadavg(),
  };
}

function printUsage() {
  console.log(
    'Usage:\n' +
      '  node scripts/flake-hunt.mjs --filter <pnpm-filter> [options] [-- <extra vitest args>]\n' +
      '  node scripts/flake-hunt.mjs --self-test\n\n' +
      "Runs a unit's test suite in a loop, retaining full output ONLY for the\n" +
      'run(s) that go red — the failing test names, the loop iteration, the load\n' +
      'average at the start and end of that run, the wall clock, the raw JSON\n' +
      'reporter output, and the complete stdout/stderr. Green runs are deleted.\n\n' +
      'Options:\n' +
      '  --filter <pkg>     Required. pnpm workspace filter, e.g. @pops/purchases.\n' +
      `  --iterations <n>   Loop budget. Default ${DEFAULT_ITERATIONS}.\n` +
      '  --coverage         Run "test:coverage" instead of "test".\n' +
      '  --keep-going       Spend the whole --iterations budget even after a red\n' +
      '                     run, instead of stopping at the first one.\n' +
      '  --script <name>    Override the pnpm script to run.\n' +
      '  --out-dir <path>   Where retained red-run artifacts are written. Default\n' +
      '                     is under tmp/flake-hunt/, already covered by .gitignore.\n' +
      '  -- <args...>       Forwarded to vitest verbatim.\n\n' +
      'Exit 0 = every iteration was green. Exit 1 = a red run was caught.\n' +
      'Exit 2 = usage error.'
  );
}

/**
 * Fixtures proving the pure decision logic still decides, runnable with no
 * dependency on a real test suite or a real subprocess — the fast,
 * dependency-free check this repo's guards run as `--self-test`, alongside
 * (not instead of) the full vitest suite in `scripts/__tests__/`.
 *
 * @returns {boolean}
 */
function selfTest() {
  const checks = {
    'a filter becomes a filesystem-safe slug':
      slugifyFilter('@pops/purchases') === 'pops-purchases',
    '--filter is required': (() => {
      try {
        parseArgs(['--iterations', '5']);
        return false;
      } catch (error) {
        return error instanceof UsageError;
      }
    })(),
    'a non-numeric --iterations is a usage error': (() => {
      try {
        parseArgs(['--filter', '@pops/x', '--iterations', 'nope']);
        return false;
      } catch (error) {
        return error instanceof UsageError;
      }
    })(),
    '--coverage selects the test:coverage script by default':
      parseArgs(['--filter', '@pops/x', '--coverage']).script === 'test:coverage',
    '--script overrides the default':
      parseArgs(['--filter', '@pops/x', '--script', 'test:watch']).script === 'test:watch',
    'args after a literal -- are forwarded, not parsed':
      parseArgs(['--filter', '@pops/x', '--', '--pool=forks']).extraArgs.join() === '--pool=forks',
    'a passing report yields no failures':
      extractFailures({
        testResults: [{ name: 'a.test.ts', assertionResults: [{ status: 'passed' }] }],
      }).length === 0,
    'a failed assertion is extracted with its file and message':
      extractFailures({
        testResults: [
          {
            name: 'a.test.ts',
            assertionResults: [{ status: 'failed', fullName: 'a > b', failureMessages: ['boom'] }],
          },
        ],
      })[0]?.file === 'a.test.ts' &&
      extractFailures({
        testResults: [
          {
            name: 'a.test.ts',
            assertionResults: [{ status: 'failed', fullName: 'a > b', failureMessages: ['boom'] }],
          },
        ],
      })[0]?.message === 'boom',
    'a malformed report yields no failures rather than throwing':
      extractFailures({ testResults: 'not an array' }).length === 0 &&
      extractFailures(undefined).length === 0,
    'a summary without a JSON report says so': buildSummary({
      filter: '@pops/x',
      script: 'test',
      iteration: 1,
      iterations: 1,
      exitCode: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:00:01.000Z',
      loadBefore: [0, 0, 0],
      loadAfter: [0, 0, 0],
      failures: [],
      hadJsonReport: false,
    }).includes('No JSON reporter output'),
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.error(`self-test FAILED: ${failed.map(([name]) => name).join('; ')}`);
    return false;
  }
  console.log(`self-test OK — ${Object.keys(checks).length} assertions passed.`);
  return true;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    process.exit(2);
    return;
  }
  if (argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
    return;
  }

  /** @type {FlakeHuntOptions} */
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`FAIL — ${error.message}. See --help.`);
    process.exit(2);
    return;
  }

  const outDir =
    opts.outDir !== undefined
      ? resolve(opts.outDir)
      : join(defaultOutDirBase(repoRoot, opts.filter), huntId());

  console.log(
    `flake-hunt: ${opts.filter} via "${opts.script}", up to ${opts.iterations} iteration(s), ` +
      `${opts.keepGoing ? 'spending the whole budget even after a red run' : 'stopping at the first red run'}. ` +
      `Red-run artifacts (if any) go under ${outDir}.`
  );

  const result = await runHunt({
    filter: opts.filter,
    script: opts.script,
    iterations: opts.iterations,
    keepGoing: opts.keepGoing,
    outDir,
    runIteration: (iteration, staging) =>
      runRealIteration(iteration, staging, {
        filter: opts.filter,
        script: opts.script,
        extraArgs: opts.extraArgs,
      }),
    log: (line) => console.log(line),
  });

  if (!result.caught) {
    console.log(`OK — ${result.ranIterations} iteration(s) green. No red run caught.`);
    process.exit(0);
    return;
  }

  console.error(`FAIL — caught ${result.redRuns.length} red run(s) of ${result.ranIterations}:`);
  for (const red of result.redRuns) {
    const names =
      red.failures.length === 0
        ? `(no per-test failure parsed — see ${red.dir})`
        : red.failures.map((f) => `${f.file} > ${f.name}`).join('; ');
    console.error(`  iteration ${red.iteration}: ${names}`);
  }
  process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main().catch((error) => {
    console.error(
      `FAIL — ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
    );
    process.exit(1);
  });
}
