import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  deriveApiTypesOutput,
  discoverCandidateDirs,
  discoverTargets,
  extractOutputDir,
  findDiscoveryViolations,
  findVersionControlViolations,
  generate,
  invokesHeyApiGenerator,
  parseArgs,
} from '../generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** These cases build fixture workspaces and shell out to git. */
const FIXTURE_TIMEOUT_MS = 30_000;

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Target = { pkgName: string; pkgDir: string; scriptName: string; output: string | null };

function write(root: string, path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/**
 * A workspace with one app client and one pillar type map, both installed.
 * The OpenAPI snapshot is the input both depend on.
 */
function fixtureWorkspace({ installed = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pops-codegen-'));
  scratch.push(root);
  write(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n');
  write(root, 'pillars/demo/openapi/demo.openapi.json', '{"openapi":"3.0.3"}\n');
  write(
    root,
    'pillars/demo/package.json',
    JSON.stringify({
      name: '@fixture/demo',
      exports: { './api-types': { types: './dist/contract/api-types.generated.d.ts' } },
      scripts: { 'generate:api-types': 'tsx scripts/generate-api-types.ts' },
    })
  );
  write(
    root,
    'pillars/demo/app/package.json',
    JSON.stringify({
      name: '@fixture/app-demo',
      scripts: { 'generate:demo-client': 'openapi-ts -o src/demo-api' },
    })
  );
  if (installed) {
    mkdirSync(join(root, 'pillars/demo/node_modules'), { recursive: true });
    mkdirSync(join(root, 'pillars/demo/app/node_modules'), { recursive: true });
  }
  return root;
}

const FIXTURE_EXPECTED = [
  { pkgName: '@fixture/demo', scriptName: 'generate:api-types' },
  { pkgName: '@fixture/app-demo', scriptName: 'generate:demo-client' },
];

/** A runner that writes each target's output the way the real generators do. */
function writingRunner(calls: string[]) {
  return async (root: string, target: Target) => {
    calls.push(`${target.pkgName}:${target.scriptName}`);
    if (target.output === null) return { status: 1, output: 'no output' };
    const path = join(root, target.pkgDir, target.output);
    if (target.output.endsWith('.ts')) write(root, join(target.pkgDir, target.output), 'x\n');
    else write(root, join(target.pkgDir, target.output, 'index.ts'), `// ${path}\n`);
    return { status: 0, output: '' };
  };
}

function quiet() {
  return () => undefined;
}

describe('Hey API script parsing', () => {
  it.each([
    ['openapi-ts -o src/a-api', 'src/a-api'],
    ['openapi-ts -f openapi-ts.b.config.ts -o src/b-api', 'src/b-api'],
    ['pnpm exec openapi-ts --output src/c-api', 'src/c-api'],
    ['NODE_OPTIONS=--max-old-space-size=4096 npx openapi-ts -o src/d-api', 'src/d-api'],
    ['echo first && openapi-ts -o src/e-api', 'src/e-api'],
  ])('finds the output of %s', (command, output) => {
    expect(invokesHeyApiGenerator(command)).toBe(true);
    expect(extractOutputDir(command)).toBe(output);
  });

  it('reports no output when the generator step names none', () => {
    expect(invokesHeyApiGenerator('openapi-ts -f cfg.ts')).toBe(true);
    expect(extractOutputDir('openapi-ts -f cfg.ts && oxfmt --write src/x-api -o elsewhere')).toBe(
      null
    );
  });

  it.each(['tsx scripts/generate-openapi.ts', 'echo openapi-ts', 'openapi-typescript -o out'])(
    'does not mistake %s for the generator',
    (command) => {
      expect(invokesHeyApiGenerator(command)).toBe(false);
      expect(extractOutputDir(command)).toBe(null);
    }
  );
});

describe('deriveApiTypesOutput', () => {
  it('maps the compiled types export back to its source', () => {
    expect(
      deriveApiTypesOutput({
        exports: { './api-types': { types: './dist/contract/api-types.generated.d.ts' } },
      })
    ).toBe('src/contract/api-types.generated.ts');
  });

  it.each([
    [{}],
    [{ exports: {} }],
    [{ exports: { './api-types': './dist/x.js' } }],
    [{ exports: { './api-types': { types: './src/x.ts' } } }],
    [null],
  ])('returns null for %j', (manifest) => {
    expect(deriveApiTypesOutput(manifest)).toBe(null);
  });
});

describe('findDiscoveryViolations', () => {
  const target = (
    pkgName: string,
    scriptName: string,
    output: string | null = 'out'
  ): Target & {
    kind: 'hey-api';
  } => ({ kind: 'hey-api', pkgName, pkgDir: `dir/${pkgName}`, scriptName, output });

  it('passes an exact match', () => {
    expect(
      findDiscoveryViolations(
        [target('a', 'generate:x')],
        [{ pkgName: 'a', scriptName: 'generate:x' }]
      )
    ).toEqual([]);
  });

  it('names a missing, an unexpected, a duplicated and an output-less target', () => {
    const violations = findDiscoveryViolations(
      [target('b', 'generate:y'), target('c', 'generate:z', null), target('c', 'generate:z')],
      [
        { pkgName: 'a', scriptName: 'generate:x' },
        { pkgName: 'c', scriptName: 'generate:z' },
      ]
    );
    expect(violations).toHaveLength(4);
    expect(violations.join('\n')).toMatch(/a:generate:x was not discovered/u);
    expect(violations.join('\n')).toMatch(/b:generate:y is a generator missing/u);
    expect(violations.join('\n')).toMatch(/c:generate:z is declared twice/u);
    expect(violations.join('\n')).toMatch(/c:generate:z runs openapi-ts but names no/u);
  });

  it('reports an empty discovery against the pinned set', () => {
    expect(findDiscoveryViolations([]).length).toBeGreaterThan(20);
  });
});

describe('this repository', { timeout: FIXTURE_TIMEOUT_MS }, () => {
  const targets = discoverTargets(REPO_ROOT);

  it('discovers exactly the pinned generators', () => {
    expect(findDiscoveryViolations(targets)).toEqual([]);
  });

  it('ignores every generated output and tracks none of them', () => {
    expect(findVersionControlViolations(REPO_ROOT, targets)).toEqual([]);
  });
});

describe('generate', { timeout: FIXTURE_TIMEOUT_MS }, () => {
  it('generates every target, then skips them while the inputs are unchanged', async () => {
    const root = fixtureWorkspace();
    const calls: string[] = [];
    const options = { root, expected: FIXTURE_EXPECTED, run: writingRunner(calls), log: quiet() };

    const first = await generate(options);
    const second = await generate(options);

    expect(first).toMatchObject({ status: 0, failures: [] });
    expect(first.generated.toSorted()).toEqual([
      '@fixture/app-demo:generate:demo-client',
      '@fixture/demo:generate:api-types',
    ]);
    expect(second).toMatchObject({ status: 0, generated: [] });
    expect(calls).toHaveLength(2);
  });

  it('regenerates after a snapshot change, a deleted output, or --force', async () => {
    const root = fixtureWorkspace();
    const calls: string[] = [];
    const options = { root, expected: FIXTURE_EXPECTED, run: writingRunner(calls), log: quiet() };
    await generate(options);

    write(root, 'pillars/demo/openapi/demo.openapi.json', '{"openapi":"3.0.3","paths":{}}\n');
    expect((await generate(options)).generated).toHaveLength(2);

    rmSync(join(root, 'pillars/demo/app/src/demo-api'), { recursive: true });
    expect((await generate(options)).generated).toEqual(['@fixture/app-demo:generate:demo-client']);

    expect((await generate({ ...options, force: true })).generated).toHaveLength(2);
  });

  it('fails a generator that exits non-zero, with its output', async () => {
    const root = fixtureWorkspace();
    const result = await generate({
      root,
      expected: FIXTURE_EXPECTED,
      run: async () => ({ status: 3, output: 'spec is invalid' }),
      log: quiet(),
    });

    expect(result.status).toBe(1);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]).toMatch(/exited 3:\nspec is invalid/u);
  });

  it('fails a generator that exits 0 without writing its output', async () => {
    const root = fixtureWorkspace();
    const result = await generate({
      root,
      expected: FIXTURE_EXPECTED,
      run: async () => ({ status: 0, output: '' }),
      log: quiet(),
    });

    expect(result.status).toBe(1);
    expect(result.failures.join('\n')).toMatch(/exited 0 but wrote nothing/u);
    expect(result.generated).toEqual([]);
  });

  it('skips uninstalled units, but fails when one is requested by name', async () => {
    const root = fixtureWorkspace({ installed: false });
    const calls: string[] = [];
    const options = { root, expected: FIXTURE_EXPECTED, run: writingRunner(calls), log: quiet() };

    const all = await generate(options);
    const named = await generate({ ...options, packages: ['@fixture/app-demo'] });

    expect(all).toMatchObject({ status: 0, generated: [] });
    expect(all.skipped).toHaveLength(2);
    expect(named.status).toBe(1);
    expect(named.failures.join('\n')).toMatch(/is not installed/u);
    expect(calls).toEqual([]);
  });

  it('scopes to --pkg and rejects a package with no generator', async () => {
    const root = fixtureWorkspace();
    const calls: string[] = [];
    const options = { root, expected: FIXTURE_EXPECTED, run: writingRunner(calls), log: quiet() };

    const scoped = await generate({ ...options, packages: ['@fixture/demo'] });
    const unknown = await generate({ ...options, packages: ['@fixture/nothing'] });

    expect(scoped.generated).toEqual(['@fixture/demo:generate:api-types']);
    expect(unknown.status).toBe(1);
    expect(unknown.failures).toEqual(['--pkg @fixture/nothing matched no codegen target.']);
  });

  it('fails when discovery disagrees with the pinned set', async () => {
    const root = fixtureWorkspace();
    const result = await generate({
      root,
      expected: [FIXTURE_EXPECTED[0] ?? { pkgName: '', scriptName: '' }],
      run: writingRunner([]),
      log: quiet(),
    });

    expect(result.status).toBe(1);
    expect(result.failures).toEqual([
      '@fixture/app-demo:generate:demo-client is a generator missing from EXPECTED_TARGETS in this file.',
    ]);
  });
});

describe('findVersionControlViolations', { timeout: FIXTURE_TIMEOUT_MS }, () => {
  function gitWorkspace(gitignore: string) {
    const root = fixtureWorkspace();
    write(root, '.gitignore', gitignore);
    execFileSync('git', ['init', '-q'], { cwd: root });
    return root;
  }

  it('passes outputs that are ignored and untracked', () => {
    const root = gitWorkspace(
      'pillars/demo/app/src/demo-api/\npillars/demo/src/contract/api-types.generated.ts\n'
    );
    expect(findVersionControlViolations(root, discoverTargets(root))).toEqual([]);
  });

  it('names an output missing from .gitignore', () => {
    const root = gitWorkspace('pillars/demo/app/src/demo-api/\n');
    expect(findVersionControlViolations(root, discoverTargets(root))).toEqual([
      'pillars/demo/src/contract/api-types.generated.ts is not ignored; add it to .gitignore.',
    ]);
  });

  it('names a committed output even when it is ignored', () => {
    const root = gitWorkspace(
      'pillars/demo/app/src/demo-api/\npillars/demo/src/contract/api-types.generated.ts\n'
    );
    write(root, 'pillars/demo/app/src/demo-api/index.ts', 'x\n');
    execFileSync('git', ['add', '-f', 'pillars/demo/app/src/demo-api/index.ts'], { cwd: root });

    const violations = findVersionControlViolations(root, discoverTargets(root));

    expect(violations).toHaveLength(2);
    expect(violations[0]).toMatch(/1 generated file\(s\) are committed/u);
    expect(violations[1]).toMatch(/demo-api\/ is not ignored/u);
  });

  it('checks nothing outside a git work tree', () => {
    const root = fixtureWorkspace();
    expect(findVersionControlViolations(root, discoverTargets(root))).toEqual([]);
  });
});

describe('the root postinstall script', { timeout: FIXTURE_TIMEOUT_MS }, () => {
  const manifest: unknown = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  const postinstall =
    typeof manifest === 'object' &&
    manifest !== null &&
    'scripts' in manifest &&
    typeof manifest.scripts === 'object' &&
    manifest.scripts !== null &&
    'postinstall' in manifest.scripts &&
    typeof manifest.scripts.postinstall === 'string'
      ? manifest.scripts.postinstall
      : '';
  const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin` };

  it('runs the generator', () => {
    expect(postinstall).toContain('node scripts/codegen/generate.mjs');
  });

  it('succeeds in an image build context, which has no scripts directory', () => {
    const context = mkdtempSync(join(tmpdir(), 'pops-codegen-context-'));
    scratch.push(context);

    expect(spawnSync('sh', ['-c', postinstall], { cwd: context, env }).status).toBe(0);
  });

  it('propagates a generator failure', () => {
    const context = mkdtempSync(join(tmpdir(), 'pops-codegen-context-'));
    scratch.push(context);
    write(context, 'scripts/codegen/generate.mjs', 'process.exit(7);\n');

    expect(spawnSync('sh', ['-c', postinstall], { cwd: context, env }).status).toBe(7);
  });
});

describe('image builds that bundle a client', () => {
  const targets = discoverTargets(REPO_ROOT);
  const clientOwners = new Set(
    targets.filter((target) => target.kind === 'hey-api').map((target) => target.pkgName)
  );

  /** Workspace package name -> its directory and its `workspace:` dependencies. */
  const workspace = new Map<string, { dir: string; deps: string[] }>();
  for (const dir of discoverCandidateDirs(REPO_ROOT)) {
    const path = join(REPO_ROOT, dir, 'package.json');
    if (!existsSync(path)) continue;
    const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof manifest !== 'object' || manifest === null || !('name' in manifest)) continue;
    const deps: string[] = [];
    for (const field of ['dependencies', 'devDependencies']) {
      const block = field in manifest ? Reflect.get(manifest, field) : undefined;
      if (typeof block !== 'object' || block === null) continue;
      for (const [dep, range] of Object.entries(block)) {
        if (typeof range === 'string' && range.startsWith('workspace:')) deps.push(dep);
      }
    }
    workspace.set(String(manifest.name), { dir, deps });
  }

  function closure(name: string): Set<string> {
    const seen = new Set<string>();
    const queue = [name];
    for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(...(workspace.get(next)?.deps ?? []));
    }
    return seen;
  }

  const images = [...workspace.entries()]
    .filter(([, unit]) => existsSync(join(REPO_ROOT, unit.dir, 'Dockerfile')))
    .map(([name, unit]) => ({ name, file: `${unit.dir}/Dockerfile`, closure: closure(name) }))
    .filter((image) => [...image.closure].some((dep) => clientOwners.has(dep)));

  it('are all found', () => {
    expect(images.length).toBeGreaterThanOrEqual(10);
  });

  it.each(images)('$file generates every client it bundles between install and build', (image) => {
    const text = readFileSync(join(REPO_ROOT, image.file), 'utf8');
    const install = text.indexOf('pnpm install --frozen-lockfile');
    const copy = text.indexOf('COPY scripts/codegen/ ./scripts/codegen/');
    const step = /^RUN node scripts\/codegen\/generate\.mjs(.*)$/mu.exec(text);
    const build = text.search(/^RUN pnpm .*build/mu);
    const requested = [...(step?.[1] ?? '').matchAll(/--pkg (\S+)/gu)].map((match) => match[1]);
    const bundled = [...image.closure].filter((dep) => clientOwners.has(dep)).toSorted();

    expect(install).toBeGreaterThan(-1);
    expect(copy).toBeGreaterThan(install);
    expect(step?.index ?? -1).toBeGreaterThan(copy);
    expect(build).toBeGreaterThan(step?.index ?? Infinity);
    expect(requested.toSorted()).toEqual(bundled);
  });
});

describe('parseArgs', () => {
  it('collects repeated --pkg and --force', () => {
    expect(parseArgs(['--pkg', 'a', '--force', '--pkg', 'b'])).toEqual({
      packages: ['a', 'b'],
      force: true,
    });
  });

  it.each([[['--pkg']], [['--pkg', '--force']], [['--bogus']]])('rejects %j', (argv) => {
    expect(parseArgs(argv)).toHaveProperty('error');
  });
});
