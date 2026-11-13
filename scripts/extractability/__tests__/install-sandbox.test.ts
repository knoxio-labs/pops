import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { installSandbox } from '../install-sandbox.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const policy = { 'tool@1.0.0': 'patches/tool.patch' };
function fixture(): { sourceRoot: string; destination: string; patch: string; workspace: string } {
  const root = mkdtempSync(join(repoRoot, 'tmp/ex2-projection-'));
  roots.push(root);
  const sourceRoot = join(root, 'source');
  const destination = join(root, 'unit');
  mkdirSync(join(sourceRoot, 'patches'), { recursive: true });
  mkdirSync(destination);
  const patch = join(sourceRoot, 'patches/tool.patch');
  const workspace = join(destination, 'pnpm-workspace.yaml');
  writeFileSync(patch, 'captured patch bytes');
  writeFileSync(
    join(sourceRoot, 'pnpm-workspace.yaml'),
    stringifyYaml({ packages: [], patchedDependencies: policy })
  );
  writeFileSync(workspace, stringifyYaml({ packages: [], allowBuilds: { esbuild: true } }));
  return { sourceRoot, destination, patch, workspace };
}
function graph(match = true, version = '1.0.0', path = '/package'): string {
  return JSON.stringify([
    {
      name: 'fixture',
      version: '1.0.0',
      path: '/root',
      private: true,
      devDependencies: match
        ? {
            parent: {
              from: 'parent',
              version: '1.0.0',
              path: '/parent',
              dependencies: {
                aliased: { from: 'tool', version, path, resolved: 'registry:tool@1.0.0' },
              },
            },
          }
        : {},
    },
  ]);
}

