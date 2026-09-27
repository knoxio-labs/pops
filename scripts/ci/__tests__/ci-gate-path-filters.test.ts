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

describe('exclusions (a leading "!") in a PATH_FILTERS entry', () => {
  it('reads the design carve-out in the real "E2E Tests" mirror', async () => {
    const { PATH_FILTERS } = await runEmbeddedScript();
    expect(PATH_FILTERS['E2E Tests']).toContain('!pillars/design/**');
  });

  it('excludes a design-surface-only diff that "pillars/**" would otherwise select', async () => {
    // The defect: `pillars/design/src/screens/**` is selected by `pillars/**`,
    // so before exclusions existed the shell's Playwright lane ran on every
    // design iteration. It must now read as a genuine path-filter exclusion.
    const { matchesPathFilter } = await runEmbeddedScript();
    expect(
      matchesPathFilter('E2E Tests', [
        'pillars/design/src/screens/AccountDetails.tsx',
        'pillars/design/src/experiments/balance-card.json',
      ])
    ).toBe(false);
  });

  it('excludes the rest of the design pillar too, not just its surface', async () => {
    const { matchesPathFilter } = await runEmbeddedScript();
    expect(matchesPathFilter('E2E Tests', ['pillars/design/Dockerfile.api'])).toBe(false);
    expect(matchesPathFilter('E2E Tests', ['pillars/design/package.json'])).toBe(false);
  });

  it('still selects when another pillar changed alongside the design one', async () => {
    const { matchesPathFilter } = await runEmbeddedScript();
    expect(
      matchesPathFilter('E2E Tests', [
        'pillars/design/src/screens/AccountDetails.tsx',
        'pillars/finance/src/index.ts',
      ])
    ).toBe(true);
  });

  it('still selects a change to the lane’s own workflow file', async () => {
    const { matchesPathFilter } = await runEmbeddedScript();
    expect(matchesPathFilter('E2E Tests', ['.github/workflows/fe-test-e2e.yml'])).toBe(true);
  });

  it('drops only what the exclusion names, leaving its siblings selected', async () => {
    const { matchesPathFilter } = await runEmbeddedScript();
    expect(matchesPathFilter('E2E Tests', ['pillars/designs/src/index.ts'])).toBe(true);
    expect(matchesPathFilter('E2E Tests', ['libs/ui/src/index.ts'])).toBe(true);
  });
});

describe('exclusion semantics on synthetic filters (the degenerate cases)', () => {
  /**
   * `matchesPathFilter` closes over `PATH_FILTERS`, so a synthetic entry
   * exercises the real deployed matcher on shapes no gated workflow declares
   * yet. Each run re-evaluates the script body, so the additions never leak
   * between tests.
   */
  it('selects nothing at all when the filter is only exclusions', async () => {
    const { matchesPathFilter, PATH_FILTERS } = await runEmbeddedScript();
    PATH_FILTERS['Synthetic'] = ['!docs/**'];
    expect(matchesPathFilter('Synthetic', ['docs/README.md'])).toBe(false);
    expect(matchesPathFilter('Synthetic', ['pillars/finance/src/index.ts'])).toBe(false);
  });

  it('is a no-op when the exclusion matches nothing in the diff', async () => {
    const { matchesPathFilter, PATH_FILTERS } = await runEmbeddedScript();
    PATH_FILTERS['Synthetic'] = ['pillars/**', '!libs/**'];
    expect(matchesPathFilter('Synthetic', ['pillars/finance/src/index.ts'])).toBe(true);
  });

  it('lets a later positive pattern re-select what an exclusion dropped', async () => {
    // GitHub walks the list in order and the LAST matching pattern decides.
    const { matchesPathFilter, PATH_FILTERS } = await runEmbeddedScript();
    PATH_FILTERS['Synthetic'] = ['pillars/**', '!pillars/design/**', 'pillars/design/nginx/**'];
    expect(matchesPathFilter('Synthetic', ['pillars/design/nginx/default.conf'])).toBe(true);
    expect(matchesPathFilter('Synthetic', ['pillars/design/src/api/server.ts'])).toBe(false);
  });

  it('does not let an exclusion order-swap change a positive-only answer', async () => {
    const { matchesPathFilter, PATH_FILTERS } = await runEmbeddedScript();
    PATH_FILTERS['Synthetic'] = ['!pillars/design/**', 'pillars/**'];
    // The positive comes last, so it wins — the exclusion is inert here.
    expect(matchesPathFilter('Synthetic', ['pillars/design/src/index.ts'])).toBe(true);
  });

  it('keeps returning null for an unknown diff regardless of exclusions', async () => {
    const { matchesPathFilter, PATH_FILTERS } = await runEmbeddedScript();
    PATH_FILTERS['Synthetic'] = ['pillars/**', '!pillars/design/**'];
    expect(matchesPathFilter('Synthetic', null)).toBeNull();
  });

  it('treats an exclusion of everything as selecting nothing', async () => {
    const { matchesPathFilter, PATH_FILTERS } = await runEmbeddedScript();
    PATH_FILTERS['Synthetic'] = ['pillars/**', '!**'];
    expect(matchesPathFilter('Synthetic', ['pillars/finance/src/index.ts'])).toBe(false);
    expect(matchesPathFilter('Synthetic', [])).toBe(false);
  });
});
