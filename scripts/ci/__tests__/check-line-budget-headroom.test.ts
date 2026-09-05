/**
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes. These drive the pure core (glob matching, config parsing, the
 * comment/blank-aware line counter) over inputs it must flag and inputs it
 * must not, plus one end-to-end run against a throwaway git repo that plants
 * the rebase-tips-a-shared-file-over-budget shape: a file at its cap on the
 * target branch, a branch that only adds one line to it.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  countBudgetLines,
  evaluate,
  globToRegExp,
  matchesAnyGlob,
  parseMaxLinesConfig,
} from '../check-line-budget-headroom.mjs';

/**
 * git's repository-location overrides, scrubbed — mirrors
 * `check-line-budget-headroom.mjs`'s own `gitEnv()`. Without this, a test run
 * from inside `.husky/pre-push` (which exports `GIT_DIR` for the repo being
 * pushed) would point these throwaway fixtures at that repo instead of their
 * own temp directory.
 */
function gitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_COMMON_DIR',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_PREFIX',
    'GIT_QUARANTINE_PATH',
    'GIT_NAMESPACE',
  ]) {
    delete env[name];
  }
  return env;
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

describe('glob matching against the real .oxlintrc.json overrides', () => {
  const oxlintrc = JSON.parse(readFileSync(join(repoRoot, '.oxlintrc.json'), 'utf8'));
  const { exemptGlobs } = parseMaxLinesConfig(oxlintrc);

  it('finds at least one max-lines: off override in the real config', () => {
    expect(exemptGlobs.length).toBeGreaterThan(0);
  });

  it.each([
    ['a *.test.ts file', 'pillars/food/src/api/handlers.test.ts'],
    ['a *.spec.tsx file', 'pillars/shell/src/App.spec.tsx'],
    ['a *.stories.tsx file', 'libs/ui/src/primitives/Button.stories.tsx'],
    ['a generated contract file', 'pillars/purchases/src/contract/purchase.generated.ts'],
    ['a generated module-registry file', 'libs/module-registry/src/generated.ts'],
    ['a Hey API .gen.ts client file', 'pillars/food/app/src/lists-api/types.gen.ts'],
    ['a script under scripts/', 'scripts/ci/check-something.ts'],
  ])('exempts %s, matching the real oxlint config', (_label, path) => {
    expect(matchesAnyGlob(path, exemptGlobs)).toBe(true);
  });

  it.each([
    ['an ordinary contract schema file', 'pillars/purchases/src/contract/schemas/purchase.ts'],
    ['an ordinary handler file', 'pillars/food/src/api/handlers.ts'],
    ['a component that is not a story or a test', 'libs/ui/src/primitives/Button.tsx'],
  ])('does NOT exempt %s', (_label, path) => {
    expect(matchesAnyGlob(path, exemptGlobs)).toBe(false);
  });
});

describe('globToRegExp', () => {
  it('a single star does not cross a path separator', () => {
    expect(globToRegExp('pillars/*/src/x.ts').test('pillars/a/b/src/x.ts')).toBe(false);
    expect(globToRegExp('pillars/*/src/x.ts').test('pillars/a/src/x.ts')).toBe(true);
  });

  it('a leading ** matches zero or more directories', () => {
    const re = globToRegExp('**/*.test.ts');
    expect(re.test('x.test.ts')).toBe(true);
    expect(re.test('a/b/c/x.test.ts')).toBe(true);
    expect(re.test('a/b/c/x.ts')).toBe(false);
  });

  it('a brace group expands every alternative', () => {
    const re = globToRegExp('**/*.{ts,tsx}');
    expect(re.test('a/b.ts')).toBe(true);
    expect(re.test('a/b.tsx')).toBe(true);
    expect(re.test('a/b.js')).toBe(false);
  });
});

describe('parseMaxLinesConfig', () => {
  it('defaults to 200 when the rule is not an array', () => {
    expect(parseMaxLinesConfig({ rules: {} }).max).toBe(200);
  });

  it('reads a non-default configured max', () => {
    expect(parseMaxLinesConfig({ rules: { 'max-lines': ['error', { max: 120 }] } }).max).toBe(120);
  });

  it('ignores overrides that turn off an unrelated rule', () => {
    const { exemptGlobs } = parseMaxLinesConfig({
      rules: { 'max-lines': ['error', { max: 200 }] },
      overrides: [{ files: ['**/*.ts'], rules: { 'max-lines-per-function': 'off' } }],
    });
    expect(exemptGlobs).toEqual([]);
  });

  it('collects globs from every override that turns max-lines off, not just the first', () => {
    const { exemptGlobs } = parseMaxLinesConfig({
      rules: { 'max-lines': ['error', { max: 200 }] },
      overrides: [
        { files: ['**/*.test.ts'], rules: { 'max-lines': 'off' } },
        { files: ['**/*.stories.tsx'], rules: { 'max-lines': 'off' } },
      ],
    });
    expect(exemptGlobs).toEqual(['**/*.test.ts', '**/*.stories.tsx']);
  });
});

