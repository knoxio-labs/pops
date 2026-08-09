import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  discoverUnitDirs,
  findStemCollisionTestFiles,
  findUncoveredTestFiles,
  hidesTests,
  offendingExcludes,
  readTypecheckInvocations,
  resolveProjectFileSet,
  scanRepo,
  stripJsonComments,
  typecheckScriptCoversOwnConfig,
} from '../check-tests-typechecked.mjs';

describe('hidesTests', () => {
  it.each([
    '**/__tests__/**',
    'src/__tests__/**',
    '**/*.test.ts',
    '**/*.test.tsx',
    'src/**/*.test.ts',
    '**/*.spec.ts',
    'src/**/test-helpers.ts',
    'src/**/test-utils.ts',
  ])('flags %s', (glob) => {
    expect(hidesTests(glob)).toBe(true);
  });

  it.each(['node_modules', 'dist', 'scripts', '**/*.stories.tsx', '**/*.mdx', 'coverage'])(
    'passes %s',
    (glob) => {
      expect(hidesTests(glob)).toBe(false);
    }
  );

  it('does not flag node_modules paths that happen to contain a test dir', () => {
    expect(hidesTests('node_modules/**/__tests__/**')).toBe(false);
  });

  it('matches regardless of separator or case', () => {
    expect(hidesTests('src\\**\\__TESTS__\\**')).toBe(true);
  });
});

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

  it('keeps an escaped quote inside a string literal', () => {
    expect(JSON.parse(stripJsonComments('{ "a": "say \\"hi\\"" }')).a).toBe('say "hi"');
  });
});

describe('discoverUnitDirs + offendingExcludes', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tests-typechecked-guard-'));
    const write = (dir: string, config: unknown): void => {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, 'tsconfig.json'), JSON.stringify(config));
    };
    write('libs/clean', { exclude: ['node_modules', 'dist'] });
    write('pillars/hidden', { exclude: ['**/__tests__/**', 'node_modules'] });
    write('pillars/hidden/app', { exclude: ['**/*.test.tsx'] });
    write('pillars/no-exclude', { include: ['src'] });
    mkdirSync(join(root, 'pillars/not-a-unit'), { recursive: true });
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('discovers libs, pillars and nested pillar apps, and skips dirs with no tsconfig', () => {
    const found = discoverUnitDirs(root).map((dir) => dir.slice(root.length + 1));
    expect(found).toEqual([
      'libs/clean',
      'pillars/hidden',
      'pillars/hidden/app',
      'pillars/no-exclude',
    ]);
  });

  it('reports the offending globs for a unit that hides its tests', () => {
    expect(offendingExcludes(join(root, 'pillars/hidden'))).toEqual(['**/__tests__/**']);
    expect(offendingExcludes(join(root, 'pillars/hidden/app'))).toEqual(['**/*.test.tsx']);
  });

  it('reports nothing for a unit whose excludes are build-only or absent', () => {
    expect(offendingExcludes(join(root, 'libs/clean'))).toEqual([]);
    expect(offendingExcludes(join(root, 'pillars/no-exclude'))).toEqual([]);
  });
});

describe('offendingExcludes + extends', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tests-typechecked-guard-extends-'));
    writeFileSync(join(root, 'tsconfig.base.json'), JSON.stringify({ compilerOptions: {} }));
    writeFileSync(
      join(root, 'tsconfig.hiding-base.json'),
      JSON.stringify({ exclude: ['**/__tests__/**'] })
    );

    const write = (dir: string, config: unknown): void => {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, 'tsconfig.json'), JSON.stringify(config));
    };
    write('pillars/no-own-exclude-clean-base', { extends: '../../tsconfig.base.json' });
    write('pillars/no-own-exclude-hiding-base', { extends: '../../tsconfig.hiding-base.json' });
    write('pillars/own-exclude-wins', {
      extends: '../../tsconfig.hiding-base.json',
      exclude: ['node_modules', 'dist'],
    });
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('inherits a clean base as clean', () => {
    expect(offendingExcludes(join(root, 'pillars/no-own-exclude-clean-base'))).toEqual([]);
  });

  it('inherits a test-hiding exclude from a base the unit does not declare its own exclude over', () => {
    expect(offendingExcludes(join(root, 'pillars/no-own-exclude-hiding-base'))).toEqual([
      '**/__tests__/**',
    ]);
  });

  it("a unit's own exclude replaces the base's rather than merging with it", () => {
    expect(offendingExcludes(join(root, 'pillars/own-exclude-wins'))).toEqual([]);
  });
});

