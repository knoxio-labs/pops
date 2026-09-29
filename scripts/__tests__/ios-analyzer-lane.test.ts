import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { isMapping, parseYaml } from '../ci/config-parse.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lane = join(repo, 'clients/ios/scripts/analyzer-lane.sh');
const temps: string[] = [];

afterEach(() => {
  for (const path of temps.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture(summary = 'Found 0 violations, 0 serious in 5 files.', status = '0') {
  mkdirSync(join(repo, 'tmp'), { recursive: true });
  const cwd = mkdtempSync(join(repo, 'tmp/ios-analyzer-test-'));
  temps.push(cwd);
  for (const file of [
    'App/Main.swift',
    'AppTests/MainTests.swift',
    'Packages/A/Sources/A.swift',
    'Packages/A/Tests/ATests.swift',
    'Packages/A/script.swift',
    'Packages/A/Package.swift',
    'Packages/A/.build/Excluded.swift',
    'Packages/A/Generated/Excluded.swift',
    'Tools/Excluded.swift',
  ]) {
    mkdirSync(dirname(join(cwd, file)), { recursive: true });
    writeFileSync(join(cwd, file), '#!/usr/bin/env swift\n');
  }
  const bin = join(cwd, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'swiftlint'),
    `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$@" > "$POPS_TEST_ARGUMENTS"
printf 'analyzer stdout marker\\n'
printf 'analyzer stderr marker\\n' >&2
if [ "\${POPS_TEST_WAIT:-}" = true ]; then read -r release; fi
printf '%s\\n' "$POPS_TEST_SUMMARY"
exit "$POPS_TEST_STATUS"
`
  );
  chmodSync(join(bin, 'swiftlint'), 0o755);
  const compilerLog = join(cwd, 'compiler.log');
  writeFileSync(compilerLog, 'compile evidence\n');
  const artifacts = join(cwd, 'diagnostics');
  return {
    cwd,
    artifacts,
    compilerLog,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      POPS_IOS_COMPILER_LOG: compilerLog,
      POPS_IOS_ANALYZER_ARTIFACTS: artifacts,
      POPS_TEST_ARGUMENTS: join(cwd, 'arguments'),
      POPS_TEST_SUMMARY: summary,
      POPS_TEST_STATUS: status,
    },
  };
}

function run(summary?: string, status?: string) {
  const setup = fixture(summary, status);
  const result = spawnSync('bash', [lane], { ...setup, encoding: 'utf8', timeout: 5000 });
  return { ...setup, result };
}

describe('the iOS analyzer lane', () => {
  it('retains both streams, strict arguments, and the existing source floor exclusions', () => {
    const { result, artifacts, cwd, compilerLog } = run();
    expect(result.status).toBe(0);
    expect(readFileSync(join(artifacts, 'compiler.log'), 'utf8')).toBe('compile evidence\n');
    const log = readFileSync(join(artifacts, 'analyze.log'), 'utf8');
    expect(log).toContain('analyzer stdout marker');
    expect(log).toContain('analyzer stderr marker');
    expect(result.stdout).toContain(log);
    expect(readFileSync(join(cwd, 'arguments'), 'utf8').trim().split('\n')).toEqual([
      'analyze',
      '--strict',
      '--compiler-log-path',
      compilerLog,
      '--config',
      '.swiftlint.yml',
    ]);
  }, 15000);

  it.each([
    '',
    'Found 0 violations, 0 serious in 0 files.',
    'Found 0 violations, 0 serious in 4 files.',
    'Found 0 violations in unknown files.',
    'Found 0 violations, 0 serious in 5 files.\nFound 0 violations, 0 serious in 4 files.',
  ])(
    'rejects missing, malformed or partial coverage: %j',
    (summary) => {
      const { result } = run(summary);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('the compiler log did not cover the whole tree');
    },
    15000
  );

  it('preserves a nonzero analyzer status when the coverage floor is met', () => {
    expect(run(undefined, '7').result.status).toBe(7);
    expect(run('Found 0 violations, 0 serious in 4 files.', '7').result.status).toBe(1);
  }, 15000);

  it('refuses an absent compiler log before invoking the analyzer', () => {
    const setup = fixture();
    rmSync(setup.compilerLog);
    const result = spawnSync('bash', [lane], { ...setup, encoding: 'utf8', timeout: 5000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no compiler log');
    expect(() => readFileSync(setup.env.POPS_TEST_ARGUMENTS)).toThrow();
  }, 15000);

  it.each([false, true])(
    'streams before completion and retains interrupted=%s output',
    async (interrupt) => {
      const setup = fixture();
      const child = spawn('bash', [lane], {
        cwd: setup.cwd,
        env: { ...setup.env, POPS_TEST_WAIT: 'true' },
        detached: true,
      });
      const pid = child.pid;
      if (pid === undefined) throw new Error('Analyzer wrapper did not start');
      let output = '';
      let released = false;
      const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolveResult, reject) => {
          const timer = setTimeout(() => {
            process.kill(-pid, 'SIGKILL');
            reject(new Error('Analyzer output was buffered until exit'));
          }, 3000);
          child.on('error', reject);
          child.stdout.on('data', (chunk: Buffer) => {
            output += chunk.toString();
            if (!released && output.includes('analyzer stderr marker')) {
              released = true;
              if (interrupt) process.kill(-pid, 'SIGTERM');
              else child.stdin.end('continue\n');
            }
          });
          child.on('close', (code, signal) => {
            clearTimeout(timer);
            resolveResult({ code, signal });
          });
        }
      );
      expect(released).toBe(true);
      expect(output).toContain('analyzer stdout marker');
      expect(result).toEqual(
        interrupt ? { code: null, signal: 'SIGTERM' } : { code: 0, signal: null }
      );
      const log = readFileSync(join(setup.artifacts, 'analyze.log'), 'utf8');
      expect(log).toContain('analyzer stdout marker');
      expect(log).toContain('analyzer stderr marker');
      expect(log.includes('Found 0 violations')).toBe(!interrupt);
    },
    15000
  );

  it('keeps the CI timeout, failure artifact, and shared task entry point wired', () => {
    const workflowPath = join(repo, '.github/workflows/ios-quality.yml');
    const workflow = parseYaml(readFileSync(workflowPath, 'utf8'), workflowPath);
    if (!isMapping(workflow) || !isMapping(workflow.jobs)) throw new Error('Missing workflow jobs');
    const steps = Object.values(workflow.jobs).flatMap((job) =>
      isMapping(job) && Array.isArray(job.steps) ? job.steps.filter(isMapping) : []
    );
    const analyze = steps.find(
      (step) => step.name === 'SwiftLint analyzer rules (reuse the test compile)'
    );
    expect(analyze?.['timeout-minutes']).toBe(75);
    expect(analyze?.run).toBe('mise run --skip-deps lint:analyze');
    expect(analyze?.env).toEqual({
      POPS_IOS_ANALYZER_ARTIFACTS: '${{ runner.temp }}/ios-analyzer-diagnostics',
    });
    const upload = steps.find((step) => step.name === 'SwiftLint analyzer log');
    expect(upload?.if).toBe('failure()');
    expect(upload?.with).toMatchObject({
      name: 'ios-analyzer-debug',
      path: '${{ runner.temp }}/ios-analyzer-diagnostics',
    });
    expect(readFileSync(join(repo, 'clients/ios/mise.toml'), 'utf8')).toContain(
      'run = "bash scripts/analyzer-lane.sh"'
    );
    expect(readFileSync(lane, 'utf8')).toContain('tail -c "+$((offset + 1))" "$output_log"');
  });
});