describe('countBudgetLines', () => {
  it('counts a plain code line', () => {
    expect(countBudgetLines('const a = 1;')).toBe(1);
  });

  it('skips blank lines', () => {
    expect(countBudgetLines('const a = 1;\n\nconst b = 2;')).toBe(2);
  });

  it('skips a whitespace-only line', () => {
    expect(countBudgetLines('const a = 1;\n   \nconst b = 2;')).toBe(2);
  });

  it('skips a full-line line comment', () => {
    expect(countBudgetLines('const a = 1;\n// a comment\nconst b = 2;')).toBe(2);
  });

  it('skips a single-line block comment', () => {
    expect(countBudgetLines('const a = 1;\n/* a comment */\nconst b = 2;')).toBe(2);
  });

  it('skips every line of a multi-line block comment', () => {
    expect(countBudgetLines('const a = 1;\n/*\n * line one\n * line two\n */\nconst b = 2;')).toBe(
      2
    );
  });

  it('counts a line that mixes code and a trailing comment', () => {
    expect(countBudgetLines('const a = 1; // not a comment-only line')).toBe(1);
  });

  it('does not treat "//" inside a string as a comment start', () => {
    expect(countBudgetLines('const url = "https://example.com";')).toBe(1);
  });

  it('does not treat a comment marker inside a template literal as a comment', () => {
    expect(countBudgetLines('const s = `has // and /* inside it`;')).toBe(1);
  });

  it('counts every line a multi-line template literal spans, as code', () => {
    expect(countBudgetLines('const s = `line one\nline two\nline three`;')).toBe(3);
  });

  it('handles an escaped quote inside a string without ending it early', () => {
    expect(countBudgetLines('const s = "a \\" quote"; // trailing comment')).toBe(1);
  });
});

