import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { embeddedScript } from '../check-ci-gate-wiring.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const gatePath = join(repoRoot, '.github', 'workflows', 'ci-gate.yml');

/**
 * `ci-gate.yml`'s embedded script defines `globToRegExp`, `matchesPathFilter`
 * and `PATH_FILTERS`, then — before making any network call — hands them to
 * `globalThis.__ciGateTestHook` and returns, if that hook is a function. That
 * seam is inert in production (the hook is never set there) and lets this
 * test run the EXACT script GitHub executes, rather than a hand-copied
 * duplicate that could drift from it.
 */
type Captured = {
  globToRegExp: (glob: string) => RegExp;
  matchesPathFilter: (name: string, files: string[] | null) => boolean | null;
  PATH_FILTERS: Record<string, string[]>;
};

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (github: unknown, context: unknown, core: unknown) => Promise<void>;

async function runEmbeddedScript(): Promise<Captured> {
  const source = readFileSync(gatePath, 'utf8');
  const body = embeddedScript(source);
  expect(body).not.toBe('');

  let captured: Captured | undefined;
  (globalThis as { __ciGateTestHook?: (fns: Captured) => void }).__ciGateTestHook = (fns) => {
    captured = fns;
  };
  try {
    const fn = new AsyncFunction('github', 'context', 'core', body);
    await fn(
      {
        rest: {},
        paginate: () => Promise.reject(new Error('the test hook should have returned first')),
      },
      { repo: { owner: 'x', repo: 'y' }, payload: {} },
      { info: () => {}, warning: () => {}, setFailed: () => {} }
    );
  } finally {
    delete (globalThis as { __ciGateTestHook?: unknown }).__ciGateTestHook;
  }
  if (!captured)
    throw new Error('ci-gate.yml script did not call __ciGateTestHook — test seam missing');
  return captured;
}

afterEach(() => {
  delete (globalThis as { __ciGateTestHook?: unknown }).__ciGateTestHook;
});

describe('the real ci-gate.yml script', () => {
  it('calls the test hook and exposes the matching functions', async () => {
    const { globToRegExp, matchesPathFilter, PATH_FILTERS } = await runEmbeddedScript();
    expect(typeof globToRegExp).toBe('function');
    expect(typeof matchesPathFilter).toBe('function');
    expect(PATH_FILTERS['iOS Quality']).toBeDefined();
  });
});

describe('globToRegExp (as embedded in ci-gate.yml)', () => {
  it.each([
    ['pillars/**', 'pillars/finance/src/index.ts', true],
    ['pillars/**', 'libs/ui/src/index.ts', false],
    ['pillars/*/app/**', 'pillars/finance/app/src/main.tsx', true],
    ['pillars/*/app/**', 'pillars/finance/src/main.tsx', false],
    ['pillars/*/app/**', 'pillars/finance/app/nested/deep/file.tsx', true],
    ['**/Dockerfile', 'Dockerfile', true],
    ['**/Dockerfile', 'pillars/finance/Dockerfile', true],
    ['**/Dockerfile', 'pillars/finance/Dockerfile.dev', false],
    ['infra/docker*/**', 'infra/docker-compose/base.yml', true],
    ['infra/docker-compose*.yml', 'infra/docker-compose.dev.yml', true],
    ['infra/docker-compose*.yml', 'infra/docker-compose.dev.yaml', false],
    ['Cargo.toml', 'Cargo.toml', true],
    ['Cargo.toml', 'pillars/contacts/Cargo.toml', false],
    ['clients/ios/**', 'clients/ios/Packages/FeatureTransactions/README.md', true],
  ])('%s vs %s -> %s', async (pattern, file, expected) => {
    const { globToRegExp } = await runEmbeddedScript();
    expect(globToRegExp(pattern).test(file)).toBe(expected);
  });
});

describe('matchesPathFilter (as embedded in ci-gate.yml)', () => {
  it('is unconditionally true for a workflow with no PATH_FILTERS entry ("Quality")', async () => {
    const { matchesPathFilter } = await runEmbeddedScript();
    expect(matchesPathFilter('Quality', [])).toBe(true);
    expect(matchesPathFilter('Quality', null)).toBe(true);
  });

  it('reproduces the exact false-green scenario: iOS Quality should have triggered', async () => {
    // The commit that surfaced this: a README under clients/ios/Packages/**
    // changed, ios-quality.yml's own `pull_request.paths` includes
    // "clients/ios/**", so this must NOT be read as a genuine exclusion.
    const { matchesPathFilter } = await runEmbeddedScript();
    expect(
      matchesPathFilter('iOS Quality', ['clients/ios/Packages/FeatureTransactions/README.md'])
    ).toBe(true);
  });

  it('is a genuine exclusion when the diff touches none of the filter', async () => {
    const { matchesPathFilter } = await runEmbeddedScript();
    expect(matchesPathFilter('iOS Quality', ['libs/ui/src/index.ts', 'docs/README.md'])).toBe(
      false
    );
  });

  it('is null (unknown, not a match) when the diff could not be determined', async () => {
    const { matchesPathFilter } = await runEmbeddedScript();
    expect(matchesPathFilter('iOS Quality', null)).toBeNull();
  });

  it('matches when only one of several changed files hits the filter', async () => {
    const { matchesPathFilter } = await runEmbeddedScript();
    expect(
      matchesPathFilter('Docker Build', ['docs/README.md', 'pillars/finance/Dockerfile'])
    ).toBe(true);
  });
});