describe('isolated install patch protocol', () => {
  it('resolves before projection, stages captured matching bytes and performs normal frozen installation', async () => {
    const f = fixture();
    const calls: string[][] = [];
    let installs = 0;
    const selected = await installSandbox(f.destination, {
      sourceRoot: f.sourceRoot,
      runPnpm: async (args, cwd) => {
        expect(cwd).toBe(f.destination);
        calls.push([...args]);
        if (args[0] === 'install') {
          installs += 1;
          if (installs === 1) {
            expect(parseYaml(readFileSync(f.workspace, 'utf8'))).not.toHaveProperty(
              'patchedDependencies'
            );
            writeFileSync(f.patch, 'later source must not retarget this install');
          } else {
            expect(parseYaml(readFileSync(f.workspace, 'utf8'))).toMatchObject({
              patchedDependencies: policy,
            });
            expect(readFileSync(join(f.destination, 'patches/tool.patch'), 'utf8')).toBe(
              'captured patch bytes'
            );
          }
          return '';
        }
        return graph(true, '1.0.0', installs === 1 ? '/unpatched' : '/patch-hash');
      },
    });
    expect(selected).toEqual(policy);
    expect(calls).toEqual([
      ['install', '--lockfile-only', '--no-frozen-lockfile'],
      ['list', '--lockfile-only', '--json', '--depth', 'Infinity'],
      ['list', '--lockfile-only', '--json', '--depth', 'Infinity', 'tool@1.0.0'],
      ['install', '--lockfile-only', '--no-frozen-lockfile'],
      ['list', '--lockfile-only', '--json', '--depth', 'Infinity'],
      ['install', '--frozen-lockfile'],
      ['list', '--lockfile-only', '--json', '--depth', 'Infinity'],
    ]);
  });
  it('omits unmatched root policy instead of allowing an unused patch', async () => {
    const f = fixture();
    const calls: string[][] = [];
    const selected = await installSandbox(f.destination, {
      sourceRoot: f.sourceRoot,
      runPnpm: async (args) => {
        calls.push([...args]);
        return args[0] === 'list' ? graph(false) : '';
      },
    });
    expect(selected).toEqual({});
    expect(parseYaml(readFileSync(f.workspace, 'utf8'))).not.toHaveProperty('patchedDependencies');
    expect(existsSync(join(f.destination, 'patches'))).toBe(false);
    expect(calls).toContainEqual(['install', '--frozen-lockfile']);
    expect(calls.flat().join(' ')).not.toMatch(/allow-unused|ignore-scripts/u);
  });
  it('rejects a missing selected patch before any child or policy write', async () => {
    const f = fixture();
    const before = readFileSync(f.workspace);
    unlinkSync(f.patch);
    const calls: string[][] = [];
    await expect(
      installSandbox(f.destination, {
        sourceRoot: f.sourceRoot,
        runPnpm: async (args) => {
          calls.push(args);
          return graph();
        },
      })
    ).rejects.toThrow();
    expect(calls).toEqual([]);
    expect(readFileSync(f.workspace)).toEqual(before);
    expect(existsSync(join(f.destination, 'patches'))).toBe(false);
  });
  it('rejects graph drift before the final install without convergence retries', async () => {
    const f = fixture();
    const calls: string[][] = [];
    let installs = 0;
    await expect(
      installSandbox(f.destination, {
        sourceRoot: f.sourceRoot,
        runPnpm: async (args) => {
          calls.push([...args]);
          if (args[0] === 'install') {
            installs += 1;
            return '';
          }
          return graph(true, installs > 1 ? '2.0.0' : '1.0.0');
        },
      })
    ).rejects.toThrow('changed the resolved dependency graph');
    expect(calls).not.toContainEqual(['install', '--frozen-lockfile']);
    expect(installs).toBe(2);
  });
  it('preserves install failures and rejects lifecycle policy changes', async () => {
    const f = fixture();
    await expect(
      installSandbox(f.destination, {
        sourceRoot: f.sourceRoot,
        runPnpm: async () => {
          throw new Error('normal lifecycle failure');
        },
      })
    ).rejects.toThrow('normal lifecycle failure');
    await expect(
      installSandbox(f.destination, {
        sourceRoot: f.sourceRoot,
        runPnpm: async () => {
          writeFileSync(
            f.workspace,
            stringifyYaml({ packages: [], overrides: { unexpected: '1.0.0' } })
          );
          return '';
        },
      })
    ).rejects.toThrow('Lifecycle changed');
  });
  it('fails unsupported selectors before resolution rather than silently excluding root policy', async () => {
    const f = fixture();
    writeFileSync(
      join(f.sourceRoot, 'pnpm-workspace.yaml'),
      stringifyYaml({ patchedDependencies: { 'tool@^1': 'patches/tool.patch' } })
    );
    let called = false;
    await expect(
      installSandbox(f.destination, {
        sourceRoot: f.sourceRoot,
        runPnpm: async () => {
          called = true;
          return graph();
        },
      })
    ).rejects.toThrow('requires an exact');
    expect(called).toBe(false);
  });
  it('does not silently lose an unsupported root selector resembling a prototype key', async () => {
    const f = fixture();
    writeFileSync(
      join(f.sourceRoot, 'pnpm-workspace.yaml'),
      'patchedDependencies: { __proto__: patches/tool.patch }\n'
    );
    let called = false;
    await expect(
      installSandbox(f.destination, {
        sourceRoot: f.sourceRoot,
        runPnpm: async () => {
          called = true;
          return graph();
        },
      })
    ).rejects.toThrow('requires an exact');
    expect(called).toBe(false);
  });
  it('the actual rewrite command leaves root patch projection for the resolved closure', () => {
    const f = fixture();
    writeFileSync(
      join(f.destination, 'package.json'),
      readFileSync(join(repoRoot, 'libs/types/package.json'))
    );
    const manifest = join(f.sourceRoot, 'deps-manifest.json');
    writeFileSync(manifest, '{}');
    const result = spawnSync(
      process.execPath,
      [
        join(repoRoot, 'scripts/extractability/rewrite-deps.mjs'),
        join(f.destination, 'package.json'),
        manifest,
      ],
      { encoding: 'utf8', timeout: 30_000 }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(parseYaml(readFileSync(f.workspace, 'utf8'))).toMatchObject({ packages: [] });
    expect(parseYaml(readFileSync(f.workspace, 'utf8'))).not.toHaveProperty('patchedDependencies');
    expect(existsSync(join(f.destination, 'patches'))).toBe(false);
  }, 40_000);
});