describe('readTypecheckInvocations + typecheckScriptCoversOwnConfig', () => {
  let root: string;

  const writeUnit = (dir: string, scripts: Record<string, string>): void => {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, 'tsconfig.json'), JSON.stringify({ include: ['src'] }));
    writeFileSync(join(root, dir, 'package.json'), JSON.stringify({ scripts }));
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tests-typechecked-script-'));
    writeUnit('bare', { typecheck: 'tsc --noEmit' });
    writeUnit('explicit', { typecheck: 'tsc --noEmit -p tsconfig.json' });
    writeUnit('flag-order-swapped', { typecheck: 'tsc -p tsconfig.json --noEmit' });
    writeUnit('long-project-flag', { typecheck: 'tsc --project tsconfig.json --noEmit' });
    writeUnit('appended', { typecheck: 'tsc --noEmit && tsc --noEmit -p scripts/tsconfig.json' });
    writeUnit('retargeted', { typecheck: 'tsc --noEmit -p tsconfig.build.json' });
    writeUnit('unmodeled-flag', { typecheck: 'tsc --noEmit --pretty false' });
    writeUnit('no-script', { build: 'tsc -b tsconfig.build.json' });
    mkdirSync(join(root, 'no-package-json'), { recursive: true });
    writeFileSync(join(root, 'no-package-json', 'tsconfig.json'), JSON.stringify({}));

    writeUnit('dir-project', { typecheck: 'tsc --noEmit -p .' });
    writeUnit('nested-dir-project', {
      typecheck: 'tsc --noEmit && tsc --noEmit -p scripts',
    });
    mkdirSync(join(root, 'nested-dir-project', 'scripts'), { recursive: true });
    writeFileSync(
      join(root, 'nested-dir-project', 'scripts', 'tsconfig.json'),
      JSON.stringify({ include: ['**/*.ts'] })
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('parses a bare invocation as targeting the unit’s own tsconfig.json', () => {
    const { script, invocations } = readTypecheckInvocations(join(root, 'bare'));
    expect(script).toBe('tsc --noEmit');
    expect(invocations).toEqual([
      { raw: 'tsc --noEmit', recognized: true, projectPath: join(root, 'bare', 'tsconfig.json') },
    ]);
  });

  it('accepts a bare invocation, an explicit -p tsconfig.json, and an appended second project', () => {
    expect(typecheckScriptCoversOwnConfig(join(root, 'bare'))).toBe(true);
    expect(typecheckScriptCoversOwnConfig(join(root, 'explicit'))).toBe(true);
    expect(typecheckScriptCoversOwnConfig(join(root, 'appended'))).toBe(true);
  });

  it('accepts -p/--project in any position, since flag order carries no meaning', () => {
    expect(typecheckScriptCoversOwnConfig(join(root, 'flag-order-swapped'))).toBe(true);
    expect(typecheckScriptCoversOwnConfig(join(root, 'long-project-flag'))).toBe(true);
  });

  it('rejects a script retargeted only at a different project', () => {
    expect(typecheckScriptCoversOwnConfig(join(root, 'retargeted'))).toBe(false);
  });

  it('rejects a flag it does not model rather than assuming it is harmless', () => {
    expect(typecheckScriptCoversOwnConfig(join(root, 'unmodeled-flag'))).toBe(false);
  });

  it('resolves a -p <directory> argument to <directory>/tsconfig.json, the way tsc itself does', () => {
    const { invocations } = readTypecheckInvocations(join(root, 'dir-project'));
    expect(invocations).toEqual([
      {
        raw: 'tsc --noEmit -p .',
        recognized: true,
        projectPath: join(root, 'dir-project', 'tsconfig.json'),
      },
    ]);
    expect(typecheckScriptCoversOwnConfig(join(root, 'dir-project'))).toBe(true);
  });

  it('resolves a nested -p <directory> (the scripts/ shape without an explicit tsconfig.json) too', () => {
    const { invocations } = readTypecheckInvocations(join(root, 'nested-dir-project'));
    expect(invocations[1]).toEqual({
      raw: 'tsc --noEmit -p scripts',
      recognized: true,
      projectPath: join(root, 'nested-dir-project', 'scripts', 'tsconfig.json'),
    });
  });

  it('rejects a unit with no typecheck script, or no package.json at all', () => {
    expect(typecheckScriptCoversOwnConfig(join(root, 'no-script'))).toBe(false);
    expect(typecheckScriptCoversOwnConfig(join(root, 'no-package-json'))).toBe(false);
    expect(readTypecheckInvocations(join(root, 'no-package-json')).script).toBeNull();
  });
});

