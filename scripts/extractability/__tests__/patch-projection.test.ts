import { describe, expect, it } from 'vitest';

import {
  exactPatchSelector,
  parsePnpmDependencyGraph,
  projectResolvedPatches,
} from '../patch-projection.mjs';

const policy = { 'drizzle-kit@0.31.11': 'patches/tool.patch' };
const tool = {
  from: 'drizzle-kit',
  version: '0.31.11',
  path: '/unpatched/tool',
  resolved: 'registry:drizzle-kit@0.31.11',
};
function output(
  dependencies: Record<string, unknown> = {},
  extra: Record<string, unknown> = {}
): string {
  return JSON.stringify([
    {
      name: 'fixture-root',
      version: '1.0.0',
      path: '/workspace',
      private: true,
      dependencies,
      ...extra,
    },
  ]);
}

describe('resolved dependency patch projection', () => {
  it('uses actual transitive canonical identities even under an alias', async () => {
    const source = output({
      parent: { from: 'parent', version: '1.0.0', path: '/parent', dependencies: { alias: tool } },
    });
    const queries: string[] = [];
    expect(
      await projectResolvedPatches(policy, parsePnpmDependencyGraph(source), async (selector) => {
        queries.push(selector);
        return source;
      })
    ).toEqual(policy);
    expect(queries).toEqual(['drizzle-kit@0.31.11']);
  });
  it('does not retain a root metadata match or an alias-only coincidence', async () => {
    const rootOnly = output({}, { name: 'drizzle-kit', version: '0.31.11' });
    expect(
      await projectResolvedPatches(policy, parsePnpmDependencyGraph(rootOnly), async () => rootOnly)
    ).toEqual({});
    const aliasOnly = output({ 'drizzle-kit': { ...tool, from: 'another-package' } });
    expect(
      await projectResolvedPatches(
        policy,
        parsePnpmDependencyGraph(aliasOnly),
        async () => aliasOnly
      )
    ).toEqual({});
  });
  it('rejects disagreement between the exact selector and complete graph', async () => {
    await expect(
      projectResolvedPatches(policy, parsePnpmDependencyGraph(output({ tool })), async () =>
        output()
      )
    ).rejects.toThrow('disagrees');
  });
  it('ignores only root metadata and filesystem paths in graph identity', () => {
    const first = output({ tool });
    const second = output(
      { tool: { ...tool, path: '/patched/hash/tool' } },
      { name: 'another-root', version: '2.0.0', path: '/another' }
    );
    expect(parsePnpmDependencyGraph(first)).toEqual(parsePnpmDependencyGraph(second));
  });
  it.each([
    { tool: { ...tool, version: '0.31.12' } },
    { otherAlias: tool },
    { tool: { ...tool, resolved: 'registry:another-source' } },
    { tool: { ...tool, deduped: true, dedupedDependenciesCount: 2 } },
    { tool: { ...tool, dependencies: { child: { from: 'child', version: '1.0.0' } } } },
  ])('preserves package and edge evidence: %j', (changed) => {
    expect(parsePnpmDependencyGraph(output(changed))).not.toEqual(
      parsePnpmDependencyGraph(output({ tool }))
    );
  });
  it('preserves an own dependency alias that resembles an object prototype key', () => {
    const source = '[{"dependencies":{"__proto__":{"from":"drizzle-kit","version":"0.31.11"}}}]';
    expect(JSON.stringify(parsePnpmDependencyGraph(source))).toContain('"__proto__"');
  });
  it('preserves dependency categories rather than flattening package sets', () => {
    expect(parsePnpmDependencyGraph(output({ tool }))).not.toEqual(
      parsePnpmDependencyGraph(output({}, { devDependencies: { tool } }))
    );
  });
  it.each([
    'not json',
    '{}',
    '[{}, {}]',
    output({ tool: { version: '0.31.11' } }),
    output({ tool: { ...tool, unexpected: true } }),
    output({ tool: { ...tool, dependencies: [] } }),
  ])('fails closed on unsupported list output: %s', (source) => {
    expect(() => parsePnpmDependencyGraph(source)).toThrow();
  });
  it('accepts scoped exact selectors but rejects unimplemented broad policy', () => {
    expect(exactPatchSelector('@scope/tool@1.2.3-beta.1')).toEqual({
      name: '@scope/tool',
      version: '1.2.3-beta.1',
    });
    for (const selector of ['tool', 'tool@^1.2.3', 'tool@*'])
      expect(() => exactPatchSelector(selector)).toThrow('requires an exact');
  });
});
