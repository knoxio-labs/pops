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
    'gh api repos/knoxio-labs/pops/rules/branches/main --jq [.[] | select(.type == "merge_queue")] | length':
      '1',
    'git rev-parse origin/integration/inventory': sha,
    'git diff --name-only origin/main...HEAD': 'pillars/inventory/src/index.ts',
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
      'gh api repos/knoxio-labs/pops/rules/branches/main --jq [.[] | select(.type == "merge_queue")] | length':
        '0',
    },
  ])('refuses unsafe promotion before mutating refs: %j', (overrides) => {
    const f = fixture(overrides);
    expect(() => promoteIntegration(f.run)).toThrow();
    expect(
      f.calls.some((call) => call.startsWith('git switch') || call.startsWith('git push'))
    ).toBe(false);
  });

  it.each(['mise lint', 'mise typecheck'])('does not publish after %s fails', (failure) => {
    const f = fixture({}, failure);
    expect(() => promoteIntegration(f.run)).toThrow('command failed');
    expect(f.calls.some((call) => call.startsWith('git push'))).toBe(false);
  });

  it('runs both checks before publishing and returns to integration', () => {
    const f = fixture();
    promoteIntegration(f.run);
    const push = f.calls.indexOf(`git push -u origin promotion/inventory/${sha}`);
    expect(push).toBeGreaterThan(f.calls.indexOf('mise lint'));
    expect(push).toBeGreaterThan(f.calls.indexOf('mise typecheck'));
    expect(
      f.calls.some((call) => call.startsWith('gh pr create --base main --head promotion/'))
    ).toBe(true);
    expect(f.calls.at(-1)).toBe('git switch integration/inventory');
  });

  it('restores the source branch when publishing fails', () => {
    const f = fixture({}, `git push -u origin promotion/inventory/${sha}`);
    expect(() => promoteIntegration(f.run)).toThrow('command failed');
    expect(f.calls.at(-1)).toBe('git switch integration/inventory');
    expect(f.calls.some((call) => call.startsWith('gh pr create'))).toBe(false);
  });
});