describe('resolveProjectFileSet', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tests-typechecked-resolve-'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('matches a directory-form include recursively and drops an excluded file', () => {
    const dir = join(root, 'directory-include');
    mkdirSync(join(dir, 'src', '__tests__'), { recursive: true });
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ include: ['src'] }));
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {};\n');
    writeFileSync(join(dir, 'src', '__tests__', 'index.test.ts'), 'export {};\n');
    writeFileSync(join(dir, 'src', '__tests__', 'skip.test.ts'), 'export {};\n');

    const excluded = join(dir, 'tsconfig.excluding.json');
    writeFileSync(
      excluded,
      JSON.stringify({ include: ['src'], exclude: ['src/__tests__/skip.test.ts'] })
    );

    const { files, errors } = resolveProjectFileSet(excluded);
    expect(errors).toEqual([]);
    expect(files.has(join(dir, 'src', 'index.ts'))).toBe(true);
    expect(files.has(join(dir, 'src', '__tests__', 'index.test.ts'))).toBe(true);
    expect(files.has(join(dir, 'src', '__tests__', 'skip.test.ts'))).toBe(false);
  });

  it('a narrowed include never matches a file outside it', () => {
    const dir = join(root, 'narrowed-include');
    mkdirSync(join(dir, 'src', 'api'), { recursive: true });
    mkdirSync(join(dir, 'src', '__tests__'), { recursive: true });
    const configPath = join(dir, 'tsconfig.json');
    writeFileSync(configPath, JSON.stringify({ include: ['src/api/**'] }));
    writeFileSync(join(dir, 'src', 'api', 'index.ts'), 'export {};\n');
    writeFileSync(join(dir, 'src', '__tests__', 'index.test.ts'), 'export {};\n');

    const { files } = resolveProjectFileSet(configPath);
    expect(files.has(join(dir, 'src', 'api', 'index.ts'))).toBe(true);
    expect(files.has(join(dir, 'src', '__tests__', 'index.test.ts'))).toBe(false);
  });

  it('a files-only config (the tsconfig.build.json shape) resolves to exactly its files list, not "everything"', () => {
    const dir = join(root, 'files-only');
    mkdirSync(join(dir, 'src'), { recursive: true });
    const configPath = join(dir, 'tsconfig.json');
    writeFileSync(configPath, JSON.stringify({ files: [] }));
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {};\n');

    const { files, errors } = resolveProjectFileSet(configPath);
    expect(errors).toEqual([]);
    expect(files.size).toBe(0);
  });

  it('a config with neither files nor include defaults to matching everything, like tsc itself', () => {
    const dir = join(root, 'no-include-no-files');
    mkdirSync(join(dir, 'src'), { recursive: true });
    const configPath = join(dir, 'tsconfig.json');
    writeFileSync(configPath, JSON.stringify({ compilerOptions: {} }));
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {};\n');

    const { files } = resolveProjectFileSet(configPath);
    expect(files.has(join(dir, 'src', 'index.ts'))).toBe(true);
  });

  it('reports an error and zero files for a missing config, rather than silently passing', () => {
    const { files, errors } = resolveProjectFileSet(join(root, 'does-not-exist', 'tsconfig.json'));
    expect(files.size).toBe(0);
    expect(errors).toHaveLength(1);
  });

  it('reports an error and zero files for malformed JSON, rather than crashing or silently passing', () => {
    const dir = join(root, 'malformed');
    mkdirSync(dir, { recursive: true });
    const configPath = join(dir, 'tsconfig.json');
    writeFileSync(configPath, '{ this is not json');

    const { files, errors } = resolveProjectFileSet(configPath);
    expect(files.size).toBe(0);
    expect(errors).toHaveLength(1);
  });
});

