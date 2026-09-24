#!/usr/bin/env node
/**
 * The inventory-types acceptance suite (POPS-4354), end to end, with an
 * evidence record for every criterion.
 *
 *   mise run inventory:acceptance                      # S1–S6 (MCP / REST / BFM)
 *   mise run inventory:acceptance -- --web             # + S7, Playwright
 *   mise run inventory:acceptance -- --ios             # + S8, Maestro (macOS)
 *   mise run inventory:acceptance -- --pull-request 5100 --pr-issue POPS-4600
 *
 * Each layer runs the tests that live with the code they exercise —
 * `pillars/mcp/src/acceptance/` (vitest), `pillars/shell/e2e/*.acceptance.spec.ts`
 * (Playwright) and `clients/ios/.maestro/acceptance/` (Maestro) — through
 * that package's own runner, with a machine-readable report. This script
 * only builds what those runners spawn, runs them, and turns their reports
 * into evidence (`evidence.mjs`). A layer that was not selected or produced
 * no report leaves its criteria `skipped`, never `passed`.
 *
 * Output, under `--out` (default `tmp/inventory-acceptance/`):
 *   <scenario>.records.json  every criterion's evidence record
 *   <scenario>.packet.json   with --pull-request/--pr-issue: the packet
 *                            `scripts/implementation-evidence.mjs` validates,
 *                            and its verdict is printed
 *   summary.json             each scenario's status
 *
 * Exits 1 when any criterion failed or a packet did not validate; skips do
 * not fail the run, they are reported.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { release } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readFlag } from '../cli-flags.mjs';
import { assessImplementationEvidence, readEvidencePacket } from '../implementation-evidence.mjs';
import {
  maestroResults,
  playwrightResults,
  scenarioPacket,
  scenarioRecords,
  scenarioStatus,
  vitestResults,
} from './evidence.mjs';
import { SCENARIOS } from './scenarios.mjs';

/** @typedef {import('./evidence.mjs').TestResult} TestResult */

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const USAGE = `Usage: node scripts/inventory-acceptance/run.mjs [--web] [--ios] [--skip-build]
         [--out <dir>] [--pull-request <n> --pr-issue <TICKET>]`;

/**
 * @param {string} command
 * @param {string[]} args
 * @param {Record<string, string>} [env]
 * @returns {number}
 */
function run(command, args, env = {}) {
  process.stdout.write(`\ninventory-acceptance: ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  return result.status ?? 1;
}

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function gitRevision() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return { revision: head.stdout.trim(), dirty: status.stdout.trim() !== '' };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const web = args.includes('--web');
  const ios = args.includes('--ios');
  const out = resolve(REPO_ROOT, readFlag(args, '--out') ?? 'tmp/inventory-acceptance');
  const pullRequestFlag = readFlag(args, '--pull-request');
  const prIssue = readFlag(args, '--pr-issue');
  if ((pullRequestFlag === undefined) !== (prIssue === undefined)) {
    process.stderr.write(`--pull-request and --pr-issue go together.\n${USAGE}\n`);
    return 2;
  }
  const pullRequest =
    pullRequestFlag === undefined || prIssue === undefined
      ? undefined
      : { number: Number(pullRequestFlag), prIssue };

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const { revision, dirty } = gitRevision();
  const context = {
    revision,
    host: `local ${process.platform} ${release()}, node ${process.version}${dirty ? ', working tree has uncommitted changes' : ''}`,
  };

  if (!args.includes('--skip-build')) {
    const filters = ['@pops/registry...', '@pops/inventory...', '@pops/bfm...', '@pops/mcp...'];
    if (web) filters.push('@pops/shell^...', '@pops/app-inventory...');
    const built = run('pnpm', [...filters.flatMap((filter) => ['--filter', filter]), 'build']);
    if (built !== 0) {
      process.stderr.write('inventory-acceptance: the build failed; nothing was run.\n');
      return 1;
    }
  }

  /** @type {TestResult[]} */
  const results = [];
  /** @type {Map<string, string>} */
  const notRun = new Map();

  const vitestReport = join(out, 'vitest.json');
  run('pnpm', [
    '--filter',
    '@pops/mcp',
    'test:acceptance',
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${vitestReport}`,
  ]);
  if (existsSync(vitestReport)) results.push(...vitestResults(readJson(vitestReport), REPO_ROOT));
  else notRun.set('vitest', 'the vitest acceptance run wrote no report');

  if (web) {
    const playwrightReport = join(out, 'playwright.json');
    run(
      'pnpm',
      [
        '--filter',
        '@pops/shell',
        'exec',
        'playwright',
        'test',
        '--config',
        'playwright.acceptance.config.ts',
        '--reporter=list,json',
      ],
      { INVENTORY_ACCEPTANCE: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: playwrightReport }
    );
    if (existsSync(playwrightReport)) {
      results.push(...playwrightResults(readJson(playwrightReport), 'pillars/shell/e2e'));
    } else {
      notRun.set('playwright', 'the Playwright acceptance run wrote no report');
    }
  } else {
    notRun.set('playwright', 'not run: the web layer runs with --web');
  }

  const iosScenario = SCENARIOS.find((scenario) => scenario.layer === 'maestro');
  if (ios && iosScenario !== undefined) {
    const status = run('node', ['scripts/ios-e2e/run.mjs'], {
      POPS_E2E_FLOWS: iosScenario.file.replace(/^clients\/ios\//, ''),
    });
    results.push(...maestroResults(iosScenario, status, 'the output above'));
  } else {
    notRun.set(
      'maestro',
      'not run: the iOS layer runs with --ios on a macOS host with Xcode and Maestro'
    );
  }

  let failed = false;
  /** @type {Record<string, string>} */
  const summary = {};
  for (const scenario of SCENARIOS) {
    const records = scenarioRecords(scenario, results, context, notRun.get(scenario.layer));
    writeFileSync(
      join(out, `${scenario.id}.records.json`),
      `${JSON.stringify(records, null, 2)}\n`
    );
    const status = scenarioStatus(records);
    summary[scenario.id] = status;
    if (status === 'failed') failed = true;
    process.stdout.write(`\n${scenario.id} ${status.toUpperCase()} — ${scenario.title}\n`);
    for (const record of records) {
      process.stdout.write(`  ${record.criterion} ${record.status}: ${record.detail}\n`);
    }
    if (pullRequest === undefined) continue;
    const packet = scenarioPacket(scenario, records, pullRequest);
    writeFileSync(join(out, `${scenario.id}.packet.json`), `${JSON.stringify(packet, null, 2)}\n`);
    try {
      const verdict = assessImplementationEvidence(readEvidencePacket(packet));
      process.stdout.write(`  packet: ${verdict.status}\n`);
    } catch (error) {
      failed = true;
      process.stdout.write(
        `  packet INVALID: ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  }
  writeFileSync(
    join(out, 'summary.json'),
    `${JSON.stringify({ revision, ...summary }, null, 2)}\n`
  );
  process.stdout.write(`\ninventory-acceptance: evidence under ${out}\n`);
  if (pullRequest === undefined) {
    process.stdout.write(
      'inventory-acceptance: no --pull-request/--pr-issue, so records were written but no packets.\n'
    );
  }
  return failed ? 1 : 0;
}

process.exitCode = main();
