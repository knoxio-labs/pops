import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  basePackageName,
  checkPillar,
  discoverLibReferenceTargets,
  discoverPillarBuildConfigs,
  findPopsPackageImports,
  isFilesOnlyAggregator,
  resolveEffectiveComposite,
  scanRepo,
  stripJsonComments,
} from '../check-composite-references.mjs';

describe('stripJsonComments', () => {
  it('removes line and block comments', () => {
    const source = '{\n  // line\n  "a": 1, /* block */ "b": 2\n}';
    expect(JSON.parse(stripJsonComments(source))).toEqual({ a: 1, b: 2 });
  });

  it('keeps a // that lives inside a string literal', () => {
    expect(JSON.parse(stripJsonComments('{ "url": "https://example.com/x" }')).url).toBe(
      'https://example.com/x'
    );
  });
});

describe('isFilesOnlyAggregator', () => {
  it('recognizes the pillars/shell/tsconfig.build.json shape', () => {
    expect(
      isFilesOnlyAggregator({
        files: [],
        references: [{ path: '../../libs/types/tsconfig.build.json' }],
      })
    ).toBe(true);
  });

  it('does not exempt a config that also declares include', () => {
    expect(isFilesOnlyAggregator({ files: [], include: ['src'] })).toBe(false);
  });

  it('does not exempt a normal compiling pillar', () => {
    expect(isFilesOnlyAggregator({ include: ['src'] })).toBe(false);
  });

  it('does not exempt a non-empty files array', () => {
    expect(isFilesOnlyAggregator({ files: ['src/index.ts'] })).toBe(false);
  });
});

describe('basePackageName', () => {
  it.each([
    ['@pops/pillar-sdk', '@pops/pillar-sdk'],
    ['@pops/pillar-sdk/server', '@pops/pillar-sdk'],
    ['@pops/types/nested/path', '@pops/types'],
  ])('%s -> %s', (specifier, expected) => {
    expect(basePackageName(specifier)).toBe(expected);
  });
});

describe('discoverPillarBuildConfigs + discoverLibReferenceTargets', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'composite-refs-discovery-'));

    mkdirSync(join(root, 'pillars', 'has-build'), { recursive: true });
    writeFileSync(join(root, 'pillars', 'has-build', 'tsconfig.build.json'), '{}');
    mkdirSync(join(root, 'pillars', 'no-build'), { recursive: true });

    mkdirSync(join(root, 'libs', 'composite-lib'), { recursive: true });
    writeFileSync(
      join(root, 'libs', 'composite-lib', 'package.json'),
      JSON.stringify({ name: '@pops/composite-lib' })
    );
    writeFileSync(join(root, 'libs', 'composite-lib', 'tsconfig.build.json'), '{}');

    // A lib with a package.json but no tsconfig.build.json (locales/navigation/
    // overlay-ego/ui's real shape) is not a reference-target candidate.
    mkdirSync(join(root, 'libs', 'no-build-lib'), { recursive: true });
    writeFileSync(
      join(root, 'libs', 'no-build-lib', 'package.json'),
      JSON.stringify({ name: '@pops/no-build-lib' })
    );

    // A Rust-style lib with no package.json at all (pops-ai/pops-settings'
    // real shape) is likewise not a candidate.
    mkdirSync(join(root, 'libs', 'no-package-lib'), { recursive: true });
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('discovers only pillars that own a tsconfig.build.json', () => {
    const found = discoverPillarBuildConfigs(root).map((p) => p.id);
    expect(found).toEqual(['has-build']);
  });

  it('discovers only libs that own both package.json and tsconfig.build.json', () => {
    const { targets, errors } = discoverLibReferenceTargets(root);
    expect([...targets.keys()]).toEqual(['@pops/composite-lib']);
    expect(errors).toEqual([]);
  });
});

describe('resolveEffectiveComposite', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'composite-refs-composite-'));
    writeFileSync(join(root, 'base.json'), JSON.stringify({ compilerOptions: { strict: true } }));

    mkdirSync(join(root, 'own-true'), { recursive: true });
    writeFileSync(
      join(root, 'own-true', 'tsconfig.build.json'),
      JSON.stringify({ compilerOptions: { composite: true } })
    );

    mkdirSync(join(root, 'own-false'), { recursive: true });
    writeFileSync(
      join(root, 'own-false', 'tsconfig.build.json'),
      JSON.stringify({ extends: '../base.json', compilerOptions: { composite: false } })
    );

    mkdirSync(join(root, 'no-composite'), { recursive: true });
    writeFileSync(
      join(root, 'no-composite', 'tsconfig.build.json'),
      JSON.stringify({ extends: '../base.json' })
    );

    mkdirSync(join(root, 'inherits-true'), { recursive: true });
    writeFileSync(
      join(root, 'inherits-true-base.json'),
      JSON.stringify({ compilerOptions: { composite: true } })
    );
    writeFileSync(
      join(root, 'inherits-true', 'tsconfig.build.json'),
      JSON.stringify({ extends: '../inherits-true-base.json' })
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads composite:true declared directly', () => {
    expect(resolveEffectiveComposite(join(root, 'own-true', 'tsconfig.build.json'))).toEqual({
      composite: true,
      error: null,
    });
  });

  it('an own composite:false is not overridden by an unrelated base', () => {
    expect(resolveEffectiveComposite(join(root, 'own-false', 'tsconfig.build.json'))).toEqual({
      composite: false,
      error: null,
    });
  });

  it('a config that declares no composite at all resolves to false', () => {
    expect(resolveEffectiveComposite(join(root, 'no-composite', 'tsconfig.build.json'))).toEqual({
      composite: false,
      error: null,
    });
  });

  it('inherits composite:true through extends when the config itself is silent', () => {
    expect(resolveEffectiveComposite(join(root, 'inherits-true', 'tsconfig.build.json'))).toEqual({
      composite: true,
      error: null,
    });
  });
});