describe('evaluate() end-to-end against a throwaway git repo', () => {
  const repos: string[] = [];

  afterEach(() => {
    for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function makeRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'line-budget-test-'));
    repos.push(dir);
    execFileSync('git', ['init', '--initial-branch=main', '-q'], { cwd: dir, env: gitEnv() });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, env: gitEnv() });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, env: gitEnv() });
    return dir;
  }

  function commit(dir: string, file: string, content: string, message: string): void {
    writeFileSync(join(dir, file), content);
    execFileSync('git', ['add', file], { cwd: dir, env: gitEnv() });
    execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir, env: gitEnv() });
  }

  function body(n: number): string {
    return `${Array.from({ length: n }, (_, i) => `console.error(${i});`).join('\n')}\n`;
  }

  it("fails when this branch tips a file already at the target's cap", () => {
    const dir = makeRepo();
    commit(dir, 'shared.ts', body(199), 'ancestor: 199 lines');
    execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir, env: gitEnv() });
    commit(
      dir,
      'shared.ts',
      `${body(199)}console.error(999);\n`,
      'feature: +1 line, own head is 200'
    );
    execFileSync('git', ['checkout', '-q', 'main'], { cwd: dir, env: gitEnv() });
    commit(
      dir,
      'shared.ts',
      `${body(199)}console.error(998);\n`,
      'main: independently grows to 200'
    );
    execFileSync('git', ['checkout', '-q', 'feature'], { cwd: dir, env: gitEnv() });

    const { verdicts } = evaluate({ cwd: dir, baseRef: 'main', headroom: 10 });
    const shared = verdicts.find((v) => v.file === 'shared.ts');
    expect(shared?.status).toBe('fail');
    expect(shared?.approxCount).toBe(201);
  });

  it('stays OK when the projected count is comfortably under the cap', () => {
    const dir = makeRepo();
    commit(dir, 'shared.ts', body(50), 'ancestor: 50 lines');
    execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir, env: gitEnv() });
    commit(dir, 'shared.ts', `${body(50)}console.error(999);\n`, 'feature: +1 line');

    const { verdicts } = evaluate({ cwd: dir, baseRef: 'main', headroom: 10 });
    expect(verdicts.find((v) => v.file === 'shared.ts')?.status).toBe('ok');
  });

  it('warns, but does not fail, inside the headroom band', () => {
    const dir = makeRepo();
    commit(dir, 'shared.ts', body(190), 'ancestor: 190 lines');
    execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir, env: gitEnv() });
    commit(dir, 'shared.ts', `${body(190)}console.error(999);\n`, 'feature: +1 line, 191 total');

    const { verdicts } = evaluate({ cwd: dir, baseRef: 'main', headroom: 10 });
    expect(verdicts.find((v) => v.file === 'shared.ts')?.status).toBe('warn');
  });

  it('does not report a file this branch never touched', () => {
    const dir = makeRepo();
    commit(dir, 'shared.ts', body(199), 'ancestor');
    commit(dir, 'untouched.ts', body(199), 'ancestor: a second file at 199, also near cap');
    execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir, env: gitEnv() });
    commit(dir, 'shared.ts', `${body(199)}console.error(999);\n`, 'feature only touches shared.ts');

    const { verdicts } = evaluate({ cwd: dir, baseRef: 'main', headroom: 10 });
    expect(verdicts.some((v) => v.file === 'untouched.ts')).toBe(false);
  });

  it('does not report a file the real .oxlintrc.json exempts, even far over cap', () => {
    const dir = makeRepo();
    commit(dir, 'shared.test.ts', body(199), 'ancestor');
    execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir, env: gitEnv() });
    commit(dir, 'shared.test.ts', body(400), 'feature: grows a test file to 400 lines');

    const { verdicts } = evaluate({ cwd: dir, baseRef: 'main', headroom: 10 });
    expect(verdicts.some((v) => v.file === 'shared.test.ts')).toBe(false);
  });

  it('reports a brand-new over-budget file directly, with no target-side comparison', () => {
    const dir = makeRepo();
    commit(dir, 'unrelated.ts', 'console.error(0);\n', 'ancestor');
    execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir, env: gitEnv() });
    commit(dir, 'brand-new.ts', body(250), 'feature: introduces a 250-line file');

    const { verdicts } = evaluate({ cwd: dir, baseRef: 'main', headroom: 10 });
    const created = verdicts.find((v) => v.file === 'brand-new.ts');
    expect(created?.status).toBe('fail');
  });

  it('reports a skip reason rather than a false pass when HEAD is the base branch itself', () => {
    const dir = makeRepo();
    commit(dir, 'shared.ts', body(10), 'only commit, on main');

    const { verdicts, skippedReason } = evaluate({ cwd: dir, baseRef: 'main', headroom: 10 });
    expect(skippedReason).toBeDefined();
    expect(verdicts).toEqual([]);
  });

  it('reports a skip reason rather than a silent empty pass when the base ref cannot be resolved', () => {
    const dir = makeRepo();
    commit(dir, 'shared.ts', body(10), 'ancestor');
    execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir, env: gitEnv() });
    commit(dir, 'shared.ts', `${body(10)}console.error(999);\n`, 'feature');

    const { skippedReason } = evaluate({ cwd: dir, baseRef: 'does-not-exist', headroom: 10 });
    expect(skippedReason).toBeDefined();
  });
});

describe('the guard self-test', () => {
  // The self-test builds two throwaway git repos and drives roughly twenty
  // `git`/node child-process calls through them (see `selfTest()` in
  // check-line-budget-headroom.mjs), on top of the child `node --self-test`
  // process itself. That is comfortably under vitest's 5000ms default on an
  // idle machine but not under concurrent load from sibling CI jobs or
  // parallel worktrees — clocked at 6831ms (POPS-3017) and again at 6096ms
  // against the default budget with a load average of ~365-416. The bound is
  // on the machine's load, not on anything this test asserts, so it matches
  // the pattern already used for RESOLVE_ALL_UNITS_TIMEOUT_MS and
  // REAL_TAG_ZOO_TIMEOUT_MS.
  const SELF_TEST_TIMEOUT_MS = 20_000;

  it(
    'passes against the real repo tree',
    () => {
      expect(() =>
        execFileSync(
          'node',
          [join(repoRoot, 'scripts', 'ci', 'check-line-budget-headroom.mjs'), '--self-test'],
          {
            cwd: repoRoot,
            stdio: 'pipe',
          }
        )
      ).not.toThrow();
    },
    SELF_TEST_TIMEOUT_MS
  );
});