describe('findUncoveredTestFiles', () => {
  let root: string;
  let allUnitDirs: Set<string>;

  const writeUnit = (dir: string, tsconfig: unknown, typecheck = 'tsc --noEmit'): void => {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, 'tsconfig.json'), JSON.stringify(tsconfig));
    writeFileSync(join(root, dir, 'package.json'), JSON.stringify({ scripts: { typecheck } }));
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tests-typechecked-uncovered-'));

    writeUnit('covered', { include: ['src'] });
    mkdirSync(join(root, 'covered/src/__tests__'), { recursive: true });
    writeFileSync(join(root, 'covered/src/index.ts'), 'export {};\n');
    writeFileSync(join(root, 'covered/src/__tests__/index.test.ts'), 'export {};\n');

    writeUnit('narrowed', { include: ['src/api/**'] });
    mkdirSync(join(root, 'narrowed/src/api'), { recursive: true });
    mkdirSync(join(root, 'narrowed/src/__tests__'), { recursive: true });
    writeFileSync(join(root, 'narrowed/src/api/index.ts'), 'export {};\n');
    writeFileSync(join(root, 'narrowed/src/__tests__/index.test.ts'), 'export {};\n');

    mkdirSync(join(root, 'has-scripts/scripts'), { recursive: true });
    writeUnit(
      'has-scripts',
      { include: ['src'] },
      'tsc --noEmit && tsc --noEmit -p scripts/tsconfig.json'
    );
    writeFileSync(join(root, 'has-scripts/tsconfig.json'), JSON.stringify({ include: ['src'] }));
    mkdirSync(join(root, 'has-scripts/src'), { recursive: true });
    writeFileSync(join(root, 'has-scripts/src/index.ts'), 'export {};\n');
    writeFileSync(
      join(root, 'has-scripts/scripts/tsconfig.json'),
      JSON.stringify({ include: ['**/*.ts'] })
    );
    writeFileSync(join(root, 'has-scripts/scripts/build.ts'), 'export {};\n');
    writeFileSync(join(root, 'has-scripts/scripts/build.test.ts'), 'export {};\n');

    writeUnit(
      'missing-scripts-project',
      { include: ['src'] },
      'tsc --noEmit && tsc --noEmit -p scripts/tsconfig.json'
    );
    mkdirSync(join(root, 'missing-scripts-project/scripts'), { recursive: true });
    writeFileSync(join(root, 'missing-scripts-project/scripts/build.test.ts'), 'export {};\n');

    allUnitDirs = new Set(
      ['covered', 'narrowed', 'has-scripts', 'missing-scripts-project'].map((dir) =>
        join(root, dir)
      )
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('passes a unit whose include reaches every test file on disk', () => {
    const { files, errors } = findUncoveredTestFiles(join(root, 'covered'), allUnitDirs);
    expect(files).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('flags a test file a narrowed include drops, with no exclude involved at all', () => {
    const { files } = findUncoveredTestFiles(join(root, 'narrowed'), allUnitDirs);
    expect(files).toEqual([join(root, 'narrowed', 'src', '__tests__', 'index.test.ts')]);
  });

  it('covers a second appended project (the nine-pillar scripts/tsconfig.json shape)', () => {
    const { files } = findUncoveredTestFiles(join(root, 'has-scripts'), allUnitDirs);
    expect(files).toEqual([]);
  });

  it('flags scripts/ test files when the second project the script names does not exist', () => {
    const { files } = findUncoveredTestFiles(join(root, 'missing-scripts-project'), allUnitDirs);
    expect(files).toEqual([join(root, 'missing-scripts-project', 'scripts', 'build.test.ts')]);
  });
});

describe('findStemCollisionTestFiles', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tests-typechecked-stem-'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('flags both files when a .test.ts and a .test.tsx share a stem', () => {
    const dir = join(root, 'colliding');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'Foo.test.ts'), 'export {};\n');
    writeFileSync(join(dir, 'src', 'Foo.test.tsx'), 'export {};\n');

    const victims = findStemCollisionTestFiles(dir, new Set([dir]));
    expect(victims.toSorted()).toEqual(
      [join(dir, 'src', 'Foo.test.ts'), join(dir, 'src', 'Foo.test.tsx')].toSorted()
    );
  });

  it('does not flag two test files with genuinely different stems', () => {
    const dir = join(root, 'distinct');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'Foo.test.ts'), 'export {};\n');
    writeFileSync(join(dir, 'src', 'Bar.test.ts'), 'export {};\n');

    expect(findStemCollisionTestFiles(dir, new Set([dir]))).toEqual([]);
  });

  it('finding an uncovered-by-glob test file surfaces it via findUncoveredTestFiles too', () => {
    const dir = join(root, 'colliding-in-project');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { jsx: 'react-jsx' }, include: ['src'] })
    );
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } })
    );
    writeFileSync(join(dir, 'src', 'Foo.test.ts'), 'export {};\n');
    writeFileSync(join(dir, 'src', 'Foo.test.tsx'), 'export {};\n');

    const { files } = findUncoveredTestFiles(dir, new Set([dir]));
    expect(files.toSorted()).toEqual(
      [join(dir, 'src', 'Foo.test.ts'), join(dir, 'src', 'Foo.test.tsx')].toSorted()
    );
  });
});