describe('findPopsPackageImports', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'composite-refs-imports-'));
    mkdirSync(join(root, 'src', '__tests__'), { recursive: true });
    mkdirSync(join(root, 'src', 'nested'), { recursive: true });

    writeFileSync(
      join(root, 'src', 'index.ts'),
      [
        "import { configureServerSdk } from '@pops/pillar-sdk/server';",
        "import type { Money } from '@pops/types';",
        "// import { x } from '@pops/commented-out';",
        'const s = "import { x } from \'@pops/in-a-string\';";',
      ].join('\n')
    );
    writeFileSync(
      join(root, 'src', 'nested', 'more.ts'),
      "export * from '@pops/pillar-settings';\n"
    );
    writeFileSync(
      join(root, 'src', '__tests__', 'index.test.ts'),
      "import { x } from '@pops/only-in-tests';\n"
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('collects @pops/* base package names from real import statements, subpaths included', () => {
    const found = findPopsPackageImports(join(root, 'src'));
    expect(found).toEqual(new Set(['@pops/pillar-sdk', '@pops/types', '@pops/pillar-settings']));
  });

  it('does not match a specifier embedded in a comment or string literal', () => {
    const found = findPopsPackageImports(join(root, 'src'));
    expect(found.has('@pops/commented-out')).toBe(false);
    expect(found.has('@pops/in-a-string')).toBe(false);
  });

  it('excludes __tests__ from the scan', () => {
    const found = findPopsPackageImports(join(root, 'src'));
    expect(found.has('@pops/only-in-tests')).toBe(false);
  });

  it('returns an empty set for a pillar with no src directory', () => {
    expect(findPopsPackageImports(join(root, 'does-not-exist'))).toEqual(new Set());
  });
});

/**
 * The degenerate case ADR-045 requires: a fixture pillar that imports a real
 * composite lib but ships a `tsconfig.build.json` missing `composite`/
 * `references` must be flagged by `checkPillar` directly — not merely by the
 * guard's own bundled `--self-test`, so a change to `checkPillar` that
 * quietly stops reporting is caught here even if nobody thinks to run
 * `--self-test` locally.
 */
describe('checkPillar — the composite/references degenerate case', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'composite-refs-degenerate-'));
    mkdirSync(join(root, 'libs', 'sdk'), { recursive: true });
    writeFileSync(
      join(root, 'libs', 'sdk', 'package.json'),
      JSON.stringify({ name: '@pops/pillar-sdk' })
    );
    writeFileSync(
      join(root, 'libs', 'sdk', 'tsconfig.build.json'),
      JSON.stringify({ compilerOptions: { composite: true } })
    );

    mkdirSync(join(root, 'pillars', 'broken', 'src'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'broken', 'src', 'index.ts'),
      "import { pillar } from '@pops/pillar-sdk/server';\nexport {};\n"
    );
    // The exact regression this ticket is about: no `composite`, no
    // `references` — like documents/mcp/orchestrator's tsconfig.build.json
    // before it was fixed.
    writeFileSync(
      join(root, 'pillars', 'broken', 'tsconfig.build.json'),
      JSON.stringify({ include: ['src'] })
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('is flagged, never silently passed', () => {
    const { targets } = discoverLibReferenceTargets(root);
    const { violation, error } = checkPillar(
      {
        id: 'broken',
        dir: join(root, 'pillars', 'broken'),
        configPath: join(root, 'pillars', 'broken', 'tsconfig.build.json'),
      },
      targets
    );

    expect(error).toBeNull();
    expect(violation).not.toBeNull();
    expect(violation?.missingComposite).toBe(true);
    expect(violation?.missingReferences).toEqual(['sdk']);
  });

  it('scanRepo surfaces the same violation for the whole tree', () => {
    const { pillarCount, failures } = scanRepo(root);
    expect(pillarCount).toBe(1);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.some((f) => f.includes('pillars/broken') && /composite/.test(f))).toBe(true);
    expect(failures.some((f) => f.includes('pillars/broken') && f.includes('libs/sdk'))).toBe(true);
  });
});

describe('scanRepo against the real repo tree', () => {
  it('reports zero failures — every pillar already declares what it imports', () => {
    const repoRoot = join(__dirname, '..', '..', '..');
    const { pillarCount, failures } = scanRepo(repoRoot);
    expect(pillarCount).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});

describe('empty-discovery reporting (ADR-045)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'composite-refs-empty-'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports zero discovered pillars as a failure, not a vacuous pass', () => {
    const { pillarCount, failures } = scanRepo(root);
    expect(pillarCount).toBe(0);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/discovered zero pillars/);
  });
});
