import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const iosRoot = join(repoRoot, 'clients', 'ios');
const lane = join(iosRoot, 'scripts', 'app-test-lane.sh');
const temps: string[] = [];
const TEST_TIMEOUT_MS = 10_000;

afterEach(() => {
  while (temps.length > 0) rmSync(temps.pop() as string, { recursive: true, force: true });
});

function fakeTool(directory: string, name: string, source: string): void {
  const path = join(directory, name);
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function fixture(): { bin: string; argumentsFile: string } {
  const tempRoot = join(repoRoot, 'tmp');
  mkdirSync(tempRoot, { recursive: true });
  const root = mkdtempSync(join(tempRoot, 'ios-app-test-lane-'));
  temps.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const argumentsFile = join(root, 'xcodebuild-arguments');

  fakeTool(
    bin,
    'xcodebuild',
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "$POPS_TEST_XCODEBUILD_ARGUMENTS"
while [ "$#" -gt 0 ]; do
  if [ "$1" = '-resultBundlePath' ]; then
    mkdir -p "$2"
    shift
  fi
  shift
done
`
  );
  fakeTool(
    bin,
    'xcrun',
    `#!/usr/bin/env bash
set -euo pipefail
case "$4" in
  summary) printf '%s\n' '{"totalTestCount":1,"skippedTests":0}' ;;
  tests) printf '%s\n' '{"testNodes":[{"nodeType":"Unit test bundle","name":"PopsTests.xctest"}]}' ;;
  *) exit 2 ;;
esac
`
  );

  return { bin, argumentsFile };
}

describe('the iOS app test lane diagnostic policy', () => {
  it(
    'passes the CI diagnostic policy to xcodebuild',
    () => {
      const { bin, argumentsFile } = fixture();

      execFileSync('bash', [lane, 'platform=iOS Simulator,name=iPhone 17,OS=latest'], {
        cwd: iosRoot,
        timeout: TEST_TIMEOUT_MS,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          POPS_IOS_TEST_DIAGNOSTICS: 'never',
          POPS_TEST_XCODEBUILD_ARGUMENTS: argumentsFile,
        },
      });

      const args = readFileSync(argumentsFile, 'utf8').trim().split('\n');
      const policy = args.indexOf('-collect-test-diagnostics');
      expect(policy).toBeGreaterThanOrEqual(0);
      expect(args[policy + 1]).toBe('never');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'rejects an unknown diagnostic policy before starting xcodebuild',
    () => {
      const { bin, argumentsFile } = fixture();

      const result = spawnSync('bash', [lane, 'platform=iOS Simulator,name=iPhone 17,OS=latest'], {
        cwd: iosRoot,
        encoding: 'utf8',
        timeout: TEST_TIMEOUT_MS,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          POPS_IOS_TEST_DIAGNOSTICS: 'sometimes',
          POPS_TEST_XCODEBUILD_ARGUMENTS: argumentsFile,
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('POPS_IOS_TEST_DIAGNOSTICS must be never or on-failure');
      expect(() => readFileSync(argumentsFile)).toThrow();
    },
    TEST_TIMEOUT_MS
  );
});