describe('scanRepo — discovery floor (ADR-045)', () => {
  it('reports a failure, not a vacuous pass, when discovery finds zero units', () => {
    const root = mkdtempSync(join(tmpdir(), 'tests-typechecked-empty-'));
    try {
      const { unitCount, failures } = scanRepo(root);
      expect(unitCount).toBe(0);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatch(/discovered zero unit type-check projects/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('scans a real tree with mixed clean and offending units end to end', () => {
    const root = mkdtempSync(join(tmpdir(), 'tests-typechecked-scan-'));
    try {
      mkdirSync(join(root, 'libs/clean/src'), { recursive: true });
      writeFileSync(join(root, 'libs/clean/tsconfig.json'), JSON.stringify({ include: ['src'] }));
      writeFileSync(
        join(root, 'libs/clean/package.json'),
        JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } })
      );
      writeFileSync(join(root, 'libs/clean/src/index.test.ts'), 'export {};\n');

      mkdirSync(join(root, 'pillars/offending/src'), { recursive: true });
      writeFileSync(
        join(root, 'pillars/offending/tsconfig.json'),
        JSON.stringify({ exclude: ['**/*.test.ts'] })
      );
      writeFileSync(
        join(root, 'pillars/offending/package.json'),
        JSON.stringify({ scripts: { typecheck: 'tsc --noEmit -p tsconfig.build.json' } })
      );
      writeFileSync(join(root, 'pillars/offending/src/index.test.ts'), 'export {};\n');

      const { unitCount, failures } = scanRepo(root);
      expect(unitCount).toBe(2);
      expect(failures.some((f) => f.includes('libs/clean'))).toBe(false);
      expect(failures.some((f) => f.includes('pillars/offending') && f.includes('excludes'))).toBe(
        true
      );
      expect(
        failures.some(
          (f) => f.includes('pillars/offending') && f.includes('never type-checks its own')
        )
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
