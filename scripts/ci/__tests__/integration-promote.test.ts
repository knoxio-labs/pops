import { describe, expect, it } from 'vitest';

import { promoteIntegration, promotionBranch } from '../integration-promote.mjs';

const sha = 'a'.repeat(40);

function fixture(overrides: Record<string, string> = {}, failure?: string) {
  const calls: string[] = [];
  const answers: Record<string, string> = {
    'git branch --show-current': 'integration/inventory',
    'git rev-parse HEAD': sha,
    'gh repo view --json nameWithOwner --jq .nameWithOwner': 'knoxio-labs/pops',
    'gh api user --jq .login': 'knoxio',
    'gh api repos/knoxio-labs/pops/rules/branches/main --jq [.[] | select(.type == "required_status_checks") | .parameters | .required_status_checks[] | select(.context == "Promotion validation")] | length':
      '1',
    'git rev-parse origin/integration/inventory': sha,
    'git diff --name-only origin/main...HEAD': 'pillars/inventory/src/index.ts',
    'git diff --name-only origin/main HEAD': 'pillars/inventory/src/index.ts',
    ...overrides,
  };
  return {
    calls,
    run(command: string, args: string[]) {
      const key = [command, ...args].join(' ');
      calls.push(key);
      if (key === failure) throw new Error('command failed');
      return answers[key] ?? '';
    },
  };
}

describe('integration promotion', () => {
  it.each([
    'main',
    'integration/../main',
    'integration/a;b',
    'integration/a/b',
    'integration/UPPER',
  ])('rejects unsafe source %s', (source) => {
    expect(() => promotionBranch(source, sha)).toThrow();
  });

  it('uses the full revision to freeze each candidate separately', () => {
    expect(promotionBranch('integration/inventory', sha)).toBe(`promotion/inventory/${sha}`);
    expect(() => promotionBranch('integration/inventory', 'abc123')).toThrow();
  });

  it.each<Record<string, string>>([
    { 'git status --porcelain': ' M source.ts' },
    { 'git rev-parse origin/integration/inventory': 'b'.repeat(40) },
    { 'git diff --name-only origin/main...HEAD': '' },
    { 'gh api user --jq .login': 'someone-else' },
    { 'gh repo view --json nameWithOwner --jq .nameWithOwner': 'other/repo' },
    {
      'gh api repos/knoxio-labs/pops/rules/branches/main --jq [.[] | select(.type == "required_status_checks") | .parameters | .required_status_checks[] | select(.context == "Promotion validation")] | length':
        '0',
    },
  ])('refuses unsafe promotion before mutating refs: %j', (overrides) => {
    const f = fixture(overrides);
    expect(() => promoteIntegration(f.run)).toThrow();
    expect(
      f.calls.some((call) => call.startsWith('git switch') || call.startsWith('git push'))
    ).toBe(false);
  });

  it('does not publish or open a PR after the affected gate fails', () => {
    const f = fixture({}, 'mise check');
    expect(() => promoteIntegration(f.run)).toThrow('command failed');
    expect(f.calls.some((call) => call.startsWith('git push'))).toBe(false);
    expect(f.calls.some((call) => call.startsWith('gh pr create'))).toBe(false);
  });

  it('refuses an already-integrated tree after merging current main', () => {
    const f = fixture({ 'git diff --name-only origin/main HEAD': '' });
    expect(() => promoteIntegration(f.run)).toThrow('no changes after incorporating');
    expect(f.calls.some((call) => call.startsWith('git push'))).toBe(false);
  });

  it('accepts a required promotion gate without strict freshness and validates before publishing', () => {
    const f = fixture();
    promoteIntegration(f.run);
    const freeze = f.calls.findIndex((call) => call.startsWith('git commit --allow-empty'));
    const check = f.calls.indexOf('mise check');
    const push = f.calls.indexOf(`git push -u origin promotion/inventory/${sha}`);
    expect(check).toBeGreaterThan(
      f.calls.indexOf('git merge -m chore: refresh promotion from main origin/main')
    );
    expect(freeze).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(freeze);
    expect(push).toBeGreaterThan(check);
    expect(
      f.calls.some((call) => call.startsWith('gh pr create --base main --head promotion/'))
    ).toBe(true);
    expect(
      f.calls.some(
        (call) =>
          call.startsWith('gh pr create ') &&
          call.includes('Validation: mise check passed before push.')
      )
    ).toBe(true);
    expect(f.calls.at(-1)).toBe('git switch integration/inventory');
  });

  it('leaves the frozen candidate available when publishing fails', () => {
    const f = fixture({}, `git push -u origin promotion/inventory/${sha}`);
    expect(() => promoteIntegration(f.run)).toThrow('command failed');
    expect(f.calls.at(-1)).toBe(`git push -u origin promotion/inventory/${sha}`);
    expect(f.calls.some((call) => call.startsWith('gh pr create'))).toBe(false);
  });
});
