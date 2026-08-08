import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  discoverUnitDirs,
  hidesTests,
  offendingExcludes,
  stripJsonComments,
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
